import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pid = req.nextUrl.searchParams.get('project_id');
  const cwp_id = req.nextUrl.searchParams.get('cwp_id');
  const iwp_id = req.nextUrl.searchParams.get('iwp_id');

  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  const sb = supabase as any;

  if (iwp_id) {
    const [iwpRes, actRes, constRes, progRes] = await Promise.all([
      sb.from('mining_iwp').select('*').eq('project_id', pid).eq('iwp_id', iwp_id).single(),
      sb.from('mining_iwp_actividad').select('*, mining_programa(id, cod_actividad, nombre_actividad, hh, fecha_inicio, fecha_fin, tipo)').eq('project_id', pid).eq('iwp_id', iwp_id),
      sb.from('mining_iwp_constraint').select('*').eq('project_id', pid).eq('iwp_id', iwp_id),
      sb.from('mining_iwp_progreso').select('*').eq('project_id', pid).eq('iwp_id', iwp_id).order('fecha_reporte', { ascending: false }),
    ]);
    if (iwpRes.error) return NextResponse.json({ error: iwpRes.error.message }, { status: 500 });
    return NextResponse.json({
      iwp: iwpRes.data,
      actividades: (actRes.data ?? []).map((a: any) => ({
        ...a,
        prog: a.mining_programa
          ? { ...a.mining_programa, codigo: a.mining_programa.cod_actividad, descripcion: a.mining_programa.nombre_actividad }
          : null,
      })),
      constraints: constRes.data ?? [],
      progreso: progRes.data ?? [],
    });
  }

  const [iwpsRes, cwpRes] = await Promise.all([
    cwp_id ? sb.from('mining_iwp').select('*').eq('project_id', pid).eq('cwp_id', cwp_id).order('fecha_creacion', { ascending: false }) : Promise.resolve({ data: [] }),
    cwp_id ? sb.from('mining_cwp').select('hh_planner, disciplina_cod').eq('project_id', pid).eq('cwp_id', cwp_id).single() : Promise.resolve({ data: null }),
  ]);
  if (iwpsRes.error) return NextResponse.json({ error: iwpsRes.error.message }, { status: 500 });

  const iwps = iwpsRes.data ?? [];
  const constRes = await sb.from('mining_iwp_constraint').select('iwp_id, cleared').eq('project_id', pid).in('iwp_id', iwps.map((i: any) => i.iwp_id));
  const constByIwp = new Map<string, { total: number; despejados: number }>();
  for (const c of constRes.data ?? []) {
    const m = constByIwp.get(c.iwp_id) ?? { total: 0, despejados: 0 };
    m.total++;
    if (c.cleared) m.despejados++;
    constByIwp.set(c.iwp_id, m);
  }

  return NextResponse.json({
    cwp: cwpRes.data,
    iwps: iwps.map((i: any) => ({
      ...i,
      constraints: constByIwp.get(i.iwp_id) ?? { total: 0, despejados: 0 },
    })),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, cwp_id, descripcion, fecha_inicio_plan, fecha_fin_plan, crew_size, actividades, imagenes, descripcion_scope } = body;

  if (!project_id || !cwp_id || !descripcion || !fecha_inicio_plan || !fecha_fin_plan) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const sb = supabase as any;
  const { data: cwp, error: cwpErr } = await sb.from('mining_cwp').select('cwp_id, hh_planner').eq('project_id', project_id).eq('cwp_id', cwp_id).single();
  if (cwpErr || !cwp) return NextResponse.json({ error: 'CWP not found' }, { status: 404 });

  const { data: lastIwp } = await sb.from('mining_iwp').select('iwp_id').eq('project_id', project_id).eq('cwp_id', cwp_id).order('iwp_id', { ascending: false }).limit(1);
  const seq = lastIwp && lastIwp.length > 0 ? parseInt(lastIwp[0].iwp_id.split('-').pop() || '0') + 1 : 1;
  const iwp_id = `${cwp_id}-IWP-${String(seq).padStart(2, '0')}`;

  const hh_est = Array.isArray(actividades) ? actividades.reduce((s: number, a: any) => s + (Number(a.hh_asignadas_iwp) || 0), 0) : 0;
  const fecha_ini = new Date(fecha_inicio_plan);
  const semana = Math.ceil((fecha_ini.getDate() + new Date(fecha_ini.getFullYear(), fecha_ini.getMonth(), 1).getDay()) / 7);

  const { data: newIwp, error: iwpErr } = await sb.from('mining_iwp').insert({
    project_id, cwp_id, iwp_id, descripcion, descripcion_scope: descripcion_scope || null, fecha_inicio_plan, fecha_fin_plan, crew_size: crew_size || null,
    hh_estimadas: hh_est, semana_ejecucion: semana, status: 'Planificado', avance_fisico_pct: 0,
    imagenes: Array.isArray(imagenes) ? imagenes : [], creado_por: user.email, fecha_creacion: new Date().toISOString(),
  }).select().single();

  if (iwpErr) return NextResponse.json({ error: iwpErr.message }, { status: 500 });

  if (Array.isArray(actividades) && actividades.length > 0) {
    const actPayload = actividades.map((a: any) => ({
      project_id, iwp_id, programa_id: a.programa_id, hh_asignadas_iwp: Number(a.hh_asignadas_iwp) || 0,
      cantidad_asignada: a.cantidad_asignada ?? null, unidad: a.unidad ?? null,
    }));
    const { error: actErr } = await sb.from('mining_iwp_actividad').insert(actPayload);
    if (actErr) {
      await sb.from('mining_iwp').delete().eq('iwp_id', iwp_id).eq('project_id', project_id);
      return NextResponse.json({ error: actErr.message }, { status: 500 });
    }
  }

  return NextResponse.json(newIwp, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, iwp_id, ...updates } = body;

  if (!project_id || !iwp_id) return NextResponse.json({ error: 'Missing project_id or iwp_id' }, { status: 400 });

  const sb = supabase as any;
  const { error } = await sb.from('mining_iwp')
    .update({ ...updates, fecha_ultima_actualizacion: new Date().toISOString() })
    .eq('project_id', project_id).eq('iwp_id', iwp_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pid = req.nextUrl.searchParams.get('project_id');
  const iwp_id = req.nextUrl.searchParams.get('iwp_id');

  if (!pid || !iwp_id) return NextResponse.json({ error: 'Missing project_id or iwp_id' }, { status: 400 });

  const sb = supabase as any;
  const { error } = await sb.from('mining_iwp').delete().eq('project_id', pid).eq('iwp_id', iwp_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
