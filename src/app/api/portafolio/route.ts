import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FUENTES, nivelMadurez, coberturaLlave, faltantesEsenciales, type ConteoFuente } from '@/lib/fuentes-datos';
import { resolverModulos } from '@/lib/modules';

// Estado de la cartera: para cada proyecto de la organización, qué fuentes de datos tiene
// cargadas, cuántas filas traen la llave CWP y qué nivel de madurez alcanza.
// GET ?org_id=...  → { proyectos: [...] }
//
// Usa el cliente del usuario: RLS decide qué proyectos ve.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get('org_id');
  if (!orgId) return NextResponse.json({ error: 'Missing org_id' }, { status: 400 });
  const sb = supabase as any;

  const { data: proyectos, error } = await sb
    .from('projects')
    .select('id, name, stage, active_modules, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Un count por fuente y, si la fuente transporta la llave, otro count filtrando por
  // llave no nula. Son counts con head:true (no traen filas), así que el costo es bajo.
  const filas = await Promise.all((proyectos ?? []).map(async (p: any) => {
    const conteos: Record<string, ConteoFuente> = {};
    await Promise.all(FUENTES.map(async f => {
      const { count } = await sb.from(f.tabla).select('*', { count: 'exact', head: true }).eq('project_id', p.id);
      const total = count ?? 0;
      let conLlave: number | null = null;
      if (f.campoCwp && total) {
        const { count: c2 } = await sb.from(f.tabla)
          .select('*', { count: 'exact', head: true })
          .eq('project_id', p.id).not(f.campoCwp, 'is', null);
        conLlave = c2 ?? 0;
      } else if (f.campoCwp) {
        conLlave = 0;
      }
      conteos[f.key] = { total, conLlave };
    }));

    return {
      id: p.id,
      name: p.name,
      stage: p.stage,
      modulos: resolverModulos(p.active_modules),
      conteos,
      nivel: nivelMadurez(conteos),
      cobertura: coberturaLlave(conteos),
      faltantes: faltantesEsenciales(conteos),
    };
  }));

  return NextResponse.json({ proyectos: filas });
}
