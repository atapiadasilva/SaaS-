import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Dashboard por departamento (Calidad, Medio Ambiente, SSO, Equipos, RRHH).
// GET ?project_id=&depto= → { kpis, docs, consideraciones }
// Los documentos salen de mining_doc_aconex (clasificados por función Aconex / título);
// las consideraciones del feed diario de la IA (mining_consideraciones).

type Depto = 'CALIDAD' | 'MEDIO_AMBIENTE' | 'SSO' | 'EQUIPOS' | 'RRHH';

const EQUIPO_RE = /CAMI[OÓ]N|GR[UÚ]A|EQUIPO|RETROEXCAV|BULLDOZER|RODILLO|MANIPULADOR|TELEHANDLER|ALZA\s*HOMBRE|MIXER|BOMBA DE HORMIG|GENERADOR|COMPRESOR|SOLDADORA|CARGADOR|EXCAVADORA|MOTONIVELADORA|IZAJE/i;
const RRHH_RE = /DOTACI|N[OÓ]MINA|ACREDITA|PERSONAL|COMPETENC|CAPACITA|FATIGA Y SOMNOLENCIA|ALCOHOL|PASAPORTE/i;

function perteneceDepto(depto: Depto, d: any): boolean {
  const fn: string = d.funcion ?? '';
  const titulo: string = d.titulo ?? '';
  switch (depto) {
    case 'CALIDAD': return fn.startsWith('20') || fn.startsWith('35');
    case 'MEDIO_AMBIENTE': return fn.startsWith('10');
    case 'SSO': return fn.startsWith('60');
    case 'EQUIPOS': return EQUIPO_RE.test(titulo);
    case 'RRHH': return RRHH_RE.test(titulo) || (fn.startsWith('50') && d.tipo_doc === 'Nómina/Estándar');
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pid = req.nextUrl.searchParams.get('project_id');
  const depto = req.nextUrl.searchParams.get('depto') as Depto | null;
  if (!pid || !depto) return NextResponse.json({ error: 'Missing project_id/depto' }, { status: 400 });
  const sb = supabase as any;

  const [docsRes, consRes] = await Promise.all([
    sb.from('mining_doc_aconex')
      .select('id, n_cmdic, titulo, tipo_doc, rev, estado_aconex, fecha_modificacion, funcion, categoria, cwa_id, cwp_id_exacto, cwp_sugerido, ext')
      .eq('project_id', pid)
      .order('fecha_modificacion', { ascending: false, nullsFirst: false }),
    sb.from('mining_consideraciones')
      .select('id, fecha_reporte, depto, tipo, cwp_id, iwp_id, n_cmdic, titulo, detalle, severidad, estado, fecha_limite, responsable, metadata')
      .eq('project_id', pid).eq('depto', depto)
      .order('fecha_reporte', { ascending: false }),
  ]);
  if (docsRes.error || consRes.error) {
    return NextResponse.json({ error: (docsRes.error ?? consRes.error).message }, { status: 500 });
  }

  const docs = (docsRes.data ?? []).filter((d: any) => perteneceDepto(depto, d));
  const cons = consRes.data ?? [];

  const esAprobado = (e: string | null) => !!e && /aprobado/i.test(e) && !/para aprob/i.test(e);
  const esRechazado = (e: string | null) => !!e && /rechaz/i.test(e);

  const kpis = {
    docs_total: docs.length,
    aprobados: docs.filter((d: any) => esAprobado(d.estado_aconex)).length,
    rechazados: docs.filter((d: any) => esRechazado(d.estado_aconex)).length,
    en_revision: docs.filter((d: any) => d.estado_aconex && !esAprobado(d.estado_aconex) && !esRechazado(d.estado_aconex)).length,
    consid_abiertas: cons.filter((c: any) => c.estado !== 'CERRADA').length,
    bloqueantes: cons.filter((c: any) => c.estado !== 'CERRADA' && c.severidad === 'BLOQUEANTE').length,
    ultima_actualizacion: cons[0]?.fecha_reporte ?? null,
  };

  return NextResponse.json({ kpis, docs, consideraciones: cons });
}
