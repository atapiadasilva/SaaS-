import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/mining-cwp-resumen?project_id=&cwp_id=
// Contexto ejecutivo consolidado de un CWP: estado real cruzando todas las fuentes
// (diccionario AWP, programa P6, MC↔ECO-2, Aconex, suministro, IWP).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const cwpId = params.get('cwp_id');
  if (!projectId || !cwpId) return NextResponse.json({ error: 'Missing project_id/cwp_id' }, { status: 400 });

  const sb = supabase as any;
  const [cwpRes, mcRes, docsExactRes, docsSugRes, iwpRes, consRes] = await Promise.all([
    sb.from('mining_cwp').select('fecha_ifc, activity_id_ifc, status_cwp, suministro, ruta_critica, hito_contractual, hh_planner, fecha_ini, fecha_fin, costo_oferta_clp, pct_hh_proyecto')
      .eq('project_id', projectId).eq('cwp_id', cwpId).single(),
    sb.from('mining_mc').select('task_id, item_eco2, cantidad_item, hh_item')
      .eq('project_id', projectId).eq('cwp_id', cwpId),
    sb.from('mining_doc_aconex').select('id', { count: 'exact', head: true })
      .eq('project_id', projectId).eq('cwp_id_exacto', cwpId),
    sb.from('mining_doc_aconex').select('id', { count: 'exact', head: true })
      .eq('project_id', projectId).eq('cwp_sugerido', cwpId),
    sb.from('mining_iwp').select('iwp_id, status, hh_estimadas, avance_fisico_pct')
      .eq('project_id', projectId).eq('cwp_id', cwpId),
    sb.from('mining_iwp_constraint').select('iwp_id, cleared')
      .eq('project_id', projectId).like('iwp_id', `${cwpId}%`),
  ]);
  if (cwpRes.error) return NextResponse.json({ error: cwpRes.error.message }, { status: 404 });

  const mcRows = mcRes.data ?? [];
  const items = [...new Set(mcRows.map((m: any) => m.item_eco2).filter(Boolean))] as string[];

  // Valorización: cantidad de la MC × precio unitario del itemizado ECO-2
  const itemInfo = new Map<string, any>();
  if (items.length) {
    const { data } = await sb.from('mining_itemizado')
      .select('item, descripcion, unidad, pu_clp, hh_unidad, partida_bmp')
      .eq('project_id', projectId).in('item', items);
    for (const it of data ?? []) itemInfo.set(it.item, it);
  }

  const porItem = new Map<string, { item: string; descripcion: string; unidad: string; cantidad: number; monto: number; hh: number }>();
  let montoMC = 0, hhMC = 0, sinMatch = 0;
  for (const m of mcRows) {
    hhMC += Number(m.hh_item ?? 0);
    const info = itemInfo.get(m.item_eco2);
    if (!info) { if (m.item_eco2) sinMatch++; continue; }
    const monto = Number(m.cantidad_item ?? 0) * Number(info.pu_clp ?? 0);
    montoMC += monto;
    const cur = porItem.get(m.item_eco2) ?? { item: m.item_eco2, descripcion: info.descripcion ?? '', unidad: info.unidad ?? '', cantidad: 0, monto: 0, hh: 0 };
    cur.cantidad += Number(m.cantidad_item ?? 0);
    cur.monto += monto;
    cur.hh += Number(m.hh_item ?? 0);
    porItem.set(m.item_eco2, cur);
  }
  const topItems = [...porItem.values()].sort((a, b) => b.monto - a.monto).slice(0, 8);

  const iwps = iwpRes.data ?? [];
  const hhIwp = iwps.reduce((s: number, i: any) => s + Number(i.hh_estimadas ?? 0), 0);
  const avancePonderado = hhIwp > 0
    ? iwps.reduce((s: number, i: any) => s + Number(i.avance_fisico_pct ?? 0) * Number(i.hh_estimadas ?? 0), 0) / hhIwp
    : 0;
  const consPend = (consRes.data ?? []).filter((c: any) => !c.cleared).length;

  return NextResponse.json({
    cwp: cwpRes.data,
    mc: {
      n_actividades: new Set(mcRows.map((m: any) => m.task_id)).size,
      n_items: porItem.size,
      items_sin_match: sinMatch,
      monto_clp: Math.round(montoMC),
      hh: Math.round(hhMC),
      top_items: topItems,
    },
    docs: { exactos: docsExactRes.count ?? 0, sugeridos: docsSugRes.count ?? 0 },
    iwp: {
      n: iwps.length,
      hh_asignadas: hhIwp,
      avance_pct: Math.round(avancePonderado * 10) / 10,
      constraints_pendientes: consPend,
      por_status: iwps.reduce((acc: Record<string, number>, i: any) => { acc[i.status] = (acc[i.status] ?? 0) + 1; return acc; }, {}),
    },
  });
}
