import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listLocalDocNums } from '@/lib/aconex-local';
import { disciplineFromDocNum } from '@/lib/document-disciplines';

// GET /api/mining-planos/list?project_id=...
// Registro completo de documentos de ingeniería (control de documentos) bajo metodología AWP:
// todos los planos/especificaciones del proyecto, con CWA/CV/CWP/EWP, disciplina derivada del
// código de documento, y disponibilidad real de PDF local — para el módulo "Documentos".
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;
  const [planosRes, cwpRes] = await Promise.all([
    sb.from('mining_planos').select('codigo_documento, descripcion, tipo, confianza, cwp_id, ewp_id').eq('project_id', projectId),
    sb.from('mining_cwp').select('cwp_id, cwa_id, cv_id, cwp_nombre, es_oficial').eq('project_id', projectId),
  ]);
  if (planosRes.error) return NextResponse.json({ error: planosRes.error.message }, { status: 500 });
  if (cwpRes.error) return NextResponse.json({ error: cwpRes.error.message }, { status: 500 });

  const cwpById = new Map<string, any>((cwpRes.data ?? []).map((c: any) => [c.cwp_id, c]));
  const localDocNums = listLocalDocNums();

  const docs = (planosRes.data ?? []).map((p: any) => {
    const disc = disciplineFromDocNum(p.codigo_documento);
    const cwp = p.cwp_id ? cwpById.get(p.cwp_id) : null;
    return {
      codigoDocumento: p.codigo_documento,
      descripcion: p.descripcion,
      tipo: p.tipo,
      confianza: p.confianza,
      cwpId: p.cwp_id,
      ewpId: p.ewp_id,
      cwaId: cwp?.cwa_id ?? (p.cwp_id ? p.cwp_id.split('.')[0] : null),
      cvId: cwp?.cv_id ?? null,
      cwpNombre: cwp?.cwp_nombre ?? null,
      esOficial: cwp?.es_oficial ?? false,
      disciplinaCode: disc.code,
      disciplina: disc.name,
      disciplinaColor: disc.color,
      tieneArchivo: localDocNums.has(p.codigo_documento),
    };
  });

  const disciplinas = new Map<string, { code: string; name: string; color: string; n: number }>();
  for (const d of docs) {
    const cur = disciplinas.get(d.disciplinaCode) ?? { code: d.disciplinaCode, name: d.disciplina, color: d.disciplinaColor, n: 0 };
    cur.n++;
    disciplinas.set(d.disciplinaCode, cur);
  }

  return NextResponse.json({
    docs,
    disciplinas: [...disciplinas.values()].sort((a, b) => b.n - a.n),
    total: docs.length,
    conArchivo: docs.filter((d: any) => d.tieneArchivo).length,
  });
}
