// El banco de cantidades de un CWP: qué hay que construir, a qué rendimiento, y cuánto de
// eso ya se llevaron los IWP abiertos.
//
// Vive acá y no en la ruta porque lo consultan dos: el asistente de apertura para proponer
// el quiebre, y el POST de apertura para verificar que nadie asigne más saldo del que hay.
// Confiar en el banco que mandó el cliente sería confiar en que nadie abrió otro IWP en el
// intertanto — y en una sesión de Pull Planning hay varias personas mirando el mismo CWP.
//
// La cantidad puede venir de dos lugares según cómo se cargó el proyecto:
//   · mining_mc          la Matriz de Cobro — cruza actividad del programa con item ECO-2.
//                        Es la fuente fina cuando existe (Collahuasi).
//   · mining_itemizado   el itemizado con cwp_id directo, que es lo que deja el data pack.
// Se prefiere la MC porque trae la cantidad realmente comprometida por CWP; si no hay, se
// cae al itemizado. Nunca se mezclan: mezclarlas duplicaría cantidades.

import type { PartidaBanco } from './iwp-apertura';

export interface FilaBanco extends PartidaBanco {
  pu_clp: number | null;
}

export interface BancoCwp {
  fuente: 'mc' | 'itemizado';
  banco: FilaBanco[];
  iwpIds: string[];
  totales: {
    hh_banco: number;
    hh_asignadas: number;
    hh_saldo: number;
    monto_clp: number;
    n_partidas: number;
    n_partidas_sin_rendimiento: number;
    pct_aperturado: number;
  };
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export async function cargarBanco(sb: any, projectId: string, cwpId: string): Promise<BancoCwp> {
  const [mcRes, itemRes, iwpRes] = await Promise.all([
    sb.from('mining_mc').select('item_eco2, cantidad_item, hh_item')
      .eq('project_id', projectId).eq('cwp_id', cwpId),
    sb.from('mining_itemizado')
      .select('item, descripcion, unidad, cantidad, hh_unidad, hh_item, pu_clp, commodity')
      .eq('project_id', projectId).eq('cwp_id', cwpId),
    sb.from('mining_iwp').select('iwp_id').eq('project_id', projectId).eq('cwp_id', cwpId),
  ]);

  const itemizado = itemRes.data ?? [];
  const catalogo = new Map<string, any>(itemizado.map((x: any) => [x.item, x]));
  const mcRows = (mcRes.data ?? []).filter((x: any) => x.item_eco2);

  type Bruta = Omit<FilaBanco, 'cantidad_asignada' | 'hh_asignadas' | 'cantidad_saldo' | 'hh_saldo'>;
  let filas: Bruta[];

  if (mcRows.length > 0) {
    // La MC puede referenciar items que no están en el itemizado de este CWP; igual
    // necesitan descripción y unidad para que terreno sepa qué está midiendo.
    const faltantes = [...new Set<string>(mcRows.map((x: any) => String(x.item_eco2)))].filter(i => !catalogo.has(i));
    if (faltantes.length) {
      const { data } = await sb.from('mining_itemizado')
        .select('item, descripcion, unidad, hh_unidad, pu_clp, commodity')
        .eq('project_id', projectId).in('item', faltantes);
      for (const x of data ?? []) if (!catalogo.has(x.item)) catalogo.set(x.item, x);
    }

    const agg = new Map<string, { cantidad: number; hh: number }>();
    for (const row of mcRows) {
      const cur = agg.get(row.item_eco2) ?? { cantidad: 0, hh: 0 };
      cur.cantidad += n(row.cantidad_item);
      cur.hh += n(row.hh_item);
      agg.set(row.item_eco2, cur);
    }

    filas = [...agg.entries()].map(([item, v]) => {
      const info = catalogo.get(item) ?? {};
      // El rendimiento real del CWP se deduce de sus propias cantidades y HH; el hh_unidad
      // del itemizado es el respaldo cuando la MC no trae HH.
      const hhUnidad = v.cantidad > 0 && v.hh > 0 ? v.hh / v.cantidad : (n(info.hh_unidad) || null);
      return {
        item,
        descripcion: info.descripcion ?? null,
        unidad: info.unidad ?? null,
        commodity: info.commodity ?? null,
        cantidad_total: v.cantidad,
        hh_total: v.hh > 0 ? v.hh : (hhUnidad ? v.cantidad * hhUnidad : 0),
        hh_unidad: hhUnidad,
        pu_clp: info.pu_clp ?? null,
        origen: 'mc' as const,
      };
    });
  } else {
    const agg = new Map<string, Bruta>();
    for (const row of itemizado) {
      const cur = agg.get(row.item) ?? {
        item: row.item, descripcion: row.descripcion, unidad: row.unidad, commodity: row.commodity,
        cantidad_total: 0, hh_total: 0, hh_unidad: null, pu_clp: row.pu_clp, origen: 'itemizado' as const,
      };
      cur.cantidad_total += n(row.cantidad);
      cur.hh_total += n(row.hh_item) || n(row.cantidad) * n(row.hh_unidad);
      agg.set(row.item, cur);
    }
    filas = [...agg.values()].map(f => ({
      ...f,
      hh_unidad: f.cantidad_total > 0 && f.hh_total > 0 ? f.hh_total / f.cantidad_total : null,
    }));
  }

  // ── Lo que ya se llevaron los IWP abiertos ──
  const iwpIds = (iwpRes.data ?? []).map((i: any) => i.iwp_id);
  const asignado = new Map<string, { cantidad: number; hh: number }>();
  if (iwpIds.length) {
    const { data: parts } = await sb.from('mining_iwp_partida')
      .select('item, cantidad_asignada, hh_asignadas')
      .eq('project_id', projectId).in('iwp_id', iwpIds);
    for (const p of parts ?? []) {
      const cur = asignado.get(p.item) ?? { cantidad: 0, hh: 0 };
      cur.cantidad += n(p.cantidad_asignada);
      cur.hh += n(p.hh_asignadas);
      asignado.set(p.item, cur);
    }
  }

  const banco: FilaBanco[] = filas
    .map(f => {
      const a = asignado.get(f.item) ?? { cantidad: 0, hh: 0 };
      return {
        ...f,
        cantidad_total: r3(f.cantidad_total),
        hh_total: Math.round(f.hh_total),
        hh_unidad: f.hh_unidad != null ? Math.round(f.hh_unidad * 10000) / 10000 : null,
        cantidad_asignada: r3(a.cantidad),
        hh_asignadas: Math.round(a.hh),
        cantidad_saldo: Math.max(0, r3(f.cantidad_total - a.cantidad)),
        hh_saldo: Math.max(0, Math.round(f.hh_total - a.hh)),
      };
    })
    .sort((a, b) => b.hh_saldo - a.hh_saldo || b.hh_total - a.hh_total);

  const t = banco.reduce(
    (acc, b) => ({
      hh_banco: acc.hh_banco + b.hh_total,
      hh_asignadas: acc.hh_asignadas + b.hh_asignadas,
      hh_saldo: acc.hh_saldo + b.hh_saldo,
      monto_clp: acc.monto_clp + b.cantidad_total * n(b.pu_clp),
    }),
    { hh_banco: 0, hh_asignadas: 0, hh_saldo: 0, monto_clp: 0 },
  );

  return {
    fuente: mcRows.length > 0 ? 'mc' : 'itemizado',
    banco,
    iwpIds,
    totales: {
      ...t,
      monto_clp: Math.round(t.monto_clp),
      n_partidas: banco.length,
      n_partidas_sin_rendimiento: banco.filter(b => !b.hh_unidad && b.cantidad_saldo > 0).length,
      pct_aperturado: t.hh_banco > 0 ? Math.round((t.hh_asignadas / t.hh_banco) * 1000) / 10 : 0,
    },
  };
}
