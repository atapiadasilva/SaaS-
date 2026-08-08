import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enBacklogEjecutable, estaCerrado, normalizarEstado } from '@/lib/iwp-estado';

// La Sala de Apertura: qué CWP quebrar esta semana, y qué falta en los que no se puede.
//
// El problema que resuelve no es de cálculo, es de embudo. El motor de apertura existe y
// funciona, pero para llegar a él había que saber de antemano qué CWP tocaba: entrar a
// Minería, encontrarlo entre 74 en una lista, abrir su pestaña IWP y recién ahí ver el botón.
// Nadie hace eso todos los días. Esta ruta arma la lista priorizada y dice, CWP por CWP, si
// se puede aperturar y qué falta si no.
//
// Deliberadamente NO usa `cargarBanco` por CWP: serían tres queries por paquete y setenta y
// cuatro paquetes. El saldo y la cobertura salen de las vistas `v_cwp_banco` y
// `v_cwp_cobertura`, que agregan en la base con la misma llave `item + partida_bmp` que usa
// `lib/cwp-banco` — si las dos divergieran, el ranking mostraría un saldo distinto al del
// asistente y no se podría confiar en ninguno de los dos.

const n = (v: unknown) => Number(v ?? 0) || 0;

interface Bloqueo {
  codigo: string;
  mensaje: string;
  /** `bloqueo` impide aperturar; `aviso` deja seguir pero degrada el resultado. */
  severidad: 'bloqueo' | 'aviso';
  /** A dónde ir a arreglarlo, relativo a la raíz del proyecto. */
  destino?: string;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pid = req.nextUrl.searchParams.get('project_id');
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;

  const [cwpRes, bancoRes, cobRes, iwpRes, cuadRes, turnoRes, ingRes] = await Promise.all([
    sb.from('mining_cwp')
      .select('cwp_id, cwp_nombre, cwa_id, cv_id, disciplina, disciplina_cod, hh_planner, fecha_ini, fecha_fin, ruta_critica, fecha_ifc, status_cwp')
      .eq('project_id', pid).eq('es_oficial', true),
    sb.from('v_cwp_banco').select('cwp_id, n_partidas, hh_banco, hh_saldo, n_sin_rendimiento').eq('project_id', pid),
    sb.from('v_cwp_cobertura').select('cwp_id, n_planos, n_elementos').eq('project_id', pid),
    sb.from('mining_iwp')
      .select('iwp_id, cwp_id, status, hh_estimadas, fecha_inicio_plan, constraint_cleared')
      .eq('project_id', pid),
    sb.from('mining_cuadrilla').select('id, disciplina_cod, n_personas, factor_productividad, turno_id').eq('project_id', pid).eq('activa', true),
    sb.from('mining_turno').select('id, codigo, dias_trabajo, dias_descanso, horas_dia, es_default').eq('project_id', pid).eq('activo', true),
    // Estado de la ingeniería por CWP. Agregado en la base por la misma razón que el banco: son
    // cientos de vínculos documento→CWP y traerlos crudos toparía el límite de filas de PostgREST.
    sb.from('v_cwp_ingenieria').select('cwp_id, n_docs, n_ifc, n_revision, n_interna').eq('project_id', pid),
  ]);

  const err = [cwpRes, bancoRes, cobRes, iwpRes, cuadRes, turnoRes, ingRes].find((r: any) => r?.error);
  if (err?.error) return NextResponse.json({ error: err.error.message }, { status: 500 });

  const cwps = cwpRes.data ?? [];
  const iwps = iwpRes.data ?? [];
  const cuadrillas = cuadRes.data ?? [];
  const turnos = turnoRes.data ?? [];

  const bancoPorCwp = new Map<string, any>((bancoRes.data ?? []).map((b: any) => [b.cwp_id, b]));
  const cobPorCwp = new Map<string, any>((cobRes.data ?? []).map((c: any) => [c.cwp_id, c]));
  const ingPorCwp = new Map<string, any>((ingRes.data ?? []).map((i: any) => [i.cwp_id, i]));

  const iwpsPorCwp = new Map<string, typeof iwps>();
  for (const i of iwps) {
    const arr = iwpsPorCwp.get(i.cwp_id) ?? [];
    arr.push(i);
    iwpsPorCwp.set(i.cwp_id, arr);
  }

  const hayCuadrillas = cuadrillas.length > 0;
  const hoy = Date.now();
  const dias = (f: string | null) => (f ? Math.round((new Date(f).getTime() - hoy) / 86400000) : null);

