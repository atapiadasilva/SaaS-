import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listLocalDocNums } from '@/lib/aconex-local';

// GET /api/mining-reporte/html?project_id=...
// Genera un HTML standalone con toda la data AWP (CWA→CV→CWP, planos, itemizado, programa).
// Los links de planos apuntan a http://localhost:3000/api/mining-planos/file (requiere que el
// servidor esté corriendo y el usuario logueado). Descargar con Ctrl+S desde el browser.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const sb = supabase as any;
  const [cwaRes, cvRes, cwpRes, discRes, planosRes, itemizadoRes, programaRes, elementosRes] = await Promise.all([
    sb.from('mining_cwa').select('*').eq('project_id', projectId).order('cwa_id'),
    sb.from('mining_cv').select('*').eq('project_id', projectId).order('cv_id'),
    sb.from('mining_cwp').select('*').eq('project_id', projectId).order('cwa_id').order('cv_id').order('cwp_id'),
    sb.from('mining_disciplinas').select('*').eq('project_id', projectId),
    sb.from('mining_planos').select('*').eq('project_id', projectId),
    // Ítems de cobro desde el itemizado (ECO-2), que es lo que llenan el onboarding y el
    // data pack. El modelo antiguo (mining_pwp + mining_partidas) solo existía en Collahuasi.
    sb.from('mining_itemizado')
      .select('item, descripcion, obra, unidad, cantidad, pu_clp, p_total_clp, cwp_id')
      .eq('project_id', projectId).order('item'),
    sb.from('mining_programa').select('*').eq('project_id', projectId).eq('fuente', 'P333'),
    sb.rpc('mining_cwp_element_counts', { p_project_id: projectId }),
  ]);

  const localDocs = listLocalDocNums();

  const PAL = ['#1565C0','#1E88E5','#78909C','#6A1B9A','#8D6E63','#E65100','#00695C','#AD1457','#F9A825','#FB8C00','#5E35B1','#C9A100','#E53935','#283593','#546E7A'];
  const discColor = new Map<string, string>();
  (discRes.data ?? []).forEach((d: any, i: number) => discColor.set(d.disciplina_cod, PAL[i % PAL.length]));

  const planosByCwp = new Map<string, any[]>();
  for (const p of planosRes.data ?? []) {
    const arr = planosByCwp.get(p.cwp_id) ?? [];
    arr.push({ doc: p.codigo_documento, de: p.descripcion, ti: p.tipo, tieneArchivo: localDocs.has(p.codigo_documento) });
    planosByCwp.set(p.cwp_id, arr);
  }

  const itemsByCwp = new Map<string, any[]>();
  for (const it of itemizadoRes.data ?? []) {
    if (!it.cwp_id) continue;
    const arr = itemsByCwp.get(it.cwp_id) ?? [];
    arr.push({ co: it.item, de: it.descripcion, ob: it.obra, un: it.unidad, qt: it.cantidad, pu: it.pu_clp, tot: it.p_total_clp });
    itemsByCwp.set(it.cwp_id, arr);
  }

  const programaByCwp = new Map<string, any[]>();
  for (const t of programaRes.data ?? []) {
    const arr = programaByCwp.get(t.cwp_id) ?? [];
    arr.push({ id: t.id, n: t.nombre_actividad, hh: t.hh, s: t.fecha_inicio, e: t.fecha_fin, code: t.cod_actividad });
    programaByCwp.set(t.cwp_id, arr);
  }

  const elementosCount = new Map<string, number>();
  for (const e of elementosRes.data ?? []) elementosCount.set(e.cwp_id, Number(e.n));

  const cwpList = (cwpRes.data ?? []).map((c: any) => {
    const items = itemsByCwp.get(c.cwp_id) ?? [];
    const planos = planosByCwp.get(c.cwp_id) ?? [];
    const tasks = programaByCwp.get(c.cwp_id) ?? [];
    const hh = tasks.reduce((s: number, t: any) => s + (t.hh ?? 0), 0);
    const start = tasks.map((t: any) => t.s).filter(Boolean).sort()[0] ?? null;
    const end = tasks.map((t: any) => t.e).filter(Boolean).sort().slice(-1)[0] ?? null;
    const costo = c.costo_oferta_clp ?? 0;
    const cvData = (cvRes.data ?? []).find((v: any) => v.cv_id === c.cv_id);
    return {
      cwa: c.cwa_id, cv: c.cv_id, cvName: cvData?.cv_nombre ?? '',
      disc: c.disciplina_cod, dn: c.disciplina, cwp: c.cwp_id, ewp: c.ewp_id ?? '',
      nombre: c.cwp_nombre ?? '', alcance: c.alcance ?? '',
      color: discColor.get(c.disciplina_cod) ?? '#1565C0',
      costo, items, planos,
      prog: tasks.length ? { hh, acts: tasks.length, start, end, tasks } : null,
      nElementos: elementosCount.get(c.cwp_id) ?? 0,
    };
  });

  const cwaList = (cwaRes.data ?? []).map((c: any) => ({ id: c.cwa_id, name: c.cwa_nombre ?? c.cwa_id }));
  const cvList = (cvRes.data ?? []).map((c: any) => ({ id: c.cv_id, name: c.cv_nombre ?? c.cv_id, cwa: c.cwa_id }));

  const totalCosto = cwpList.reduce((s: number, c: any) => s + c.costo, 0);
  const totalHH = programaRes.data?.reduce((s: number, t: any) => s + (t.hh ?? 0), 0) ?? 0;
  const totalPlanos = planosRes.data?.length ?? 0;
  const totalPartidas = itemizadoRes.data?.length ?? 0;

  const data = { cwp: cwpList, cwa: cwaList, cv: cvList, baseUrl, kpi: { costo: totalCosto, hh: totalHH, planos: totalPlanos, partidas: totalPartidas } };
  const html = buildHtml(data);

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="reporte-awp-${new Date().toISOString().slice(0,10)}.html"`,
    },
  });
}

function buildHtml(data: any): string {
  const json = JSON.stringify(data);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reporte AWP — EISA/CMDIC</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;font-size:14px;min-height:100vh}
a{color:#60a5fa;text-decoration:none}a:hover{text-decoration:underline}
/* Layout */
#app{display:flex;flex-direction:column;height:100vh}
#topbar{background:#1e293b;border-bottom:1px solid #334155;padding:12px 20px;display:flex;align-items:center;gap:16px;flex-shrink:0}
#topbar h1{font-size:16px;font-weight:700;color:#f1f5f9;letter-spacing:.5px}
#topbar .tag{font-size:11px;background:#0f172a;border:1px solid #334155;color:#94a3b8;padding:2px 8px;border-radius:4px}
#kpis{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
.kpi{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:8px 16px;text-align:center;min-width:100px}
.kpi .val{font-size:18px;font-weight:700;color:#60a5fa}
.kpi .lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
#layout{display:flex;flex:1;overflow:hidden}
/* Sidebar */
#sidebar{width:280px;background:#1e293b;border-right:1px solid #334155;overflow-y:auto;flex-shrink:0;padding:8px 0}
#searchbar{padding:8px 12px}
#searchbar input{width:100%;background:#0f172a;border:1px solid #334155;color:#e2e8f0;border-radius:6px;padding:6px 10px;font-size:13px;outline:none}
#searchbar input:focus{border-color:#60a5fa}
.nav-cwa{border-bottom:1px solid #1e3a5f}
.nav-cwa-hdr{display:flex;align-items:center;padding:8px 12px;cursor:pointer;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;user-select:none;gap:6px}
.nav-cwa-hdr:hover{background:#0f172a}
.nav-cwa-hdr .arrow{font-size:10px;transition:transform .2s;margin-left:auto}
.nav-cwa-hdr.open .arrow{transform:rotate(90deg)}
.nav-cv{display:none;padding-left:8px}
.nav-cv.open{display:block}
.nav-cv-hdr{display:flex;align-items:center;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:600;color:#cbd5e1;user-select:none;gap:6px;border-radius:6px}
.nav-cv-hdr:hover{background:#0f172a}
.nav-cv-hdr .arrow{font-size:9px;transition:transform .2s;margin-left:auto}
.nav-cv-hdr.open .arrow{transform:rotate(90deg)}
.nav-cwp-list{display:none;padding-left:8px}
.nav-cwp-list.open{display:block}
.nav-cwp-item{padding:5px 12px;cursor:pointer;font-size:12px;color:#64748b;border-radius:6px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav-cwp-item:hover{background:#0f172a;color:#e2e8f0}
.nav-cwp-item.active{background:#1e3a5f;color:#60a5fa;font-weight:600}
.nav-cwp-disc{width:8px;height:8px;border-radius:50%;flex-shrink:0}
/* Main */
#main{flex:1;overflow-y:auto;padding:20px}
#placeholder{display:flex;align-items:center;justify-content:center;height:100%;color:#334155;font-size:18px;font-weight:600;letter-spacing:.5px}
/* CWP Detail */
#detail{display:none}
#detail.show{display:block}
.detail-hdr{display:flex;align-items:flex-start;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.detail-hdr h2{font-size:18px;font-weight:700;color:#f1f5f9;flex:1;min-width:200px}
.disc-badge{display:inline-flex;align-items:center;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;color:#fff;white-space:nowrap}
.detail-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.meta-chip{background:#1e293b;border:1px solid #334155;border-radius:6px;padding:4px 10px;font-size:12px;color:#94a3b8;display:flex;gap:4px;align-items:center}
.meta-chip span{color:#e2e8f0;font-weight:600}
.alcance{background:#1e293b;border-left:3px solid #60a5fa;padding:10px 14px;border-radius:0 6px 6px 0;color:#94a3b8;font-size:13px;margin-bottom:16px;line-height:1.5}
/* Tabs */
.tabs{display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid #334155;padding-bottom:0}
.tab{padding:8px 16px;cursor:pointer;font-size:13px;font-weight:600;color:#64748b;border-radius:6px 6px 0 0;border-bottom:2px solid transparent;margin-bottom:-1px;user-select:none}
.tab:hover{color:#94a3b8}
.tab.active{color:#60a5fa;border-bottom-color:#60a5fa}
.tab-panel{display:none}
.tab-panel.active{display:block}
/* Tables */
.tbl-wrap{overflow-x:auto;border-radius:8px;border:1px solid #334155}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#1e293b;color:#64748b;text-align:left;padding:8px 10px;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.5px;white-space:nowrap}
td{padding:7px 10px;color:#cbd5e1;border-top:1px solid #1e293b;vertical-align:top}
tr:hover td{background:#1e293b55}
.num{text-align:right;font-family:monospace;font-size:12px}
.total-row td{background:#1e3a5f;color:#e2e8f0;font-weight:700;border-top:2px solid #60a5fa}
/* No-data */
.empty{color:#334155;text-align:center;padding:32px;font-size:13px}
/* Tags */
.tipo-tag{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#1e3a5f;color:#60a5fa}
.tipo-tag.DW{background:#1a3a1a;color:#4ade80}
.tipo-tag.SP{background:#2a1a3a;color:#c084fc}
/* Gantt dates */
.date-chip{display:inline-block;background:#0f172a;border:1px solid #334155;padding:2px 6px;border-radius:4px;font-size:11px;font-family:monospace;white-space:nowrap}
/* Scrollbar */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:#0f172a}
::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#475569}
/* Print */
@media print{#sidebar{display:none}#main{overflow:visible}#app{height:auto}#layout{overflow:visible}#topbar #kpis{display:none}}
/* Hidden flag */
.hidden{display:none!important}
</style>
</head>
<body>
<div id="app">
  <div id="topbar">
    <h1>AWP &mdash; EISA / CMDIC</h1>
    <span class="tag" id="gen-date"></span>
    <div id="kpis">
      <div class="kpi"><div class="val" id="kpi-costo"></div><div class="lbl">Costo Oferta</div></div>
      <div class="kpi"><div class="val" id="kpi-hh"></div><div class="lbl">HH Programa</div></div>
      <div class="kpi"><div class="val" id="kpi-cwp"></div><div class="lbl">CWPs</div></div>
      <div class="kpi"><div class="val" id="kpi-planos"></div><div class="lbl">Planos</div></div>
      <div class="kpi"><div class="val" id="kpi-partidas"></div><div class="lbl">Partidas</div></div>
    </div>
  </div>
  <div id="layout">
    <div id="sidebar">
      <div id="searchbar"><input id="q" type="text" placeholder="Buscar CWP…" oninput="filter(this.value)"></div>
      <div id="nav"></div>
    </div>
    <div id="main">
      <div id="placeholder">Selecciona un CWP del árbol</div>
      <div id="detail"></div>
    </div>
  </div>
</div>
<script>
const RAW=${json};
const { cwp:CWP, cwa:CWA, cv:CV, baseUrl:BASE, kpi:KPI } = RAW;

// ─── Formatters ────────────────────────────────────────────────────────────
const fmtCLP = n => n >= 1e9
  ? (n/1e9).toFixed(2)+' MM CLP'
  : n >= 1e6
  ? (n/1e6).toFixed(1)+' M CLP'
  : n.toLocaleString('es-CL')+' CLP';
const fmtNum = n => (n??0).toLocaleString('es-CL');
const fmtHH  = h => h >= 1000 ? (h/1000).toFixed(1)+'K HH' : fmtNum(h)+' HH';
const fmtDate = s => { if(!s)return '—'; const d=new Date(s); return d.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'}); };
const escH = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ─── KPIs ──────────────────────────────────────────────────────────────────
document.getElementById('gen-date').textContent = 'Generado ' + new Date().toLocaleDateString('es-CL');
document.getElementById('kpi-costo').textContent = fmtCLP(KPI.costo);
document.getElementById('kpi-hh').textContent = fmtHH(KPI.hh);
document.getElementById('kpi-cwp').textContent = CWP.length;
document.getElementById('kpi-planos').textContent = KPI.planos;
document.getElementById('kpi-partidas').textContent = KPI.partidas;

// ─── Nav Tree ──────────────────────────────────────────────────────────────
let activeCwp = null;
function buildNav(cwpList) {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  const grouped = {};
  for(const c of cwpList){
    (grouped[c.cwa] ??= {})[c.cv] ??= [];
    grouped[c.cwa][c.cv].push(c);
  }
  for(const cwaId of Object.keys(grouped).sort()){
    const cwaData = CWA.find(x=>x.id===cwaId);
    const cwaLabel = cwaData ? cwaData.name : cwaId;
    const cwaEl = document.createElement('div');
    cwaEl.className='nav-cwa';
    const cwaCvs = grouped[cwaId];
    let cwaHtml = \`<div class="nav-cwa-hdr" onclick="toggleCwa(this)">\`;
    cwaHtml += \`<span>🏗 \${escH(cwaLabel)}</span><span class="arrow">▶</span></div>\`;
    cwaHtml += \`<div class="nav-cv">\`;
    for(const cvId of Object.keys(cwaCvs).sort()){
      const cvData = CV.find(x=>x.id===cvId);
      const cvLabel = cvData ? cvData.name : cvId;
      cwaHtml += \`<div class="nav-cv-hdr" onclick="toggleCv(this)">\${escH(cvLabel)}<span class="arrow">▶</span></div>\`;
      cwaHtml += \`<div class="nav-cwp-list">\`;
      for(const c of cwaCvs[cvId]){
        cwaHtml += \`<div class="nav-cwp-item" data-cwp="\${escH(c.cwp)}" onclick="selectCwp('\${escH(c.cwp)}')">\`;
        cwaHtml += \`<div class="nav-cwp-disc" style="background:\${escH(c.color)}"></div>\`;
        cwaHtml += \`\${escH(c.cwp)}</div>\`;
      }
      cwaHtml += \`</div>\`;
    }
    cwaHtml += \`</div>\`;
    cwaEl.innerHTML = cwaHtml;
    nav.appendChild(cwaEl);
  }
}
buildNav(CWP);

function toggleCwa(hdr){
  hdr.classList.toggle('open');
  hdr.nextElementSibling.classList.toggle('open');
}
function toggleCv(hdr){
  hdr.classList.toggle('open');
  hdr.nextElementSibling.classList.toggle('open');
}

function filter(q){
  const lo = q.toLowerCase().trim();
  const filtered = lo ? CWP.filter(c =>
    c.cwp.toLowerCase().includes(lo) ||
    c.nombre.toLowerCase().includes(lo) ||
    c.dn?.toLowerCase().includes(lo) ||
    c.cv.toLowerCase().includes(lo) ||
    c.cwa.toLowerCase().includes(lo)
  ) : CWP;
  buildNav(filtered);
  // Auto-open all when filtering
  if(lo){
    document.querySelectorAll('.nav-cwa-hdr').forEach(h=>{ h.classList.add('open'); h.nextElementSibling.classList.add('open'); });
    document.querySelectorAll('.nav-cv-hdr').forEach(h=>{ h.classList.add('open'); h.nextElementSibling.classList.add('open'); });
  }
}

// ─── Detail ────────────────────────────────────────────────────────────────
function selectCwp(cwpId){
  activeCwp = cwpId;
  document.querySelectorAll('.nav-cwp-item').forEach(el=>{
    el.classList.toggle('active', el.dataset.cwp===cwpId);
  });
  const c = CWP.find(x=>x.cwp===cwpId);
  if(!c) return;
  document.getElementById('placeholder').style.display='none';
  const detail = document.getElementById('detail');
  detail.className='show';

  const totalItems = c.items.reduce((s,i)=>s+(i.tot??0),0);
  const planosConArchivo = c.planos.filter(p=>p.tieneArchivo).length;

  let html = \`<div class="detail-hdr">\`;
  html += \`<div style="flex:1"><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
    <h2>\${escH(c.cwp)}</h2>
    <span class="disc-badge" style="background:\${escH(c.color)}">\${escH(c.disc)} — \${escH(c.dn)}</span>
  </div>
  <div style="color:#94a3b8;font-size:13px;margin-bottom:8px">\${escH(c.nombre)}</div>\`;

  html += \`<div class="detail-meta">
    <div class="meta-chip">CWA <span>\${escH(c.cwa)}</span></div>
    <div class="meta-chip">CV <span>\${escH(c.cv)}</span></div>
    \${c.ewp ? \`<div class="meta-chip">EWP <span>\${escH(c.ewp)}</span></div>\` : ''}
    <div class="meta-chip">Costo <span>\${fmtCLP(c.costo)}</span></div>
    <div class="meta-chip">Elementos BIM <span>\${fmtNum(c.nElementos)}</span></div>
    \${c.prog ? \`<div class="meta-chip">HH <span>\${fmtHH(c.prog.hh)}</span></div>
    <div class="meta-chip">Inicio <span>\${fmtDate(c.prog.start)}</span></div>
    <div class="meta-chip">Fin <span>\${fmtDate(c.prog.end)}</span></div>\` : ''}
    <div class="meta-chip">Planos <span>\${c.planos.length} (\${planosConArchivo} con PDF)</span></div>
    <div class="meta-chip">Partidas <span>\${c.items.length}</span></div>
  </div>\`;

  if(c.alcance) html += \`<div class="alcance">\${escH(c.alcance)}</div>\`;
  html += \`</div></div>\`;

  // Tabs
  html += \`<div class="tabs">
    <div class="tab active" onclick="showTab(this,'tab-planos')">📄 Planos (\${c.planos.length})</div>
    <div class="tab" onclick="showTab(this,'tab-items')">📋 Itemizado (\${c.items.length})</div>
    <div class="tab" onclick="showTab(this,'tab-prog')">📅 Programa (\${c.prog ? c.prog.acts : 0})</div>
  </div>\`;

  // Planos
  html += \`<div id="tab-planos" class="tab-panel active">\`;
  if(!c.planos.length){ html += \`<div class="empty">Sin planos vinculados</div>\`; }
  else {
    html += \`<div class="tbl-wrap"><table>
      <thead><tr><th>Código</th><th>Descripción</th><th>Tipo</th><th>Archivo</th></tr></thead><tbody>\`;
    for(const p of c.planos){
      const tipoClass = p.ti==='DW'?'DW':p.ti==='SP'?'SP':'';
      html += \`<tr><td style="font-family:monospace;font-size:11px">\${escH(p.doc)}</td>
        <td>\${escH(p.de)}</td>
        <td><span class="tipo-tag \${tipoClass}">\${escH(p.ti??'—')}</span></td>
        <td>\${p.tieneArchivo
          ? \`<a href="\${escH(BASE)}/api/mining-planos/file?codigo_documento=\${encodeURIComponent(p.doc)}" target="_blank">🔗 Abrir PDF</a>\`
          : \`<span style="color:#334155;font-size:11px">sin archivo</span>\`
        }</td></tr>\`;
    }
    html += \`</tbody></table></div>\`;
  }
  html += \`</div>\`;

  // Itemizado
  html += \`<div id="tab-items" class="tab-panel">\`;
  if(!c.items.length){ html += \`<div class="empty">Sin partidas vinculadas</div>\`; }
  else {
    html += \`<div class="tbl-wrap"><table>
      <thead><tr><th>Código</th><th>Descripción</th><th>Obra</th><th>Unidad</th><th class="num">Cantidad</th><th class="num">P.U. (CLP)</th><th class="num">Total (CLP)</th></tr></thead><tbody>\`;
    for(const it of c.items){
      html += \`<tr><td style="font-family:monospace;font-size:11px">\${escH(it.co)}</td>
        <td>\${escH(it.de)}</td>
        <td>\${escH(it.ob??'')}</td>
        <td><b>\${escH(it.un??'')}</b></td>
        <td class="num">\${fmtNum(it.qt)}</td>
        <td class="num">\${fmtNum(it.pu)}</td>
        <td class="num">\${fmtNum(it.tot)}</td></tr>\`;
    }
    html += \`<tr class="total-row"><td colspan="4">TOTAL</td>
      <td class="num">—</td><td class="num">—</td>
      <td class="num">\${fmtNum(totalItems)}</td></tr>\`;
    html += \`</tbody></table></div>\`;
  }
  html += \`</div>\`;

  // Programa
  html += \`<div id="tab-prog" class="tab-panel">\`;
  if(!c.prog){ html += \`<div class="empty">Sin actividades en programa</div>\`; }
  else {
    const allDates = c.prog.tasks.flatMap(t=>[t.s,t.e]).filter(Boolean).sort();
    const minD = allDates[0] ? new Date(allDates[0]).getTime() : 0;
    const maxD = allDates.slice(-1)[0] ? new Date(allDates.slice(-1)[0]).getTime() : 0;
    const span = maxD - minD || 1;
    html += \`<div class="tbl-wrap"><table>
      <thead><tr><th>Código</th><th>Actividad</th><th class="num">HH</th><th>Inicio</th><th>Fin</th><th style="min-width:200px">Línea de Tiempo</th></tr></thead><tbody>\`;
    for(const t of c.prog.tasks){
      const left = t.s ? ((new Date(t.s).getTime()-minD)/span*100).toFixed(1) : 0;
      const width = (t.s && t.e) ? (((new Date(t.e).getTime()-new Date(t.s).getTime())/span)*100).toFixed(1) : 2;
      html += \`<tr>
        <td style="font-family:monospace;font-size:11px">\${escH(t.code??'')}</td>
        <td>\${escH(t.n)}</td>
        <td class="num">\${fmtNum(t.hh)}</td>
        <td><span class="date-chip">\${fmtDate(t.s)}</span></td>
        <td><span class="date-chip">\${fmtDate(t.e)}</span></td>
        <td><div style="background:#1e293b;border-radius:4px;height:12px;position:relative;overflow:hidden">
          <div style="position:absolute;left:\${left}%;width:max(\${width}%,2px);height:100%;background:#60a5fa;border-radius:3px;opacity:.85"></div>
        </div></td>
      </tr>\`;
    }
    html += \`</tbody></table></div>\`;
  }
  html += \`</div>\`;

  detail.innerHTML = html;
}

function showTab(tabEl, panelId){
  tabEl.closest('.tabs').querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  tabEl.classList.add('active');
  const detail = document.getElementById('detail');
  detail.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  detail.querySelector('#'+panelId).classList.add('active');
}

// Auto-select first CWP
if(CWP.length){
  const first = CWP[0];
  // Open its CWA and CV
  setTimeout(()=>{
    const item = document.querySelector('[data-cwp="'+first.cwp+'"]');
    if(item){
      let p = item.parentElement;
      while(p && p.id!=='nav'){
        if(p.classList.contains('nav-cwp-list')||p.classList.contains('nav-cv')){
          p.classList.add('open');
          p.previousElementSibling?.classList.add('open');
        }
        p=p.parentElement;
      }
    }
    selectCwp(first.cwp);
  },50);
}
</script>
</body>
</html>`;
}
