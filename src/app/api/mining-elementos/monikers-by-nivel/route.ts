import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Nivel = 'cwa' | 'cv' | 'cwp' | 'swp';
const COL: Record<Nivel, string> = { cwa: 'cwa_id', cv: 'cv_id', cwp: 'cwp_id', swp: 'swp_id' };
// Pseudo-código para los elementos sin clasificar oficialmente (cwa_id/cv_id/swp_id en NULL en la
// BD) — no existe como valor real de columna, así que se resuelve aparte con IS NULL.
const SENTINEL: Record<Nivel, string | null> = { cwa: 'SIN-CWA', cv: 'SIN-CV', cwp: null, swp: 'SIN-SWP' };
const PAGE = 1000; // tope real de filas por respuesta de PostgREST — pedir más no sirve, hay que paginar

// Pide la 1ra página con count exacto, y dispara TODAS las páginas restantes en PARALELO
// (en vez de una a una) — para 50k+ filas esto reduce la espera de ~10s secuenciales a ~1 round-trip.
// Solo la 1ra página pide count: 'exact' (se necesita una sola vez, para saber cuántas páginas
// faltan) — pedirlo en cada página disparaba ~56 conteos exactos redundantes EN PARALELO sobre
// la misma tabla (uno por página), saturando el pool de conexiones y siendo la causa real de los
// ~4-5s que tardaba este endpoint en modelos de 50k+ elementos.
async function fetchAllPaged(build: (from: number, to: number, withCount: boolean) => PromiseLike<{ data: any[] | null; error: any; count: number | null }>) {
  const first = await build(0, PAGE - 1, true);
  if (first.error) throw new Error(first.error.message);
  const rows: any[] = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  if (rows.length < PAGE || total <= PAGE) return rows;
  const remainingPages = Math.ceil((total - PAGE) / PAGE);
  const pages = await Promise.all(
    Array.from({ length: remainingPages }, (_, i) => { const from = (i + 1) * PAGE; return build(from, from + PAGE - 1, false); })
  );
  for (const p of pages) {
    if (p.error) throw new Error(p.error.message);
    rows.push(...(p.data ?? []));
  }
  return rows;
}

// GET /api/mining-elementos/monikers-by-nivel?project_id=&nivel=cwa|cv|cwp
// Agrupa sp3d_moniker por valor de CWA/CV/CWP — usado para colorear/aislar el modelo en el visor
// resolviendo por SP3d Moniker (no por una propiedad nativa CWA/CV que puede no existir en todo el modelo).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const nivel = params.get('nivel') as Nivel | null;
  if (!projectId || !nivel || !COL[nivel]) {
    return NextResponse.json({ error: 'Missing/invalid project_id or nivel' }, { status: 400 });
  }
  const col = COL[nivel];
  const sentinel = SENTINEL[nivel];
  const soloCodigosRaw = params.get('codigos')?.split(',').map(c => c.trim()).filter(Boolean); // opcional: limita el resultado
  const wantsSentinel = !!sentinel && (!soloCodigosRaw || soloCodigosRaw.includes(sentinel));
  const realCodigos = soloCodigosRaw?.filter(c => c !== sentinel);

  const sb = supabase as any;
  const groups: Record<string, string[]> = {};

  try {
    if (!soloCodigosRaw || realCodigos?.length !== 0) {
      const rows = await fetchAllPaged((from, to, withCount) => {
        let q = sb.from('mining_elementos').select(`sp3d_moniker, ${col}`, withCount ? { count: 'exact' } : undefined).eq('project_id', projectId).not(col, 'is', null).range(from, to);
        if (realCodigos) q = q.in(col, realCodigos);
        return q;
      });
      for (const row of rows) {
        const key = row[col];
        if (!key) continue;
        (groups[key] ??= []).push(row.sp3d_moniker);
      }
    }

    if (wantsSentinel && sentinel) {
      const rows = await fetchAllPaged((from, to, withCount) =>
        sb.from('mining_elementos').select('sp3d_moniker', withCount ? { count: 'exact' } : undefined).eq('project_id', projectId).is(col, null).range(from, to)
      );
      for (const row of rows) (groups[sentinel] ??= []).push(row.sp3d_moniker);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  return NextResponse.json({ groups });
}
