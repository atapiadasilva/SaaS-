import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const LINEA_FIELDS = [
  'codigo', 'area', 'servicio', 'cwa_codigo', 'cwp_codigo', 'pid_codigo', 'pid_valido',
  'sistema', 'n_isometricos', 'n_spools', 'n_elementos', 'nps', 'peso_kg', 'longitud_m',
  'n_eq_mecanicos', 'n_eq_electricos', 'n_instrumentos', 'n_canalizaciones',
].join(',');

const EQUIPO_FIELDS = [
  'tag', 'tag_base', 'area', 'disciplina_codigo', 'tipo_cod', 'tipo_desc_ref',
  'cwa_codigo', 'cwp_codigo', 'pid_codigo', 'pid_valido', 'sistema', 'descripcion',
  'espec_tecnica', 'n_monikers', 'n_lineas_mismo_pid',
].join(',');

// GET /api/mining-sistemas/detalle?project_id=&swp_id=
// Ficha de un subsistema: líneas y equipos asociados (vía P&ID, ya propagado en mining_awp_linea/
// mining_awp_equipo) y el conteo de elementos del modelo 3D ya clasificados con este swp_id.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const swpId = params.get('swp_id');
  if (!projectId || !swpId) return NextResponse.json({ error: 'Missing project_id or swp_id' }, { status: 400 });

  const sb = supabase as any;

  const [lineasRes, equiposRes, elementosRes] = await Promise.all([
    sb.from('mining_awp_linea').select(LINEA_FIELDS).eq('project_id', projectId).eq('subsistema_principal', swpId).order('codigo'),
    sb.from('mining_awp_equipo').select(EQUIPO_FIELDS).eq('project_id', projectId).eq('subsistema_codigo', swpId).order('tag'),
    sb.from('mining_elementos').select('sp3d_moniker', { count: 'exact' }).eq('project_id', projectId).eq('swp_id', swpId),
  ]);

  if (lineasRes.error) return NextResponse.json({ error: lineasRes.error.message }, { status: 500 });
  if (equiposRes.error) return NextResponse.json({ error: equiposRes.error.message }, { status: 500 });
  if (elementosRes.error) return NextResponse.json({ error: elementosRes.error.message }, { status: 500 });

  return NextResponse.json({
    lineas: lineasRes.data ?? [],
    equipos: equiposRes.data ?? [],
    n_elementos_modelo: elementosRes.count ?? 0,
    monikers: (elementosRes.data ?? []).map((r: any) => r.sp3d_moniker),
  });
}
