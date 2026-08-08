import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cargarBanco, type FilaBanco } from '@/lib/cwp-banco';
import {
  proponerIwps, dividirPaquete, fusionarPaquetes, duracionDias, capacidadCiclo,
  type Turno, type Cuadrilla, type Estrategia, type Zona, type PartidaAsignada,
} from '@/lib/iwp-apertura';
import { semanaIso, normalizarEstado } from '@/lib/iwp-estado';

// La Mesa de Trabajo de un CWP: todo lo que necesita la sesión de Pull Planning, y todas las
// operaciones que se hacen sobre ella.
//
// Es una sola ruta con `accion` en vez de siete rutas porque todas trabajan sobre la misma
// sesión y comparten la misma verificación de saldo. Partirla obligaría a repetir esa
// verificación siete veces, que es exactamente la clase de duplicación que después se
// desincroniza.
//
// GET  ?project_id=&cwp_id=   estado completo de la mesa
// POST { accion: 'generar' | 'parametros' | 'editar' | 'lote' | 'dividir' | 'fusionar'
//              | 'eliminar' | 'restaurar' | 'publicar' | 'descartar' }

const n = (v: unknown) => Number(v ?? 0) || 0;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

interface BorradorRow {
  id: string;
  secuencia: number;
  nombre: string | null;
  limites_bateria: string | null;
  grupo: string | null;
  cuadrilla_id: string | null;
  fecha_inicio_plan: string | null;
  fecha_fin_plan: string | null;
  dias: number | null;
  hh: number;
  partidas: PartidaAsignada[];
  editado: boolean;
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const cwpId = params.get('cwp_id');
  if (!projectId || !cwpId) return NextResponse.json({ error: 'Missing project_id/cwp_id' }, { status: 400 });

  const sb = supabase as any;

  const [cwpRes, turnoRes, cuadrillaRes, elemRes, banco, sesionRes, publicadosRes] = await Promise.all([
    sb.from('mining_cwp')
      .select('cwp_id, cwp_nombre, cwa_id, disciplina, disciplina_cod, hh_planner, fecha_ini, fecha_fin, ruta_critica')
      .eq('project_id', projectId).eq('cwp_id', cwpId).maybeSingle(),
    sb.from('mining_turno').select('*').eq('project_id', projectId).eq('activo', true)
      .order('es_default', { ascending: false }).order('codigo'),
    sb.from('mining_cuadrilla').select('*').eq('project_id', projectId).eq('activa', true).order('codigo'),
    sb.from('mining_elementos')
      .select('sector, area_unidad, elevacion, sistema_servicio, peso_kg')
      .eq('project_id', projectId).eq('cwp_id', cwpId).limit(20000),
    cargarBanco(sb, projectId, cwpId),
    sb.from('mining_apertura_sesion').select('*')
      .eq('project_id', projectId).eq('cwp_id', cwpId).eq('estado', 'ABIERTA').maybeSingle(),
    sb.from('mining_iwp').select('*').eq('project_id', projectId).eq('cwp_id', cwpId)
      .order('secuencia', { ascending: true, nullsFirst: false }).order('fecha_inicio_plan'),
  ]);

  if (cwpRes.error) return NextResponse.json({ error: cwpRes.error.message }, { status: 500 });
  if (!cwpRes.data) return NextResponse.json({ error: `El CWP ${cwpId} no existe en este proyecto` }, { status: 404 });

  const sesion = sesionRes.data ?? null;

  // ── Borradores de la sesión abierta ──
  let borradores: BorradorRow[] = [];
  if (sesion) {
    const { data } = await sb.from('mining_iwp_borrador').select('*')
      .eq('sesion_id', sesion.id).order('secuencia');
    borradores = (data ?? []) as BorradorRow[];
  }

  // ── IWP ya publicados, con sus cantidades y el semáforo de restricciones ──
  const publicados = publicadosRes.data ?? [];
  const ids = publicados.map((p: any) => p.iwp_id);
  const partidasPorIwp = new Map<string, any[]>();
  const consPorIwp = new Map<string, { total: number; pendientes: number }>();
  if (ids.length) {
    const [partRes, consRes] = await Promise.all([
      sb.from('mining_iwp_partida').select('*').eq('project_id', projectId).in('iwp_id', ids),
      sb.from('mining_iwp_constraint').select('iwp_id, cleared').eq('project_id', projectId).in('iwp_id', ids),
    ]);
    for (const p of partRes.data ?? []) {
      const arr = partidasPorIwp.get(p.iwp_id) ?? [];
      arr.push(p);
      partidasPorIwp.set(p.iwp_id, arr);
    }
    for (const c of consRes.data ?? []) {
      const cur = consPorIwp.get(c.iwp_id) ?? { total: 0, pendientes: 0 };
      cur.total++;
      if (!c.cleared) cur.pendientes++;
      consPorIwp.set(c.iwp_id, cur);
    }
  }

