import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Tageo masivo con correlativo + amarre a una línea del itemizado.
//
// El TAG es el nombre con que la pieza se conoce fuera del modelo: en terreno, en el protocolo de
// calidad y en el estado de pago. Ponerlo uno por uno sobre 11.000 piezas no es viable, así que se
// asigna sobre un grupo: el usuario da el patrón ("DUR-00") y el servidor reparte el correlativo.
//
// Y se exige la partida en la MISMA operación a propósito. Un elemento con tag pero sin partida es
// una pieza con nombre que nadie puede cobrar; separar los dos pasos garantiza que el segundo se
// quede a medias. Por eso el endpoint rechaza la petición si falta cualquiera de los dos.

/**
 * "DUR-00" → { prefijo: "DUR-", ancho: 2 }.  "TK-000" → { prefijo: "TK-", ancho: 3 }.
 * Los ceros finales definen cuántos dígitos lleva el correlativo. Sin ceros, se asumen 3:
 * "DUR" se comporta como "DUR-000".
 */
function parsearPatron(patron: string): { prefijo: string; ancho: number } {
  const s = String(patron ?? '').trim();
  const m = s.match(/^(.*?)(0+)$/);
  if (m) return { prefijo: m[1], ancho: m[2].length };
  return { prefijo: s.endsWith('-') ? s : `${s}-`, ancho: 3 };
}

const formatear = (prefijo: string, ancho: number, n: number) => `${prefijo}${String(n).padStart(ancho, '0')}`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, monikers, patron, item, desde } = body ?? {};

  if (!project_id) return NextResponse.json({ error: 'Falta project_id' }, { status: 400 });
  if (!Array.isArray(monikers) || !monikers.length) return NextResponse.json({ error: 'No hay elementos seleccionados' }, { status: 400 });
  if (!String(patron ?? '').trim()) return NextResponse.json({ error: 'Falta el patrón del TAG (ej. DUR-00)' }, { status: 400 });
  if (!String(item ?? '').trim()) return NextResponse.json({ error: 'Falta la partida del itemizado: un elemento con tag pero sin partida no se puede cobrar' }, { status: 400 });

  const sb = supabase as any;
  const itemLimpio = String(item).trim();

  // La partida tiene que existir. Si no, el vínculo apuntaría al vacío y el estado de pago
  // arrastraría elementos hacia una línea inexistente.
  const { data: partida, error: ePartida } = await sb.from('mining_itemizado')
    .select('item, descripcion, cwp_id, unidad, cantidad')
    .eq('project_id', project_id).eq('item', itemLimpio).limit(1).maybeSingle();
  if (ePartida) return NextResponse.json({ error: ePartida.message }, { status: 500 });
  if (!partida) return NextResponse.json({ error: `La partida "${itemLimpio}" no existe en el itemizado de este proyecto` }, { status: 400 });

  const { prefijo, ancho } = parsearPatron(patron);

  // El correlativo arranca después del último tag que ya usa este prefijo, para que un segundo
  // lote no pise al primero. `desde` permite forzarlo cuando el usuario quiere otra numeración.
  let siguiente = Number(desde);
  if (!Number.isFinite(siguiente) || siguiente < 1) {
    const { data: previos } = await sb.from('mining_elementos')
      .select('tag_unificado').eq('project_id', project_id).like('tag_unificado', `${prefijo}%`);
    const usados = (previos ?? [])
      .map((r: any) => Number(String(r.tag_unificado).slice(prefijo.length)))
      .filter((n: number) => Number.isFinite(n));
    siguiente = usados.length ? Math.max(...usados) + 1 : 1;
  }

  // Se numera en el orden estable del moniker, no en el orden en que llegó la selección: así el
  // mismo grupo produce siempre los mismos tags aunque se seleccione de otra manera.
  const ordenados = [...new Set(monikers.map((m: unknown) => String(m).trim()).filter(Boolean))].sort();

  const asignaciones = ordenados.map((moniker, i) => ({ moniker, tag: formatear(prefijo, ancho, siguiente + i) }));

  // Un tag repetido revienta el índice único y aborta el lote entero. Se avisa antes, nombrando
  // el choque, en vez de devolver un error de base de datos que no dice nada.
  const tags = asignaciones.map(a => a.tag);
  const { data: choques } = await sb.from('mining_elementos')
    .select('tag_unificado, sp3d_moniker').eq('project_id', project_id).in('tag_unificado', tags);
  const conflicto = (choques ?? []).filter((c: any) => !ordenados.includes(c.sp3d_moniker));
  if (conflicto.length) {
    return NextResponse.json({
      error: `El tag ${conflicto[0].tag_unificado} ya está en uso por otro elemento. Elige otro prefijo o parte desde un número mayor.`,
      enUso: conflicto.map((c: any) => c.tag_unificado).slice(0, 10),
    }, { status: 409 });
  }

  let actualizados = 0;
  const logs: any[] = [];
  for (const { moniker, tag } of asignaciones) {
    const { error } = await sb.from('mining_elementos')
      .update({ tag_unificado: tag, item_itemizado: itemLimpio })
      .eq('project_id', project_id).eq('sp3d_moniker', moniker);
    if (error) return NextResponse.json({ error: `${moniker}: ${error.message}`, actualizados }, { status: 500 });
    actualizados++;
    logs.push(
      { project_id, sp3d_moniker: moniker, campo: 'tag_unificado', valor_anterior: null, valor_nuevo: tag, origen: 'tageo_lote', usuario_id: user.id },
      { project_id, sp3d_moniker: moniker, campo: 'item_itemizado', valor_anterior: null, valor_nuevo: itemLimpio, origen: 'tageo_lote', usuario_id: user.id },
    );
  }

  const { error: eLog } = await sb.from('mining_cambios_log').insert(logs);
  if (eLog) console.error('[taggear] no se pudo guardar el log:', eLog.message);

  return NextResponse.json({
    actualizados,
    desde: asignaciones[0]?.tag ?? null,
    hasta: asignaciones[asignaciones.length - 1]?.tag ?? null,
    partida: { item: partida.item, descripcion: partida.descripcion, unidad: partida.unidad, cantidad: partida.cantidad },
  });
}
