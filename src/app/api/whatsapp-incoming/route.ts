import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendBridgeMessage, sendBridgePresence } from '@/lib/bot-bridge';
import { runAgent, saveMessage, transcribeAudio } from '@/lib/bot/gemini';
import { enqueueMessage } from '@/lib/bot/msg-queue';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Mapa de locks por teléfono: evita que dos ráfagas consolidadas del mismo
// usuario se procesen en paralelo (la segunda espera a que termine la primera).
const processingLocks = new Map<string, Promise<void>>();

// POST /api/whatsapp-incoming — recibido desde el wa-bridge (Baileys) en lukeserver.
// Tres flujos:
//   1. Registro por invitación ("ALTA <token>") → inmediato, sin cola.
//   2. Número desconocido → se ignora en silencio.
//   3. Conversación normal → se encola con debounce para consolidar mensajes
//      rápidos del mismo usuario en uno solo antes de llamar al agente.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-wa-bridge-secret');
  if (!secret || secret !== process.env.WA_BRIDGE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { phone: rawPhone, message, audio, senderPn } = body as { phone?: string; message?: string; audio?: { data: string; mimeType: string }; senderPn?: string | null };
  if (!rawPhone) return NextResponse.json({ ok: true });

  const phone = (senderPn ? senderPn.replace(/[^0-9]/g, '') : null) || rawPhone;

  const supabase = getAdminClient();
  const texto = (message || '').trim();
  const altaMatch = texto.match(/^ALTA\s+(\S+)/i);

  // ── Flujo 1: registro por invitación (inmediato, sin cola) ──
  if (altaMatch) {
    const token = altaMatch[1].toUpperCase();
    const { data: invite } = await supabase
      .from('mining_bot_invites')
      .select('id, project_id, rol, nombre, used_at, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (!invite) {
      await sendBridgeMessage(phone, 'Ese código de invitación no existe. Pídele a tu administrador uno nuevo.');
      return NextResponse.json({ ok: true });
    }
    if (invite.used_at) {
      await sendBridgeMessage(phone, 'Esa invitación ya fue usada. Pídele a tu administrador una nueva.');
      return NextResponse.json({ ok: true });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await sendBridgeMessage(phone, 'Esa invitación venció. Pídele a tu administrador una nueva.');
      return NextResponse.json({ ok: true });
    }

    await supabase.from('mining_bot_usuarios').upsert(
      { project_id: invite.project_id, telefono: phone, nombre: invite.nombre, rol: invite.rol },
      { onConflict: 'project_id,telefono' }
    );
    await supabase.from('mining_bot_invites').update({ used_at: new Date().toISOString(), usado_por_telefono: phone }).eq('id', invite.id);

    const rolLabel = invite.rol === 'admin' ? 'administrador' : 'lector';
    await sendBridgeMessage(phone, `¡Hola${invite.nombre ? ' ' + invite.nombre : ''}! Quedaste registrado como ${rolLabel} en jAIme, el asistente de AWPBIM. Ya puedes escribirme cuando necesites algo.`);
    return NextResponse.json({ ok: true });
  }

  // ── Flujo 2: verificar que el número esté autorizado ──
  const { data: usuario } = await supabase
    .from('mining_bot_usuarios')
    .select('id, project_id, nombre, rol')
    .eq('telefono', phone)
    .maybeSingle();

  if (!usuario) return NextResponse.json({ ok: true });

  // ── Flujo 3: conversación normal — transcribir audio (si aplica) y encolar ──
  // El audio se transcribe ANTES de encolar para que el buffer siempre trabaje
  // con texto plano. Así un audio + texto se consolidan sin problema.
  let mensajeTexto = texto;
  let tipoMensaje: 'texto' | 'audio' = 'texto';
  if (audio?.data) {
    mensajeTexto = await transcribeAudio(audio.data, audio.mimeType);
    tipoMensaje = 'audio';
  }
  if (!mensajeTexto) return NextResponse.json({ ok: true });

  // Mostrar "escribiendo…" de inmediato — el usuario sabe que el bot recibió algo.
  sendBridgePresence(phone, 'composing');

  // Encolar el fragmento. Si llegan más mensajes del mismo teléfono en la ventana
  // de debounce (~2.5s por defecto), se acumulan y se procesan juntos.
  enqueueMessage(
    phone,
    { texto: mensajeTexto, tipoMensaje },
    async (consolidated) => {
      // Serializar: si ya hay un mensaje consolidado procesándose para este
      // teléfono, esperar a que termine antes de arrancar el siguiente.
      const prev = processingLocks.get(phone) ?? Promise.resolve();
      const current = prev.then(() => processConsolidated(phone, usuario, consolidated));
      processingLocks.set(phone, current.catch(() => {}));
      await current;
    }
  );

  // Respondemos 200 de inmediato al bridge — el procesamiento real ocurre
  // cuando el debounce expira (fire-and-forget desde el punto de vista HTTP).
  return NextResponse.json({ ok: true });
}

// ── Procesamiento del mensaje consolidado ──
async function processConsolidated(
  phone: string,
  usuario: { id: string; project_id: string; nombre: string | null; rol: string },
  consolidated: { textoConsolidado: string; tipoMensaje: 'texto' | 'audio' }
) {
  const supabase = getAdminClient();
  const presenceInterval = setInterval(() => sendBridgePresence(phone, 'composing'), 8000);

  try {
    await saveMessage(supabase, usuario.project_id, phone, 'user', consolidated.textoConsolidado, consolidated.tipoMensaje);

    const respuesta = await runAgent({
      supabase,
      projectId: usuario.project_id,
      telefono: phone,
      nombreUsuario: usuario.nombre,
      rol: usuario.rol as 'admin' | 'lector',
      mensajeTexto: consolidated.textoConsolidado,
    });

    await saveMessage(supabase, usuario.project_id, phone, 'model', respuesta);
    await sendBridgeMessage(phone, respuesta);
  } finally {
    clearInterval(presenceInterval);
    await sendBridgePresence(phone, 'paused');
    // Limpiar lock cuando ya no hay nada pendiente
    if (processingLocks.get(phone) === undefined) processingLocks.delete(phone);
  }
}

