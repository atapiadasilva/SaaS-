import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Las columnas estándar que la plataforma necesita mapear.
// Cada proyecto puede tener distinto nombre de columna para cada uno.
export const STANDARD_FIELDS = [
  { key: 'guid',       label: 'Identificador único / GUID',   example: 'SP3D_MONIKER, GUID, TAG_PLANTA, EID' },
  { key: 'cwp',        label: 'Paquete de Trabajo (CWP)',      example: 'CWP, PAQUETE_TRABAJO, WBS' },
  { key: 'disciplina', label: 'Disciplina',                    example: 'DISCIPLINA, DISC, Disciplina' },
  { key: 'nombre',     label: 'Nombre del elemento',          example: 'Nombre, DESCRIPTION, NAME' },
  { key: 'descripcion',label: 'Descripción',                   example: 'Descripción, DESCRIPTION, DESC' },
  { key: 'sitio',      label: 'Sitio / Área',                 example: 'SITIO, AREA, LOCATION' },
  { key: 'sector',     label: 'Sector',                       example: 'SECTOR, ZONE' },
  { key: 'sistema',    label: 'Sistema de servicio',          example: 'SISTEMA, SYSTEM_SERVICE' },
  { key: 'estado',     label: 'Estado del elemento',          example: 'ESTADO, STATUS' },
  { key: 'ewp',        label: 'EWP (Engineering Work Package)',example: 'EWP, EWP_ID' },
  { key: 'swp',        label: 'SWP (System Work Package)',     example: 'SWP, SWP_ID, SUBSISTEMA' },
] as const;

export type ColumnMappingKey = typeof STANDARD_FIELDS[number]['key'];

// GET /api/project-column-mapping?project_id=
// Devuelve el mapeo actual y los campos estándar disponibles
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const { data: proj, error } = await (supabase as any)
    .from('projects')
    .select('module_config')
    .eq('id', projectId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mapping: Record<string, string> = proj?.module_config?.column_mapping ?? {};
  return NextResponse.json({ mapping, fields: STANDARD_FIELDS });
}

// PATCH /api/project-column-mapping
// Body: { project_id, mapping: Record<ColumnMappingKey, string> }
// Persiste el mapeo en projects.module_config.column_mapping
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, mapping } = await req.json();
  if (!project_id || typeof mapping !== 'object') {
    return NextResponse.json({ error: 'Missing project_id or mapping' }, { status: 400 });
  }

  const validKeys = new Set(STANDARD_FIELDS.map(f => f.key));
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(mapping)) {
    if (validKeys.has(k as ColumnMappingKey) && typeof v === 'string' && v.trim()) {
      clean[k] = v.trim();
    }
  }

  const { error } = await (supabase as any).rpc('merge_module_config', {
    p_project_id: project_id,
    p_key: 'column_mapping',
    p_value: clean,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mapping: clean });
}
