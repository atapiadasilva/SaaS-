import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/mining-sistemas?project_id=
// Resumen Sistema → Subsistema (PRECOMWP oficial) con conteos de líneas/equipos/elementos del
// modelo, vía la RPC mining_swp_resumen (agrega mining_swp + mining_awp_linea + mining_awp_equipo
// + mining_elementos en una sola consulta server-side).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;
  const { data: rows, error } = await sb.rpc('mining_swp_resumen', { p_project_id: projectId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sistemasMap = new Map<string, { sistema: string; nombre_sistema: string | null; subsistemas: any[] }>();
  for (const r of rows ?? []) {
    if (!sistemasMap.has(r.sistema)) sistemasMap.set(r.sistema, { sistema: r.sistema, nombre_sistema: r.nombre_sistema, subsistemas: [] });
    sistemasMap.get(r.sistema)!.subsistemas.push({
      swp_id: r.swp_id, nombre_swp: r.nombre_swp,
      n_lineas: Number(r.n_lineas), n_equipos: Number(r.n_equipos),
      n_elementos_modelo: Number(r.n_elementos_modelo), pids: r.pids ?? [],
    });
  }
  const sistemas = [...sistemasMap.values()].sort((a, b) => a.sistema.localeCompare(b.sistema));

  return NextResponse.json({ sistemas });
}
