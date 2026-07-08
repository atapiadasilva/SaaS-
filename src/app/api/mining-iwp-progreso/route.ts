import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// El commodity de mining_disciplinas usa guion en-dash ("E00 – Obras eléctricas") y a veces
// trae un "/" con una segunda referencia ("P00 – Piping / TIE00"); mining_ponderaciones.commodity
// usa guion normal. Se normaliza a guion simple y se prueba también solo la primera mitad antes del "/".
function normalizeCommodity(s: string): string[] {
  const norm = s.replace(/–/g, '-').trim();
  const variants = [norm];
  if (norm.includes('/')) variants.push(norm.split('/')[0].trim());
  return variants;
}

// GET /api/mining-iwp-progreso?project_id=&cwp_id=  -> pasos de avance disponibles para la disciplina del CWP
// GET /api/mining-iwp-progreso?project_id=&iwp_id=   -> historial de reportes de ese IWP
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const cwpId = params.get('cwp_id');
  const iwpId = params.get('iwp_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;

  if (iwpId) {
    const { data, error } = await sb.from('mining_iwp_progreso').select('*')
      .eq('project_id', projectId).eq('iwp_id', iwpId).order('fecha_reporte', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data ?? [] });
  }

  if (cwpId) {
    const { data: cwpRow, error: cwpErr } = await sb.from('mining_cwp').select('disciplina_cod')
      .eq('project_id', projectId).eq('cwp_id', cwpId).maybeSingle();
    if (cwpErr) return NextResponse.json({ error: cwpErr.message }, { status: 500 });
    if (!cwpRow?.disciplina_cod) return NextResponse.json({ pasos: [] });

    const { data: discRow, error: discErr } = await sb.from('mining_disciplinas').select('commodity')
      .eq('project_id', projectId).eq('disciplina_cod', cwpRow.disciplina_cod).maybeSingle();
    if (discErr) return NextResponse.json({ error: discErr.message }, { status: 500 });
    if (!discRow?.commodity) return NextResponse.json({ pasos: [] });

    const variants = normalizeCommodity(discRow.commodity);
    const { data: pasos, error: pondErr } = await sb.from('mining_ponderaciones').select('*')
      .eq('project_id', projectId).eq('tipo', 'fisico').in('commodity', variants)
      .order('item_code').order('subitem_code').order('orden');
    if (pondErr) return NextResponse.json({ error: pondErr.message }, { status: 500 });

    return NextResponse.json({ pasos: pasos ?? [] });
  }

  return NextResponse.json({ error: 'Provide cwp_id or iwp_id' }, { status: 400 });
}

// POST /api/mining-iwp-progreso
// Body: { project_id, iwp_id, fecha_reporte, pasos_completados?: string[] (ponderacion ids),
//         pasos_disponibles_total?: string[] (todos los ids mostrados, para normalizar el %),
//         avance_fisico_pct_manual?, hh_reales_acum?, observacion? }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    project_id, iwp_id, fecha_reporte, pasos_completados, pasos_disponibles_total,
    avance_fisico_pct_manual, hh_reales_acum, observacion,
  } = body ?? {};
  if (!project_id || !iwp_id || !fecha_reporte) return NextResponse.json({ error: 'Missing project_id/iwp_id/fecha_reporte' }, { status: 400 });

  const sb = supabase as any;
  let avance_fisico_pct: number | null = null;

  if (Array.isArray(pasos_completados) && Array.isArray(pasos_disponibles_total) && pasos_disponibles_total.length) {
    const { data: pasos, error } = await sb.from('mining_ponderaciones').select('id, peso')
      .eq('project_id', project_id).in('id', pasos_disponibles_total);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const totalPeso = (pasos ?? []).reduce((s: number, p: any) => s + Number(p.peso ?? 0), 0);
    const checkedSet = new Set(pasos_completados);
    const checkedPeso = (pasos ?? []).filter((p: any) => checkedSet.has(p.id)).reduce((s: number, p: any) => s + Number(p.peso ?? 0), 0);
    avance_fisico_pct = totalPeso > 0 ? Math.round((checkedPeso / totalPeso) * 10000) / 100 : 0;
  } else if (typeof avance_fisico_pct_manual === 'number') {
    avance_fisico_pct = avance_fisico_pct_manual;
  } else {
    return NextResponse.json({ error: 'Falta avance_fisico_pct_manual o pasos_completados+pasos_disponibles_total' }, { status: 400 });
  }

  const { data: reporte, error: insErr } = await sb.from('mining_iwp_progreso').insert({
    project_id, iwp_id, fecha_reporte, completado: avance_fisico_pct >= 100,
    hh_reales_acum: hh_reales_acum ?? null, avance_fisico_pct,
    reportado_por: user.email ?? user.id, observacion: observacion ?? null,
  }).select('*').single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const { error: updErr } = await sb.from('mining_iwp').update({
    avance_fisico_pct, hh_reales_acum: hh_reales_acum ?? undefined, fecha_ultima_actualizacion: new Date().toISOString(),
  }).eq('project_id', project_id).eq('iwp_id', iwp_id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ row: reporte });
}
