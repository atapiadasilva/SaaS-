import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Nivel = 'cwa' | 'cv' | 'cwp';
const CATALOG_TABLE: Record<Nivel, string> = { cwa: 'mining_cwa', cv: 'mining_cv', cwp: 'mining_cwp' };
const CATALOG_ID_COL: Record<Nivel, string> = { cwa: 'cwa_id', cv: 'cv_id', cwp: 'cwp_id' };
const CATALOG_NAME_COL: Record<Nivel, string> = { cwa: 'cwa_nombre', cv: 'cv_nombre', cwp: 'cwp_nombre' };
const NULL_COL: Record<Nivel, string | null> = { cwa: 'cwa_id', cv: 'cv_id', cwp: null };
const SIN_CODIGO: Record<Nivel, string | null> = { cwa: 'SIN-CWA', cv: 'SIN-CV', cwp: null };

// GET /api/mining-revision?project_id=&nivel=cwa|cv|cwp
// Checklist de revisión: cada código del nivel (CWA/CV/CWP) con su conteo de elementos en el modelo
// y su estado de revisión (pendiente / revisado / con_problema), persistido en mining_revision_estado.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const nivel = params.get('nivel') as Nivel | null;
  if (!projectId || !nivel || !CATALOG_TABLE[nivel]) {
    return NextResponse.json({ error: 'Missing/invalid project_id or nivel' }, { status: 400 });
  }

  const sb = supabase as any;
  const nullCol = NULL_COL[nivel];
  const [bucketsRes, catalogRes, estadoRes, sinAsignarRes] = await Promise.all([
    sb.rpc('mining_elementos_nivel_buckets', { p_project_id: projectId, p_nivel: nivel }),
    sb.from(CATALOG_TABLE[nivel]).select(`${CATALOG_ID_COL[nivel]}, ${CATALOG_NAME_COL[nivel]}`).eq('project_id', projectId),
    sb.from('mining_revision_estado').select('codigo, estado, notas, revisado_en').eq('project_id', projectId).eq('nivel', nivel),
    nullCol
      ? sb.from('mining_elementos').select('sp3d_moniker', { count: 'exact', head: true }).eq('project_id', projectId).is(nullCol, null)
      : Promise.resolve({ data: null, error: null, count: 0 }),
  ]);

  const firstError = [bucketsRes, catalogRes, estadoRes, sinAsignarRes].find(r => r.error);
  if (firstError) return NextResponse.json({ error: firstError.error.message }, { status: 500 });

  const nombrePorCodigo = new Map<string, string>();
  for (const row of catalogRes.data ?? []) nombrePorCodigo.set(row[CATALOG_ID_COL[nivel]], row[CATALOG_NAME_COL[nivel]]);

  const estadoPorCodigo = new Map<string, { estado: string; notas: string | null; revisado_en: string | null }>();
  for (const row of estadoRes.data ?? []) estadoPorCodigo.set(row.codigo, row);

  const codigosVistos = new Set<string>();
  const items = (bucketsRes.data ?? []).map((b: any) => {
    codigosVistos.add(b.codigo);
    const est = estadoPorCodigo.get(b.codigo);
    return {
      codigo: b.codigo,
      nombre: nombrePorCodigo.get(b.codigo) ?? null,
      nElementos: Number(b.n),
      enCatalogo: nombrePorCodigo.has(b.codigo),
      estado: est?.estado ?? 'pendiente',
      notas: est?.notas ?? null,
      revisadoEn: est?.revisado_en ?? null,
    };
  });

  // Códigos del catálogo que hoy no tienen ningún elemento en el modelo (igual deben aparecer en el checklist)
  for (const [codigo, nombre] of nombrePorCodigo) {
    if (codigosVistos.has(codigo)) continue;
    const est = estadoPorCodigo.get(codigo);
    items.push({
      codigo, nombre, nElementos: 0, enCatalogo: true,
      estado: est?.estado ?? 'pendiente', notas: est?.notas ?? null, revisadoEn: est?.revisado_en ?? null,
    });
  }

  // CWA/CV: los elementos sin clasificar oficialmente (buckets SIN-CWP.* del nivel CWP) quedan con
  // cwa_id/cv_id en NULL — sin este pseudo-código no aparecerían nunca en el checklist de estos niveles.
  const sinCodigo = SIN_CODIGO[nivel];
  const sinCount = sinAsignarRes.count ?? 0;
  if (sinCodigo && sinCount > 0) {
    const est = estadoPorCodigo.get(sinCodigo);
    items.push({
      codigo: sinCodigo, nombre: `Sin ${nivel.toUpperCase()} asignado (revisar / clasificar)`, nElementos: sinCount, enCatalogo: false,
      estado: est?.estado ?? 'pendiente', notas: est?.notas ?? null, revisadoEn: est?.revisado_en ?? null,
    });
  }

  items.sort((a: { codigo: string }, b: { codigo: string }) => a.codigo.localeCompare(b.codigo));
  return NextResponse.json({ items });
}

// PATCH /api/mining-revision
// Body: { project_id, nivel, codigo, estado, notas? }
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, nivel, codigo, estado, notas } = body ?? {};
  if (!project_id || !nivel || !codigo || !estado) {
    return NextResponse.json({ error: 'Missing project_id, nivel, codigo or estado' }, { status: 400 });
  }
  if (!['pendiente', 'revisado', 'con_problema'].includes(estado)) {
    return NextResponse.json({ error: 'Invalid estado' }, { status: 400 });
  }

  const sb = supabase as any;
  const { error } = await sb.from('mining_revision_estado').upsert({
    project_id, nivel, codigo, estado, notas: notas ?? null,
    revisado_por: user.id, revisado_en: new Date().toISOString(),
  }, { onConflict: 'project_id,nivel,codigo' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
