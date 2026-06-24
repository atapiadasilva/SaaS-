import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Nivel = 'cwa' | 'cv' | 'cwp' | 'swp';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// GET /api/mining-colores?project_id=&nivel=cwa|cv|cwp
// Colores custom guardados por el usuario para cada código de ese nivel (sobreescriben la paleta automática).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const nivel = params.get('nivel') as Nivel | null;
  if (!projectId || !nivel || !['cwa', 'cv', 'cwp', 'swp'].includes(nivel)) {
    return NextResponse.json({ error: 'Missing/invalid project_id or nivel' }, { status: 400 });
  }

  const sb = supabase as any;
  const { data, error } = await sb.from('mining_colores_codigo')
    .select('codigo, color').eq('project_id', projectId).eq('nivel', nivel);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const colores: Record<string, string> = {};
  for (const row of data ?? []) colores[row.codigo] = row.color;
  return NextResponse.json({ colores });
}

// PATCH /api/mining-colores
// Body: { project_id, nivel, colores: { [codigo]: '#rrggbb' } } — guarda/sobreescribe varios códigos a la vez.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, nivel, colores } = body ?? {};
  if (!project_id || !['cwa', 'cv', 'cwp', 'swp'].includes(nivel) || !colores || typeof colores !== 'object') {
    return NextResponse.json({ error: 'Missing project_id, nivel or colores{}' }, { status: 400 });
  }

  const rows = Object.entries(colores as Record<string, string>)
    .filter(([codigo, hex]) => codigo && HEX_RE.test(hex))
    .map(([codigo, hex]) => ({
      project_id, nivel, codigo, color: hex.toLowerCase(),
      updated_by: user.id, updated_at: new Date().toISOString(),
    }));
  if (!rows.length) return NextResponse.json({ error: 'No hay colores válidos (formato #rrggbb) para guardar' }, { status: 400 });

  const sb = supabase as any;
  const { error } = await sb.from('mining_colores_codigo').upsert(rows, { onConflict: 'project_id,nivel,codigo' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updated: rows.length });
}
