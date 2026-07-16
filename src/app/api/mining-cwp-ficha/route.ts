import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/mining-cwp-ficha?project_id=&cwp_id=
// Ficha CWP imprimible (HTML autocontenido, A4) — resumen ejecutivo del paquete:
// identificación y jerarquía AWP, KPIs, programa P333, itemizado de cobro, IWPs y planos.
// Se abre en una pestaña y se guarda como PDF con el botón Imprimir del navegador.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const cwpId = params.get('cwp_id');
  if (!projectId || !cwpId) return NextResponse.json({ error: 'Missing project_id/cwp_id' }, { status: 400 });

  const sb = supabase as any;

  const { data: cwp, error: cwpErr } = await sb.from('mining_cwp').select('*')
    .eq('project_id', projectId).eq('cwp_id', cwpId).single();
  if (cwpErr || !cwp) return NextResponse.json({ error: cwpErr?.message ?? 'CWP no encontrado' }, { status: 404 });

  const [progRes, itemRes, planosRes, iwpRes, cwaRes, cvRes] = await Promise.all([
    sb.from('mining_programa').select('cod_actividad, nombre_actividad, hh, fecha_inicio, fecha_fin, duracion_dias')
      .eq('project_id', projectId).eq('cwp_id', cwpId).eq('fuente', 'P333').order('fecha_inicio'),
    sb.from('mining_itemizado').select('item, descripcion, unidad, cantidad, hh_unidad, hh_item, partida_bmp')
      .eq('project_id', projectId).eq('cwp_id', cwpId).order('hh_item', { ascending: false }),
    sb.from('mining_planos').select('codigo_documento, descripcion, tipo')
      .eq('project_id', projectId).eq('cwp_id', cwpId).order('codigo_documento'),
    sb.from('mining_iwp').select('iwp_id, descripcion, status, fecha_inicio_plan, fecha_fin_plan, hh_estimadas, avance_fisico_pct, crew_size')
      .eq('project_id', projectId).eq('cwp_id', cwpId).order('iwp_id'),
    sb.from('mining_cwa').select('*').eq('project_id', projectId).eq('cwa_id', cwp.cwa_id).maybeSingle(),
    sb.from('mining_cv').select('*').eq('project_id', projectId).eq('cv_id', cwp.cv_id).maybeSingle(),
  ]);

  const prog: any[] = progRes.data ?? [];
  const items: any[] = itemRes.data ?? [];
  const planos: any[] = planosRes.data ?? [];
  const iwps: any[] = iwpRes.data ?? [];
  const cwaNombre = cwaRes.data?.nombre ?? cwaRes.data?.name ?? '';
  const cvNombre = cvRes.data?.nombre ?? cvRes.data?.name ?? '';

  // Constraints pendientes por IWP (para el semáforo de cada paquete)
  const consByIwp = new Map<string, { total: number; pend: number }>();
  if (iwps.length) {
    const { data: cons } = await sb.from('mining_iwp_constraint').select('iwp_id, cleared')
      .eq('project_id', projectId).in('iwp_id', iwps.map((i: any) => i.iwp_id));
    for (const c of cons ?? []) {
      const m = consByIwp.get(c.iwp_id) ?? { total: 0, pend: 0 };
      m.total++;
      if (!c.cleared) m.pend++;
      consByIwp.set(c.iwp_id, m);
    }
  }

  const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fn = (v: any) => v == null ? '—' : Math.round(Number(v)).toLocaleString('es-CL');
  const f1 = (v: any) => v == null ? '—' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: 1 });
  const fd = (v: any) => v ? String(v).slice(0, 10) : '—';
  const fmm = (v: any) => !v ? '—' : '$' + Math.round(Number(v) / 1e6).toLocaleString('es-CL') + ' MM';

  const hhProg = prog.reduce((s, t) => s + (Number(t.hh) || 0), 0);
  const hhItem = items.reduce((s, i) => s + (Number(i.hh_item) || 0), 0);
  const progIni = prog.map(t => t.fecha_inicio).filter(Boolean).sort()[0] ?? null;
  const progFin = prog.map(t => t.fecha_fin).filter(Boolean).sort().slice(-1)[0] ?? null;
  const hhIwp = iwps.reduce((s, i) => s + (Number(i.hh_estimadas) || 0), 0);
  const avanceCwp = hhIwp > 0
    ? Math.round(iwps.reduce((s, i) => s + (Number(i.avance_fisico_pct) || 0) * (Number(i.hh_estimadas) || 0), 0) / hhIwp)
    : null;

  // Timeline CSS del programa (barras proporcionales dentro de la ventana del CWP)
  const t0 = progIni ? +new Date(progIni) : 0;
  const t1 = progFin ? +new Date(progFin) : 1;
  const span = Math.max(1, t1 - t0);
  const barra = (s: string | null, e: string | null) => {
    if (!s || !e || !progIni) return '';
    const l = ((+new Date(s) - t0) / span) * 100;
    const w = Math.max(1.2, ((+new Date(e) - +new Date(s)) / span) * 100);
    return `<div class="tl"><i style="left:${l.toFixed(1)}%;width:${w.toFixed(1)}%"></i></div>`;
  };

  const progHtml = prog.length ? prog.map(t => `
    <tr>
      <td class="mono">${esc(t.cod_actividad)}</td>
      <td>${esc(t.nombre_actividad)}</td>
      <td class="nw">${fd(t.fecha_inicio)} → ${fd(t.fecha_fin)}</td>
      <td class="num">${fn(t.hh)}</td>
      <td class="w-tl">${barra(t.fecha_inicio, t.fecha_fin)}</td>
    </tr>`).join('')
    : '<tr><td colspan="5" class="dim">Este CWP no tiene actividades en el programa P333.</td></tr>';

  const MAX_ITEMS = 18;
  const itemsHtml = items.length ? items.slice(0, MAX_ITEMS).map(i => `
    <tr>
      <td class="mono">${esc(i.item)}</td>
      <td>${esc(i.descripcion)}</td>
      <td class="mono">${esc(i.partida_bmp)}</td>
      <td class="num nw">${f1(i.cantidad)} ${esc(i.unidad ?? '')}</td>
      <td class="num">${fn(i.hh_item)}</td>
    </tr>`).join('')
    : '<tr><td colspan="5" class="dim">Sin ítems del itemizado vinculados a este CWP.</td></tr>';
  const itemsExtra = items.length > MAX_ITEMS
    ? `<tr><td colspan="4" class="dim">… y ${items.length - MAX_ITEMS} ítem(s) más (ver plataforma)</td><td class="num dim">${fn(items.slice(MAX_ITEMS).reduce((s, i) => s + (Number(i.hh_item) || 0), 0))}</td></tr>`
    : '';

  const STATUS_LABEL: Record<string, string> = {
    PLANIFICADO: 'Planificado', LISTO_PARA_TRABAJO: 'Listo', EN_EJECUCION: 'En ejecución', COMPLETADO: 'Completado', HOLD: 'En espera',
  };
  const iwpHtml = iwps.length ? iwps.map(i => {
    const cons = consByIwp.get(i.iwp_id) ?? { total: 0, pend: 0 };
    return `<tr>
      <td class="mono">${esc(i.iwp_id)}</td>
      <td>${esc(i.descripcion ?? '')}</td>
      <td><span class="chip">${esc(STATUS_LABEL[i.status] ?? i.status ?? '—')}</span></td>
      <td class="nw">${fd(i.fecha_inicio_plan)} → ${fd(i.fecha_fin_plan)}</td>
      <td class="num">${fn(i.hh_estimadas)}</td>
      <td class="num"><b>${i.avance_fisico_pct ?? 0}%</b></td>
      <td class="nw">${cons.pend ? `⚠ ${cons.pend}/${cons.total} pend.` : (cons.total ? '✓ despejados' : '—')}</td>
    </tr>`;
  }).join('')
    : '<tr><td colspan="7" class="dim">Todavía no se abre en IWP — el paquete no tiene frentes de instalación cortados.</td></tr>';

  const MAX_PLANOS = 36;
  const planosHtml = planos.length
    ? `<div class="planos">${planos.slice(0, MAX_PLANOS).map(p =>
        `<div><span class="mono">${esc(p.codigo_documento)}</span> <span class="dim2">${esc(p.tipo ?? '')}</span></div>`).join('')}
      </div>${planos.length > MAX_PLANOS ? `<div class="dim" style="margin-top:4px">… y ${planos.length - MAX_PLANOS} plano(s) más</div>` : ''}`
    : '<div class="dim">Sin planos vinculados.</div>';

  const badges: string[] = [];
  if (cwp.ruta_critica) badges.push('<span class="badge crit">🔥 RUTA CRÍTICA</span>');
  if (cwp.status_cwp) badges.push(`<span class="badge">${esc(cwp.status_cwp)}</span>`);
  if (cwp.es_oficial === false) badges.push('<span class="badge warn">No oficial</span>');
  if (avanceCwp != null) badges.push(`<span class="badge ${avanceCwp >= 100 ? 'ok' : ''}">Avance ${avanceCwp}%</span>`);

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Ficha CWP ${esc(cwp.cwp_id)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 11mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5px; color: #1e293b; margin: 24px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -0.01em; }
  h1 .disc { display: inline-block; vertical-align: 3px; margin-right: 8px; padding: 2px 10px; border-radius: 8px; background: #FF0000; color: #fff; font-size: 13px; }
  h2 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; color: #757575; border-bottom: 2px solid #FF0000; padding-bottom: 3px; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 3px 6px; }
  td { padding: 3px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .mono { font-family: Consolas, monospace; font-size: 9.5px; white-space: nowrap; }
  .num { text-align: right; font-family: Consolas, monospace; }
  .nw { white-space: nowrap; }
  .dim { color: #94a3b8; font-style: italic; }
  .dim2 { color: #94a3b8; font-size: 8.5px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #FF0000; padding-bottom: 10px; }
  .brand { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
  .brand .mark { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(135deg,#FF0000,#A00000); color: #fff; font-weight: 900; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .brand .name { font-size: 11px; font-weight: 800; letter-spacing: .08em; color: #1A1A1A; }
  .brand .name b { color: #FF0000; }
  .brand .tag { font-size: 7.5px; color: #757575; text-transform: uppercase; letter-spacing: .16em; }
  .trace { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-family: Consolas, monospace; font-size: 9.5px; color: #475569; }
  .trace b { color: #1A1A1A; }
  .trace .sep { color: #FF0000; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: 9.5px; background: #e2e8f0; margin-left: 4px; }
  .badge.crit { background: #fee2e2; color: #a00000; }
  .badge.warn { background: #fef3c7; color: #92400e; }
  .badge.ok { background: #dcfce7; color: #166534; }
  .chip { display: inline-block; padding: 1px 8px; border-radius: 999px; font-weight: 700; font-size: 8.5px; background: #eff6ff; color: #1d4ed8; }
  .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 12px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; page-break-inside: avoid; }
  .kpi b { display: block; font-size: 14px; letter-spacing: -0.01em; }
  .kpi span { font-size: 8px; text-transform: uppercase; color: #64748b; letter-spacing: .04em; }
  .alcance { border-left: 3px solid #FF0000; background: #fafafa; padding: 7px 12px; border-radius: 0 8px 8px 0; color: #334155; line-height: 1.5; }
  .w-tl { width: 26%; }
  .tl { position: relative; height: 9px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
  .tl i { position: absolute; top: 1px; bottom: 1px; border-radius: 3px; background: linear-gradient(90deg,#FF0000,#c02020); }
  .planos { columns: 3; column-gap: 16px; font-size: 9px; line-height: 1.7; }
  .firmas { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 34px; page-break-inside: avoid; }
  .firma { border-top: 1px solid #334155; padding-top: 4px; text-align: center; font-size: 10px; color: #475569; }
  .foot { margin-top: 14px; font-size: 8px; color: #94a3b8; display: flex; justify-content: space-between; }
  @media print { .noprint { display: none; } body { margin: 0; } }
</style></head><body>

<div class="head">
  <div>
    <div class="brand">
      <div class="mark">H</div>
      <div>
        <div class="name">HILO <b>DIGITAL</b></div>
        <div class="tag">Ficha de Paquete de Construcción · AWP</div>
      </div>
    </div>
    <h1><span class="disc">${esc(cwp.disciplina_cod ?? '')}</span>CWP ${esc(cwp.cwp_id)}</h1>
    <div style="margin-top:3px;font-size:12px">${esc(cwp.cwp_nombre ?? '')}</div>
    <div class="trace">
      CWA <b>${esc(cwp.cwa_id ?? '—')}</b> ${cwaNombre ? `<span class="dim2">${esc(cwaNombre)}</span>` : ''}
      <span class="sep">›</span> CV <b>${esc(cwp.cv_id ?? '—')}</b> ${cvNombre ? `<span class="dim2">${esc(cvNombre)}</span>` : ''}
      <span class="sep">›</span> CWP <b>${esc(cwp.cwp_id)}</b>
      <span class="sep">›</span> EWP <b>${esc(cwp.ewp_id ?? '—')}</b>
    </div>
  </div>
  <div style="text-align:right">
    ${badges.join('<br>') || ''}
    ${cwp.hito_contractual ? `<div style="margin-top:6px;font-size:9.5px"><b>🎯 ${esc(cwp.hito_contractual)}</b></div>` : ''}
    <div class="dim" style="margin-top:6px">P333 Crecimiento Ujina · PG210 Puerto<br>Generado ${new Date().toISOString().slice(0, 10)}</div>
  </div>
</div>

<div class="kpis">
  <div class="kpi"><b>${fmm(cwp.costo_oferta_clp)}</b><span>Costo oferta</span></div>
  <div class="kpi"><b>${fn(hhProg)}</b><span>HH programa (${prog.length} act.)</span></div>
  <div class="kpi"><b>${fn(hhItem)}</b><span>HH itemizado (${items.length} ítems)</span></div>
  <div class="kpi"><b>${fd(progIni)}</b><span>Inicio programa</span></div>
  <div class="kpi"><b>${fd(progFin)}</b><span>Fin programa</span></div>
  <div class="kpi"><b>${iwps.length ? `${iwps.length} · ${avanceCwp ?? 0}%` : '—'}</b><span>IWPs · avance</span></div>
</div>

${cwp.alcance ? `<h2>Alcance del paquete</h2><div class="alcance">${esc(cwp.alcance)}</div>` : ''}

<h2>Programa P333 (${prog.length} actividades · ${fn(hhProg)} HH)</h2>
<table>
  <tr><th>Actividad</th><th>Descripción</th><th>Fechas</th><th style="text-align:right">HH</th><th>Línea de tiempo</th></tr>
  ${progHtml}
</table>

<h2>Itemizado de cobro — MC (top por HH)</h2>
<table>
  <tr><th>Ítem</th><th>Descripción</th><th>Partida BMP</th><th style="text-align:right">Cantidad</th><th style="text-align:right">HH</th></tr>
  ${itemsHtml}
  ${itemsExtra}
  ${items.length ? `<tr><td colspan="4" style="font-weight:700">TOTAL (${items.length} ítems)</td><td class="num" style="font-weight:700">${fn(hhItem)}</td></tr>` : ''}
</table>

<h2>Paquetes de instalación (IWP)</h2>
<table>
  <tr><th>IWP</th><th>Descripción</th><th>Estado</th><th>Fechas plan</th><th style="text-align:right">HH</th><th style="text-align:right">Avance</th><th>Constraints</th></tr>
  ${iwpHtml}
</table>

<h2>Planos y documentos del CWP (${planos.length})</h2>
${planosHtml}

<div class="firmas">
  <div class="firma">Jefe de Terreno</div>
  <div class="firma">Oficina Técnica (AWP)</div>
  <div class="firma">Administrador de Contrato</div>
</div>

<div class="foot">
  <span>HILO Digital — EIMI00417 Puerto Collahuasi · Ficha generada automáticamente desde la red de datos AWP</span>
  <span>${esc(cwp.cwp_id)} · ${new Date().toLocaleString('es-CL')}</span>
</div>

<div class="noprint" style="margin-top:22px">
  <button onclick="window.print()" style="background:#FF0000;color:#fff;border:0;border-radius:999px;padding:10px 24px;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(255,0,0,.25)">Imprimir / Guardar PDF</button>
</div>
</body></html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
