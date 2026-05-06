import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processETL } from '@/lib/ingestion-utils';

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      strategy = 'replace', // 'replace' is the only one supported for now with this single-node approach
      columnTypes = {}
    } = await req.json();

    if (!projectId || !entityName || !rows) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Process Data (ETL)
    const processedRows = processETL(rows, pkColumns, cleaningRules, columnTypes);
    const headers = Object.keys(rows[0] || {});

    // 2. Insert/Update Node (One node per Excel file)
    let nodeId;

    if (strategy === 'replace') {
      // Find existing node with same name in project or create new
      const { data: existingNode } = await supabase
        .from('nodes')
        .select('id')
        .eq('project_id', projectId)
        .eq('name', entityName)
        .single();

      if (existingNode) {
        const { error: updateError } = await supabase
          .from('nodes')
          .update({
            data: processedRows,
            data_headers: headers,
            source_type: fileType || 'excel',
            type: 'custom'
          })
          .eq('id', existingNode.id);

        if (updateError) throw updateError;
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
            position_y: 100
          })
          .select()
          .single();

        if (createError) throw createError;
        nodeId = newNode.id;
      }
    }

    return NextResponse.json({ success: true, nodeId });
  } catch (err: any) {
    console.error('Ingestion Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
