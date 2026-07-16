import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET  /api/mining-cwp-ficha?project_id=&cwp_id=
//   → JSON con { cwp, kpis, programa, itemizado, iwps, planos, ficha } para el editor y la impresión.
// POST /api/mining-cwp-ficha  body { project_id, cwp_id, orientacion, bloques }
//   → guarda la composición editable de la ficha.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const cwpId = params.get('cwp_id');
  if (!projectId || !cwpId) return NextResponse.json({ error: 'Missing project_id/cwp_id' }, { status: 400 });

  const sb = supabase as any;

  const { data: cwp, error: cwpErr } = await sb.from('mining_cwp').select('*')
    .eq('project_id', projectId).eq('cwp_id', cwpId).single();
  if (cwpErr || !cwp) return NextResponse.json({ error: cwpErr?.message ?? 'CWP no encontrado' }, { status: 404 });

  const [progRes, itemRes, planosRes, iwpRes, cwaRes, cvRes, fichaRes, docsRes] = await Promise.all([
    sb.from('mining_programa').select('cod_actividad, nombre_actividad, hh, fecha_inicio, fecha_fin, duracion_dias, unidad, cantidad')
      .eq('project_id', projectId).eq('cwp_id', cwpId).eq('fuente', 'P333').order('fecha_inicio'),
    sb.from('mining_itemizado').select('item, descripcion, descripcion_codigo, unidad, cantidad, hh_unidad, hh_item, partida_bmp, commodity, area')
      .eq('project_id', projectId).eq('cwp_id', cwpId).order('hh_item', { ascending: false }),
    sb.from('mining_planos').select('codigo_documento, descripcion, tipo, ewp_id')
      .eq('project_id', projectId).eq('cwp_id', cwpId).order('codigo_documento'),
    sb.from('mining_iwp').select('iwp_id, descripcion, status, fecha_inicio_plan, fecha_fin_plan, hh_estimadas, avance_fisico_pct, crew_size')
      .eq('project_id', projectId).eq('cwp_id', cwpId).order('iwp_id'),
    sb.from('mining_cwa').select('*').eq('project_id', projectId).eq('cwa_id', cwp.cwa_id).maybeSingle(),
    sb.from('mining_cv').select('*').eq('project_id', projectId).eq('cv_id', cwp.cv_id).maybeSingle(),
    sb.from('mining_cwp_ficha').select('orientacion, bloques, updated_at, updated_by')
      .eq('project_id', projectId).eq('cwp_id', cwpId).maybeSingle(),
    // Metadata Aconex para enriquecer planos: rev, título, código interno, estado, disciplina
    sb.from('mining_doc_aconex').select('n_cmdic, n_interno, titulo, tipo_doc, rev, estado_aconex, disciplina_doc, funcion, fecha_modificacion')
      .eq('project_id', projectId),
  ]);

  const prog: any[] = progRes.data ?? [];
  const items: any[] = itemRes.data ?? [];
  const planosRaw: any[] = planosRes.data ?? [];
  const iwps: any[] = iwpRes.data ?? [];

  // Índice de metadata Aconex por código de documento
  const docMeta = new Map<string, any>();
  for (const d of docsRes.data ?? []) if (d.n_cmdic) docMeta.set(d.n_cmdic, d);

  // Constraints pendientes por IWP
  const consByIwp = new Map<string, { total: number; pend: number }>();
  if (iwps.length) {
    const { data: cons } = await sb.from('mining_iwp_constraint').select('iwp_id, cleared')
      .eq('project_id', projectId).in('iwp_id', iwps.map((i: any) => i.iwp_id));
    for (const c of cons ?? []) {
      const m = consByIwp.get(c.iwp_id) ?? { total: 0, pend: 0 };
      m.total++; if (!c.cleared) m.pend++;
      consByIwp.set(c.iwp_id, m);
    }
  }

  const num = (v: any) => v == null ? null : Number(v);
  const hhProg = prog.reduce((s, t) => s + (Number(t.hh) || 0), 0);
  const hhItem = items.reduce((s, i) => s + (Number(i.hh_item) || 0), 0);
  const progIni = prog.map(t => t.fecha_inicio).filter(Boolean).sort()[0] ?? null;
  const progFin = prog.map(t => t.fecha_fin).filter(Boolean).sort().slice(-1)[0] ?? null;
  const hhIwp = iwps.reduce((s, i) => s + (Number(i.hh_estimadas) || 0), 0);
  const avanceCwp = hhIwp > 0
    ? Math.round(iwps.reduce((s, i) => s + (Number(i.avance_fisico_pct) || 0) * (Number(i.hh_estimadas) || 0), 0) / hhIwp)
    : null;

  const planos = planosRaw.map(p => {
    const m = docMeta.get(p.codigo_documento);
    return {
      codigo: p.codigo_documento,
      descripcion: m?.titulo || p.descripcion || '',
      tipo: p.tipo || m?.tipo_doc || '',
      rev: m?.rev ?? null,
      n_interno: m?.n_interno ?? null,
      estado: m?.estado_aconex ?? null,
      disciplina: m?.disciplina_doc ?? null,
      ewp_id: p.ewp_id ?? null,
    };
  });

  return NextResponse.json({
    cwp: {
      cwp_id: cwp.cwp_id, cwp_nombre: cwp.cwp_nombre, disciplina_cod: cwp.disciplina_cod,
      disciplina: cwp.disciplina, disciplina_grupo: cwp.disciplina_grupo,
      cwa_id: cwp.cwa_id, cv_id: cwp.cv_id, ewp_id: cwp.ewp_id,
      alcance: cwp.alcance, costo_oferta_clp: num(cwp.costo_oferta_clp),
      ruta_critica: cwp.ruta_critica, status_cwp: cwp.status_cwp,
      hito_contractual: cwp.hito_contractual, es_oficial: cwp.es_oficial,
      cwaNombre: cwaRes.data?.nombre ?? cwaRes.data?.name ?? '',
      cvNombre: cvRes.data?.nombre ?? cvRes.data?.name ?? '',
    },
    kpis: {
      hhProg, hhItem, nProg: prog.length, nItems: items.length,
      progIni, progFin, nIwp: iwps.length, avanceCwp,
      costo: num(cwp.costo_oferta_clp),
    },
    programa: prog.map(t => ({
      cod: t.cod_actividad, nombre: t.nombre_actividad, ini: t.fecha_inicio, fin: t.fecha_fin,
      hh: Number(t.hh) || 0, unidad: t.unidad, cantidad: num(t.cantidad),
    })),
    itemizado: items.map(i => ({
      item: i.item, descripcion: i.descripcion, detalle: i.descripcion_codigo, partida: i.partida_bmp,
      cantidad: num(i.cantidad), unidad: i.unidad, hh_unidad: num(i.hh_unidad), hh_item: Number(i.hh_item) || 0,
      commodity: i.commodity,
    })),
    iwps: iwps.map(i => {
      const c = consByIwp.get(i.iwp_id) ?? { total: 0, pend: 0 };
      return {
        iwp_id: i.iwp_id, descripcion: i.descripcion, status: i.status,
        ini: i.fecha_inicio_plan, fin: i.fecha_fin_plan, hh: Number(i.hh_estimadas) || 0,
        avance: Number(i.avance_fisico_pct) || 0, crew: num(i.crew_size),
        consPend: c.pend, consTotal: c.total,
      };
    }),
    planos,
    ficha: fichaRes.data ?? null,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, cwp_id, orientacion, bloques } = body ?? {};
  if (!project_id || !cwp_id) return NextResponse.json({ error: 'Missing project_id/cwp_id' }, { status: 400 });
  if (!Array.isArray(bloques)) return NextResponse.json({ error: 'bloques debe ser un arreglo' }, { status: 400 });

  const sb = supabase as any;
  const { error } = await sb.from('mining_cwp_ficha').upsert({
    project_id, cwp_id,
    orientacion: orientacion === 'horizontal' ? 'horizontal' : 'vertical',
    bloques,
    updated_at: new Date().toISOString(),
    updated_by: user.email ?? user.id,
  }, { onConflict: 'project_id,cwp_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
