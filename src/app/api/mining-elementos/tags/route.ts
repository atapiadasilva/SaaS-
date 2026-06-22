import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TAGS_LIMIT = 20000;

// GET /api/mining-elementos/tags?project_id=&cwp=
// Lista de tags (tag_unificado) de los elementos del modelo que pertenecen a un CWP.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const cwp = params.get('cwp');
  if (!projectId || !cwp) return NextResponse.json({ error: 'Missing project_id or cwp' }, { status: 400 });

  const sb = supabase as any;
  const tags: string[] = [];
  let total = 0;
  let from = 0;
  for (;;) {
    const { data, error, count } = await sb
      .from('mining_elementos')
      .select('tag_unificado', { count: 'exact' })
      .eq('project_id', projectId)
      .eq('cwp_id', cwp)
      .not('tag_unificado', 'is', null)
      .order('tag_unificado')
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    total = count ?? total;
    for (const r of data ?? []) if (r.tag_unificado) tags.push(r.tag_unificado);
    // PostgREST limita las filas por respuesta (ej. 1000) aunque se pida un rango mayor —
    // por eso avanzamos según lo recibido, no según un tamaño de página asumido.
    if (!data || data.length === 0 || tags.length >= TAGS_LIMIT) break;
    from += data.length;
  }

  return NextResponse.json({ tags, total, truncated: total > tags.length });
}
