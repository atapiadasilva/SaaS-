import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/program?project_id=xxx
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const { data, error } = await (supabase as any)
    .from('program_activities')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/program — upsert batch
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, activities, replace } = await req.json();
  if (!project_id || !activities?.length)
    return NextResponse.json({ error: 'Missing data' }, { status: 400 });

  if (replace) {
    await (supabase as any).from('program_activities').delete().eq('project_id', project_id);
  }

  const rows = activities.map(({ id, ...a }: any, i: number) => ({ ...a, project_id, sort_order: i }));
  const { error } = await (supabase as any).from('program_activities').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, count: rows.length });
}
