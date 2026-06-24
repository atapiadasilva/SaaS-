import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Nivel = 'cwa' | 'cv' | 'cwp' | 'swp';
const COL: Record<Nivel, string> = { cwa: 'cwa_id', cv: 'cv_id', cwp: 'cwp_id', swp: 'swp_id' };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// POST /api/mining-elementos/cobertura
// Body: { project_id, nivel, monikers: string[] }
// Cuenta cuántos de esos monikers ya tienen el nivel (CWA/CV/CWP/SWP) asignado en mining_elementos —
// usado por el panel "Árbol del modelo" para mostrar el % de cobertura de cada rama nativa del modelo
// (cuántos de sus elementos ya están clasificados en el nivel actualmente activo).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const projectId = body?.project_id as string | undefined;
  const nivel = body?.nivel as Nivel | undefined;
  const monikers = Array.isArray(body?.monikers) ? (body.monikers as string[]) : [];
  if (!projectId || !nivel || !COL[nivel]) {
    return NextResponse.json({ error: 'Missing/invalid project_id or nivel' }, { status: 400 });
  }
  if (!monikers.length) return NextResponse.json({ vinculados: 0 });

  const col = COL[nivel];
  const sb = supabase as any;
  const batches = chunk([...new Set(monikers)], 300);

  try {
    const counts = await Promise.all(batches.map(async (b) => {
      const { count, error } = await sb
        .from('mining_elementos')
        .select('sp3d_moniker', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('sp3d_moniker', b)
        .not(col, 'is', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    }));
    const vinculados = counts.reduce((a, b) => a + b, 0);
    return NextResponse.json({ vinculados });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
