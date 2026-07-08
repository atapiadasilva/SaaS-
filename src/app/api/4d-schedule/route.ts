import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Estructura persistida: projects.module_config['4d_schedule'] =
// { cwp: { "312101.C001": { start: "2026-08-08", end: "2027-03-06" }, ... }, cwa: {...}, cv: {...}, swp: {...} }

// GET /api/4d-schedule?project_id=&nivel=cwp|cwa|cv|swp
// Devuelve el schedule guardado para el nivel solicitado
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const nivel = params.get('nivel') as 'cwp' | 'cwa' | 'cv' | 'swp' | null;
  if (!projectId || !nivel) return NextResponse.json({ error: 'Missing project_id or nivel' }, { status: 400 });

  const { data: proj, error } = await (supabase as any)
    .from('projects')
    .select('module_config')
    .eq('id', projectId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const schedule: Record<string, { start: string; end: string }> =
    proj?.module_config?.['4d_schedule']?.[nivel] ?? {};

  return NextResponse.json({ schedule });
}

// PATCH /api/4d-schedule
// Body: { project_id, nivel, schedule: Record<string, { start: string; end: string }> }
// Persiste el schedule completo del nivel (reemplaza el anterior)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, nivel, schedule } = body ?? {};
  if (!project_id || !nivel || typeof schedule !== 'object') {
    return NextResponse.json({ error: 'Missing project_id, nivel or schedule' }, { status: 400 });
  }

  // Leer el schedule completo actual para hacer merge granular
  const { data: proj } = await (supabase as any)
    .from('projects')
    .select('module_config')
    .eq('id', project_id)
    .single();

  const current4d = proj?.module_config?.['4d_schedule'] ?? {};
  const updated4d = { ...current4d, [nivel]: schedule };

  const { error } = await (supabase as any).rpc('merge_module_config', {
    p_project_id: project_id,
    p_key: '4d_schedule',
    p_value: updated4d,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
