import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/program-links?project_id=xxx
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const { data, error } = await (supabase as any)
    .from('program_bim_links')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/program-links — create or update link
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, activity_id, set_name, external_ids, color } = body;

  if (!project_id || !activity_id || !set_name || !external_ids?.length)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

  const { data, error } = await (supabase as any).from('program_bim_links').insert({
    project_id,
    activity_id,
    set_name: set_name.trim(),
    external_ids,
    color: color || '#3B82F6',
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT /api/program-links — update existing link
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, set_name, external_ids, color, activity_id } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const update: any = {};
  if (set_name) update.set_name = set_name.trim();
  if (external_ids) update.external_ids = external_ids;
  if (color) update.color = color;
  if (activity_id) update.activity_id = activity_id;

  const { data, error } = await (supabase as any)
    .from('program_bim_links').update(update).eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/program-links?id=xxx
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await (supabase as any).from('program_bim_links').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
