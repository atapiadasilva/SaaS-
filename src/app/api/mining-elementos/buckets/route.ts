import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/mining-elementos/buckets?project_id=...
// Agrupa todos los elementos por su CWP actual (incluye "sin CWP" y huérfanos no catalogados).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;
  const { data, error } = await sb.rpc('mining_elementos_buckets', { p_project_id: projectId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const buckets = (data ?? []).map((b: any) => ({ cwpId: b.cwp_id as string | null, n: Number(b.n), enCatalogo: !!b.en_catalogo }));
  return NextResponse.json({ buckets });
}
