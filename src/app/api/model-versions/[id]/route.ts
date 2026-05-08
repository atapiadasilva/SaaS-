import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { error } = await (supabase as any)
    .from('model_data_versions')
    .update({ is_active: body.is_active })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: version } = await (supabase as any)
    .from('model_data_versions')
    .select('project_id')
    .eq('id', id)
    .single();

  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  const { data: elements } = await (supabase as any)
    .from('model_elements')
    .select('element_id, raw_versions')
    .eq('project_id', version.project_id);

  if (elements && elements.length > 0) {
    const updates = elements
      .filter((e: any) => e.raw_versions && id in e.raw_versions)
      .map((e: any) => {
        const { [id]: _removed, ...rest } = e.raw_versions;
        return {
          project_id: version.project_id,
          element_id: e.element_id,
          raw_versions: rest,
          updated_at: new Date().toISOString(),
        };
      });

    if (updates.length > 0) {
      await (supabase as any)
        .from('model_elements')
        .upsert(updates, { onConflict: 'project_id,element_id' });
    }
  }

  await (supabase as any).from('model_data_versions').delete().eq('id', id);

  return NextResponse.json({ success: true });
}
