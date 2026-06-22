import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/mining-cambios-log?project_id=&format=csv
// Exporta la trazabilidad de cambios de CWA/CV/CWP hechos desde el editor (para corregir en Navisworks DataTools).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;
  const data: any[] = [];
  let from = 0;
  for (;;) {
    const { data: page, error } = await sb
      .from('mining_cambios_log')
      .select('sp3d_moniker, campo, valor_anterior, valor_nuevo, origen, creado_en')
      .eq('project_id', projectId)
      .order('creado_en', { ascending: false })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    data.push(...(page ?? []));
    // PostgREST limita las filas por respuesta (ej. 1000) aunque se pida un rango mayor.
    if (!page || page.length === 0 || data.length >= 50000) break;
    from += page.length;
  }

  if (params.get('format') === 'csv') {
    const header = 'SP3D_MONIKER,CAMPO,VALOR_ANTERIOR,VALOR_NUEVO,ORIGEN,FECHA';
    const rows = (data ?? []).map((r: any) =>
      [r.sp3d_moniker, r.campo, r.valor_anterior, r.valor_nuevo, r.origen, r.creado_en].map(csvEscape).join(','));
    const csv = [header, ...rows].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cambios_cwa_cv_cwp_${projectId}.csv"`,
      },
    });
  }

  return NextResponse.json({ cambios: data ?? [] });
}