  // ── Consumo del borrador, para que el banco muestre las tres bandas ──
  // publicado / comprometido en el borrador / libre. Sin esto la mesa dejaría repartir dos
  // veces la misma cantidad y recién lo descubriríamos al publicar.
  const enBorrador = new Map<string, number>();
  for (const b of borradores) {
    for (const p of b.partidas ?? []) {
      enBorrador.set(p.clave, (enBorrador.get(p.clave) ?? 0) + n(p.cantidad));
    }
  }
  const bancoConBorrador = banco.banco.map((b: FilaBanco) => {
    const enB = r3(enBorrador.get(b.clave) ?? 0);
    return {
      ...b,
      cantidad_en_borrador: enB,
      cantidad_libre: Math.max(0, r3(b.cantidad_saldo - enB)),
      hh_en_borrador: b.hh_unidad ? Math.round(enB * b.hh_unidad) : 0,
    };
  });

  return NextResponse.json({
    cwp: cwpRes.data,
    banco: bancoConBorrador,
    totales: {
      ...banco.totales,
      hh_planner: n(cwpRes.data.hh_planner),
      hh_en_borrador: borradores.reduce((s, b) => s + n(b.hh), 0),
      n_borradores: borradores.length,
      n_publicados: publicados.length,
    },
    dimensiones: dimensionesDeElementos(elemRes.data ?? []),
    turnos: turnoRes.data ?? [],
    cuadrillas: cuadrillaRes.data ?? [],
    sesion,
    borradores,
    publicados: publicados.map((p: any) => ({
      ...p,
      status: normalizarEstado(p.status),
      partidas: partidasPorIwp.get(p.iwp_id) ?? [],
      constraints: consPorIwp.get(p.iwp_id) ?? { total: 0, pendientes: 0 },
    })),
  });
}

/** Las dimensiones del modelo 3D que sirven para cortar por adyacencia. */
function dimensionesDeElementos(elementos: any[]) {
  const dims: { clave: string; label: string; zonas: { clave: string; nombre: string; peso: number; n: number }[] }[] = [];

  for (const d of [
    { campo: 'sector', label: 'Sector' },
    { campo: 'area_unidad', label: 'Área / unidad' },
    { campo: 'sistema_servicio', label: 'Sistema' },
  ]) {
    const m = new Map<string, { peso: number; n: number }>();
    for (const e of elementos) {
      const k = e[d.campo];
      if (!k) continue;
      const cur = m.get(k) ?? { peso: 0, n: 0 };
      cur.peso += n(e.peso_kg);
      cur.n += 1;
      m.set(k, cur);
    }
    if (m.size >= 2) {
      dims.push({
        clave: d.campo, label: d.label,
        zonas: [...m.entries()]
          .map(([clave, v]) => ({ clave, nombre: clave, peso: v.peso > 0 ? Math.round(v.peso) : v.n, n: v.n }))
          .sort((a, b) => b.peso - a.peso),
      });
    }
  }

  const porNivel = new Map<string, { peso: number; n: number }>();
  for (const e of elementos) {
    if (e.elevacion == null) continue;
    const k = `Nivel ${Math.floor(Number(e.elevacion) / 5) * 5} m`;
    const cur = porNivel.get(k) ?? { peso: 0, n: 0 };
    cur.peso += n(e.peso_kg);
    cur.n += 1;
    porNivel.set(k, cur);
  }
  if (porNivel.size >= 2) {
    dims.push({
      clave: 'elevacion', label: 'Nivel (cada 5 m)',
      zonas: [...porNivel.entries()]
        .map(([clave, v]) => ({ clave, nombre: clave, peso: v.peso > 0 ? Math.round(v.peso) : v.n, n: v.n }))
        .sort((a, b) => parseFloat(a.clave.replace(/[^\d.-]/g, '')) - parseFloat(b.clave.replace(/[^\d.-]/g, ''))),
    });
  }

  return dims;
}

