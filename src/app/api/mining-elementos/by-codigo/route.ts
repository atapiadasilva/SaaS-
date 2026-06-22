import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ELEMENT_FIELDS = [
  'sp3d_moniker', 'name', 'tag_unificado', 'tipo_elemento', 'descripcion',
  'especialidad_cod', 'especialidad_nombre', 'categoria_constructiva',
  'sitio', 'sector', 'area_unidad', 'sistema_servicio', 'obra_tipo', 'obra_target',
  'material', 'especificacion', 'isometrico', 'spool', 'pid',
  'cwp_id', 'pwp_elemento', 'estado', 'avance_pct', 'item_o_adicional',
  'diametro_in', 'longitud_m', 'peso_kg', 'volumen_m3',
].join(',');

// GET /api/mining-elementos/by-codigo?project_id=&codigo=
// Elementos del modelo vinculados a una partida del itemizado (N:N vía mining_elemento_codigo).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const codigo = params.get('codigo');
  if (!projectId || !codigo) return NextResponse.json({ error: 'Missing project_id or codigo' }, { status: 400 });

  const sb = supabase as any;
  const { data: links, error: linkErr } = await sb
    .from('mining_elemento_codigo')
    .select('sp3d_moniker')
    .eq('project_id', projectId)
    .eq('codigo', codigo);
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  const monikers = (links ?? []).map((l: any) => l.sp3d_moniker);
  if (!monikers.length) return NextResponse.json({ elementos: [] });

  const { data: elementos, error } = await sb
    .from('mining_elementos')
    .select(ELEMENT_FIELDS)
    .eq('project_id', projectId)
    .in('sp3d_moniker', monikers)
    .order('tag_unificado');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ elementos: elementos ?? [] });
}
