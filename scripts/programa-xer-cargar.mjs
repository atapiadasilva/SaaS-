/**
 * Carga un cronograma Primavera P6 (.xer) a `mining_programa` y sus relaciones lógicas a
 * `mining_programa_relacion`.
 *
 * A diferencia del cargador del data pack, el CWP NO se deduce: el .xer del Rev.0 trae códigos de
 * actividad `SCPY-BHP-CWP` y `SCPY-BHP-CWA`, que son la asignación del planificador. Se leen de
 * ACTVTYPE → ACTVCODE → TASKACTV y se traducen al código de Hilo con el diccionario del catálogo.
 *
 * `fuente` se escribe como 'P333' porque es lo único que lee la aplicación (ver CLAUDE.md): si se
 * carga con otro valor, el proyecto aparece sin programa.
 *
 * Las cantidades salen de la Matriz de Correlación, que las trae por partida con su ID P6. Una
 * actividad puede tener varias partidas: se suman SOLO si comparten unidad — sumar metros con
 * kilos daría un número que parece dato y no lo es.
 *
 * Uso:
 *   node --env-file=.env.local scripts/programa-xer-cargar.mjs <archivo.xer> <project_id> [--aplicar]
 *     --matriz=ruta.xlsx     Matriz de Correlación, para traer cantidad y unidad por actividad
 *     --catalogo=ruta.xlsx   Excel con la hoja "P1 Catálogo CWP" (diccionario CWP legado → Hilo)
 *     --fuente=P333          Etiqueta de origen (por defecto P333)
 */
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const opt = (n, d = '') => (args.find(a => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=') || d;
const [ARCHIVO, PROJECT_ID] = args.filter(a => !a.startsWith('--'));
if (!ARCHIVO || !PROJECT_ID) {
  console.error('Uso: programa-xer-cargar.mjs <archivo.xer> <project_id> [--aplicar] [--matriz=…] [--catalogo=…]');
  process.exit(1);
}
const FUENTE = opt('fuente', 'P333');
const MATRIZ = opt('matriz', null);
const CATALOGO = opt('catalogo', 'C:\\Users\\atapiad\\Downloads\\EIMI00418_SCPY_Paquetes_HiloDigital.xlsx');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
/** El .xer entrega las fechas en ISO ("2026-07-03 08:00"), no en formato de EE.UU. */
const fecha = (v) => { const s = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };

// ── Parseo del .xer ─────────────────────────────────────────────────────────
const tablas = {};
{
  let t = '', campos = [];
  for (const l of fs.readFileSync(ARCHIVO, 'latin1').split(/\r?\n/)) {
    if (l.startsWith('%T')) { t = l.split('\t')[1]?.trim(); tablas[t] = []; }
    else if (l.startsWith('%F')) campos = l.split('\t').slice(1).map(c => c.trim());
    else if (l.startsWith('%R')) {
      const v = l.split('\t').slice(1);
      tablas[t].push(Object.fromEntries(campos.map((c, i) => [c, (v[i] ?? '').trim()])));
    }
  }
}
const tasks = tablas['TASK'] ?? [];
console.log(`${tasks.length} actividades · ${(tablas['TASKPRED'] ?? []).length} relaciones · ${(tablas['TASKACTV'] ?? []).length} códigos asignados`);

// ── Códigos de actividad: de ahí sale el CWP declarado por el planificador ──
const tiposCod = Object.fromEntries((tablas['ACTVTYPE'] ?? []).map(a => [a.actv_code_type_id, a.actv_code_type]));
const valores = Object.fromEntries((tablas['ACTVCODE'] ?? []).map(a => [a.actv_code_id, a]));
const codsPorTarea = new Map();
for (const a of tablas['TASKACTV'] ?? []) {
  const c = valores[a.actv_code_id]; if (!c) continue;
  if (!codsPorTarea.has(a.task_id)) codsPorTarea.set(a.task_id, {});
  codsPorTarea.get(a.task_id)[tiposCod[c.actv_code_type_id]] = c.short_name;
}
const K_CWP = Object.values(tiposCod).find(t => /CWP/i.test(t));
const K_ETAPA = Object.values(tiposCod).find(t => /ETAPA/i.test(t));
console.log(`  código de CWP en el .xer: ${K_CWP ?? '(no hay)'}`);

// ── Diccionario CWP legado → Hilo ───────────────────────────────────────────
const p1 = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(CATALOGO), { type: 'buffer' }).Sheets['P1 Catálogo CWP'], { defval: '', raw: false });
const aHilo = new Map(p1.map(r => [String(r.CWP).trim(), String(r.CWP_hilo).trim()]));
const { data: cat } = await sb.from('mining_cwp').select('cwp_id, cwa_id, cv_id').eq('project_id', PROJECT_ID);
const catPorId = new Map((cat ?? []).map(c => [c.cwp_id, c]));

