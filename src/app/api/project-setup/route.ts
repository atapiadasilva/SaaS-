import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolverModulos, type ModuleKey } from '@/lib/modules';

// GET  ?project_id=  → { active_modules, external_code, fuentes[] } (estado de onboarding)
// PATCH { project_id, active_modules?, external_code? }
const FUENTES: { key: string; label: string; tabla: string; modulos: ModuleKey[] }[] = [
  { key: 'elementos',  label: 'Elementos BIM (modelo 3D)',       tabla: 'mining_elementos',  modulos: ['mineria'] },
  { key: 'cwp',        label: 'Catálogo AWP (CWA/CV/CWP)',        tabla: 'mining_cwp',        modulos: ['mineria', 'planificacion'] },
  { key: 'programa',   label: 'Programa (Primavera P6)',         tabla: 'mining_programa',   modulos: ['planificacion', 'recursos'] },
  { key: 'itemizado',  label: 'Itemizado / Matriz (ECO-2)',      tabla: 'mining_itemizado',  modulos: ['estado-pago', 'conciliacion'] },
  { key: 'planos',     label: 'Planos vinculados',               tabla: 'mining_planos',     modulos: ['mineria'] },
  { key: 'documentos', label: 'Documentos Aconex',               tabla: 'mining_doc_aconex', modulos: ['calidad', 'sso', 'medio-ambiente'] },
  { key: 'trisemanal', label: 'Programa trisemanal (3WLA)',      tabla: 'mining_3wla',       modulos: ['trisemanal'] },
];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const pid = req.nextUrl.searchParams.get('project_id');
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  const sb = supabase as any;

  const { data: proj } = await sb.from('projects').select('active_modules, module_config').eq('id', pid).single();
  const counts = await Promise.all(FUENTES.map(async f => {
    const { count } = await sb.from(f.tabla).select('id', { count: 'exact', head: true }).eq('project_id', pid);
    return { ...f, count: count ?? 0 };
  }));

  return NextResponse.json({
    active_modules: resolverModulos(proj?.active_modules),
    external_code: proj?.module_config?.external_code ?? '',
    fuentes: counts,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { project_id, active_modules, external_code } = await req.json();
  if (!project_id) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  const sb = supabase as any;

  const patch: Record<string, any> = {};
  if (Array.isArray(active_modules)) patch.active_modules = resolverModulos(active_modules);
  if (typeof external_code === 'string') {
    const { data: proj } = await sb.from('projects').select('module_config').eq('id', project_id).single();
    patch.module_config = { ...(proj?.module_config ?? {}), external_code };
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  const { error } = await sb.from('projects').update(patch).eq('id', project_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
