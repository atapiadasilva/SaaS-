import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/*
  Required Supabase tables (user must run this SQL):

  CREATE TABLE model_data_versions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL,
    name text NOT NULL,
    file_name text DEFAULT '',
    match_key text NOT NULL,
    columns_imported text[] DEFAULT '{}',
    row_count integer DEFAULT 0,
    matched_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE model_elements (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid NOT NULL,
    element_id text NOT NULL,
    raw_versions jsonb DEFAULT '{}',
    updated_at timestamptz DEFAULT now(),
    UNIQUE(project_id, element_id)
  );
*/

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const [vRes, eRes] = await Promise.all([
    (supabase as any).from('model_data_versions').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
    (supabase as any).from('model_elements').select('element_id, raw_versions, updated_at').eq('project_id', projectId),
  ]);

  return NextResponse.json({ versions: vRes.data ?? [], elements: eRes.data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, version_name, file_name, match_key, columns, rows } = await req.json();
  if (!project_id || !version_name || !match_key || !rows?.length) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 });
  }

  const { data: version, error: vErr } = await (supabase as any)
    .from('model_data_versions')
    .insert({ project_id, name: version_name, file_name: file_name ?? '', match_key, columns_imported: columns, row_count: rows.length })
    .select('id').single();

  if (vErr || !version) return NextResponse.json({ error: vErr?.message ?? 'Failed to create version' }, { status: 500 });

  const versionId = version.id;

  const { data: existing } = await (supabase as any)
    .from('model_elements')
    .select('element_id, raw_versions')
    .eq('project_id', project_id);

  const existingMap = new Map<string, Record<string, Record<string, string>>>(
    (existing ?? []).map((e: any) => [e.element_id, e.raw_versions ?? {}])
  );

  const upsertRows: any[] = [];
  let matchedCount = 0;

  for (const row of rows) {
    const elementId = String(row[match_key] ?? '').trim();
    if (!elementId) continue;

    const vProps: Record<string, string> = {};
    for (const col of columns) {
      if (col !== match_key) {
        const val = row[col];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          vProps[col] = String(val).trim();
        }
      }
    }

    const existingVersions = existingMap.get(elementId) ?? {};
    const newVersions = { ...existingVersions, [versionId]: vProps };

    if (existingMap.has(elementId)) matchedCount++;

    upsertRows.push({
      project_id,
      element_id: elementId,
      raw_versions: newVersions,
      updated_at: new Date().toISOString(),
    });
  }

  if (upsertRows.length > 0) {
    const { error: uErr } = await (supabase as any)
      .from('model_elements')
      .upsert(upsertRows, { onConflict: 'project_id,element_id' });
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  await (supabase as any)
    .from('model_data_versions')
    .update({ matched_count: matchedCount, row_count: upsertRows.length })
    .eq('id', versionId);

  return NextResponse.json({ success: true, version_id: versionId, count: upsertRows.length, matched: matchedCount });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, element_ids, property_key, property_value } = await req.json();
  if (!project_id || !element_ids?.length || !property_key) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 });
  }

  const { data: existing } = await (supabase as any)
    .from('model_elements')
    .select('element_id, raw_versions')
    .eq('project_id', project_id)
    .in('element_id', element_ids);

  const existingMap = new Map<string, Record<string, Record<string, string>>>(
    (existing ?? []).map((e: any) => [e.element_id, e.raw_versions ?? {}])
  );

  const upsertRows = element_ids.map((elementId: string) => {
    const existingVersions = existingMap.get(elementId) ?? {};
    const manual = existingVersions.manual ?? {};
    manual[property_key] = property_value ?? '';
    return {
      project_id,
      element_id: elementId,
      raw_versions: { ...existingVersions, manual },
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await (supabase as any)
    .from('model_elements')
    .upsert(upsertRows, { onConflict: 'project_id,element_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
