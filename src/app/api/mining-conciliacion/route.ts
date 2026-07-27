import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginado';

// Módulo de conciliación: salud de la red relacional AWP + banco de match manual.
// GET  ?project_id=                 → resumen de relaciones (cobertura, huérfanos, salud) + stats para diagrama
// GET  ?project_id=&rel=eco2_cwp    → huérfanos + pool de candidatos de esa relación
// GET  ?project_id=&rel=eco2_full   → TODOS los items del itemizado + candidatos CWP + partidas BMP (vista Excel)
// PATCH { project_id, rel, id, target } → aplica el match

export type RelId = 'eco2_cwp' | 'item_bmp' | 'prog_cwp' | 'aconex_cwp';

const REL_META: Record<RelId, { label: string; desc: string; origen: string; destino: string }> = {
  eco2_cwp:   { label: 'ECO-2 → Diccionario AWP',  desc: 'Cada ítem de cobro del Itemizado debe estar asignado a su paquete constructivo exacto en el Diccionario AWP (69 CWP, 7 CWA).', origen: 'mining_itemizado.cwp_id', destino: 'mining_cwp.cwp_id' },
  item_bmp:   { label: 'ECO-2 → Bases de M&P',      desc: 'Cada ítem del Itemizado debe calzar con una partida de las Bases de Medición y Pago (ponderaciones de avance físico y financiero).', origen: 'mining_itemizado.partida_mp', destino: 'mining_ponderaciones.partida' },
  prog_cwp:   { label: 'Programa → CWP',            desc: 'Cada actividad P333 vigente debe pertenecer a un CWP para poder abrirla en IWP y valorizarla.', origen: 'mining_programa.cwp_id', destino: 'mining_cwp.cwp_id' },
  aconex_cwp: { label: 'Aconex → CWP',              desc: 'Cada documento descargado de Aconex debe quedar asignado a su CWP exacto (hay sugerencia por área/disciplina).', origen: 'mining_doc_aconex.cwp_id_exacto', destino: 'mining_cwp.cwp_id' },
};

