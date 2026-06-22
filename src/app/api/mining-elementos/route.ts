import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const PAGE_SIZE_DEFAULT = 100;
const PAGE_SIZE_MAX = 500;

// Deriva CWA/CV a partir del CWP usando la convención de codificación del diccionario AWP:
// CWP_ID = {CV}.{DISC}{NNN} (ej. 312101.C001) → CV = "312101" → CWA = CV[:4] = "3121"
// Si el CWP no calza con el patrón (ej. placeholders "SIN-CWP.*"), no se puede derivar → null.
function deriveCwaCv(cwpId: string): { cwa_id: string | null; cv_id: string | null } {
  const m = cwpId.match(/^(\d{6})\.[A-Za-z]+\d+/);
  if (!m) return { cwa_id: null, cv_id: null };
  const cv = m[1];
  return { cwa_id: cv.slice(0, 4), cv_id: cv };
}

type Nivel = 'cwa' | 'cv' | 'cwp';

// 'SIN-CWA'/'SIN-CV' son pseudo-códigos de UI para los elementos sin clasificar (cwa_id/cv_id en
// NULL en la BD) — si se "reasignan" hacia allá, el valor real a guardar es NULL, no el string literal.
function fieldsForNivel(nivel: Nivel, trimmed: string): Record<string, string | null> {
  if (trimmed === 'SIN-CWA' || trimmed === 'SIN-CV') return { cwa_id: null, cv_id: null, cwp_id: null };
  if (nivel === 'cwp') return { cwp_id: trimmed, ...deriveCwaCv(trimmed) };
  if (nivel === 'cv') return { cv_id: trimmed, cwa_id: trimmed.slice(0, 4), cwp_id: null };
  return { cwa_id: trimmed, cv_id: null, cwp_id: null }; // 'cwa'
}

// Filtros de igualdad simple param/match-key → columna real. Mantener en sync con FILTER_FIELDS
// del frontend (mineria/elementos/page.tsx) y con las columnas que cubre mining_elementos_filtros().
const SIMPLE_EQ_FIELDS: Record<string, string> = {
  disciplina: 'disciplina', sector: 'sector', especialidad: 'especialidad_cod', categoria: 'categoria_constructiva',
  sitio: 'sitio', areaUnidad: 'area_unidad', sistema: 'sistema_servicio', obraTipo: 'obra_tipo',
  alcance: 'alcance', estado: 'estado', itemOAdicional: 'item_o_adicional',
  validado: 'validado', motivoNoValido: 'motivo_no_valido', disciplinaModelo: 'disciplina_modelo',
  disciplinaArbol: 'disciplina_arbol', obraTarget: 'obra_target', cwpFuente: 'cwp_fuente',
  vinculoNivel: 'vinculo_nivel', categoriaEnlace: 'categoria_enlace', codigoBmp: 'codigo_bmp',
};

function applyMatchFilter(query: any, monikers: string[] | undefined, match: any) {
  if (Array.isArray(monikers) && monikers.length) return query.in('sp3d_moniker', monikers);
  if (!match) return query;
  if (match.cwp === '__empty__' || match.cwp === null) query = query.or('cwp_id.is.null,cwp_id.eq.');
  else if (match.cwp) query = query.eq('cwp_id', match.cwp);
  for (const [key, col] of Object.entries(SIMPLE_EQ_FIELDS)) {
    if (match[key]) query = query.eq(col, match[key]);
  }
  if (match.search) {
    const s = String(match.search).replace(/[%,]/g, '');
    query = query.or(`sp3d_moniker.ilike.%${s}%,name.ilike.%${s}%,descripcion.ilike.%${s}%,tipo_elemento.ilike.%${s}%`);
  }
  return query;
}

