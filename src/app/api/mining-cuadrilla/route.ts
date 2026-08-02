import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Catálogo de turnos y cuadrillas del proyecto.
//
// Son los dos datos maestros que convierten HH en un plan ejecutable: el turno dice cuántas
// horas rinde una persona antes de bajar del ciclo, y la cuadrilla cuántas personas van.
// Su producto es el tamaño objetivo del IWP, así que sin esto la apertura no tiene con qué
// dimensionar los paquetes.
//
// GET    /api/mining-cuadrilla?project_id=            -> { turnos, cuadrillas }
// POST   /api/mining-cuadrilla   { project_id, tipo: 'turno'|'cuadrilla', ... }
// PATCH  /api/mining-cuadrilla   { project_id, tipo, id, ...campos }
// DELETE /api/mining-cuadrilla?project_id=&tipo=&id=

const TABLA = { turno: 'mining_turno', cuadrilla: 'mining_cuadrilla' } as const;
type Tipo = keyof typeof TABLA;

const esTipo = (v: unknown): v is Tipo => v === 'turno' || v === 'cuadrilla';

/** Personas declaradas en la composición por rol; gana sobre el n_personas suelto si existe. */
function personasDeComposicion(composicion: unknown): number | null {
  if (!Array.isArray(composicion) || composicion.length === 0) return null;
  const total = composicion.reduce((s: number, c: any) => s + (Number(c?.cantidad) || 0), 0);
  return total > 0 ? total : null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;
  const [turnos, cuadrillas] = await Promise.all([
    sb.from('mining_turno').select('*').eq('project_id', projectId)
      .order('es_default', { ascending: false }).order('codigo'),
    sb.from('mining_cuadrilla').select('*').eq('project_id', projectId).order('codigo'),
  ]);

  if (turnos.error) return NextResponse.json({ error: turnos.error.message }, { status: 500 });
  if (cuadrillas.error) return NextResponse.json({ error: cuadrillas.error.message }, { status: 500 });

  return NextResponse.json({ turnos: turnos.data ?? [], cuadrillas: cuadrillas.data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, tipo } = body ?? {};
  if (!project_id || !esTipo(tipo)) return NextResponse.json({ error: 'Falta project_id o tipo (turno|cuadrilla)' }, { status: 400 });

  const sb = supabase as any;

  if (tipo === 'turno') {
    const { codigo, nombre, dias_trabajo, dias_descanso, horas_dia, es_default } = body;
    if (!codigo?.trim()) return NextResponse.json({ error: 'El turno necesita un código' }, { status: 400 });
    if (!(Number(dias_trabajo) > 0) || !(Number(horas_dia) > 0)) {
      return NextResponse.json({ error: 'Días de trabajo y horas por día deben ser mayores que cero' }, { status: 400 });
    }
    if (es_default) await sb.from('mining_turno').update({ es_default: false }).eq('project_id', project_id);
    const { data, error } = await sb.from('mining_turno').insert({
      project_id, codigo: codigo.trim().toUpperCase(), nombre: nombre?.trim() || null,
      dias_trabajo: Number(dias_trabajo), dias_descanso: Number(dias_descanso) || 0,
      horas_dia: Number(horas_dia), es_default: !!es_default,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  const { codigo, nombre, disciplina_cod, composicion, n_personas, turno_id, factor_productividad, observacion } = body;
  if (!codigo?.trim()) return NextResponse.json({ error: 'La cuadrilla necesita un código' }, { status: 400 });
  const personas = (personasDeComposicion(composicion) ?? Number(n_personas)) || 0;
  if (personas <= 0) return NextResponse.json({ error: 'La cuadrilla necesita al menos una persona' }, { status: 400 });

  const { data, error } = await sb.from('mining_cuadrilla').insert({
    project_id, codigo: codigo.trim().toUpperCase(), nombre: nombre?.trim() || null,
    disciplina_cod: disciplina_cod || null,
    composicion: Array.isArray(composicion) ? composicion : [],
    n_personas: personas, turno_id: turno_id || null,
    factor_productividad: Number(factor_productividad) > 0 ? Number(factor_productividad) : 1,
    observacion: observacion?.trim() || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, tipo, id, ...updates } = body ?? {};
  if (!project_id || !esTipo(tipo) || !id) return NextResponse.json({ error: 'Falta project_id, tipo o id' }, { status: 400 });

  const sb = supabase as any;

  if (tipo === 'turno' && updates.es_default) {
    await sb.from('mining_turno').update({ es_default: false }).eq('project_id', project_id);
  }
  if (tipo === 'cuadrilla') {
    const personas = personasDeComposicion(updates.composicion);
    if (personas != null) updates.n_personas = personas;
  }

  const { error } = await sb.from(TABLA[tipo]).update(updates).eq('project_id', project_id).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const tipo = params.get('tipo');
  const id = params.get('id');
  if (!projectId || !esTipo(tipo) || !id) return NextResponse.json({ error: 'Falta project_id, tipo o id' }, { status: 400 });

  const sb = supabase as any;

  // No se borra lo que ya está planificado: se desactiva, para no romper los IWP que lo usan.
  const enUso = await sb.from('mining_iwp')
    .select('iwp_id', { count: 'exact', head: true })
    .eq('project_id', projectId).eq(tipo === 'turno' ? 'turno_id' : 'cuadrilla_id', id);

  if ((enUso.count ?? 0) > 0) {
    const { error } = await sb.from(TABLA[tipo])
      .update(tipo === 'turno' ? { activo: false } : { activa: false })
      .eq('project_id', projectId).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, desactivado: true, iwps: enUso.count });
  }

  const { error } = await sb.from(TABLA[tipo]).delete().eq('project_id', projectId).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
