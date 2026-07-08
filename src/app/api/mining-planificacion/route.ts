import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/mining-planificacion?project_id=
// Payload completo para el módulo de planificación (sin modelo 3D):
// programa P333 vigente (tareas + hitos con su WBS de Primavera), CWP/CWA con metadata,
// e hitos contractuales. Los IWP se obtienen del endpoint existente /api/mining-iwp.

// PATCH /api/mining-planificacion
// body: { project_id, programa_id, cwp_id } → asigna el CWP a la actividad del programa
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;
  const [progRes, cwpRes, cwaRes, hitosRes] = await Promise.all([
    sb.from('mining_programa')
      .select('id, cwp_id, cod_actividad, nombre_actividad, hh, fecha_inicio, fecha_fin, tipo, wbs, sector, cantidad, unidad, duracion_dias')
      .eq('project_id', projectId).eq('fuente', 'P333')
      .order('fecha_inicio'),
    sb.from('mining_cwp')
      .select('cwp_id, cwp_nombre, cwa_id, cv_id, disciplina_cod, disciplina, hh_planner, fecha_ini, fecha_fin, ruta_critica, fecha_ifc, status_cwp, costo_oferta_clp, hito_contractual')
      .eq('project_id', projectId).eq('es_oficial', true),
    sb.from('mining_cwa')
      .select('cwa_id, cwa_nombre')
      .eq('project_id', projectId),
    sb.from('mining_hitos')
      .select('numero, hito, plazo_dias, multa')
      .eq('project_id', projectId).order('numero'),
  ]);

  const firstError = [progRes, cwpRes, cwaRes, hitosRes].find(r => r.error);
  if (firstError?.error) return NextResponse.json({ error: firstError.error.message }, { status: 500 });

  return NextResponse.json({
    actividades: progRes.data ?? [],
    cwps: cwpRes.data ?? [],
    cwas: cwaRes.data ?? [],
    hitos: hitosRes.data ?? [],
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, programa_id, cwp_id } = body ?? {};
  if (!project_id || !programa_id || !cwp_id) {
    return NextResponse.json({ error: 'Missing project_id, programa_id, or cwp_id' }, { status: 400 });
  }

  const sb = supabase as any;
  const { error } = await sb.from('mining_programa')
    .update({ cwp_id })
    .eq('project_id', project_id)
    .eq('id', programa_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