// ── Cantidades desde la Matriz de Correlación ───────────────────────────────
const cantPorAct = new Map();
if (MATRIZ && fs.existsSync(MATRIZ)) {
  const wb = XLSX.read(fs.readFileSync(MATRIZ), { type: 'buffer' });
  const hoja = wb.Sheets[wb.SheetNames.find(n => /correlaci/i.test(n)) ?? wb.SheetNames[0]];
  const bruto = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: true });
  const iHdr = bruto.findIndex(r => r.some(c => String(c).trim() === 'ID P6'));
  const hdr = (bruto[iHdr] ?? []).map(c => String(c ?? '').trim());
  const col = (re) => hdr.findIndex(h => re.test(h));
  const iId = col(/^ID P6$/i), iCant = col(/^Cant/i), iUni = col(/^Unid/i);
  const acum = new Map();
  for (const r of bruto.slice(iHdr + 1)) {
    const id = String(r[iId] ?? '').trim(); if (!id) continue;
    const c = num(r[iCant]); const u = String(r[iUni] ?? '').trim();
    if (c == null || !u) continue;
    if (!acum.has(id)) acum.set(id, new Map());
    acum.get(id).set(u, (acum.get(id).get(u) ?? 0) + c);
  }
  // Solo se acepta la cantidad si la actividad tiene UNA sola unidad.
  let mixtas = 0;
  for (const [id, unidades] of acum) {
    if (unidades.size === 1) { const [u, c] = [...unidades][0]; cantPorAct.set(id, { cantidad: c, unidad: u }); }
    else mixtas++;
  }
  console.log(`  Matriz de Correlación: ${acum.size} actividades con cantidad · ${cantPorAct.size} con unidad única · ${mixtas} con unidades mezcladas (se omiten)`);
}

// ── Armado de actividades ───────────────────────────────────────────────────
const TIPO = { TT_Task: 'Tarea', TT_Mile: 'Hito inicio', TT_FinMile: 'Hito término', TT_LOE: 'Nivel de esfuerzo', TT_Rsrc: 'Dependiente de recurso' };
const wbsPorId = Object.fromEntries((tablas['PROJWBS'] ?? []).map(w => [w.wbs_id, w.wbs_name]));
const filas = [], porTareaCod = new Map();
let conCwp = 0, cwpFuera = 0, conCant = 0;
const fueraSet = new Set();
for (const a of tasks) {
  const cod = String(a.task_code ?? '').trim();
  if (!cod) continue;
  porTareaCod.set(a.task_id, cod);
  const cods = codsPorTarea.get(a.task_id) ?? {};
  const legado = K_CWP ? cods[K_CWP] : null;
  let cwp = null;
  if (legado) {
    const h = aHilo.get(String(legado).trim());
    if (h && catPorId.has(h)) { cwp = h; conCwp++; }
    else { cwpFuera++; fueraSet.add(legado); }
  }
  const c = catPorId.get(cwp ?? '');
  const q = cantPorAct.get(cod);
  if (q) conCant++;
  const ini = fecha(a.target_start_date ?? a.early_start_date);
  const fin = fecha(a.target_end_date ?? a.early_end_date);
  filas.push({
    project_id: PROJECT_ID,
    cod_actividad: cod,
    nombre_actividad: String(a.task_name ?? '').trim() || null,
    hh: num(a.target_work_qty) ?? 0,
    fecha_inicio: ini,
    fecha_fin: fin,
    duracion_dias: ini && fin ? Math.max(0, Math.round((new Date(fin) - new Date(ini)) / 86400000)) : null,
    tipo: TIPO[a.task_type] ?? a.task_type ?? null,
    cwp_id: cwp,
    cwa_id: c?.cwa_id ?? null,
    cv_id: c?.cv_id ?? null,
    sector: K_ETAPA ? (cods[K_ETAPA] ?? null) : null,
    wbs: wbsPorId[a.wbs_id] ?? null,
    cantidad: q?.cantidad ?? null,
    unidad: q?.unidad ?? null,
    fuente: FUENTE,
  });
}

// ── Relaciones ──────────────────────────────────────────────────────────────
const relaciones = [];
const vistas = new Set();
for (const r of tablas['TASKPRED'] ?? []) {
  const pred = porTareaCod.get(r.pred_task_id), suc = porTareaCod.get(r.task_id);
  if (!pred || !suc) continue;
  const tipo = String(r.pred_type ?? '').trim() || null;
  const k = `${pred}|${suc}|${tipo}`;
  if (vistas.has(k)) continue;
  vistas.add(k);
  relaciones.push({
    project_id: PROJECT_ID, fuente: FUENTE, pred_codigo: pred, suc_codigo: suc,
    tipo, lag_dias: num(r.lag_hr_cnt) != null ? Number(r.lag_hr_cnt) / 8 : null,
  });
}

// ── Informe ─────────────────────────────────────────────────────────────────
const hh = filas.reduce((s, f) => s + (f.hh || 0), 0);
console.log(`\nA cargar: ${filas.length} actividades · ${relaciones.length} relaciones`);
console.log(`  con CWP declarado en el cronograma : ${conCwp}`);
console.log(`  con CWP fuera del catálogo         : ${cwpFuera}${fueraSet.size ? `  → ${[...fueraSet].join(', ')}` : ''}`);
console.log(`  con cantidad y unidad              : ${conCant}`);
console.log(`  HH totales                         : ${Math.round(hh).toLocaleString('es-CL')}`);
const cwps = new Set(filas.map(f => f.cwp_id).filter(Boolean));
console.log(`  CWP cubiertos                      : ${cwps.size} de ${cat?.length ?? 0}`);

if (!APLICAR) { console.log('\nSimulación. Repite con --aplicar para escribir.'); process.exit(0); }

console.log('\nEscribiendo…');
for (const [tabla, datos] of [['mining_programa', filas], ['mining_programa_relacion', relaciones]]) {
  const { error: eDel } = await sb.from(tabla).delete().eq('project_id', PROJECT_ID).eq('fuente', FUENTE);
  if (eDel) { console.error(`  error al limpiar ${tabla}: ${eDel.message}`); process.exit(1); }
  let n = 0;
  for (let i = 0; i < datos.length; i += 500) {
    const lote = datos.slice(i, i + 500);
    const { error } = await sb.from(tabla).insert(lote);
    if (error) { console.error(`  error en ${tabla}: ${error.message}`); process.exit(1); }
    n += lote.length;
  }
  console.log(`  ${tabla}: ${n}`);
}
