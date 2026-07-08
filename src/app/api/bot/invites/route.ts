import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchBridgeStatus } from '@/lib/bot-bridge';
import { randomBytes } from 'crypto';
import QRCode from 'qrcode';

// GET /api/bot/invites?project_id=... — lista invitaciones (pendientes y usadas)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const { data, error } = await supabase
    .from('mining_bot_invites')
    .select('id, token, rol, nombre, usado_por_telefono, used_at, created_at, expires_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invites: data ?? [] });
}

// POST /api/bot/invites — crea una invitación nueva y devuelve el QR (link wa.me)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, rol, nombre } = body as { project_id?: string; rol?: string; nombre?: string };
  if (!project_id) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  if (rol !== 'admin' && rol !== 'lector') return NextResponse.json({ error: 'rol debe ser admin o lector' }, { status: 400 });

  const status = await fetchBridgeStatus();
  if (!status?.botNumber) {
    return NextResponse.json({ error: 'El bot no está vinculado a WhatsApp todavía (sin botNumber). Vincúlalo primero con el QR de conexión.' }, { status: 409 });
  }

  const token = randomBytes(4).toString('hex').toUpperCase(); // 8 caracteres

  const { error } = await supabase
    .from('mining_bot_invites')
    .insert({ project_id, token, rol, nombre: nombre || null });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const waText = encodeURIComponent(`ALTA ${token}`);
  const waLink = `https://wa.me/${status.botNumber}?text=${waText}`;
  const qrDataUrl = await QRCode.toDataURL(waLink, { width: 360, margin: 1 });

  return NextResponse.json({ token, waLink, qrDataUrl });
}

// DELETE /api/bot/invites?id=... — revoca una invitación no usada
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabase.from('mining_bot_invites').delete().eq('id', id).is('used_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
