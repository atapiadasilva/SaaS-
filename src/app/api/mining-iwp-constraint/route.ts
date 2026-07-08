import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
// Body: { project_id, iwp_id, tipo, descripcion, fecha_necesaria? }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, iwp_id, tipo, descripcion, fecha_necesaria } = body ?? {};
  if (!project_id || !iwp_id || !tipo) return NextResponse.json({ error: 'Missing project_id/iwp_id/tipo' }, { status: 400 });

  const sb = supabase as any;
  const { data, error } = await sb.from('mining_iwp_constraint')
    .insert({ project_id, iwp_id, tipo, descripcion: descripcion ?? null, fecha_necesaria: fecha_necesaria ?? null })
    .select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Nuevo constraint pendiente → el IWP deja de estar libre; si estaba liberado vuelve a PLANIFICADO.
  const { data: iwpRow } = await sb.from('mining_iwp').select('status')
    .eq('project_id', project_id).eq('iwp_id', iwp_id).single();
  await sb.from('mining_iwp').update({
    constraint_cleared: false,
    ...(iwpRow?.status === 'LISTO_PARA_TRABAJO' ? { status: 'PLANIFICADO' } : {}),
    fecha_ultima_actualizacion: new Date().toISOString(),
  }).eq('project_id', project_id).eq('iwp_id', iwp_id);

  return NextResponse.json({ row: data });
}

// PATCH /api/mining-iwp-constraint
// Body: { project_id, constraint_id, cleared?, descripcion?, fecha_necesaria?, nota? }
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, constraint_id, cleared, ...rest } = body ?? {};
  if (!project_id || !constraint_id) return NextResponse.json({ error: 'Missing project_id/constraint_id' }, { status: 400 });

  const fields: Record<string, any> = { ...rest };
  if (typeof cleared === 'boolean') {
    fields.cleared = cleared;
    fields.fecha_cleared = cleared ? new Date().toISOString().slice(0, 10) : null;
    fields.despejado_por = cleared ? (user.email ?? user.id) : null;
  }

  const sb = supabase as any;
  const { data: updated, error } = await sb.from('mining_iwp_constraint').update(fields)
    .eq('project_id', project_id).eq('id', constraint_id).select('iwp_id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sincronizar el semáforo del IWP: constraint_cleared = true solo si no quedan pendientes.
  // Si vuelve a haber pendientes y el IWP estaba liberado, regresa a PLANIFICADO (regla COAA).
  if (typeof cleared === 'boolean' && updated?.iwp_id) {
    const { count } = await sb.from('mining_iwp_constraint')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project_id).eq('iwp_id', updated.iwp_id).eq('cleared', false);
    const libre = (count ?? 0) === 0;
    const iwpFields: Record<string, any> = { constraint_cleared: libre, fecha_ultima_actualizacion: new Date().toISOString() };
    if (!libre) {
      const { data: iwpRow } = await sb.from('mining_iwp').select('status')
        .eq('project_id', project_id).eq('iwp_id', updated.iwp_id).single();
      if (iwpRow?.status === 'LISTO_PARA_TRABAJO') iwpFields.status = 'PLANIFICADO';
    }
    await sb.from('mining_iwp').update(iwpFields)
      .eq('project_id', project_id).eq('iwp_id', updated.iwp_id);
  }

  return NextResponse.json({ ok: true });
}
