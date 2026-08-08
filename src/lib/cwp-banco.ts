// El banco de cantidades de un CWP: qué hay que construir, a qué rendimiento, y cuánto de
// eso ya se llevaron los IWP abiertos.
//
// Vive acá y no en la ruta porque lo consultan dos: el asistente de apertura para proponer
// el quiebre, y el POST de apertura para verificar que nadie asigne más saldo del que hay.
// Confiar en el banco que mandó el cliente sería confiar en que nadie abrió otro IWP en el
// intertanto — y en una sesión de Pull Planning hay varias personas mirando el mismo CWP.
//
// ── Por qué la fuente es el itemizado y no la matriz de cobro ────────────────
//
// `mining_mc` parece la fuente fina —cruza actividad del programa con item ECO-2— pero
// repite el total del item en cada actividad que lo toca. El CWP 312101.S001 tiene el item
// 113 en cinco filas (1ª a 5ª etapa), las cinco con las mismas 778 un y las mismas 42.430
// HH: sumarlas da 225.666 HH contra 55.606 del planner. Cuatro veces el alcance real.
//
// `mining_itemizado` filtrado por `cwp_id` no tiene ese problema: cada fila es un frente
// distinto con su propia cantidad —"Fundación Anillo A", "Anillo B", "Anillo C"— y
// `cantidad × hh_unidad` cuadra con `hh_item`. Contrastado contra `hh_planner` en los diez
// CWP más grandes de Collahuasi queda dentro del 1–3% en todos; la MC se dispara 4–5× en
// dos de ellos y se queda en el 3% del alcance en otros dos.
//
// Y no hace falta un respaldo: de los 159 CWP cargados, 106 tienen itemizado y **ninguno**
// depende sólo de la MC. Un segundo camino sin cobertura que probar sería nada más que otra
// manera de equivocarse.
//
// ── Por qué la llave es item + partida_bmp ──────────────────────────────────
//
// Un mismo item aparece varias veces en un CWP, una por elemento físico. Agregarlas por
// item convertiría cuatro fundaciones en una sola línea de 2.792 m³ con la descripción de
// la primera. Manteniéndolas separadas, cada línea del banco ya es un frente de trabajo y
// el quiebre sale alineado con lo que terreno reconoce.

import type { PartidaBanco } from './iwp-apertura';

export interface FilaBanco extends PartidaBanco {
  pu_clp: number | null;
}

export interface BancoCwp {
  fuente: 'itemizado';
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

/** Identidad de una línea del banco. Es también la llave del descuento. */
export function claveDe(item: string, partidaBmp: string | null | undefined): string {
  return `${item}|${partidaBmp ?? ''}`;
}

type FilaBruta = Omit<FilaBanco, 'cantidad_asignada' | 'hh_asignadas' | 'cantidad_saldo' | 'hh_saldo'>;

export async function cargarBanco(sb: any, projectId: string, cwpId: string): Promise<BancoCwp> {
  const [itemRes, iwpRes] = await Promise.all([
    sb.from('mining_itemizado')
      .select('item, partida_bmp, descripcion, unidad, cantidad, hh_unidad, hh_item, pu_clp, commodity')
      .eq('project_id', projectId).eq('cwp_id', cwpId),
    sb.from('mining_iwp').select('iwp_id').eq('project_id', projectId).eq('cwp_id', cwpId),
  ]);

  // Dos filas con el mismo item y la misma partida romperían la llave del descuento, así
  // que ésas —y sólo ésas— se suman entre sí.
  const agg = new Map<string, FilaBruta>();
  for (const row of (itemRes.data ?? []) as any[]) {
    const clave = claveDe(row.item, row.partida_bmp);
    const cur: FilaBruta = agg.get(clave) ?? {
      clave, item: row.item, partida_bmp: row.partida_bmp ?? null,
      descripcion: row.descripcion, unidad: row.unidad, commodity: row.commodity,
      cantidad_total: 0, hh_total: 0, hh_unidad: n(row.hh_unidad) || null,
      pu_clp: row.pu_clp, origen: 'itemizado',
    };
    cur.cantidad_total += n(row.cantidad);
    cur.hh_total += n(row.hh_item) || n(row.cantidad) * n(row.hh_unidad);
    agg.set(clave, cur);
  }

  // ── Lo que ya se llevaron los IWP abiertos ──
  const iwpIds = (iwpRes.data ?? []).map((i: any) => i.iwp_id);
  const asignado = new Map<string, { cantidad: number; hh: number }>();
  if (iwpIds.length) {
    const { data: parts } = await sb.from('mining_iwp_partida')
      .select('item, partida_bmp, cantidad_asignada, hh_asignadas')
      .eq('project_id', projectId).in('iwp_id', iwpIds);
    for (const p of (parts ?? []) as any[]) {
      const clave = claveDe(p.item, p.partida_bmp);
      const cur = asignado.get(clave) ?? { cantidad: 0, hh: 0 };
      cur.cantidad += n(p.cantidad_asignada);
      cur.hh += n(p.hh_asignadas);
      asignado.set(clave, cur);
    }
  }

  const banco: FilaBanco[] = [...agg.values()]
    .map(f => {
      const a = asignado.get(f.clave) ?? { cantidad: 0, hh: 0 };
      // El rendimiento declarado manda; si falta, se deduce de las propias cantidades.
      const hhUnidad = f.hh_unidad ?? (f.cantidad_total > 0 && f.hh_total > 0 ? f.hh_total / f.cantidad_total : null);
      return {
        ...f,
        cantidad_total: r3(f.cantidad_total),
        hh_total: Math.round(f.hh_total),
        hh_unidad: hhUnidad != null ? Math.round(hhUnidad * 10000) / 10000 : null,
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
    fuente: 'itemizado',
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