// ─── Escritura ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, cwp_id, accion } = body ?? {};
  if (!project_id || !cwp_id || !accion) {
    return NextResponse.json({ error: 'Falta project_id, cwp_id o accion' }, { status: 400 });
  }

  const sb = supabase as any;
  const sesion = await sesionAbierta(sb, project_id, cwp_id, user.email);
  if ('error' in sesion) return NextResponse.json({ error: sesion.error }, { status: 500 });

  const s = sesion.sesion;

  switch (accion) {
    case 'parametros': return guardarParametros(sb, s, body);
    case 'generar':    return generar(sb, s, project_id, cwp_id, body);
    case 'editar':     return editar(sb, s, body);
    case 'lote':       return lote(sb, s, body);
    case 'dividir':    return dividir(sb, s, body);
    case 'fusionar':   return fusionar(sb, s, body);
    case 'eliminar':   return eliminar(sb, s, body);
    case 'restaurar':  return restaurar(sb, s, project_id, body);
    case 'publicar':   return publicar(sb, s, project_id, cwp_id, body, user.email);
    case 'descartar':  return descartar(sb, s);
    default:
      return NextResponse.json({ error: `Acción desconocida: ${accion}` }, { status: 400 });
  }
}

/**
 * La sesión viva del CWP; se abre sola la primera vez que alguien entra a la mesa.
 *
 * Nace con fecha de inicio puesta. El ribbon mostraba la del CWP como valor por defecto del
 * input, pero eso es pintura: si nadie la tocaba, la sesión quedaba con `fecha_inicio` nula,
 * la cascada no tenía de dónde partir y el quiebre salía sin fechas y con el Gantt vacío.
 */
async function sesionAbierta(sb: any, projectId: string, cwpId: string, email: string | undefined) {
  const { data: existente } = await sb.from('mining_apertura_sesion').select('*')
    .eq('project_id', projectId).eq('cwp_id', cwpId).eq('estado', 'ABIERTA').maybeSingle();
  if (existente) return { sesion: existente };

  const { data, error } = await sb.from('mining_apertura_sesion').insert({
    project_id: projectId, cwp_id: cwpId, abierta_por: email ?? null,
    fecha_inicio: await inicioPorDefecto(sb, projectId, cwpId),
  }).select().single();
  if (error) {
    // Carrera con otra persona entrando a la mesa al mismo tiempo: gana quien insertó.
    const { data: reintento } = await sb.from('mining_apertura_sesion').select('*')
      .eq('project_id', projectId).eq('cwp_id', cwpId).eq('estado', 'ABIERTA').maybeSingle();
    if (reintento) return { sesion: reintento };
    return { error: error.message };
  }
  return { sesion: data };
}

/**
 * Desde cuándo planificar. Un CWP que debió partir hace una semana no se replanifica hacia
 * atrás: la sesión arranca hoy, que es cuando la cuadrilla puede tomar el frente.
 */
async function inicioPorDefecto(sb: any, projectId: string, cwpId: string): Promise<string> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data } = await sb.from('mining_cwp').select('fecha_ini')
    .eq('project_id', projectId).eq('cwp_id', cwpId).maybeSingle();
  const delCwp = data?.fecha_ini ? String(data.fecha_ini).slice(0, 10) : null;
  return delCwp && delCwp > hoy ? delCwp : hoy;
}

const tocar = (sb: any, sesionId: string) =>
  sb.from('mining_apertura_sesion').update({ updated_at: new Date().toISOString() }).eq('id', sesionId);

