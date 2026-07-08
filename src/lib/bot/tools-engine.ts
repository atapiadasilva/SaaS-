import type { SupabaseClient } from '@supabase/supabase-js';

export interface DbTool {
  nombre_funcion: string;
  descripcion: string;
  codigo_javascript: string;
  esquema_json: Record<string, unknown>;
  requiere_admin: boolean;
}

// Tool meta — siempre disponible para usuarios admin, deja que Gemini se cree
// tools nuevas sobre la marcha cuando algo útil no existe todavía.
export const CREAR_HERRAMIENTA_TOOL = {
  name: 'crear_herramienta_dinamica',
  description: 'Crea y registra una nueva tool cuando el usuario (admin) pide una consulta o acción que no existe todavía como herramienta. Sé conservador: el código debe hacer EXACTAMENTE lo pedido, nada más.',
  parameters: {
    type: 'OBJECT',
    properties: {
      nombre_funcion: { type: 'STRING', description: "snake_case, único, empieza con 'obtener_', 'consultar_' o 'actualizar_'" },
      descripcion: { type: 'STRING', description: 'Qué hace, en una frase' },
      codigo_javascript: { type: 'STRING', description: "Cuerpo de una función async. Recibe 'supabase' (cliente con acceso total) y 'args' (objeto con los parámetros). Debe hacer return con el resultado." },
      esquema_json: { type: 'OBJECT', description: 'JSON Schema de los parámetros que recibirá la tool en args (formato OBJECT con properties)' },
      requiere_admin: { type: 'BOOLEAN', description: 'true si la tool escribe/actualiza/borra datos; false si solo lee' },
    },
    required: ['nombre_funcion', 'descripcion', 'codigo_javascript', 'esquema_json', 'requiere_admin'],
  },
};

export async function loadDynamicTools(supabase: SupabaseClient, projectId: string): Promise<DbTool[]> {
  const { data } = await supabase
    .from('bot_tools_dinamicas')
    .select('nombre_funcion, descripcion, codigo_javascript, esquema_json, requiere_admin')
    .eq('project_id', projectId);
  return (data ?? []) as DbTool[];
}

export function buildFunctionDeclarations(tools: DbTool[], rol: 'admin' | 'lector') {
  const declarations = tools.map(t => ({
    name: t.nombre_funcion,
    description: t.descripcion,
    parameters: t.esquema_json,
  }));
  // La tool de auto-creación se ofrece a todos los roles — la restricción de que
  // un lector solo pueda crear tools de lectura se aplica en el momento de registro.
  declarations.push(CREAR_HERRAMIENTA_TOOL);
  return declarations;
}

interface ExecuteResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

// Corre el código JS de una tool dinámica con acceso a supabase y a los args que pasó Gemini.
// Guardia de rol: si la tool requiere admin y el usuario es lector, ni se ejecuta.
export async function executeDynamicTool(
  tool: DbTool,
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  rol: 'admin' | 'lector'
): Promise<ExecuteResult> {
  if (tool.requiere_admin && rol !== 'admin') {
    return { ok: false, error: 'PERMISO_DENEGADO: esta acción requiere un usuario admin. El usuario actual es lector y no puede ejecutarla.' };
  }

  try {
    const fn = new Function(
      'supabase',
      'args',
      `return (async () => { ${tool.codigo_javascript} })();`
    );
    const timeoutMs = 8000;
    const result = await Promise.race([
      fn(supabase, args),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)),
    ]);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function registerDynamicTool(
  supabase: SupabaseClient,
  projectId: string,
  args: { nombre_funcion: string; descripcion: string; codigo_javascript: string; esquema_json: Record<string, unknown>; requiere_admin?: boolean }
): Promise<ExecuteResult> {
  const { error } = await supabase.from('bot_tools_dinamicas').upsert({
    project_id: projectId,
    nombre_funcion: args.nombre_funcion,
    descripcion: args.descripcion,
    codigo_javascript: args.codigo_javascript,
    esquema_json: args.esquema_json,
    requiere_admin: args.requiere_admin ?? true,
  }, { onConflict: 'project_id,nombre_funcion' });

  if (error) return { ok: false, error: error.message };
  return { ok: true, result: { creada: args.nombre_funcion } };
}
