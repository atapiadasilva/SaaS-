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

  // Read current config
  const { data: proj, error: readErr } = await (supabase as any)
    .from('projects')
    .select('module_config, organization_id')
    .eq('id', project_id)
    .single();

  if (readErr || !proj) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Build next config
  const existing = (proj.module_config as Record<string, unknown>) ?? {};
  const next = value === null
    ? Object.fromEntries(Object.entries(existing).filter(([k]) => k !== key))
    : { ...existing, [key]: value };

  const { error: updateErr } = await (supabase as any)
    .from('projects')
    .update({ module_config: next })
    .eq('id', project_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
