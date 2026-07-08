import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSystemPrompt } from './system-prompt';
import { buildSchemaMap } from './schema-map';
import { buildFunctionDeclarations, executeDynamicTool, loadDynamicTools, registerDynamicTool, CREAR_HERRAMIENTA_TOOL } from './tools-engine';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function geminiUrl() {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  return `${GEMINI_BASE}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
}

type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string }; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } };
type GeminiContent = { role: 'user' | 'model' | 'function'; parts: GeminiPart[] };

async function callGemini(body: Record<string, unknown>): Promise<{ parts: GeminiPart[] } | null> {
  const res = await fetch(geminiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('[gemini] HTTP', res.status, await res.text().catch(() => ''));
    return null;
  }
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts;
  return parts ? { parts } : null;
}

// Transcribe un audio (base64 + mimeType) a texto plano, sin tools ni contexto —
// así cualquier mensaje de voz se convierte en texto antes de entrar al agente,
// y el historial queda siempre en texto (igual al patrón de LukeMontaje).
export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const result = await callGemini({
    contents: [{
      role: 'user',
      parts: [
        { text: 'Transcribe este audio a texto en español. Responde SOLO con la transcripción, sin comentarios ni formato adicional.' },
        { inlineData: { mimeType, data: audioBase64 } },
      ],
    }],
    generationConfig: { temperature: 0 },
  });
  const text = result?.parts.find(p => p.text)?.text;
  return text?.trim() || '(no se pudo transcribir el audio)';
}

export async function loadHistory(supabase: SupabaseClient, projectId: string, telefono: string, limite = 10): Promise<GeminiContent[]> {
  const { data } = await supabase
    .from('mining_bot_mensajes')
    .select('rol, contenido')
    .eq('project_id', projectId)
    .eq('telefono', telefono)
    .order('created_at', { ascending: false })
    .limit(limite);

  return (data ?? []).reverse().map(m => ({
    role: m.rol as 'user' | 'model',
    parts: [{ text: m.contenido }],
  }));
}

export async function saveMessage(
  supabase: SupabaseClient, projectId: string, telefono: string,
  rol: 'user' | 'model', contenido: string, tipoMensaje: 'texto' | 'audio' = 'texto'
) {
  await supabase.from('mining_bot_mensajes').insert({ project_id: projectId, telefono, rol, contenido, tipo_mensaje: tipoMensaje });
}

const MAX_ITERACIONES = 6;

// Loop agéntico: llama a Gemini con las tools dinámicas disponibles; si pide ejecutar
// una función, la corre (con guardia de rol) y le devuelve el resultado, hasta que
// responda con texto final. Devuelve ese texto, listo para mandar por WhatsApp.
export async function runAgent(opts: {
  supabase: SupabaseClient;
  projectId: string;
  telefono: string;
  nombreUsuario: string | null;
  rol: 'admin' | 'lector';
  mensajeTexto: string;
}): Promise<string> {
  const { supabase, projectId, telefono, nombreUsuario, rol, mensajeTexto } = opts;

  const [schemaMap, dbTools, history] = await Promise.all([
    buildSchemaMap(supabase),
    loadDynamicTools(supabase, projectId),
    loadHistory(supabase, projectId, telefono),
  ]);

  const systemInstruction = buildSystemPrompt({ schemaMap, rol, nombreUsuario, projectId });
  const functionDeclarations = buildFunctionDeclarations(dbTools, rol);

  const contents: GeminiContent[] = [...history, { role: 'user', parts: [{ text: mensajeTexto }] }];

  let iteraciones = 0;
  while (iteraciones < MAX_ITERACIONES) {
    iteraciones++;
    const result = await callGemini({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      tools: functionDeclarations.length ? [{ functionDeclarations }] : undefined,
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    });

    if (!result) return 'Tuve un problema para procesar tu mensaje. Intenta de nuevo en un momento.';

    const functionCalls = result.parts.filter(p => p.functionCall);
    if (functionCalls.length === 0) {
      const text = result.parts.find(p => p.text)?.text?.trim();
      return text || 'No tengo una respuesta para eso por ahora.';
    }

    contents.push({ role: 'model', parts: result.parts });

    for (const part of functionCalls) {
      const call = part.functionCall!;
      let response: unknown;

      if (call.name === CREAR_HERRAMIENTA_TOOL.name) {
        const toolArgs = call.args as { nombre_funcion: string; descripcion: string; codigo_javascript: string; esquema_json: Record<string, unknown>; requiere_admin?: boolean };
        // Lectores solo pueden crear tools de lectura — forzamos requiere_admin=false
        if (rol === 'lector') {
          toolArgs.requiere_admin = false;
        }
        response = await registerDynamicTool(supabase, projectId, toolArgs);
        if ((response as { ok: boolean }).ok) {
          dbTools.push({
            nombre_funcion: toolArgs.nombre_funcion,
            descripcion: toolArgs.descripcion,
            codigo_javascript: toolArgs.codigo_javascript,
            esquema_json: toolArgs.esquema_json,
            requiere_admin: toolArgs.requiere_admin ?? true,
          });
        }
      } else {
        const tool = dbTools.find(t => t.nombre_funcion === call.name);
        response = tool
          ? await executeDynamicTool(tool, call.args, supabase, rol)
          : { ok: false, error: `La tool "${call.name}" no existe.` };
      }

      contents.push({ role: 'function', parts: [{ functionResponse: { name: call.name, response } }] });
    }
  }

  return 'No logré resolver tu pedido en un número razonable de pasos — intenta pedirlo de forma más simple o directa.';
}