function applyFilters(query: any, params: URLSearchParams) {
  const monikers = params.get('monikers');
  if (monikers) {
    return query.in('sp3d_moniker', monikers.split(',').map(m => m.trim()).filter(Boolean));
  }

  const cwp = params.get('cwp');
  if (cwp === '__empty__') query = query.or('cwp_id.is.null,cwp_id.eq.');
  else if (cwp) query = query.eq('cwp_id', cwp);

  for (const [key, col] of Object.entries(SIMPLE_EQ_FIELDS)) {
    const v = params.get(key);
    if (v) query = query.eq(col, v);
  }

  const search = params.get('search')?.trim();
  if (search) {
    const s = search.replace(/[%,]/g, '');
    query = query.or(`sp3d_moniker.ilike.%${s}%,name.ilike.%${s}%,descripcion.ilike.%${s}%,tipo_elemento.ilike.%${s}%`);
  }
  return query;
}

// GET /api/mining-elementos?project_id=&page=&pageSize=&cwp=&disciplina=&sector=&search=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const page = Math.max(0, Number(params.get('page') ?? 0));
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(params.get('pageSize') ?? PAGE_SIZE_DEFAULT)));
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const sb = supabase as any;
  let query = sb.from('mining_elementos').select('*', { count: 'exact' }).eq('project_id', projectId);
  query = applyFilters(query, params);
  query = query.order('sp3d_moniker').range(from, to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], total: count ?? 0, page, pageSize });
}

// PATCH /api/mining-elementos
// Body: { project_id, nivel?: 'cwa'|'cv'|'cwp' (default 'cwp'), newCwpId|newValue, origen?: string,
//         monikers?: string[], match?: { cwp?, disciplina?, sector?, search?, ... } }
// Si vienen `monikers`, reasigna esos elementos puntuales. Si viene `match`, reasigna TODOS los elementos que cumplen ese filtro (bulk).
// nivel='cwp' deriva CWA/CV desde el patrón del código. nivel='cv'/'cwa' limpia los niveles más finos (quedan pendientes
// de refinar en el paso de revisión correspondiente) y registra cada cambio en mining_cambios_log para trazabilidad/exportación.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, monikers, match, origen } = body ?? {};
  const nivel: Nivel = ['cwa', 'cv', 'cwp'].includes(body?.nivel) ? body.nivel : 'cwp';
  const newValueRaw = body?.newValue ?? body?.newCwpId;
  if (!project_id) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  if (typeof newValueRaw !== 'string' || !newValueRaw.trim()) return NextResponse.json({ error: 'Missing newValue/newCwpId' }, { status: 400 });
  if (!(Array.isArray(monikers) && monikers.length) && !match) {
    return NextResponse.json({ error: 'Provide monikers[] or match{}' }, { status: 400 });
  }

  const sb = supabase as any;
  const trimmed = newValueRaw.trim();
  const fields = fieldsForNivel(nivel, trimmed);

  let beforeQuery = sb.from('mining_elementos').select('sp3d_moniker, cwa_id, cv_id, cwp_id').eq('project_id', project_id);
  beforeQuery = applyMatchFilter(beforeQuery, monikers, match);
  const { data: before, error: beforeErr } = await beforeQuery;
  if (beforeErr) return NextResponse.json({ error: beforeErr.message }, { status: 500 });
  if (!before?.length) return NextResponse.json({ updated: 0 });

  let updateQuery = sb.from('mining_elementos').update(fields).eq('project_id', project_id);
  updateQuery = applyMatchFilter(updateQuery, monikers, match);
  const { data: updated, error } = await updateQuery.select('sp3d_moniker');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const campos = (['cwa_id', 'cv_id', 'cwp_id'] as const).filter(c => c in fields);
  const logRows = before.flatMap((row: any) => campos
    .filter(campo => row[campo] !== fields[campo])
    .map(campo => ({
      project_id, sp3d_moniker: row.sp3d_moniker, campo,
      valor_anterior: row[campo], valor_nuevo: fields[campo],
      origen: origen ?? `revision_${nivel}`, usuario_id: user.id,
    })));
  if (logRows.length) {
    const { error: logErr } = await sb.from('mining_cambios_log').insert(logRows);
    if (logErr) console.error('[mining-elementos] error guardando log de cambios:', logErr.message);
  }

  return NextResponse.json({ updated: updated?.length ?? 0 });
}
