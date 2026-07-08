import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processETL } from '@/lib/ingestion-utils';

// Resuelve el nombre real de una columna dado el alias configurado en column_mapping.
// Si el mapping dice { guid: "SP3D_MONIKER" } y la fila tiene "SP3D_MONIKER", devuelve "SP3D_MONIKER".
// Si en cambio la fila tiene "GUID_ELEMENTO" y el mapping dice { guid: "GUID_ELEMENTO" },
// renombra la columna al nombre estándar esperado por el resto de la plataforma.
function applyColumnMapping(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>
): Record<string, unknown>[] {
  if (!mapping || Object.keys(mapping).length === 0) return rows;

  // mapping = { guid: "GUID_ELEMENTO", cwp: "PAQUETE" }
  // → invertido: { "GUID_ELEMENTO": "SP3D_MONIKER", "PAQUETE": "CWP" }
  const STANDARD_TARGET: Record<string, string> = {
    guid: 'SP3D_MONIKER',
    cwp: 'CWP',
    disciplina: 'Disciplina',
    nombre: 'Nombre',
    descripcion: 'Descripción',
    sitio: 'Sitio',
    sector: 'Sector',
    sistema: 'Sistema',
    estado: 'Estado',
    ewp: 'EWP',
    swp: 'SWP',
  };

  const renames: Record<string, string> = {};
  for (const [fieldKey, sourceCol] of Object.entries(mapping)) {
    const targetCol = STANDARD_TARGET[fieldKey];
    if (targetCol && sourceCol && sourceCol !== targetCol) {
      renames[sourceCol] = targetCol;
    }
  }

  if (Object.keys(renames).length === 0) return rows;

  return rows.map(row => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[renames[k] ?? k] = v;
    }
    return out;
  });
}

export async function POST(req: Request) {
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const {
      projectId,
      entityName,
      fileType,
      rows,
      pkColumns = [],
      cleaningRules = { trim: true, uppercase: false },
      strategy = 'replace',
      columnTypes = {},
    } = await req.json();

    if (!projectId || !entityName || !rows) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Obtener column_mapping del proyecto si existe
    const { data: proj } = await supabase
      .from('projects')
      .select('module_config')
      .eq('id', projectId)
      .single();

    const columnMapping: Record<string, string> = proj?.module_config?.column_mapping ?? {};

    // Aplicar renombrado de columnas según el mapeo del proyecto
    const mappedRows = applyColumnMapping(rows, columnMapping);

    // 1. Process Data (ETL)
    const processedRows = processETL(mappedRows, pkColumns, cleaningRules, columnTypes);
    const headers = Object.keys(mappedRows[0] || {});

    // 2. Insert/Update Node
    let nodeId: string | undefined;

    if (strategy === 'replace') {
      const { data: existingNode } = await supabase
        .from('nodes')
        .select('id')
        .eq('project_id', projectId)
        .eq('name', entityName)
        .single();

      if (existingNode) {
        await supabase
          .from('nodes')
          .update({
            data: processedRows,
            data_headers: headers,
            source_type: fileType || 'excel',
            type: 'custom',
          })
          .eq('id', existingNode.id);
        nodeId = existingNode.id;
      } else {
        const { data: newNode, error: createError } = await supabase
          .from('nodes')
          .insert({
            project_id: projectId,
            name: entityName,
            source_type: fileType || 'excel',
            type: 'custom',
            data_headers: headers,
            data: processedRows,
            position_x: 100,
            position_y: 100,
          })
          .select()
          .single();

        if (createError) throw createError;
        nodeId = newNode.id;
      }
    }

    return NextResponse.json({ success: true, nodeId: nodeId ?? null, columnsMapped: Object.keys(columnMapping).length });
  } catch (err: any) {
    console.error('Ingestion Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
