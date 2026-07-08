import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/mining-iwp-elemento?project_id=&iwp_id=   → lista de elementos del IWP
// GET /api/mining-iwp-elemento?project_id=&cwp_id=   → conteo por IWP del CWP (para badges)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const iwpId = params.get('iwp_id');
  if (!projectId || !iwpId) return NextResponse.json({ error: 'Missing project_id/iwp_id' }, { status: 400 });

  const sb = supabase as any;
  const { data, error } = await sb.from('mining_iwp_elemento').select('id, moniker, nombre, fecha_asignacion')
    .eq('project_id', projectId).eq('iwp_id', iwpId).order('moniker');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

// POST /api/mining-iwp-elemento
// Body: { project_id, iwp_id, monikers: string[] } → asigna la selección del modelo al IWP (upsert)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, iwp_id, monikers } = body ?? {};
  if (!project_id || !iwp_id) return NextResponse.json({ error: 'Missing project_id/iwp_id' }, { status: 400 });
  if (!Array.isArray(monikers) || !monikers.length) return NextResponse.json({ error: 'Sin elementos seleccionados en el modelo' }, { status: 400 });

  const sb = supabase as any;
  const rows = [...new Set(monikers as string[])].map(m => ({
    project_id, iwp_id, moniker: m, asignado_por: user.email ?? user.id,
  }));
  const { error } = await sb.from('mining_iwp_elemento')
    .upsert(rows, { onConflict: 'project_id,iwp_id,moniker', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, asignados: rows.length });
}

// DELETE /api/mining-iwp-elemento?project_id=&iwp_id=[&moniker=]
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const iwpId = params.get('iwp_id');
  const moniker = params.get('moniker');
  if (!projectId || !iwpId) return NextResponse.json({ error: 'Missing project_id/iwp_id' }, { status: 400 });

  const sb = supabase as any;
  let q = sb.from('mining_iwp_elemento').delete().eq('project_id', projectId).eq('iwp_id', iwpId);
  if (moniker) q = q.eq('moniker', moniker);
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
