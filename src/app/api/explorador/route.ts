import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginado';
import { FUENTE_EXPLORABLE_BY_KEY, SIN_VALOR } from '@/lib/explorador-dimensiones';

// Explorador de datos: agrupa cualquier fuente del proyecto por una o dos dimensiones
// y suma una métrica. Es el "pivot" de la plataforma.
//
// GET ?project_id=&fuente=itemizado&dim=commodity[&dim2=cwa_id][&metrica=p_total_clp]
//
// El agrupamiento se hace en el servidor y no en Postgres porque PostgREST no expone
// GROUP BY sin una función; a cambio se traen solo las 2-3 columnas implicadas y se pagina,
// así que incluso las 57.000 filas de elementos de Collahuasi son manejables.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const pid = p.get('project_id');
  const fuenteKey = p.get('fuente') ?? 'cwp';
  const dim = p.get('dim');
  const dim2 = p.get('dim2') || null;
  const metricaKey = p.get('metrica') ?? 'count';
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const fuente = FUENTE_EXPLORABLE_BY_KEY[fuenteKey];
  if (!fuente) return NextResponse.json({ error: `Fuente desconocida: ${fuenteKey}` }, { status: 400 });

  // Solo se aceptan dimensiones y métricas del catálogo: evita que llegue una columna
  // arbitraria por la query string.
  const dimOk = fuente.dimensiones.find(d => d.key === dim);
  if (!dimOk) return NextResponse.json({ error: `Dimensión inválida para ${fuente.label}: ${dim}` }, { status: 400 });
  const dim2Ok = dim2 ? fuente.dimensiones.find(d => d.key === dim2) : null;
  if (dim2 && !dim2Ok) return NextResponse.json({ error: `Dimensión inválida: ${dim2}` }, { status: 400 });
  const metrica = fuente.metricas.find(m => m.key === metricaKey);
  if (!metrica) return NextResponse.json({ error: `Métrica inválida: ${metricaKey}` }, { status: 400 });

  const columnas = [dimOk.key, dim2Ok?.key, metrica.key !== 'count' ? metrica.key : null]
    .filter(Boolean).join(', ');

  const sb = supabase as any;
  const { data, error } = await fetchAllPaged((from, to) => {
    let q = sb.from(fuente.tabla).select(columnas).eq('project_id', pid);
    if (fuente.filtro) q = q.eq(fuente.filtro.columna, fuente.filtro.valor);
    return q.range(from, to);
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const valor = (fila: any) => metrica.key === 'count' ? 1 : (Number(fila[metrica.key]) || 0);
  const etiqueta = (v: any) => {
    if (v === null || v === undefined || v === '') return SIN_VALOR;
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    return String(v);
  };

  const celdas = new Map<string, { d1: string; d2: string; total: number; filas: number }>();
  const totalPorD1 = new Map<string, number>();
  const totalPorD2 = new Map<string, number>();
  let granTotal = 0, granFilas = 0;

  for (const fila of data) {
    const d1 = etiqueta((fila as any)[dimOk.key]);
    const d2 = dim2Ok ? etiqueta((fila as any)[dim2Ok.key]) : '';
    const v = valor(fila);
    const k = `${d1}||${d2}`;
    const c = celdas.get(k) ?? { d1, d2, total: 0, filas: 0 };
    c.total += v; c.filas++;
    celdas.set(k, c);
    totalPorD1.set(d1, (totalPorD1.get(d1) ?? 0) + v);
    if (dim2Ok) totalPorD2.set(d2, (totalPorD2.get(d2) ?? 0) + v);
    granTotal += v; granFilas++;
  }

  const ordenar = (m: Map<string, number>) => [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es-CL'))
    .map(([k, v]) => ({ valor: k, total: v }));

  return NextResponse.json({
    fuente: { key: fuente.key, label: fuente.label },
    dimension: dimOk, dimension2: dim2Ok ?? null, metrica,
    filas: ordenar(totalPorD1),
    columnas: dim2Ok ? ordenar(totalPorD2) : null,
    celdas: dim2Ok ? [...celdas.values()] : null,
    total: granTotal,
    nFilas: granFilas,
    sinAsignar: totalPorD1.get(SIN_VALOR) ?? 0,
  });
}
