import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Panel KPI general del proyecto: consolida contrato, programa, conciliación,
// avance físico/financiero, dotación, consideraciones, entregables clave y compromisos.
// GET ?project_id= → payload completo del panel

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pid = req.nextUrl.searchParams.get('project_id');
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  const sb = supabase as any;

  const [itemRes, progRes, cwpRes, iwpRes, hitosRes, pondRes, avanceRes, consRes, docsRes, dotRes, eqRes, estRes] = await Promise.all([
    sb.from('mining_itemizado').select('item, partida_bmp, cwp_id, hh_item, p_total_clp').eq('project_id', pid),
    sb.from('mining_programa').select('id, cwp_id, hh, fecha_inicio, fecha_fin, tipo').eq('project_id', pid).eq('fuente', 'P333'),
    sb.from('mining_cwp').select('cwp_id, hh_planner, costo_oferta_clp, ruta_critica').eq('project_id', pid).eq('es_oficial', true),
    sb.from('mining_iwp').select('iwp_id, status, avance_fisico_pct').eq('project_id', pid),
    sb.from('mining_hitos').select('numero, hito, plazo_dias, multa').eq('project_id', pid).order('numero'),
    sb.from('mining_ponderaciones').select('id, item_code, subitem_code, tipo, peso').eq('project_id', pid),
    sb.from('mining_avance_pasos').select('item, ponderacion_id, pct').eq('project_id', pid),
    sb.from('mining_consideraciones').select('depto, tipo, severidad, estado, titulo, cwp_id, fecha_limite, fecha_reporte, n_cmdic, metadata').eq('project_id', pid),
    sb.from('mining_doc_aconex').select('estado_aconex, funcion, tipo_doc, rev').eq('project_id', pid),
    sb.from('mining_dotacion').select('fecha, mod_hd, moi_hd, mod_hh_acum, moi_hh_acum').eq('project_id', pid).order('fecha'),
    sb.from('mining_equipos').select('descripcion, patente_codigo, acreditado').eq('project_id', pid),
    sb.from('mining_estudio_aconex').select('categoria, n_cmdic, titulo, data').eq('project_id', pid),
  ]);
  const err = [itemRes, progRes, cwpRes, iwpRes, hitosRes, pondRes, avanceRes, consRes, docsRes, dotRes, eqRes, estRes].find(r => r.error);
  if (err?.error) return NextResponse.json({ error: err.error.message }, { status: 500 });

  const items = itemRes.data ?? [];
  const prog = progRes.data ?? [];
  const cwps = cwpRes.data ?? [];
  const cons = consRes.data ?? [];
  const docs = docsRes.data ?? [];
  const estudio = estRes.data ?? [];

  // ── Contrato / economía ──
  const contratoClp = items.reduce((s: number, i: any) => s + (Number(i.p_total_clp) || 0), 0);
  const eco2Hh = items.reduce((s: number, i: any) => s + (Number(i.hh_item) || 0), 0);
  const progHh = prog.reduce((s: number, a: any) => s + (Number(a.hh) || 0), 0);
  const cwpHh = cwps.reduce((s: number, c: any) => s + (Number(c.hh_planner) || 0), 0);
  const cwpClp = cwps.reduce((s: number, c: any) => s + (Number(c.costo_oferta_clp) || 0), 0);

  // ── Avance físico/financiero (pasos BMP registrados) ──
  const pondById = new Map((pondRes.data ?? []).map((p: any) => [p.id, p]));
  const pondByPartida = new Map<string, any[]>();
  for (const p of pondRes.data ?? []) {
    const code = p.subitem_code ?? p.item_code;
    const arr = pondByPartida.get(code) ?? [];
    arr.push(p);
    pondByPartida.set(code, arr);
  }
  const avancePorItem = new Map<string, Map<string, number>>();
  for (const a of avanceRes.data ?? []) {
    const m = avancePorItem.get(a.item) ?? new Map();
    m.set(a.ponderacion_id, Number(a.pct));
    avancePorItem.set(a.item, m);
  }
  let fisicoPond = 0, fisicoBase = 0, ganado = 0;
  for (const it of items) {
    const monto = Number(it.p_total_clp) || 0;
    const pasos = pondByPartida.get(it.partida_bmp) ?? [];
    const avMap = avancePorItem.get(it.item);
    for (const tipo of ['fisico', 'financiero'] as const) {
      const grupo = pasos.filter((p: any) => p.tipo === tipo);
      if (!grupo.length) continue;
      const totalPeso = grupo.reduce((s: number, p: any) => s + Number(p.peso), 0);
      if (!totalPeso) continue;
      const av = grupo.reduce((s: number, p: any) => s + Number(p.peso) * ((avMap?.get(p.id) ?? 0) / 100), 0) / totalPeso;
      if (tipo === 'fisico') { fisicoPond += monto * av; fisicoBase += monto; }
      else ganado += monto * av;
    }
  }

  // ── Conciliación ──
  const bmpCodes = new Set([...pondByPartida.keys()]);
  const conciliacion = {
    eco2_cwp: { ok: items.filter((i: any) => i.cwp_id).length, total: items.length },
    eco2_bmp: { ok: items.filter((i: any) => i.partida_bmp && bmpCodes.has(i.partida_bmp)).length, total: items.length },
    prog_cwp: { ok: prog.filter((a: any) => a.cwp_id).length, total: prog.length },
    aconex_cwp: { ok: 0, total: 0 }, // se completa abajo con query dedicada
  };
  const { data: aconexCov } = await sb.from('mining_doc_aconex').select('cwp_id_exacto').eq('project_id', pid);
  conciliacion.aconex_cwp = { ok: (aconexCov ?? []).filter((d: any) => d.cwp_id_exacto).length, total: (aconexCov ?? []).length };

  // ── Consideraciones por depto ──
  const deptos: Record<string, { abiertas: number; bloqueantes: number }> = {};
  for (const c of cons) {
    const d = deptos[c.depto] ?? { abiertas: 0, bloqueantes: 0 };
    if (c.estado !== 'CERRADA') {
      d.abiertas++;
      if (c.severidad === 'BLOQUEANTE') d.bloqueantes++;
    }
    deptos[c.depto] = d;
  }
  const abiertas = cons.filter((c: any) => c.estado !== 'CERRADA' && c.severidad !== 'INFO');

  // ── Documental ──
  const esAprobado = (e: string | null) => !!e && /aprobado/i.test(e) && !/para aprob/i.test(e);
  const esRechazado = (e: string | null) => !!e && /rechaz/i.test(e);
  const documental = {
    total: docs.length,
    aprobados: docs.filter((d: any) => esAprobado(d.estado_aconex)).length,
    rechazados: docs.filter((d: any) => esRechazado(d.estado_aconex)).length,
    en_revision: docs.filter((d: any) => d.estado_aconex && !esAprobado(d.estado_aconex) && !esRechazado(d.estado_aconex)).length,
  };

  // ── Estudio: singletons + RFI + compromisos ──
  const get1 = (cat: string) => estudio.find((e: any) => e.categoria === cat)?.data ?? null;
  const rfis = estudio.filter((e: any) => e.categoria === 'rfi');
  const rfiCambioDiseno = rfis.filter((e: any) => e.data?.implica_cambio_diseno === true || String(e.data?.implica_cambio_diseno).toLowerCase() === 'sí' || String(e.data?.implica_cambio_diseno).toLowerCase() === 'si');
  const compromisos = estudio
    .filter((e: any) => e.categoria === 'correspondencia' && e.data?.compromiso_o_accion_pendiente)
    .map((e: any) => ({ carta: e.n_cmdic, asunto: e.data.asunto, compromiso: e.data.compromiso_o_accion_pendiente, fecha_limite: e.data.fecha_limite ?? null, fecha: e.data.fecha ?? null }));

  const estadoPago = get1('estado_pago');
  const programaCons = get1('programa_construccion');
  const repSemanal = get1('reporte_semanal_001');

  return NextResponse.json({
    contrato: {
      valor_clp: contratoClp,
      anticipo_clp: estadoPago?.desglose?.find((d: any) => /Anticipo/i.test(d.concepto))?.monto_clp ?? null,
      ep1: estadoPago ? { n_cmdic: estadoPago.n_cmdic, periodo: estadoPago.periodo, liquido: estadoPago.monto_total_clp } : null,
      inicio: programaCons?.inicio ?? '30-04-2026',
      fin: programaCons?.fin ?? '15-09-2027',
      duracion_dias: programaCons?.duracion_dias ?? 504,
      hitos_programa: programaCons?.hitos ?? [],
      programa_nota: programaCons?.nota_aprobacion ?? null,
    },
    avance: {
      fisico_pct: fisicoBase ? (fisicoPond / fisicoBase) * 100 : 0,
      financiero_clp: ganado,
      financiero_pct: contratoClp ? (ganado / contratoClp) * 100 : 0,
      semanal: repSemanal ? { real: repSemanal.pct_avance_real, plan: repSemanal.pct_avance_plan, corte: repSemanal.n_cmdic } : null,
      iwps: (iwpRes.data ?? []).length,
    },
    integridad: {
      eco2_clp: contratoClp,
      ep_valor_contrato: estadoPago?.desglose?.find((d: any) => /Contrato Inicial/i.test(d.concepto))?.monto_clp ?? null,
      eco2_hh: eco2Hh,
      prog_hh: progHh,
      cwp_hh: cwpHh,
      cwp_clp: cwpClp,
      conciliacion,
    },
    deptos,
    consideraciones_abiertas: abiertas,
    documental,
    dotacion: dotRes.data ?? [],
    equipos: eqRes.data ?? [],
    rfi: { total: rfis.length, cambio_diseno: rfiCambioDiseno.length, detalle: rfiCambioDiseno.map((e: any) => ({ n_cmdic: e.n_cmdic, titulo: e.titulo, cwa: e.data?.cwa_relacionada, disciplina: e.data?.disciplina })) },
    compromisos,
    hitos_contractuales: hitosRes.data ?? [],
  });
}
