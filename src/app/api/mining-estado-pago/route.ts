import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Estado de Pago: avance físico/financiero por item del ECO-2 según las
// Bases de Medición y Pago (mining_ponderaciones), guardado paso a paso
// en mining_avance_pasos.
//
// GET   ?project_id=  → { items, pasos, avances }
// PATCH { project_id, item, ponderacion_id, pct } → upsert avance de ese paso

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pid = req.nextUrl.searchParams.get('project_id');
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  const sb = supabase as any;

  const [itemRes, pondRes, avanceRes] = await Promise.all([
    sb.from('mining_itemizado')
      .select('id, item, n_partida, partida_bmp, area, cwa_id, commodity, descripcion, obra, unidad, cantidad, hh_item, pu_clp, p_total_clp, cwp_id')
      .eq('project_id', pid).order('item'),
    sb.from('mining_ponderaciones')
      .select('id, commodity, item_code, item_nombre, subitem_code, subitem_nombre, tipo, hito, peso, orden')
      .eq('project_id', pid).order('orden'),
    sb.from('mining_avance_pasos')
      .select('item, ponderacion_id, pct, updated_at')
      .eq('project_id', pid),
  ]);
  const err = [itemRes, pondRes, avanceRes].find(r => r.error);
  if (err?.error) return NextResponse.json({ error: err.error.message }, { status: 500 });

  // pasos agrupados por partida BMP (subitem_code ?? item_code)
  const pasos = (pondRes.data ?? []).map((p: any) => ({
    id: p.id,
    partida: p.subitem_code ?? p.item_code,
    tipo: p.tipo as 'fisico' | 'financiero',
    hito: p.hito,
    peso: Number(p.peso),
    orden: p.orden,
  }));

  return NextResponse.json({ items: itemRes.data ?? [], pasos, avances: avanceRes.data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, item, ponderacion_id, pct } = body ?? {};
  if (!project_id || !item || !ponderacion_id || pct == null) {
    return NextResponse.json({ error: 'Missing project_id/item/ponderacion_id/pct' }, { status: 400 });
  }
  const sb = supabase as any;
  const { error } = await sb.from('mining_avance_pasos').upsert({
    project_id,
    item: String(item),
    ponderacion_id,
    pct: Math.max(0, Math.min(100, Number(pct))),
    actualizado_por: user.email ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_id,item,ponderacion_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
