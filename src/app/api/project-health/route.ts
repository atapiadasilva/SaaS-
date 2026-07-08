import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Vista a → entidades requeridas para que funcione
const VIEW_DEPENDENCIES: Record<string, { requires: string[]; optional: string[] }> = {
  'vista_3d':        { requires: ['elementos'],                    optional: ['cwp', 'planos'] },
  'vista_cwp':       { requires: ['elementos', 'cwp'],             optional: ['partidas', 'planos', 'programa'] },
  'itemizado':       { requires: ['partidas'],                      optional: ['elementos', 'cwp'] },
  'planos':          { requires: ['planos'],                        optional: ['cwp'] },
  'gantt':           { requires: ['programa'],                      optional: ['cwp'] },
  'iwp':             { requires: ['cwp', 'programa'],              optional: ['elementos', 'partidas'] },
  'revision_cwa':    { requires: ['elementos', 'cwp'],             optional: [] },
  'sistemas_swp':    { requires: ['elementos'],                     optional: ['cwp'] },
  'kpi_dashboard':   { requires: ['elementos', 'cwp'],             optional: ['partidas', 'programa'] },
};

type EntityKey = 'elementos' | 'cwp' | 'partidas' | 'planos' | 'programa' | 'iwp';

interface EntityHealth {
  loaded: boolean;
  total: number;
  pct_cwp?: number;
  pct_guid?: number;
  pct_disciplina?: number;
}

// GET /api/project-health?project_id=
// Devuelve cobertura de datos por entidad y qué vistas ya funcionan
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;

  // Llamar a la función RPC de salud si existe, si no calculamos manualmente
  const { data: rpcData, error: rpcErr } = await sb.rpc('project_data_health', { p_project_id: projectId });

  let entities: Record<EntityKey, EntityHealth>;

  if (rpcErr || !rpcData) {
    // Fallback: contar manualmente en paralelo
    const [elRes, cwpRes, partRes, planoRes, progRes, iwpRes] = await Promise.all([
      sb.from('mining_elementos').select('sp3d_moniker', { count: 'exact', head: true }).eq('project_id', projectId),
      sb.from('mining_cwp').select('cwp_id', { count: 'exact', head: true }).eq('project_id', projectId),
      sb.from('mining_partidas').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      sb.from('mining_planos').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      sb.from('mining_programa').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      sb.from('mining_iwp').select('iwp_id', { count: 'exact', head: true }).eq('project_id', projectId),
    ]);

    entities = {
      elementos: { loaded: (elRes.count ?? 0) > 0, total: elRes.count ?? 0 },
      cwp:       { loaded: (cwpRes.count ?? 0) > 0, total: cwpRes.count ?? 0 },
      partidas:  { loaded: (partRes.count ?? 0) > 0, total: partRes.count ?? 0 },
      planos:    { loaded: (planoRes.count ?? 0) > 0, total: planoRes.count ?? 0 },
      programa:  { loaded: (progRes.count ?? 0) > 0, total: progRes.count ?? 0 },
      iwp:       { loaded: (iwpRes.count ?? 0) > 0, total: iwpRes.count ?? 0 },
    };
  } else {
    const d = rpcData;
    entities = {
      elementos: {
        loaded:          (d.elementos?.total ?? 0) > 0,
        total:           d.elementos?.total ?? 0,
        pct_cwp:         d.elementos?.pct_cwp ?? 0,
        pct_guid:        d.elementos?.pct_guid ?? 0,
        pct_disciplina:  d.elementos?.pct_disciplina ?? 0,
      },
      cwp:      { loaded: (d.cwp?.total ?? 0) > 0,      total: d.cwp?.total ?? 0 },
      partidas: { loaded: (d.partidas?.total ?? 0) > 0,  total: d.partidas?.total ?? 0 },
      planos:   { loaded: (d.planos?.total ?? 0) > 0,    total: d.planos?.total ?? 0 },
      programa: { loaded: (d.programa?.total ?? 0) > 0,  total: d.programa?.total ?? 0 },
      iwp:      { loaded: (d.iwp?.total ?? 0) > 0,       total: d.iwp?.total ?? 0 },
    };
  }

  // Evaluar qué vistas están listas, cuáles parcialmente y cuáles bloqueadas
  const views = Object.entries(VIEW_DEPENDENCIES).map(([vista, deps]) => {
    const missingRequired = deps.requires.filter(e => !entities[e as EntityKey]?.loaded);
    const missingOptional = deps.optional.filter(e => !entities[e as EntityKey]?.loaded);
    const status =
      missingRequired.length === 0 ? 'ready'
      : missingRequired.length < deps.requires.length ? 'partial'
      : 'blocked';
    return { vista, status, missingRequired, missingOptional };
  });

  // Obtener columna_mapping configurada para el proyecto
  const { data: proj } = await sb
    .from('projects')
    .select('module_config, external_code')
    .eq('id', projectId)
    .single();

  const columnMapping = proj?.module_config?.column_mapping ?? null;
  const externalCode = proj?.external_code ?? null;

  return NextResponse.json({ entities, views, columnMapping, externalCode });
}