  // ── Fila por CWP ──
  const filas = cwps.map((c: any) => {
    const banco = bancoPorCwp.get(c.cwp_id);
    const cob = cobPorCwp.get(c.cwp_id);
    const misIwps = iwpsPorCwp.get(c.cwp_id) ?? [];

    const nPartidas = n(banco?.n_partidas);
    const hhBanco = n(banco?.hh_banco);
    const hhSaldo = n(banco?.hh_saldo);
    const sinRendimiento = n(banco?.n_sin_rendimiento);
    const planos = n(cob?.n_planos);
    const elementos = n(cob?.n_elementos);
    const ing = ingPorCwp.get(c.cwp_id);
    const docs = n(ing?.n_docs);
    const docsIfc = n(ing?.n_ifc);

    const hhAsignadas = Math.max(0, hhBanco - hhSaldo);
    const pctAperturado = hhBanco > 0 ? Math.round((hhAsignadas / hhBanco) * 1000) / 10 : 0;

    const diasInicio = dias(c.fecha_ini);
    const ifcPendiente = c.fecha_ifc ? new Date(c.fecha_ifc).getTime() > hoy : false;

    const bloqueos: Bloqueo[] = [];
    if (nPartidas === 0) {
      bloqueos.push({
        codigo: 'SIN_ITEMIZADO', severidad: 'bloqueo',
        mensaje: 'No tiene líneas de itemizado asignadas: no hay banco de cantidades que quebrar.',
        destino: 'conciliacion',
      });
    } else if (hhBanco <= 0) {
      bloqueos.push({
        codigo: 'SIN_HH', severidad: 'bloqueo',
        mensaje: 'El itemizado no tiene HH ni rendimientos: no hay con qué dimensionar los paquetes.',
        destino: 'conciliacion',
      });
    } else if (hhSaldo <= 1) {
      bloqueos.push({
        codigo: 'APERTURADO', severidad: 'aviso',
        mensaje: 'Ya está completamente aperturado en IWP.',
      });
    }
    if (!hayCuadrillas) {
      bloqueos.push({
        codigo: 'SIN_CUADRILLA', severidad: 'bloqueo',
        mensaje: 'El proyecto no tiene cuadrillas activas. Sin cuadrilla no hay capacidad de ciclo con la cual dimensionar un IWP.',
        destino: 'recursos/cuadrillas',
      });
    }
    if (sinRendimiento > 0) {
      bloqueos.push({
        codigo: 'SIN_RENDIMIENTO', severidad: 'aviso',
        mensaje: `${sinRendimiento} partida(s) con saldo pero sin rendimiento HH/unidad: quedan fuera del quiebre automático.`,
        destino: 'conciliacion',
      });
    }
    if (planos === 0) {
      bloqueos.push({
        codigo: 'SIN_PLANOS', severidad: 'aviso',
        mensaje: 'Sin planos vinculados en el CDE: terreno no tendría con qué ejecutar el paquete.',
        destino: 'mineria/documentos',
      });
    }
    if (elementos === 0) {
      bloqueos.push({
        codigo: 'SIN_MODELO', severidad: 'aviso',
        mensaje: 'Sin elementos vinculados en el modelo 3D: no se puede cortar por zona ni mostrar el alcance en el visor.',
        destino: 'mineria/elementos',
      });
    }
    if (ifcPendiente) {
      bloqueos.push({
        codigo: 'IFC_PENDIENTE', severidad: 'aviso',
        mensaje: `La ingeniería queda IFC el ${new Date(c.fecha_ifc).toLocaleDateString('es-CL')}. Se puede aperturar, pero los IWP nacen con restricción.`,
      });
    }
    // El estado real de la ingeniería, leído del CDE y no de una fecha declarada. Es aviso y no
    // bloqueo a propósito: aperturar sirve igual para planificar y para ver el alcance, pero el
    // paquete no se va a poder LIBERAR hasta que exista el plano emitido para construcción.
    if (docs > 0 && docsIfc === 0) {
      bloqueos.push({
        codigo: 'SIN_IFC', severidad: 'aviso',
        mensaje: `Los ${docs} documento(s) vinculados están en revisión o emisión interna: ninguno emitido para construcción. Los IWP nacen con restricción de ingeniería.`,
        destino: 'mineria/documentos',
      });
    }

    const aperturable = !bloqueos.some(b => b.severidad === 'bloqueo');

    // Urgencia: lo que arranca antes pesa más, la ruta crítica adelanta un mes, y a igualdad
    // de fecha manda el saldo — un CWP grande sin aperturar es más riesgo que uno chico.
    let urgencia = 0;
    if (aperturable && hhSaldo > 1) {
      const base = diasInicio == null ? 365 : Math.max(-90, diasInicio);
      urgencia = 1000 - base + (c.ruta_critica ? 30 : 0) + Math.min(200, hhSaldo / 100);
    }

    return {
      cwp_id: c.cwp_id,
      nombre: c.cwp_nombre,
      cwa: c.cwa_id,
      cv: c.cv_id,
      disciplina: c.disciplina,
      disciplina_cod: c.disciplina_cod,
      fecha_ini: c.fecha_ini,
      dias_para_inicio: diasInicio,
      ruta_critica: !!c.ruta_critica,
      hh_planner: n(c.hh_planner),
      hh_banco: Math.round(hhBanco),
      hh_asignadas: Math.round(hhAsignadas),
      hh_saldo: Math.round(hhSaldo),
      pct_aperturado: pctAperturado,
      n_partidas: nPartidas,
      n_sin_rendimiento: sinRendimiento,
      n_planos: planos,
      n_elementos: elementos,
      n_docs: docs,
      n_docs_ifc: docsIfc,
      n_iwp: misIwps.length,
      n_iwp_listos: misIwps.filter((i: any) => enBacklogEjecutable(i.status)).length,
      aperturable,
      bloqueos,
      urgencia,
    };
  });