async function guardarParametros(sb: any, s: any, body: any) {
  const campos: Record<string, unknown> = {};
  for (const k of ['cuadrilla_id', 'turno_id', 'hh_objetivo', 'estrategia', 'dimension_zona',
                   'fecha_inicio', 'cuadrillas_paralelo', 'claves_incluidas']) {
    if (k in body) campos[k] = body[k];
  }
  campos.updated_at = new Date().toISOString();
  const { error } = await sb.from('mining_apertura_sesion').update(campos).eq('id', s.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Corre el motor y reemplaza los paquetes que vinieron de él, **conservando los que una
 * persona tocó**. Sin eso, mover el objetivo de HH borraría media hora de refinamiento.
 */
async function generar(sb: any, s: any, projectId: string, cwpId: string, body: any) {
  const [{ banco }, turnoRes, cuadrillaRes] = await Promise.all([
    cargarBanco(sb, projectId, cwpId),
    sb.from('mining_turno').select('*').eq('project_id', projectId),
    sb.from('mining_cuadrilla').select('*').eq('project_id', projectId),
  ]);

  const turno: Turno | undefined = (turnoRes.data ?? []).find((t: any) => t.id === (body.turno_id ?? s.turno_id));
  const cuadrilla: Cuadrilla | undefined = (cuadrillaRes.data ?? []).find((c: any) => c.id === (body.cuadrilla_id ?? s.cuadrilla_id));
  if (!turno || !cuadrilla) {
    return NextResponse.json({ error: 'Elige una cuadrilla y un turno antes de generar el quiebre.' }, { status: 400 });
  }

  // Los paquetes editados a mano se quedan y su alcance sale del saldo disponible.
  const { data: previos } = await sb.from('mining_iwp_borrador').select('*').eq('sesion_id', s.id).order('secuencia');
  const editados = ((previos ?? []) as BorradorRow[]).filter(b => b.editado);

  const tomado = new Map<string, number>();
  for (const b of editados) {
    for (const p of b.partidas ?? []) tomado.set(p.clave, (tomado.get(p.clave) ?? 0) + n(p.cantidad));
  }

  const disponible = banco.map(b => {
    const usado = tomado.get(b.clave) ?? 0;
    const cantidad = Math.max(0, r3(b.cantidad_saldo - usado));
    return {
      ...b,
      cantidad_saldo: cantidad,
      hh_saldo: b.hh_unidad ? Math.round(cantidad * b.hh_unidad) : Math.max(0, b.hh_saldo - Math.round(usado * (b.hh_unidad ?? 0))),
    };
  });

  const estrategia = (body.estrategia ?? s.estrategia ?? 'hh') as Estrategia;
  const hhObjetivo = n(body.hh_objetivo ?? s.hh_objetivo) || capacidadCiclo(cuadrilla, turno);
  const zonas: Zona[] = await zonasDe(sb, projectId, cwpId, body.dimension_zona ?? s.dimension_zona);

  const propuesta = proponerIwps(disponible, cuadrilla, turno, {
    estrategia, hhObjetivo, zonas,
    clavesIncluidas: (body.claves_incluidas ?? s.claves_incluidas ?? []) as string[],
  });

  // Fuera los generados anteriores; los editados se quedan tal cual.
  //
  // Se borra por `sesion_id + editado`, no por una lista de ids: con 56 paquetes esa lista
  // son 2 KB de query string. Y se revisa el error — cuando este borrado falla en silencio,
  // el insert de más abajo igual corre y la mesa queda con los paquetes duplicados.
  const { error: errBorrado } = await sb.from('mining_iwp_borrador')
    .delete().eq('sesion_id', s.id).eq('editado', false);
  if (errBorrado) {
    return NextResponse.json({ error: `No se pudo limpiar el quiebre anterior: ${errBorrado.message}` }, { status: 500 });
  }

  // Ojo con los inserts por lote: PostgREST arma una sola sentencia con la unión de las
  // claves, así que una fila a la que le falte `editado` o `hh` viaja con NULL explícito y
  // revienta el NOT NULL en vez de tomar el DEFAULT. Todas las filas van con el mismo juego.
  const filas = propuesta.iwps.map((iwp, i) => ({
    sesion_id: s.id, project_id: projectId,
    secuencia: editados.length + i + 1,
    nombre: iwp.nombre, limites_bateria: iwp.limites_bateria, grupo: iwp.grupo,
    cuadrilla_id: cuadrilla.id,
    dias: iwp.dias, hh: iwp.hh, partidas: iwp.partidas, editado: false,
  }));
  if (filas.length) {
    const { error } = await sb.from('mining_iwp_borrador').insert(filas);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Nunca sin fecha: un quiebre sin fechas no se puede secuenciar ni mirar en el Gantt.
  const fechaInicio = body.fecha_inicio ?? s.fecha_inicio ?? await inicioPorDefecto(sb, projectId, cwpId);

  await guardarParametros(sb, s, {
    cuadrilla_id: cuadrilla.id, turno_id: turno.id, hh_objetivo: hhObjetivo,
    estrategia, dimension_zona: body.dimension_zona ?? s.dimension_zona,
    claves_incluidas: body.claves_incluidas ?? s.claves_incluidas,
    fecha_inicio: fechaInicio,
  });
  await reencadenar(sb, s.id, turno, fechaInicio, body.cuadrillas_paralelo ?? s.cuadrillas_paralelo);

  return NextResponse.json({ ok: true, n: filas.length, alertas: propuesta.alertas });
}

async function zonasDe(sb: any, projectId: string, cwpId: string, dimension: string | null): Promise<Zona[]> {
  if (!dimension) return [];
  const { data } = await sb.from('mining_elementos')
    .select('sector, area_unidad, elevacion, sistema_servicio, peso_kg')
    .eq('project_id', projectId).eq('cwp_id', cwpId).limit(20000);
  const dim = dimensionesDeElementos(data ?? []).find(d => d.clave === dimension);
  return (dim?.zonas ?? []).map(z => ({ clave: z.clave, nombre: z.nombre, peso: z.peso }));
}

/**
 * Recalcula la cascada de fechas sobre todos los paquetes en orden de secuencia.
 *
 * Los que tienen fecha puesta a mano la conservan y el resto sigue desde ahí: es como piensa
 * un planificador cuando fija un hito («este parte el 3, los demás se acomodan»).
 */
async function reencadenar(sb: any, sesionId: string, turno: Turno, fechaInicio: string | null, paralelo: number) {
  if (!fechaInicio) return;
  const { data } = await sb.from('mining_iwp_borrador').select('*').eq('sesion_id', sesionId).order('secuencia');
  const filas = (data ?? []) as BorradorRow[];
  if (!filas.length) return;

  const nCuadrillas = Math.max(1, paralelo || 1);
  const relojes = Array.from({ length: nCuadrillas }, () => new Date(fechaInicio + 'T00:00:00'));
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const updates: { id: string; fecha_inicio_plan: string; fecha_fin_plan: string }[] = [];
  filas.forEach((f, i) => {
    const r = i % nCuadrillas;
    let ini: Date, fin: Date;

    if (f.editado && f.fecha_inicio_plan && f.fecha_fin_plan) {
      ini = new Date(f.fecha_inicio_plan + 'T00:00:00');
      fin = new Date(f.fecha_fin_plan + 'T00:00:00');
    } else {
      ini = new Date(relojes[r]);
      const dias = f.dias ?? 1;
      // El descanso del ciclo se intercala: tras `dias_trabajo` vienen `dias_descanso`.
      const ciclos = turno.dias_trabajo > 0 ? Math.floor((dias - 1) / turno.dias_trabajo) : 0;
      fin = new Date(ini);
      fin.setDate(fin.getDate() + dias + ciclos * turno.dias_descanso - 1);
      updates.push({ id: f.id, fecha_inicio_plan: iso(ini), fecha_fin_plan: iso(fin) });
    }

    const siguiente = new Date(fin);
    siguiente.setDate(siguiente.getDate() + 1);
    relojes[r] = siguiente;
  });

  for (const u of updates) {
    await sb.from('mining_iwp_borrador')
      .update({ fecha_inicio_plan: u.fecha_inicio_plan, fecha_fin_plan: u.fecha_fin_plan })
      .eq('id', u.id);
  }
}

const CAMPOS_EDITABLES = ['nombre', 'limites_bateria', 'cuadrilla_id', 'fecha_inicio_plan', 'fecha_fin_plan', 'dias', 'grupo'];

async function editar(sb: any, s: any, body: any) {
  const { id, campos } = body;
  if (!id || !campos) return NextResponse.json({ error: 'Falta id o campos' }, { status: 400 });
  const limpio: Record<string, unknown> = { editado: true, updated_at: new Date().toISOString() };
  for (const k of CAMPOS_EDITABLES) if (k in campos) limpio[k] = campos[k];

  const { error } = await sb.from('mining_iwp_borrador').update(limpio).eq('id', id).eq('sesion_id', s.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await tocar(sb, s.id);
  return NextResponse.json({ ok: true });
}

async function lote(sb: any, s: any, body: any) {
  const { ids, campos, correr_dias } = body;
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: 'Sin paquetes seleccionados' }, { status: 400 });

  // Correr fechas es su propia operación: cada paquete se mueve respecto de la suya.
  if (typeof correr_dias === 'number' && correr_dias !== 0) {
    const { data } = await sb.from('mining_iwp_borrador').select('id, fecha_inicio_plan, fecha_fin_plan')
      .eq('sesion_id', s.id).in('id', ids);
    for (const f of data ?? []) {
      const mover = (d: string | null) => {
        if (!d) return null;
        const x = new Date(d + 'T00:00:00');
        x.setDate(x.getDate() + correr_dias);
        return x.toISOString().slice(0, 10);
      };
      await sb.from('mining_iwp_borrador').update({
        fecha_inicio_plan: mover(f.fecha_inicio_plan),
        fecha_fin_plan: mover(f.fecha_fin_plan),
        editado: true,
      }).eq('id', f.id);
    }
  }

  if (campos && Object.keys(campos).length) {
    const limpio: Record<string, unknown> = { editado: true, updated_at: new Date().toISOString() };
    for (const k of CAMPOS_EDITABLES) if (k in campos) limpio[k] = campos[k];
    const { error } = await sb.from('mining_iwp_borrador').update(limpio).eq('sesion_id', s.id).in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await tocar(sb, s.id);
  return NextResponse.json({ ok: true, n: ids.length });
}

async function dividir(sb: any, s: any, body: any) {
  const { id, partes } = body;
  const { data: fila } = await sb.from('mining_iwp_borrador').select('*').eq('id', id).eq('sesion_id', s.id).maybeSingle();
  if (!fila) return NextResponse.json({ error: 'Ese paquete ya no está en la mesa' }, { status: 404 });

  const nuevos = dividirPaquete(
    { nombre: fila.nombre ?? 'Paquete', grupo: fila.grupo, partidas: fila.partidas ?? [] },
    Number(partes) || 2,
  );

  // Los nuevos ocupan el lugar del original; los de más abajo corren para hacerles sitio.
  const { data: posteriores } = await sb.from('mining_iwp_borrador')
    .select('id, secuencia').eq('sesion_id', s.id).gt('secuencia', fila.secuencia);
  for (const p of posteriores ?? []) {
    await sb.from('mining_iwp_borrador').update({ secuencia: p.secuencia + nuevos.length - 1 }).eq('id', p.id);
  }
  await sb.from('mining_iwp_borrador').delete().eq('id', id);

  const filas = nuevos.map((x, i) => ({
    sesion_id: s.id, project_id: fila.project_id,
    secuencia: fila.secuencia + i,
    nombre: x.nombre, limites_bateria: x.limites_bateria, grupo: x.grupo,
    cuadrilla_id: fila.cuadrilla_id,
    dias: null, hh: x.partidas.reduce((sum, p) => sum + n(p.hh), 0),
    partidas: x.partidas, editado: true,
  }));
  const { error } = await sb.from('mining_iwp_borrador').insert(filas);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recalcularDuraciones(sb, s, filas.map(f => f.secuencia));
  await tocar(sb, s.id);
  return NextResponse.json({ ok: true, n: filas.length });
}

async function fusionar(sb: any, s: any, body: any) {
  const { ids } = body;
  if (!Array.isArray(ids) || ids.length < 2) {
    return NextResponse.json({ error: 'Marca al menos dos paquetes para fusionar' }, { status: 400 });
  }
  const { data: filas } = await sb.from('mining_iwp_borrador').select('*')
    .eq('sesion_id', s.id).in('id', ids).order('secuencia');
  if (!filas || filas.length < 2) return NextResponse.json({ error: 'No se encontraron los paquetes' }, { status: 404 });

  const fusionado = fusionarPaquetes(filas.map((f: any) => ({
    nombre: f.nombre ?? '', grupo: f.grupo, partidas: f.partidas ?? [],
  })));

  const primera = filas[0];
  await sb.from('mining_iwp_borrador').delete().in('id', ids);

  const { error } = await sb.from('mining_iwp_borrador').insert({
    sesion_id: s.id, project_id: primera.project_id,
    secuencia: primera.secuencia,
    nombre: fusionado.nombre, limites_bateria: fusionado.limites_bateria, grupo: fusionado.grupo,
    cuadrilla_id: primera.cuadrilla_id,
    fecha_inicio_plan: primera.fecha_inicio_plan,
    hh: fusionado.partidas.reduce((sum, p) => sum + n(p.hh), 0),
    partidas: fusionado.partidas, editado: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await compactarSecuencias(sb, s.id);
  await recalcularDuraciones(sb, s);
  await tocar(sb, s.id);
  return NextResponse.json({ ok: true });
}

async function eliminar(sb: any, s: any, body: any) {
  const { ids } = body;
  if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: 'Sin paquetes seleccionados' }, { status: 400 });
  const { error } = await sb.from('mining_iwp_borrador').delete().eq('sesion_id', s.id).in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await compactarSecuencias(sb, s.id);
  await tocar(sb, s.id);
  return NextResponse.json({ ok: true, n: ids.length });
}

/** Deshacer: el cliente manda el estado anterior completo y se reemplaza la mesa. */
async function restaurar(sb: any, s: any, projectId: string, body: any) {
  const { borradores } = body;
  if (!Array.isArray(borradores)) return NextResponse.json({ error: 'Falta el estado a restaurar' }, { status: 400 });

  await sb.from('mining_iwp_borrador').delete().eq('sesion_id', s.id);
  if (borradores.length) {
    const filas = borradores.map((b: any, i: number) => ({
      sesion_id: s.id, project_id: projectId,
      secuencia: i + 1,
      nombre: b.nombre, limites_bateria: b.limites_bateria, grupo: b.grupo,
      cuadrilla_id: b.cuadrilla_id,
      fecha_inicio_plan: b.fecha_inicio_plan, fecha_fin_plan: b.fecha_fin_plan,
      dias: b.dias, hh: n(b.hh), partidas: b.partidas ?? [], editado: !!b.editado,
    }));
    const { error } = await sb.from('mining_iwp_borrador').insert(filas);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await tocar(sb, s.id);
  return NextResponse.json({ ok: true, n: borradores.length });
}

async function compactarSecuencias(sb: any, sesionId: string) {
  const { data } = await sb.from('mining_iwp_borrador').select('id, secuencia').eq('sesion_id', sesionId).order('secuencia');
  let i = 1;
  for (const f of data ?? []) {
    if (f.secuencia !== i) await sb.from('mining_iwp_borrador').update({ secuencia: i }).eq('id', f.id);
    i++;
  }
}

/** Tras dividir o fusionar, la duración deja de calzar con las HH: se recalcula. */
async function recalcularDuraciones(sb: any, s: any, soloSecuencias?: number[]) {
  const [{ data: turnos }, { data: cuadrillas }] = await Promise.all([
    sb.from('mining_turno').select('*').eq('id', s.turno_id),
    sb.from('mining_cuadrilla').select('*').eq('id', s.cuadrilla_id),
  ]);
  const turno = turnos?.[0], cuadrilla = cuadrillas?.[0];
  if (!turno || !cuadrilla) return;

  let q = sb.from('mining_iwp_borrador').select('id, hh, secuencia').eq('sesion_id', s.id);
  if (soloSecuencias?.length) q = q.in('secuencia', soloSecuencias);
  const { data } = await q;
  for (const f of data ?? []) {
    await sb.from('mining_iwp_borrador').update({ dias: duracionDias(n(f.hh), cuadrilla, turno) }).eq('id', f.id);
  }
  await reencadenar(sb, s.id, turno, s.fecha_inicio, s.cuadrillas_paralelo);
}

// ─── Publicar ────────────────────────────────────────────────────────────────

async function publicar(sb: any, s: any, projectId: string, cwpId: string, body: any, email: string | undefined) {
  const { data: borradores } = await sb.from('mining_iwp_borrador').select('*').eq('sesion_id', s.id).order('secuencia');
  if (!borradores?.length) return NextResponse.json({ error: 'No hay paquetes que publicar' }, { status: 400 });

  // El saldo manda: se revalida contra la base, no contra lo que tenía la mesa en pantalla.
  const { banco } = await cargarBanco(sb, projectId, cwpId);
  const saldo = new Map(banco.map(b => [b.clave, b.cantidad_saldo]));
  const pedido = new Map<string, number>();
  for (const b of borradores) {
    for (const p of b.partidas ?? []) pedido.set(p.clave, (pedido.get(p.clave) ?? 0) + n(p.cantidad));
  }
  const excedidas = [...pedido.entries()]
    .filter(([clave, cant]) => cant > (saldo.get(clave) ?? 0) * 1.001 + 0.001)
    .map(([clave, cant]) => `${clave.split('|')[0]} (pide ${r3(cant)}, saldo ${r3(saldo.get(clave) ?? 0)})`);
  if (excedidas.length) {
    return NextResponse.json({
      error: `El saldo del CWP cambió mientras trabajabas. Estas partidas ya no alcanzan: ${excedidas.slice(0, 5).join('; ')}${excedidas.length > 5 ? ` y ${excedidas.length - 5} más` : ''}. Regenera el quiebre.`,
    }, { status: 409 });
  }

  const { data: existentes } = await sb.from('mining_iwp').select('iwp_id')
    .eq('project_id', projectId).eq('cwp_id', cwpId);
  const usados = new Set((existentes ?? []).map((i: any) => i.iwp_id));
  let seq = (existentes ?? []).reduce((max: number, i: any) => {
    const m = /-IWP-(\d+)$/.exec(i.iwp_id);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);

  const ahora = new Date().toISOString();
  const filasIwp: any[] = [];
  const filasPartida: any[] = [];

  for (const [i, b] of borradores.entries()) {
    do { seq += 1; } while (usados.has(`${cwpId}-IWP-${String(seq).padStart(2, '0')}`));
    const iwp_id = `${cwpId}-IWP-${String(seq).padStart(2, '0')}`;
    usados.add(iwp_id);

    filasIwp.push({
      project_id: projectId, cwp_id: cwpId, iwp_id,
      descripcion: b.nombre?.trim() || `${cwpId} · paquete ${i + 1}`,
      descripcion_scope: b.limites_bateria ?? null,
      limites_bateria: b.limites_bateria ?? null,
      fecha_inicio_plan: b.fecha_inicio_plan, fecha_fin_plan: b.fecha_fin_plan,
      duracion_dias: b.dias, takt_dias: b.dias,
      secuencia: b.secuencia,
      cuadrilla_id: b.cuadrilla_id ?? s.cuadrilla_id, turno_id: s.turno_id,
      estrategia_quiebre: s.estrategia, origen_apertura: 'mesa',
      hh_estimadas: Math.round(n(b.hh)),
      semana_ejecucion: b.fecha_inicio_plan ? semanaIso(b.fecha_inicio_plan) : null,
      status: 'PLANIFICADO', avance_fisico_pct: 0, imagenes: [],
      creado_por: email, fecha_creacion: ahora,
    });

    for (const p of b.partidas ?? []) {
      if (!(n(p.cantidad) > 0)) continue;
      filasPartida.push({
        project_id: projectId, iwp_id, origen: 'itemizado',
        item: p.item, partida_bmp: p.partida_bmp ?? null,
        descripcion: p.descripcion ?? null, unidad: p.unidad ?? null,
        cantidad_asignada: r3(n(p.cantidad)),
        hh_unidad: p.hh_unidad ?? null, hh_asignadas: Math.round(n(p.hh)),
      });
    }
  }

  const { error: errIwp } = await sb.from('mining_iwp').insert(filasIwp);
  if (errIwp) return NextResponse.json({ error: errIwp.message }, { status: 500 });

  const ids = filasIwp.map(f => f.iwp_id);
  const revertir = async (msg: string) => {
    await sb.from('mining_iwp').delete().eq('project_id', projectId).in('iwp_id', ids);
    return NextResponse.json({ error: msg }, { status: 500 });
  };

  if (filasPartida.length) {
    const { error } = await sb.from('mining_iwp_partida').insert(filasPartida);
    if (error) return revertir(`No se pudieron guardar las cantidades: ${error.message}`);
  }

  let nRestricciones = 0;
  if (Array.isArray(body.restricciones) && body.restricciones.length) {
    const filas = ids.flatMap(iwp_id => body.restricciones.map((r: any) => ({
      project_id: projectId, iwp_id,
      tipo: String(r.tipo ?? 'OTRO').slice(0, 20),
      descripcion: r.descripcion ?? null,
      fecha_necesaria: r.fecha_necesaria || null,
      cleared: false,
    })));
    const { error } = await sb.from('mining_iwp_constraint').insert(filas);
    if (error) return revertir(`No se pudieron sembrar las restricciones: ${error.message}`);
    nRestricciones = filas.length;
  }

  // La sesión se cierra: lo que sigue es una sesión nueva sobre el saldo que quede. Los
  // borradores ya son IWP reales, así que se van — igual que en `descartar`, el cambio de
  // estado no dispara la cascada de la FK.
  await sb.from('mining_iwp_borrador').delete().eq('sesion_id', s.id);
  await sb.from('mining_apertura_sesion').update({ estado: 'PUBLICADA', updated_at: ahora }).eq('id', s.id);

  return NextResponse.json({
    ok: true, iwps: ids, n_iwp: ids.length,
    n_partidas: filasPartida.length, n_restricciones: nRestricciones,
    hh_total: filasIwp.reduce((sum, f) => sum + f.hh_estimadas, 0),
  }, { status: 201 });
}

/**
 * Descartar la sesión se lleva sus paquetes.
 *
 * La cascada de la FK sólo dispara al borrar la fila de la sesión, y acá no se borra: se
 * marca DESCARTADA para conservar el registro de que alguien intentó aperturar este CWP y
 * con qué parámetros. Sin este borrado explícito, cada sesión abandonada dejaba sus
 * borradores vivos para siempre.
 */
async function descartar(sb: any, s: any) {
  const { error: errBorradores } = await sb.from('mining_iwp_borrador').delete().eq('sesion_id', s.id);
  if (errBorradores) return NextResponse.json({ error: errBorradores.message }, { status: 500 });

  const { error } = await sb.from('mining_apertura_sesion')
    .update({ estado: 'DESCARTADA', updated_at: new Date().toISOString() }).eq('id', s.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
