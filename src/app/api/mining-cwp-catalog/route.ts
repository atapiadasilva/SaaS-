import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/mining-cwp-catalog?project_id=...
// Catálogo liviano de los CWP oficiales del proyecto, para selects/comboboxes.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;
  const { data, error } = await sb
    .from('mining_cwp')
    .select('cwp_id, cwp_nombre, disciplina_cod, cwa_id, cv_id')
    .eq('project_id', projectId)
    .order('cwp_id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ catalog: data ?? [] });
}
