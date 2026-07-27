import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolverModulos } from '@/lib/modules';
import { FUENTES } from '@/lib/fuentes-datos';

// GET  ?project_id=  → { active_modules, external_code, fuentes[] } (estado de onboarding)
// PATCH { project_id, active_modules?, external_code? }
// El catálogo de fuentes vive en `@/lib/fuentes-datos` — el mismo que usa la vista de
// cartera, para que el checklist del proyecto y la matriz de la organización no se
// desincronicen nunca.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const pid = req.nextUrl.searchParams.get('project_id');
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  const sb = supabase as any;

  const { data: proj } = await sb.from('projects').select('active_modules, module_config').eq('id', pid).single();
  const counts = await Promise.all(FUENTES.map(async f => {
    const { count } = await sb.from(f.tabla).select('*', { count: 'exact', head: true }).eq('project_id', pid);
    const total = count ?? 0;
    // Además del volumen, cuánta de esa data trae la llave CWP: una fuente cargada pero
    // sin llave no conecta con el resto del proyecto.
    let conLlave: number | null = null;
    if (f.campoCwp && total) {
      const { count: c2 } = await sb.from(f.tabla).select('*', { count: 'exact', head: true })
        .eq('project_id', pid).not(f.campoCwp, 'is', null);
      conLlave = c2 ?? 0;
    } else if (f.campoCwp) conLlave = 0;
    return { ...f, count: total, conLlave };
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