  filas.sort((a: any, b: any) => b.urgencia - a.urgencia || b.hh_saldo - a.hh_saldo);

  // ── Cabecera: los cuatro números del WorkFace Planning ──
  const hhBancoTotal = filas.reduce((s: number, f: any) => s + f.hh_banco, 0);
  const hhAperturadas = filas.reduce((s: number, f: any) => s + f.hh_asignadas, 0);

  // Capacidad semanal instalada: lo que las cuadrillas activas entregan en una semana de
  // calendario, descontando los días de descanso del ciclo. Es el divisor honesto para
  // convertir el backlog en semanas — decir "12.000 HH listas" no le sirve a nadie.
  const turnoPorId = new Map(turnos.map((t: any) => [t.id, t]));
  const turnoDefault = turnos.find((t: any) => t.es_default) ?? turnos[0] ?? null;
  const hhSemanaCapacidad = cuadrillas.reduce((s: number, c: any) => {
    const t: any = turnoPorId.get(c.turno_id) ?? turnoDefault;
    if (!t) return s;
    const ciclo = n(t.dias_trabajo) + n(t.dias_descanso);
    if (ciclo <= 0) return s;
    const hhDia = n(c.n_personas) * n(t.horas_dia) * (n(c.factor_productividad) || 1);
    return s + hhDia * (n(t.dias_trabajo) / ciclo) * 7;
  }, 0);

  const hhBacklog = iwps
    .filter((i: any) => enBacklogEjecutable(i.status))
    .reduce((s: number, i: any) => s + n(i.hh_estimadas), 0);

  const en14dias = hoy + 14 * 86400000;
  const iwpEnRiesgo = iwps.filter((i: any) =>
    !i.constraint_cleared && !estaCerrado(i.status) &&
    i.fecha_inicio_plan && new Date(i.fecha_inicio_plan).getTime() <= en14dias,
  ).length;

  const porEstado: Record<string, number> = {};
  for (const i of iwps) {
    const e = normalizarEstado(i.status);
    porEstado[e] = (porEstado[e] ?? 0) + 1;
  }

  return NextResponse.json({
    resumen: {
      n_cwp: filas.length,
      n_aperturables: filas.filter((f: any) => f.aperturable && f.hh_saldo > 1).length,
      n_bloqueados: filas.filter((f: any) => !f.aperturable).length,
      n_completos: filas.filter((f: any) => f.hh_banco > 0 && f.hh_saldo <= 1).length,
      hh_banco: Math.round(hhBancoTotal),
      hh_aperturadas: Math.round(hhAperturadas),
      pct_aperturado: hhBancoTotal > 0 ? Math.round((hhAperturadas / hhBancoTotal) * 1000) / 10 : 0,
      n_iwp: iwps.length,
      por_estado: porEstado,
      hh_backlog: Math.round(hhBacklog),
      // La meta del estándar COAA son cuatro semanas de backlog libre de restricciones.
      semanas_backlog: hhSemanaCapacidad > 0 ? Math.round((hhBacklog / hhSemanaCapacidad) * 10) / 10 : null,
      hh_semana_capacidad: Math.round(hhSemanaCapacidad),
      n_cuadrillas: cuadrillas.length,
      iwp_en_riesgo: iwpEnRiesgo,
      // Ingeniería: sin documentos IFC ningún paquete es liberable, por regla COAA.
      n_docs: filas.reduce((s: number, f: any) => s + f.n_docs, 0),
      n_docs_ifc: filas.reduce((s: number, f: any) => s + f.n_docs_ifc, 0),
      n_cwp_con_ifc: filas.filter((f: any) => f.n_docs_ifc > 0).length,
    },
    cwps: filas,
  });
}
