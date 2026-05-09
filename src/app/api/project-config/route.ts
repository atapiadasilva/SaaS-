import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PATCH /api/project-config  { project_id, key, value }
// Merges value into projects.module_config[key] using service-role (bypasses RLS)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, key, value } = await req.json();
  if (!project_id || !key) return NextResponse.json({ error: 'Missing project_id or key' }, { status: 400 });

  // Atomic merge — no read-modify-write race condition
  const { error: rpcErr } = await (supabase as any).rpc('merge_module_config', {
    p_project_id: project_id,
    p_key: key,
    p_value: value === undefined ? null : value,
  });

  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
