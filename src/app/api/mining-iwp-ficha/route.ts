import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/mining-iwp-ficha?project_id=&iwp_id=
// Ficha IWP imprimible (HTML autocontenido) para entregar a la cuadrilla:
// alcance + actividades + cantidades/ítems de cobro (MC ↔ ECO-2) + planos vigentes + constraints.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const iwpId = params.get('iwp_id');
  if (!projectId || !iwpId) return NextResponse.json({ error: 'Missing project_id/iwp_id' }, { status: 400 });

  const sb = supabase as any;

  const { data: iwp, error: iwpErr } = await sb.from('mining_iwp').select('*')
    .eq('project_id', projectId).eq('iwp_id', iwpId).single();
  if (iwpErr || !iwp) return NextResponse.json({ error: iwpErr?.message ?? 'IWP no encontrado' }, { status: 404 });

  const [cwpRes, actRes, consRes, docsRes, planosRes, elemRes] = await Promise.all([
    sb.from('mining_cwp').select('*').eq('project_id', projectId).eq('cwp_id', iwp.cwp_id).single(),
    sb.from('mining_iwp_actividad')
      .select('*, mining_programa(cod_actividad, nombre_actividad, hh, fecha_inicio, fecha_fin, unidad, cantidad, duracion_dias)')
      .eq('project_id', projectId).eq('iwp_id', iwpId),
    sb.from('mining_iwp_constraint').select('*').eq('project_id', projectId).eq('iwp_id', iwpId).order('fecha_necesaria'),
    sb.from('mining_doc_aconex').select('n_cmdic, n_bechtel, tipo_doc, rev, titulo, archivo')
      .eq('project_id', projectId).eq('cwp_id_exacto', iwp.cwp_id),
    sb.from('mining_planos').select('codigo_documento, descripcion, tipo')
      .eq('project_id', projectId).eq('cwp_id', iwp.cwp_id),
    sb.from('mining_iwp_elemento').select('moniker')
      .eq('project_id', projectId).eq('iwp_id', iwpId).order('moniker'),
  ]);
  const cwp = cwpRes.data ?? {};
  const actividades = actRes.data ?? [];
  const constraints = consRes.data ?? [];

  // MC: ítems de cobro ECO-2 de las actividades asignadas, con descripción del itemizado
  const codigos = actividades.map((a: any) => a.mining_programa?.cod_actividad).filter(Boolean);
  let mcRows: any[] = [];
  if (codigos.length) {
    const { data } = await sb.from('mining_mc')
      .select('task_id, item_eco2, cantidad_item, rendimiento, hh_item')
      .eq('project_id', projectId).in('task_id', codigos);
    mcRows = data ?? [];
  }
  const items = [...new Set(mcRows.map(m => m.item_eco2).filter(Boolean))];
  const itemInfo = new Map<string, any>();
  if (items.length) {
    const { data } = await sb.from('mining_itemizado')
      .select('item, descripcion, unidad, cantidad, hh_unidad, partida_bmp')
      .eq('project_id', projectId).in('item', items);
    for (const it of data ?? []) itemInfo.set(it.item, it);
  }
  const mcByTask = new Map<string, any[]>();
  for (const m of mcRows) {
    const arr = mcByTask.get(m.task_id) ?? [];
    arr.push(m);
    mcByTask.set(m.task_id, arr);
  }

  // Deduplicar documentos (aconex exactos + planos catalogados)
  const docSet = new Map<string, { cod: string; titulo: string; rev: string; archivo: string }>();
  for (const d of docsRes.data ?? []) {
    if (d.n_cmdic) docSet.set(d.n_cmdic, { cod: d.n_cmdic, titulo: d.titulo ?? d.tipo_doc ?? '', rev: d.rev ?? '', archivo: d.archivo ?? '' });
  }
  for (const p of planosRes.data ?? []) {
    if (p.codigo_documento && !docSet.has(p.codigo_documento)) {
      docSet.set(p.codigo_documento, { cod: p.codigo_documento, titulo: p.descripcion ?? '', rev: '', archivo: '' });
    }
  }

  const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fn = (v: any) => v == null ? '—' : Math.round(Number(v)).toLocaleString('es-CL');
  const f1 = (v: any) => v == null ? '—' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: 1 });
  const fd = (v: any) => v ?? '—';

  const hhEst = Number(iwp.hh_estimadas ?? 0);
  const crew = iwp.crew_size ? Number(iwp.crew_size) : null;
  const turnos = crew && hhEst ? (hhEst / (crew * 11)) : null;

  const actHtml = actividades.map((a: any) => {
    const p = a.mining_programa ?? {};
    const mcs = mcByTask.get(p.cod_actividad) ?? [];
    const mcHtml = mcs.map(m => {
      const it = itemInfo.get(m.item_eco2);
      return `<tr class="mc">
        <td></td>
        <td colspan="2">Ítem ECO-2 <b>${esc(m.item_eco2)}</b> — ${esc(it?.descripcion ?? 'sin descripción en itemizado')}</td>
        <td>${f1(m.cantidad_item)} ${esc(it?.unidad ?? '')}</td>
        <td>${f1(m.rendimiento)}</td>
        <td>${fn(m.hh_item)}</td>
      </tr>`;
    }).join('');
    return `<tr>
      <td class="mono">${esc(p.cod_actividad)}</td>
      <td colspan="2">${esc(p.nombre_actividad)}</td>
      <td>${fd(p.fecha_inicio)} → ${fd(p.fecha_fin)}</td>
      <td>${p.cantidad != null ? `${f1(p.cantidad)} ${esc(p.unidad ?? '')}` : '—'}</td>
      <td><b>${fn(a.hh_asignadas_iwp)}</b> / ${fn(p.hh)}</td>
    </tr>${mcHtml}`;
  }).join('');

  const consHtml = constraints.length ? constraints.map((c: any) => `
    <tr>
      <td>${c.cleared ? '✅' : '⬜'}</td>
      <td>${esc(c.tipo)}</td>
      <td>${esc(c.descripcion)}</td>
      <td>${fd(c.fecha_necesaria)}</td>
      <td>${c.cleared ? `${fd(c.fecha_cleared)} · ${esc(c.despejado_por ?? '')}` : 'PENDIENTE'}</td>
    </tr>`).join('')
    : '<tr><td colspan="5" class="dim">Sin constraints registrados.</td></tr>';

  const docsHtml = docSet.size ? [...docSet.values()].map(d => `
    <tr><td class="mono">${esc(d.cod)}</td><td>${esc(d.titulo)}</td><td>${esc(d.rev)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="dim">Sin documentos vinculados al CWP.</td></tr>';

  const pendientes = constraints.filter((c: any) => !c.cleared).length;
  const elementos: string[] = (elemRes.data ?? []).map((e: any) => e.moniker);

  const scopeImgHtml = iwp.imagen_scope
    ? `<h2>Scope 3D del paquete</h2><img src="${iwp.imagen_scope}" alt="Scope 3D" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px">`
    : '';

  const elementosHtml = elementos.length
    ? `<h2>Elementos del modelo asignados (${elementos.length})</h2>
       <div style="columns:3;font-family:Consolas,monospace;font-size:9px;color:#475569">${elementos.map(esc).join('<br>')}</div>`
    : '';

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Ficha IWP ${esc(iwp.iwp_id)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; margin: 24px; }
  h1 { font-size: 18px; margin: 0; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #757575; border-bottom: 2px solid #FF0000; padding-bottom: 3px; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 3px 6px; }
  td { padding: 3px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .mono { font-family: Consolas, monospace; font-size: 10px; }
  .dim { color: #94a3b8; font-style: italic; }
  .mc td { background: #f8fafc; font-size: 10px; color: #475569; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #FF0000; padding-bottom: 10px; }
  .brand { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
  .brand .mark { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(135deg,#FF0000,#A00000); color: #fff; font-weight: 900; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .brand .name { font-size: 11px; font-weight: 800; letter-spacing: .08em; color: #1A1A1A; }
  .brand .name b { color: #FF0000; }
  .brand .tag { font-size: 7.5px; color: #757575; text-transform: uppercase; letter-spacing: .16em; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: 10px; background: #e2e8f0; }
  .warn { background: #fef3c7; color: #92400e; }
  .ok { background: #dcfce7; color: #166534; }
  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 12px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; }
  .kpi b { display: block; font-size: 15px; }
  .kpi span { font-size: 9px; text-transform: uppercase; color: #64748b; }
  .firmas { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 36px; }
  .firma { border-top: 1px solid #334155; padding-top: 4px; text-align: center; font-size: 10px; color: #475569; }
  @media print { .noprint { display: none; } body { margin: 10mm; } }
</style></head><body>
<div class="head">
  <div>
    <div class="brand">
      <div class="mark">H</div>
      <div>
        <div class="name">HILO <b>DIGITAL</b></div>
        <div class="tag">Gestión de la Información</div>
      </div>
    </div>
    <h1>IWP ${esc(iwp.iwp_id)}</h1>
    <div style="margin-top:4px">${esc(iwp.descripcion ?? '')}</div>
    <div class="dim" style="margin-top:2px">CWP ${esc(iwp.cwp_id)} — ${esc(cwp.cwp_nombre ?? '')} · ${esc(cwp.disciplina ?? '')} · CWA ${esc(cwp.cwa_id ?? '')} / CV ${esc(cwp.cv_id ?? '')}</div>
  </div>
  <div style="text-align:right">
    <span class="badge">${esc(iwp.status)}</span><br>
    <span class="badge ${pendientes ? 'warn' : 'ok'}" style="margin-top:4px">${pendientes ? `${pendientes} constraint(s) pendiente(s)` : 'Constraints despejados'}</span>
    <div class="dim" style="margin-top:6px">P333 Crecimiento Ujina · PG210 Puerto<br>Generado ${new Date().toISOString().slice(0, 10)}</div>
  </div>
</div>

<div class="kpis">
  <div class="kpi"><b>${fn(hhEst)}</b><span>HH estimadas</span></div>
  <div class="kpi"><b>${crew ?? '—'}</b><span>Cuadrilla</span></div>
  <div class="kpi"><b>${turnos != null ? f1(turnos) : '—'}</b><span>Turnos de 11 h</span></div>
  <div class="kpi"><b>${fd(iwp.fecha_inicio_plan)}</b><span>Inicio plan</span></div>
  <div class="kpi"><b>${fd(iwp.fecha_fin_plan)}</b><span>Fin plan</span></div>
</div>

${scopeImgHtml}

<h2>Actividades del programa y cantidades de cobro (MC ↔ ECO-2)</h2>
<table>
  <tr><th>Actividad P6</th><th colspan="2">Descripción / ítem de cobro</th><th>Fechas · Cantidad</th><th>Cant. / Rend.</th><th>HH IWP / total</th></tr>
  ${actHtml || '<tr><td colspan="6" class="dim">Sin actividades asignadas.</td></tr>'}
</table>

<h2>Constraints (restricciones antes de ejecutar)</h2>
<table>
  <tr><th></th><th>Tipo</th><th>Descripción</th><th>Necesario antes de</th><th>Estado</th></tr>
  ${consHtml}
</table>

<h2>Documentos / planos vigentes del CWP</h2>
<table>
  <tr><th>Código CMDIC</th><th>Título</th><th>Rev</th></tr>
  ${docsHtml}
</table>

${elementosHtml}

<h2>Información de emergencia y seguridad (completar según HSE del contrato)</h2>
<table>
  <tr><th>Concepto</th><th>Dato</th></tr>
  <tr><td>Emergencias faena CMDIC</td><td>______________________ (radio / anexo)</td></tr>
  <tr><td>Supervisor responsable del turno</td><td>______________________ · Tel: ______________</td></tr>
  <tr><td>Punto de encuentro / zona segura</td><td>______________________</td></tr>
  <tr><td>Permisos requeridos</td><td>${constraints.filter((c: any) => c.tipo === 'PERMISO').map((c: any) => esc(c.descripcion)).join(' · ') || 'Permiso de trabajo estándar'}</td></tr>
</table>

<div class="firmas">
  <div class="firma">Supervisor / Capataz</div>
  <div class="firma">Oficina Técnica (AWP)</div>
  <div class="firma">Prevención / Calidad</div>
</div>

<div class="noprint" style="margin-top:24px">
  <button onclick="window.print()" style="background:#FF0000;color:#fff;border:0;border-radius:999px;padding:10px 24px;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(255,0,0,.25)">Imprimir / Guardar PDF</button>
</div>
</body></html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
