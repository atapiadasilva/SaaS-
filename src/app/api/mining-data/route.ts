import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listLocalDocNums } from '@/lib/aconex-local';

// GET /api/mining-data?project_id=...
// Returns the AWP mining hierarchy (CWA > CV > CWP > {planos, partidas, programa}) for one project.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = supabase as any;
  const [cwaRes, cvRes, cwpRes, discRes, planosRes, pwpRes, partidasRes, programaRes, elementosRes] = await Promise.all([
    sb.from('mining_cwa').select('*').eq('project_id', projectId).order('cwa_id'),
    sb.from('mining_cv').select('*').eq('project_id', projectId),
    sb.from('mining_cwp').select('*').eq('project_id', projectId).order('cwa_id').order('cv_id').order('cwp_id'),
    sb.from('mining_disciplinas').select('*').eq('project_id', projectId),
    sb.from('mining_planos').select('*').eq('project_id', projectId),
    sb.from('mining_pwp').select('*').eq('project_id', projectId),
    sb.from('mining_partidas').select('*').eq('project_id', projectId),
    sb.from('mining_programa').select('*').eq('project_id', projectId).eq('fuente', 'P333'),
    sb.rpc('mining_cwp_element_counts', { p_project_id: projectId }),
  ]);

  const firstError = [cwaRes, cvRes, cwpRes, discRes, planosRes, pwpRes, partidasRes, programaRes, elementosRes]
    .find(r => r.error);
  if (firstError) return NextResponse.json({ error: firstError.error.message }, { status: 500 });

  const elementosCountByCwp = new Map<string, number>();
  for (const e of elementosRes.data ?? []) {
    elementosCountByCwp.set(e.cwp_id, Number(e.n));
  }

  const pwpToCwp = new Map<string, string>();
  for (const p of pwpRes.data ?? []) pwpToCwp.set(p.pwp_id, p.cwp_id);

  // Códigos con PDF disponible en la carpeta local de Aconex (ACONEX_DOCS_DIR) — para no mostrar
  // un link clickeable en planos que no tienen archivo (ej. "Procedimientos" que no vienen en el
  // export de Aconex, solo planos/especificaciones).
  const localDocNums = listLocalDocNums();

  const planosByCwp = new Map<string, any[]>();
  for (const p of planosRes.data ?? []) {
    const arr = planosByCwp.get(p.cwp_id) ?? [];
    arr.push({ doc: p.codigo_documento, de: p.descripcion, ti: p.tipo, tieneArchivo: localDocNums.has(p.codigo_documento) });
    planosByCwp.set(p.cwp_id, arr);
  }

  const itemsByCwp = new Map<string, any[]>();
  for (const it of partidasRes.data ?? []) {
    const cwpId = pwpToCwp.get(it.pwp_id);
    if (!cwpId) continue;
    const arr = itemsByCwp.get(cwpId) ?? [];
    arr.push({ co: it.codigo, de: it.descripcion, ob: it.obra, un: it.unidad, qt: it.cantidad, pu: it.pu_clp, tot: it.total_clp, guid: it.guid_elemento });
    itemsByCwp.set(cwpId, arr);
  }

  const programaByCwp = new Map<string, any[]>();
  for (const t of programaRes.data ?? []) {
    const arr = programaByCwp.get(t.cwp_id) ?? [];
    arr.push({ id: t.id, n: t.nombre_actividad, hh: t.hh, s: t.fecha_inicio, e: t.fecha_fin, code: t.cod_actividad });
    programaByCwp.set(t.cwp_id, arr);
  }

  // Disciplinas derivadas de los propios CWP (robusto: no depende de la tabla mining_disciplinas).
  const PAL = ['#1565C0', '#1E88E5', '#78909C', '#6A1B9A', '#8D6E63', '#E65100', '#00695C', '#AD1457', '#F9A825', '#FB8C00', '#5E35B1', '#C9A100', '#E53935', '#283593', '#546E7A'];
  const discNombre = new Map<string, string>();
  for (const d of (discRes.data ?? [])) discNombre.set(d.disciplina_cod, d.disciplina_nombre);
  const discCodes: string[] = [];
  for (const c of (cwpRes.data ?? [])) if (c.disciplina_cod && !discCodes.includes(c.disciplina_cod)) discCodes.push(c.disciplina_cod);
  discCodes.sort();
  const discColor = new Map<string, string>();
  discCodes.forEach((code, i) => discColor.set(code, PAL[i % PAL.length]));

  const cwp = (cwpRes.data ?? []).map((c: any) => {
    const items = itemsByCwp.get(c.cwp_id) ?? [];
    const planos = planosByCwp.get(c.cwp_id) ?? [];
    const tasks = programaByCwp.get(c.cwp_id) ?? [];
    const qty: Record<string, Record<string, number>> = {};
    for (const it of items) {
      if (!it.un) continue;
      qty[c.disciplina] = qty[c.disciplina] ?? {};
      qty[c.disciplina][it.un] = (qty[c.disciplina][it.un] ?? 0) + (it.qt ?? 0);
    }
    const hh = tasks.reduce((s, t) => s + (t.hh ?? 0), 0);
    const start = tasks.map(t => t.s).filter(Boolean).sort()[0] ?? null;
    const end = tasks.map(t => t.e).filter(Boolean).sort().slice(-1)[0] ?? null;
    return {
      cwa: c.cwa_id, cv: c.cv_id, cvName: (cvRes.data ?? []).find((v: any) => v.cv_id === c.cv_id)?.cv_nombre ?? '',
      disc: c.disciplina_cod, dn: c.disciplina, cwp: c.cwp_id, ewp: c.ewp_id,
      nombre: c.cwp_nombre, alcance: c.alcance, color: discColor.get(c.disciplina_cod) ?? '#1565C0',
      costo: c.costo_oferta_clp ?? 0,
      items, planos, qty,
      prog: tasks.length ? { hh, acts: tasks.length, start, end, tasks } : null,
      edps: [],
      nElementos: elementosCountByCwp.get(c.cwp_id) ?? 0,
    };
  });

  const cwa = (cwaRes.data ?? []).map((c: any) => ({ cwa: c.cwa_id, name: c.cwa_nombre }));
  const disc = discCodes.map((code) => ({
    code, name: discNombre.get(code) ?? cwp.find((c: any) => c.disc === code)?.dn ?? code,
    color: discColor.get(code) ?? '#1565C0',
    n: cwp.filter((c: any) => c.disc === code).length,
  })).filter((d: any) => d.n > 0);

  const kpi = {
    costo: cwp.reduce((s: number, c: any) => s + (c.costo ?? 0), 0),
    part: partidasRes.data?.length ?? 0,
    plan: planosRes.data?.length ?? 0,
    hh: programaRes.data?.reduce((s: number, t: any) => s + (t.hh ?? 0), 0) ?? 0,
  };

  return NextResponse.json({ cwp, cwa, disc, kpi });
}
