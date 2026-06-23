import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Nivel = 'cwa' | 'cv' | 'cwp';
const TABLE: Record<Nivel, string> = { cwa: 'mining_cwa', cv: 'mining_cv', cwp: 'mining_cwp' };
const ID_COL: Record<Nivel, string> = { cwa: 'cwa_id', cv: 'cv_id', cwp: 'cwp_id' };
const NAME_COL: Record<Nivel, string> = { cwa: 'cwa_nombre', cv: 'cv_nombre', cwp: 'cwp_nombre' };

// CWP_ID = {CV}.{DISC}{NNN} (ej. 312101.D001) → CV = "312101" → CWA = CV[:4] = "3121"
// (misma convención usada en /api/mining-elementos) — se usa para precompletar cwa_id/cv_id del catálogo.
function deriveParents(nivel: Nivel, codigo: string): Record<string, string> {
  if (nivel === 'cv') return { cwa_id: codigo.slice(0, 4) };
  if (nivel === 'cwp') {
    const m = codigo.match(/^(\d{6})\.[A-Za-z]+\d+/);
    if (m) return { cv_id: m[1], cwa_id: m[1].slice(0, 4) };
  }
  return {};
}

// POST /api/mining-catalogo
// Body: { project_id, nivel: 'cwa'|'cv'|'cwp', codigo, nombre? }
// Crea una nueva categoría (CWA/CV/CWP) en el catálogo del proyecto — para poder pintar/reasignar elementos
// hacia un conjunto que todavía no existía (ej. un nuevo CWA para un área que no estaba en el itemizado original).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, nivel, nombre } = body ?? {};
  const codigo = String(body?.codigo ?? '').trim();
  if (!project_id || !nivel || !TABLE[nivel as Nivel]) {
    return NextResponse.json({ error: 'Missing/invalid project_id or nivel' }, { status: 400 });
  }
  if (!codigo) return NextResponse.json({ error: 'Falta el código de la nueva categoría' }, { status: 400 });

  const n = nivel as Nivel;
  const sb = supabase as any;
  const row: Record<string, any> = {
    project_id, [ID_COL[n]]: codigo, [NAME_COL[n]]: nombre?.trim() || null,
    es_oficial: false, // creada desde la app, no viene del itemizado/DevPack original
    ...deriveParents(n, codigo),
  };

  const { error } = await sb.from(TABLE[n]).upsert(row, { onConflict: `project_id,${ID_COL[n]}` });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, codigo });
}
