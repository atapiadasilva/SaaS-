import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/program/versions?project_id=xxx
// Returns distinct program_source values with activity counts
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const { data, error } = await (supabase as any)
    .from('program_activities')
    .select('program_source')
    .eq('project_id', projectId)
    .not('program_source', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const countMap = new Map<string, number>();
  for (const row of (data ?? [])) {
    const src = row.program_source as string;
    if (src) countMap.set(src, (countMap.get(src) ?? 0) + 1);
  }

  const versions = [...countMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(versions);
}
