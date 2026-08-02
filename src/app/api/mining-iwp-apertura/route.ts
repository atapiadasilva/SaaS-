import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cargarBanco } from '@/lib/cwp-banco';

// Apertura de un CWP en IWPs — el cierre de la rutina de Pull Planning.
//
// GET  ?project_id=&cwp_id=   Restricciones que los departamentos ya declararon sobre este
//                             CWP y que van a bloquear a todos sus IWP (paso 9).
// POST                        Crea el lote completo: paquetes, cantidades y restricciones.
//
// El POST vuelve a cargar el banco antes de escribir. No es paranoia: una sesión de Pull
// Planning la miran varias personas a la vez, y el saldo que vio el asistente hace diez
// minutos puede ya no existir.

const n = (v: unknown) => Number(v ?? 0) || 0;

// ─── Paso 9: lo que los departamentos ya dijeron sobre este CWP ───────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const cwpId = params.get('cwp_id');
  if (!projectId || !cwpId) return NextResponse.json({ error: 'Missing project_id/cwp_id' }, { status: 400 });

  const sb = supabase as any;
  const [cwpRes, ifcRes, sumRes, consRes, planosRes] = await Promise.all([
    sb.from('mining_cwp').select('fecha_ifc, status_cwp, suministro')
      .eq('project_id', projectId).eq('cwp_id', cwpId).maybeSingle(),
    sb.from('mining_ewp_ifc').select('documento_ifc, fecha_ifc_plan, fecha_ifc_real, liberado, observacion')
      .eq('project_id', projectId).eq('cwp_id', cwpId),
    sb.from('mining_suministro').select('descripcion_material, proveedor, numero_po, fecha_entrega_plan, liberado')
      .eq('project_id', projectId).eq('cwp_id', cwpId),
    sb.from('mining_consideraciones').select('depto, tipo, titulo, detalle, severidad, estado, fecha_limite, responsable')
      .eq('project_id', projectId).eq('cwp_id', cwpId),
    sb.from('mining_planos').select('codigo_documento', { count: 'exact', head: true })
      .eq('project_id', projectId).eq('cwp_id', cwpId),
  ]);

  const sugeridas: {
    tipo: string; descripcion: string; fecha_necesaria: string | null;
    origen: string; severidad: string;
  }[] = [];

  // Ingeniería: los IFC pendientes son la restricción que más veces mata a un IWP.
  for (const e of (ifcRes.data ?? []).filter((x: any) => !x.liberado)) {
    sugeridas.push({
      tipo: 'IFC',
      descripcion: `IFC pendiente: ${e.documento_ifc ?? 'documento sin código'}${e.observacion ? ` — ${e.observacion}` : ''}`,
      fecha_necesaria: e.fecha_ifc_plan ?? null,
      origen: 'Ingeniería', severidad: 'alta',
    });
  }
  // Si el CWP no tiene detalle de EWP pero sí una fecha IFC futura, igual hay que avisar.
  if (!(ifcRes.data ?? []).length && cwpRes.data?.fecha_ifc) {
    const pendiente = new Date(cwpRes.data.fecha_ifc).getTime() > Date.now();
    if (pendiente) {
      sugeridas.push({
        tipo: 'IFC',
        descripcion: `La ingeniería del CWP recién queda IFC el ${new Date(cwpRes.data.fecha_ifc).toLocaleDateString('es-CL')}.`,
        fecha_necesaria: cwpRes.data.fecha_ifc, origen: 'Ingeniería', severidad: 'alta',
      });
    }
  }

  // Suministros: material sin liberar.
  for (const s of (sumRes.data ?? []).filter((x: any) => !x.liberado)) {
    sugeridas.push({
      tipo: 'MATERIAL',
      descripcion: `Material sin liberar: ${s.descripcion_material ?? 'sin descripción'}${s.numero_po ? ` (OC ${s.numero_po})` : ''}${s.proveedor ? ` · ${s.proveedor}` : ''}`,
      fecha_necesaria: s.fecha_entrega_plan ?? null,
      origen: 'Suministros', severidad: 'alta',
    });
  }

  // Los departamentos (calidad, SSO, medio ambiente…) publican por CWP en consideraciones.
  for (const c of (consRes.data ?? []).filter((x: any) => String(x.estado ?? '').toLowerCase() !== 'cerrada')) {
    sugeridas.push({
      tipo: (c.tipo ?? c.depto ?? 'OTRO').toUpperCase().slice(0, 20),
      descripcion: `${c.depto}: ${c.titulo}${c.detalle ? ` — ${c.detalle}` : ''}${c.responsable ? ` (${c.responsable})` : ''}`,
      fecha_necesaria: c.fecha_limite ?? null,
      origen: c.depto ?? 'Departamento', severidad: c.severidad ?? 'media',
    });
  }

  // Sin planos vinculados no hay con qué construir, por muy IFC que esté la ingeniería.
  if ((planosRes.count ?? 0) === 0) {
    sugeridas.push({
      tipo: 'PREDECESORA',
      descripcion: 'Este CWP no tiene planos vinculados en el CDE. Terreno no tiene con qué ejecutar.',
      fecha_necesaria: null, origen: 'Control Documental', severidad: 'media',
    });
  }

  return NextResponse.json({ sugeridas });
}

