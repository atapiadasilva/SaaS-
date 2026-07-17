import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Control del programa trisemanal (3WLA) por CWP.
// GET ?project_id=[&fecha_control=]  → { fechas, fecha, cwps: [{cwp_id, nombre, disciplina, hh, actividades[], restricciones[]}] }
// PATCH { project_id, restriccion_id, status?, fecha_cierre?, observacion? } → gestiona una restricción
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pid = req.nextUrl.searchParams.get('project_id');
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  const sb = supabase as any;

  // Fechas de control disponibles (snapshots semanales)
  const { data: fechasRows } = await sb.from('mining_3wla')
    .select('fecha_control').eq('project_id', pid).order('fecha_control', { ascending: false });
  const fechasArr: string[] = ((fechasRows ?? []) as any[]).map((r: any) => String(r.fecha_control));
  const fechas: string[] = Array.from(new Set<string>(fechasArr));
  const fecha = req.nextUrl.searchParams.get('fecha_control') || fechas[0] || null;
  if (!fecha) return NextResponse.json({ fechas: [], fecha: null, cwps: [] });

  const [actRes, restrRes, cwpRes] = await Promise.all([
    sb.from('mining_3wla').select('*').eq('project_id', pid).eq('fecha_control', fecha).order('fecha_ini'),
    sb.from('mining_3wla_restriccion').select('*').eq('project_id', pid).eq('fecha_control', fecha),
    sb.from('mining_cwp').select('cwp_id, cwp_nombre, disciplina_cod, disciplina').eq('project_id', pid),
  ]);
  const acts: any[] = actRes.data ?? [];
  const restr: any[] = restrRes.data ?? [];
  const cwpInfo = new Map<string, any>((cwpRes.data ?? []).map((c: any) => [c.cwp_id, c]));

  const byCwp = new Map<string, any>();
  const key = (id: string | null) => id ?? '__sin_cwp__';
  for (const a of acts) {
    const k = key(a.cwp_id);
    if (!byCwp.has(k)) {
      const info = a.cwp_id ? cwpInfo.get(a.cwp_id) : null;
      byCwp.set(k, {
        cwp_id: a.cwp_id, nombre: info?.cwp_nombre ?? (a.cwp_id ? '' : 'Sin CWP'),
        disciplina_cod: info?.disciplina_cod ?? null, disciplina: info?.disciplina ?? null,
        hh: 0, actividades: [], restricciones: [],
      });
    }
    const g = byCwp.get(k);
    g.hh += Number(a.hh_total) || 0;
    g.actividades.push(a);
  }
  for (const r of restr) {
    const k = key(r.cwp_id);
    if (!byCwp.has(k)) {
      const info = r.cwp_id ? cwpInfo.get(r.cwp_id) : null;
      byCwp.set(k, { cwp_id: r.cwp_id, nombre: info?.cwp_nombre ?? 'Sin CWP', disciplina_cod: info?.disciplina_cod ?? null, hh: 0, actividades: [], restricciones: [] });
    }
    byCwp.get(k).restricciones.push(r);
  }

  const cwps = [...byCwp.values()].sort((a, b) => b.hh - a.hh);
  return NextResponse.json({
    fechas, fecha,
    total: { actividades: acts.length, hh: acts.reduce((s, a) => s + (Number(a.hh_total) || 0), 0),
             restr_abiertas: restr.filter(r => r.status === 'Abierta').length, cwps: cwps.length },
    cwps,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, restriccion_id, ...campos } = body ?? {};
  if (!project_id || !restriccion_id) return NextResponse.json({ error: 'Missing project_id/restriccion_id' }, { status: 400 });

  const patch: Record<string, any> = {};
  if (typeof campos.status === 'string') {
    patch.status = campos.status;
    if (campos.status === 'Cerrada') patch.fecha_cierre = new Date().toISOString().slice(0, 10);
  }
  if ('observacion' in campos) patch.observacion = campos.observacion;
  if ('fecha_compromiso' in campos) patch.fecha_compromiso = campos.fecha_compromiso || null;

  const sb = supabase as any;
  const { error } = await sb.from('mining_3wla_restriccion').update(patch)
    .eq('project_id', project_id).eq('id', restriccion_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
