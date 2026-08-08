import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizarTipo, normalizarSeveridad, deptoDe } from '@/lib/constraints';
import { normalizarEstado } from '@/lib/iwp-estado';

// Restricciones de un IWP.
//
// El semáforo del paquete se deriva de acá y de ninguna otra parte: `constraint_cleared` y el
// salto a LISTO_PARA_TRABAJO los calcula el servidor cada vez que una restricción cambia. Es
// lo que hace que el backlog constraint-free sea un dato y no una declaración.

/**
 * Recalcula el semáforo del IWP después de tocar sus restricciones.
 *
 * Sube a LISTO_PARA_TRABAJO solo desde PLANIFICADO: si el paquete ya está liberado o en
 * ejecución, despejar la última restricción no puede hacerlo *retroceder* al backlog.
 * Baja a PLANIFICADO cuando reaparece una restricción y el paquete todavía no arrancó —
 * si ya está en ejecución la restricción es un problema, pero devolverlo de estado sería
 * borrar el hecho de que la cuadrilla está en el frente.
 */
async function sincronizarSemaforo(sb: any, projectId: string, iwpId: string) {
  const [pendRes, iwpRes] = await Promise.all([
    sb.from('mining_iwp_constraint').select('id', { count: 'exact', head: true })
      .eq('project_id', projectId).eq('iwp_id', iwpId).eq('cleared', false),
    sb.from('mining_iwp').select('status').eq('project_id', projectId).eq('iwp_id', iwpId).maybeSingle(),
  ]);

  const pendientes = pendRes.count ?? 0;
  const libre = pendientes === 0;
  const estado = normalizarEstado(iwpRes.data?.status);

  const campos: Record<string, any> = {
    constraint_cleared: libre,
    fecha_ultima_actualizacion: new Date().toISOString(),
  };

  if (libre && estado === 'PLANIFICADO') campos.status = 'LISTO_PARA_TRABAJO';
  if (!libre && (estado === 'LISTO_PARA_TRABAJO' || estado === 'LIBERADO')) campos.status = 'PLANIFICADO';

  await sb.from('mining_iwp').update(campos)
    .eq('project_id', projectId).eq('iwp_id', iwpId);

  return { pendientes, status: campos.status ?? estado };
}

// GET /api/mining-iwp-constraint?project_id=&iwp_id=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const iwpId = params.get('iwp_id');
  if (!projectId || !iwpId) return NextResponse.json({ error: 'Missing project_id/iwp_id' }, { status: 400 });

  const sb = supabase as any;
  const { data, error } = await sb.from('mining_iwp_constraint').select('*')
    .eq('project_id', projectId).eq('iwp_id', iwpId).order('fecha_necesaria', { nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [] });
}

// POST /api/mining-iwp-constraint
// Body: { project_id, iwp_id, tipo, descripcion, fecha_necesaria?, responsable?, depto?, severidad? }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, iwp_id, tipo, descripcion, fecha_necesaria, responsable, depto, severidad } = body ?? {};
  if (!project_id || !iwp_id || !tipo) return NextResponse.json({ error: 'Missing project_id/iwp_id/tipo' }, { status: 400 });

  const sb = supabase as any;
  const tipoNorm = normalizarTipo(tipo);
  const { data, error } = await sb.from('mining_iwp_constraint')
    .insert({
      project_id, iwp_id,
      tipo: tipoNorm,
      descripcion: descripcion ?? null,
      fecha_necesaria: fecha_necesaria || null,
      // Sin dueño la restricción no se cierra sola: si nadie lo dice, lo pone el catálogo.
      depto: deptoDe(tipoNorm, depto),
      responsable: responsable?.trim() || null,
      severidad: normalizarSeveridad(severidad),
    })
    .select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const semaforo = await sincronizarSemaforo(sb, project_id, iwp_id);
  return NextResponse.json({ row: data, ...semaforo });
}

// PATCH /api/mining-iwp-constraint
// Body: { project_id, constraint_id, cleared?, descripcion?, fecha_necesaria?, nota?, responsable?, depto?, severidad? }
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, constraint_id, cleared, tipo, severidad, ...rest } = body ?? {};
  if (!project_id || !constraint_id) return NextResponse.json({ error: 'Missing project_id/constraint_id' }, { status: 400 });

  const fields: Record<string, any> = { ...rest };
  if (tipo !== undefined) fields.tipo = normalizarTipo(tipo);
  if (severidad !== undefined) fields.severidad = normalizarSeveridad(severidad);
  if (typeof cleared === 'boolean') {
    fields.cleared = cleared;
    fields.fecha_cleared = cleared ? new Date().toISOString().slice(0, 10) : null;
    fields.despejado_por = cleared ? (user.email ?? user.id) : null;
  }

  const sb = supabase as any;
  const { data: updated, error } = await sb.from('mining_iwp_constraint').update(fields)
    .eq('project_id', project_id).eq('id', constraint_id).select('iwp_id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const semaforo = typeof cleared === 'boolean' && updated?.iwp_id
    ? await sincronizarSemaforo(sb, project_id, updated.iwp_id)
    : {};

  return NextResponse.json({ ok: true, ...semaforo });
}