function salud(cobertura: number): 'OK' | 'REVISAR' | 'CRITICO' {
  return cobertura >= 98 ? 'OK' : cobertura >= 80 ? 'REVISAR' : 'CRITICO';
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const pid = params.get('project_id');
  const rel = params.get('rel') as (RelId | 'eco2_full') | null;
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  const sb = supabase as any;

  // Pools compartidos
  const cwpPool = () => sb.from('mining_cwp')
    .select('cwp_id, cwp_nombre, cwa_id, disciplina, disciplina_cod')
    .eq('project_id', pid).eq('es_oficial', true).order('cwp_id');

  const bmpPool = async () => {
    const { data, error } = await sb.from('mining_ponderaciones')
      .select('item_code, item_nombre, subitem_code, subitem_nombre, commodity, tipo')
      .eq('project_id', pid);
    if (error) throw new Error(error.message);
    // Agrupar por partida (subitem_code ?? item_code)
    const map = new Map<string, any>();
    for (const p of data ?? []) {
      const code = p.subitem_code ?? p.item_code;
      const cur = map.get(code) ?? { partida: code, nombre: p.subitem_nombre ?? p.item_nombre, commodity: p.commodity, pasos_fisico: 0, hitos_financiero: 0 };
      if (p.tipo === 'fisico') cur.pasos_fisico++;
      else cur.hitos_financiero++;
      map.set(code, cur);
    }
    return [...map.values()].sort((a, b) => a.partida.localeCompare(b.partida));
  };

  if (!rel) {
    // Paginado en las tres tablas que crecen con el proyecto: la cobertura que muestra
    // este módulo sería falsa si PostgREST truncara en 1000 filas.
    const [eco2Res, progRes, aconexRes, pondRes, cwaRes, cvRes, cwpRes, hitosRes, planosRes] = await Promise.all([
      fetchAllPaged((from, to) => sb.from('mining_itemizado').select('item, cwp_id, partida_mp').eq('project_id', pid).range(from, to)),
      fetchAllPaged((from, to) => sb.from('mining_programa').select('id, cwp_id, tipo').eq('project_id', pid).eq('fuente', 'P333').range(from, to)),
      fetchAllPaged((from, to) => sb.from('mining_doc_aconex').select('id, cwp_id_exacto').eq('project_id', pid).range(from, to)),
      sb.from('mining_ponderaciones').select('item_code, subitem_code').eq('project_id', pid),
      sb.from('mining_cwa').select('cwa_id').eq('project_id', pid),
      sb.from('mining_cv').select('cv_id').eq('project_id', pid),
      sb.from('mining_cwp').select('cwp_id, es_oficial').eq('project_id', pid),
      sb.from('mining_hitos').select('numero').eq('project_id', pid),
      sb.from('mining_planos').select('cwp_id').eq('project_id', pid),
    ]);
    const err = [eco2Res, progRes, aconexRes, pondRes, cwaRes, cvRes, cwpRes, hitosRes, planosRes].find(r => r.error);
    if (err?.error) return NextResponse.json({ error: err.error.message }, { status: 500 });

    const eco2 = eco2Res.data ?? [];
    const prog = progRes.data ?? [];
    const aconex = aconexRes.data ?? [];
    const bmpCodes = new Set((pondRes.data ?? []).map((p: any) => p.subitem_code ?? p.item_code));

    const eco2Ok = eco2.filter((e: any) => e.cwp_id).length;
    const bmpOk = eco2.filter((e: any) => e.partida_mp && bmpCodes.has(e.partida_mp)).length;
    const progOk = prog.filter((p: any) => p.cwp_id).length;
    const aconexOk = aconex.filter((d: any) => d.cwp_id_exacto).length;
    const planos = planosRes.data ?? [];
    const planosOk = planos.filter((p: any) => p.cwp_id).length;

    const mk = (id: RelId, total: number, ok: number) => ({
      id, ...REL_META[id], total, ok, huerfanos: total - ok,
      cobertura: total ? Math.round((ok / total) * 1000) / 10 : 100,
      salud: salud(total ? (ok / total) * 100 : 100),
    });

    return NextResponse.json({
      relaciones: [
        mk('eco2_cwp', eco2.length, eco2Ok),
        mk('item_bmp', eco2.length, bmpOk),
        mk('prog_cwp', prog.length, progOk),
        mk('aconex_cwp', aconex.length, aconexOk),
      ],
      stats: {
        cwa: cwaRes.data?.length ?? 0,
        cv: cvRes.data?.length ?? 0,
        cwp: (cwpRes.data ?? []).filter((c: any) => c.es_oficial).length,
        cwpTotal: cwpRes.data?.length ?? 0,
        programa: prog.length,
        programaOk: progOk,
        itemizado: eco2.length,
        itemizadoCwpOk: eco2Ok,
        itemizadoBmpOk: bmpOk,
        bmpPartidas: bmpCodes.size,
        aconex: aconex.length,
        aconexOk,
        hitos: hitosRes.data?.length ?? 0,
        planos: planos.length,
        planosOk,
      },
    });
  }

  // ── Vista Excel del itemizado: TODOS los items + pools ──
  if (rel === 'eco2_full') {
    try {
      const [eco2Res, cwpRes, partidas] = await Promise.all([
        fetchAllPaged((from, to) => sb.from('mining_itemizado')
          .select('id, item, n_partida, partida_bmp, partida_mp, area, cwa_id, wbs, descripcion_codigo, commodity, descripcion, obra, unidad, cantidad, hh_unidad, hh_item, pu_clp, p_total_clp, tipo_partida, cwp_id')
          .eq('project_id', pid).order('item').range(from, to)),
        cwpPool(),
        bmpPool(),
      ]);
      if (eco2Res.error || cwpRes.error) return NextResponse.json({ error: (eco2Res.error ?? cwpRes.error).message }, { status: 500 });
      return NextResponse.json({ items: eco2Res.data ?? [], cwps: cwpRes.data ?? [], partidas });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // ── Detalle por relación: huérfanos + candidatos ──
  if (rel === 'eco2_cwp') {
    const [eco2Res, cwpRes] = await Promise.all([
      sb.from('mining_itemizado').select('id, item, descripcion, obra, area, unidad, cantidad, pu_clp, commodity, cwp_id').eq('project_id', pid).is('cwp_id', null).order('item'),
      cwpPool(),
    ]);
    if (eco2Res.error || cwpRes.error) return NextResponse.json({ error: (eco2Res.error ?? cwpRes.error).message }, { status: 500 });
    return NextResponse.json({ huerfanos: eco2Res.data ?? [], candidatos: cwpRes.data ?? [] });
  }

  if (rel === 'item_bmp') {
    try {
      const [eco2Res, partidas] = await Promise.all([
        sb.from('mining_itemizado').select('id, item, n_partida, partida_bmp, partida_mp, descripcion, commodity, area, unidad, cantidad').eq('project_id', pid).order('item'),
        bmpPool(),
      ]);
      if (eco2Res.error) return NextResponse.json({ error: eco2Res.error.message }, { status: 500 });
      const codes = new Set(partidas.map((p: any) => p.partida));
      const huerfanos = (eco2Res.data ?? []).filter((e: any) => !e.partida_mp || !codes.has(e.partida_mp));
      return NextResponse.json({ huerfanos, candidatos: partidas });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (rel === 'prog_cwp') {
    const [progRes, cwpRes] = await Promise.all([
      sb.from('mining_programa').select('id, cod_actividad, nombre_actividad, hh, tipo, sector, wbs, fecha_inicio, fecha_fin').eq('project_id', pid).eq('fuente', 'P333').is('cwp_id', null),
      cwpPool(),
    ]);
    if (progRes.error || cwpRes.error) return NextResponse.json({ error: (progRes.error ?? cwpRes.error).message }, { status: 500 });
    return NextResponse.json({ huerfanos: progRes.data ?? [], candidatos: cwpRes.data ?? [] });
  }

  if (rel === 'aconex_cwp') {
    const [docRes, cwpRes] = await Promise.all([
      sb.from('mining_doc_aconex').select('id, n_cmdic, titulo, tipo_doc, rev, cwp_sugerido').eq('project_id', pid).is('cwp_id_exacto', null),
      cwpPool(),
    ]);
    if (docRes.error || cwpRes.error) return NextResponse.json({ error: (docRes.error ?? cwpRes.error).message }, { status: 500 });
    return NextResponse.json({ huerfanos: docRes.data ?? [], candidatos: cwpRes.data ?? [] });
  }

  return NextResponse.json({ error: `Relación desconocida: ${rel}` }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, rel, id, target } = body ?? {};
  if (!project_id || !rel || !id) return NextResponse.json({ error: 'Missing project_id/rel/id' }, { status: 400 });
  const sb = supabase as any;

  let q;
  if (rel === 'eco2_cwp') {
    q = sb.from('mining_itemizado').update({ cwp_id: target ? String(target) : null });
  } else if (rel === 'item_bmp') {
    q = sb.from('mining_itemizado').update({ partida_mp: target ? String(target) : null });
  } else if (rel === 'prog_cwp') {
    if (!target) return NextResponse.json({ error: 'target requerido' }, { status: 400 });
    q = sb.from('mining_programa').update({ cwp_id: String(target) });
  } else if (rel === 'aconex_cwp') {
    if (!target) return NextResponse.json({ error: 'target requerido' }, { status: 400 });
    q = sb.from('mining_doc_aconex').update({ cwp_id_exacto: String(target) });
  } else {
    return NextResponse.json({ error: `Relación desconocida: ${rel}` }, { status: 400 });
  }

  const { error } = await q.eq('project_id', project_id).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