// ─── Crear el lote ───────────────────────────────────────────────────────────

interface PartidaIn {
  item: string; descripcion?: string | null; unidad?: string | null;
  cantidad: number; hh_unidad?: number | null; hh: number; origen?: string;
}
interface IwpIn {
  nombre: string; grupo?: string | null; limites_bateria?: string | null;
  secuencia?: number; hh?: number; dias?: number;
  fecha_inicio_plan: string; fecha_fin_plan: string;
  partidas: PartidaIn[];
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    project_id, cwp_id, cuadrilla_id, turno_id, estrategia,
    iwps, restricciones,
  } = body ?? {};

  if (!project_id || !cwp_id) return NextResponse.json({ error: 'Falta project_id o cwp_id' }, { status: 400 });
  if (!Array.isArray(iwps) || iwps.length === 0) return NextResponse.json({ error: 'No hay IWPs que crear' }, { status: 400 });

  const sb = supabase as any;

  const { data: cwp } = await sb.from('mining_cwp').select('cwp_id, disciplina_cod')
    .eq('project_id', project_id).eq('cwp_id', cwp_id).maybeSingle();
  if (!cwp) return NextResponse.json({ error: `El CWP ${cwp_id} no existe en este proyecto` }, { status: 404 });

  // ── El saldo manda: se revalida contra la base, no contra lo que mandó el cliente ──
  const { banco } = await cargarBanco(sb, project_id, cwp_id);
  const saldo = new Map(banco.map(b => [b.item, b.cantidad_saldo]));
  const pedido = new Map<string, number>();
  for (const iwp of iwps as IwpIn[]) {
    for (const p of iwp.partidas ?? []) {
      pedido.set(p.item, (pedido.get(p.item) ?? 0) + n(p.cantidad));
    }
  }
  const excedidas = [...pedido.entries()]
    // Tolerancia de un 0,1%: el troceo reparte fracciones y el redondeo no debe bloquear.
    .filter(([item, cant]) => cant > (saldo.get(item) ?? 0) * 1.001 + 0.001)
    .map(([item, cant]) => `${item} (pide ${Math.round(cant * 100) / 100}, saldo ${Math.round((saldo.get(item) ?? 0) * 100) / 100})`);
  if (excedidas.length) {
    return NextResponse.json({
      error: `El saldo del CWP cambió mientras armabas la apertura. Estas partidas ya no alcanzan: ${excedidas.slice(0, 5).join('; ')}${excedidas.length > 5 ? ` y ${excedidas.length - 5} más` : ''}. Vuelve a cargar el banco.`,
    }, { status: 409 });
  }

  // ── Numeración: continúa la del CWP, no reinicia ──
  const { data: existentes } = await sb.from('mining_iwp').select('iwp_id')
    .eq('project_id', project_id).eq('cwp_id', cwp_id);
  const usados = new Set((existentes ?? []).map((i: any) => i.iwp_id));
  let seq = (existentes ?? []).reduce((max: number, i: any) => {
    const m = /-IWP-(\d+)$/.exec(i.iwp_id);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);

  const ahora = new Date().toISOString();
  const filasIwp: any[] = [];
  const filasPartida: any[] = [];

  for (const [i, iwp] of (iwps as IwpIn[]).entries()) {
    do { seq += 1; } while (usados.has(`${cwp_id}-IWP-${String(seq).padStart(2, '0')}`));
    const iwp_id = `${cwp_id}-IWP-${String(seq).padStart(2, '0')}`;
    usados.add(iwp_id);

    const hh = iwp.partidas?.reduce((s, p) => s + n(p.hh), 0) ?? n(iwp.hh);
    const ini = iwp.fecha_inicio_plan;
    const fin = iwp.fecha_fin_plan;
    const dias = n(iwp.dias) || (ini && fin
      ? Math.max(1, Math.round((new Date(fin).getTime() - new Date(ini).getTime()) / 86400000) + 1)
      : null);

    filasIwp.push({
      project_id, cwp_id, iwp_id,
      descripcion: iwp.nombre?.trim() || `${cwp_id} · paquete ${i + 1}`,
      descripcion_scope: iwp.limites_bateria ?? null,
      limites_bateria: iwp.limites_bateria ?? null,
      fecha_inicio_plan: ini || null,
      fecha_fin_plan: fin || null,
      duracion_dias: dias,
      takt_dias: dias,
      secuencia: iwp.secuencia ?? i + 1,
      cuadrilla_id: cuadrilla_id || null,
      turno_id: turno_id || null,
      estrategia_quiebre: estrategia ?? null,
      origen_apertura: 'asistente',
      hh_estimadas: Math.round(hh),
      // La semana ISO de inicio es la que usan las rutinas semanales (Obeya) para agrupar.
      semana_ejecucion: ini ? semanaIso(ini) : null,
      status: 'Planificado',
      avance_fisico_pct: 0,
      imagenes: [],
      creado_por: user.email,
      fecha_creacion: ahora,
    });

    for (const p of iwp.partidas ?? []) {
      if (!(n(p.cantidad) > 0)) continue;
      filasPartida.push({
        project_id, iwp_id,
        origen: p.origen === 'mc' ? 'mc' : 'itemizado',
        item: p.item,
        descripcion: p.descripcion ?? null,
        unidad: p.unidad ?? null,
        cantidad_asignada: Math.round(n(p.cantidad) * 1000) / 1000,
        hh_unidad: p.hh_unidad ?? null,
        hh_asignadas: Math.round(n(p.hh)),
      });
    }
  }

  const { error: errIwp } = await sb.from('mining_iwp').insert(filasIwp);
  if (errIwp) return NextResponse.json({ error: errIwp.message }, { status: 500 });

  const ids = filasIwp.map(f => f.iwp_id);
  // Si algo falla más abajo hay que deshacer: un IWP sin cantidades es peor que ninguno,
  // porque aparece en los tableros como alcance abierto y no lo es.
  const revertir = async (msg: string) => {
    await sb.from('mining_iwp').delete().eq('project_id', project_id).in('iwp_id', ids);
    return NextResponse.json({ error: msg }, { status: 500 });
  };

  if (filasPartida.length) {
    const { error } = await sb.from('mining_iwp_partida').insert(filasPartida);
    if (error) return revertir(`No se pudieron guardar las cantidades: ${error.message}`);
  }

  let nRestricciones = 0;
  if (Array.isArray(restricciones) && restricciones.length) {
    // Las restricciones vienen del CWP, así que bloquean a todos sus IWP por igual.
    const filas = ids.flatMap(iwp_id => restricciones.map((r: any) => ({
      project_id, iwp_id,
      tipo: String(r.tipo ?? 'OTRO').slice(0, 20),
      descripcion: r.descripcion ?? null,
      fecha_necesaria: r.fecha_necesaria || null,
      cleared: false,
    })));
    const { error } = await sb.from('mining_iwp_constraint').insert(filas);
    if (error) return revertir(`No se pudieron sembrar las restricciones: ${error.message}`);
    nRestricciones = filas.length;
  }

  return NextResponse.json({
    ok: true,
    iwps: ids,
    n_iwp: ids.length,
    n_partidas: filasPartida.length,
    n_restricciones: nRestricciones,
    hh_total: filasIwp.reduce((s, f) => s + f.hh_estimadas, 0),
  }, { status: 201 });
}

/** Semana ISO en formato `2026-W31`, que es como agrupan las rutinas semanales. */
function semanaIso(fechaIso: string): string {
  const d = new Date(fechaIso + 'T00:00:00Z');
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}
