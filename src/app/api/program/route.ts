import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/program?project_id=xxx[&source=yyy]
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const projectId = params.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const source = params.get('source');

  let query = (supabase as any)
    .from('program_activities')
    .select('id,wbs_code,cwp_code,ewp_code,pwp_code,description,discipline,hh,start_date,end_date,progress,is_summary,is_milestone,is_critical,float_days,program_source,parent_wbs,sort_order')
    .eq('project_id', projectId);

  if (source) query = query.eq('program_source', source);

  const { data, error } = await query.order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/program
// Body: { project_id, activities, source_name?, replace_source? }
//   source_name:    tag for these activities (defaults to activities[0].program_source)
//   replace_source: source name to delete after successful insert (atomic replace)
//                   pass '*' to delete ALL existing activities for the project
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, activities, replace_source, source_name } = await req.json();
  if (!project_id || !activities?.length)
    return NextResponse.json({ error: 'Missing data' }, { status: 400 });

  const effectiveSource = source_name ?? (activities[0]?.program_source as string | undefined) ?? null;

  // Step 1: read IDs to delete BEFORE inserting (so we know exactly which rows to remove)
  let oldIds: string[] = [];
  if (replace_source) {
    let q = (supabase as any)
      .from('program_activities')
      .select('id')
      .eq('project_id', project_id);
    if (replace_source !== '*') q = q.eq('program_source', replace_source);
    const { data: old } = await q;
    oldIds = (old ?? []).map((r: any) => r.id as string);
  }

  const rows = activities.map(({ id, ...a }: any, i: number) => ({
    ...a,
    project_id,
    sort_order: i,
    program_source: effectiveSource,
    progress: Math.min(100, Math.max(0, isFinite(a.progress) ? a.progress : 0)),
    hh: isFinite(a.hh) && a.hh >= 0 ? a.hh : 0,
  }));

  // Step 2: INSERT — if this fails, old rows are untouched
  const { error: insertErr } = await (supabase as any).from('program_activities').insert(rows);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Step 3: DELETE old rows only after successful INSERT
  if (oldIds.length > 0) {
    // Delete in chunks of 500 to avoid query size limits
    for (let i = 0; i < oldIds.length; i += 500) {
      await (supabase as any)
        .from('program_activities')
        .delete()
        .in('id', oldIds.slice(i, i + 500));
    }
  }

  return NextResponse.json({ success: true, count: rows.length });
}
