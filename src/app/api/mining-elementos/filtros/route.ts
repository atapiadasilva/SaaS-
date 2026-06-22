import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/mining-elementos/filtros?project_id=...
// Valores distintos + conteo por columna filtrable, calculado en vivo (no es un catálogo estático).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;
  const { data, error } = await sb.rpc('mining_elementos_filtros', { p_project_id: projectId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const grouped: Record<string, { valor: string; n: number }[]> = {};
  for (const row of data ?? []) {
    (grouped[row.columna] ??= []).push({ valor: row.valor, n: Number(row.n) });
  }
  return NextResponse.json({ filtros: grouped });
}
