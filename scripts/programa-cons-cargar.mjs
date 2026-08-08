/**
 * Carga el programa de construcción (actividades `###-CONS-####`) desde la hoja P6 del
 * "Programa Construcción PRC25031".
 *
 * Por qué hace falta. En la base conviven dos programas con propósitos distintos:
 *
 *   fuente='P333'  el programa contractual del mandante (P333-1A-0322-41-0233). Es el que lee
 *                  toda la aplicación — todas las queries filtran por él.
 *   fuente='MC'    el programa de construcción propio, con el que se hizo el 4D
 *                  (312-CONS-1130). Es el que referencia cada elemento del modelo.
 *
 * Estaban cargadas 71 actividades del 'MC', todas del área 312. La hoja P6 tiene las 206 —
 * áreas 300, 312, 322, 323, 700, 710, 720 y 730. Sin las otras 135, el vínculo
 * elemento → actividad sólo se puede armar para el espesador y el resto del modelo queda
 * colgando de un programa que no existe en la base.
 *
 * El CWP no viene en la hoja P6. Se resuelve en dos pasos, en este orden:
 *
 *   1. el que ya tenía la actividad en la base — viene de la carga anterior del planificador
 *      y es más fino que cualquier derivación;
 *   2. el que declara la tabla 4D, sólo para las actividades que no tenían ninguno.
 *
 * El orden importa. El 4D deriva el CWP del paquete al que pertenecen los elementos que
 * mueve, y para la calderería del espesador eso lo manda a Equipos Mecánicos: dejarlo pisar
 * el valor anterior mandaba nueve actividades de cajones y estanques (312101.MB001) al CWP
 * de equipos (312101.M001), y borraba el CWP de otras nueve que el 4D ni menciona
 * (excavaciones, rellenos, cables, alumbrado) porque no tienen elementos modelados.
 *
 * Uso:
 *   node --env-file=.env.local scripts/programa-cons-cargar.mjs <PRC25031.xlsx> <project_id> [--aplicar]
 *      --4d=<tabla-4d.xlsx>   de dónde sacar el CWP de cada actividad (por defecto, la hoja
 *                             SP3dMoniker del mismo archivo si existe)
 *      --hoja="P6"            hoja del programa
 */
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { num, fecha } from './numeros.mjs';

const args = process.argv.slice(2);
const opt = (n, d = '') => (args.find(a => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=') || d;
const APLICAR = args.includes('--aplicar');
const [FILE, PROJECT_ID] = args.filter(a => !a.startsWith('--'));
if (!FILE || !PROJECT_ID) { console.error('Uso: programa-cons-cargar.mjs <PRC25031.xlsx> <project_id> [--aplicar]'); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan las variables de Supabase (usa --env-file=.env.local)'); process.exit(1); }
const sb = createClient(url, key);

const ES_CONS = /^\d{3}-CONS-\d+$/;
const txt = (v) => { const s = String(v ?? '').trim(); return s && s !== 'TBD' && !s.startsWith('TBD ') ? s : null; };

/**
 * Las fechas de esta planilla salen de P6 en formato de EE.UU. (M/D/YYYY). Leídas como texto,
 * `fecha()` las interpreta como D/M/YYYY y el 10 de octubre se convierte en el mes 14. Por eso
 * la hoja se lee con cellDates y aquí se acepta el Date que entrega XLSX.
 */
const fechaCelda = (v) => {
  if (v instanceof Date && !isNaN(v)) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return fecha(v);
};

// ── El programa ─────────────────────────────────────────────────────────────
const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer', cellDates: true });
const HOJA = opt('hoja', 'P6');
if (!wb.SheetNames.includes(HOJA)) { console.error(`El archivo no tiene la hoja "${HOJA}". Tiene: ${wb.SheetNames.join(', ')}`); process.exit(1); }
const filas = XLSX.utils.sheet_to_json(wb.Sheets[HOJA], { defval: '', raw: true })
  .filter(f => ES_CONS.test(String(f['Activity ID'] ?? '').trim()));
console.log(`Hoja "${HOJA}": ${filas.length} actividades de construcción`);

// ── El CWP de cada actividad, según la tabla 4D ─────────────────────────────
const RUTA_4D = opt('4d', FILE);
const wb4 = RUTA_4D === FILE ? wb : XLSX.read(fs.readFileSync(RUTA_4D), { type: 'buffer', cellDates: false });
const hoja4 = wb4.SheetNames.find(n => {
  const f = XLSX.utils.sheet_to_json(wb4.Sheets[n], { defval: '', raw: false })[0];
  return f && 'Activity_P6' in f;
});
const cwpDeActividad = new Map();
if (hoja4) {
  for (const f of XLSX.utils.sheet_to_json(wb4.Sheets[hoja4], { defval: '', raw: false })) {
    const a = String(f.Activity_P6 ?? '').trim(), c = String(f.CWP ?? '').trim();
    if (a && c && !cwpDeActividad.has(a)) cwpDeActividad.set(a, c);
  }
  console.log(`CWP por actividad (hoja "${hoja4}"): ${cwpDeActividad.size} actividades declaradas`);
} else console.log('Sin tabla 4D: las actividades quedarán sin CWP.');

// ── Catálogo y lo que ya está cargado ───────────────────────────────────────
const { data: cwps, error: eCwp } = await sb.from('mining_cwp').select('cwp_id').eq('project_id', PROJECT_ID);
if (eCwp) { console.error(eCwp.message); process.exit(1); }
const catalogo = new Set((cwps ?? []).map(c => c.cwp_id));

const { data: previasMC, error: ePrev } = await sb.from('mining_programa')
  .select('cod_actividad, cwp_id').eq('project_id', PROJECT_ID).eq('fuente', 'MC');
if (ePrev) { console.error(ePrev.message); process.exit(1); }
const cwpPrevio = new Map((previasMC ?? []).filter(a => a.cwp_id).map(a => [a.cod_actividad, a.cwp_id]));
console.log(`Ya cargadas: ${previasMC?.length ?? 0} actividades 'MC', ${cwpPrevio.size} con CWP asignado`);

// ── Armado ──────────────────────────────────────────────────────────────────
const ESPECIALIDAD = { OOCC: 'Obras Civiles', MEC: 'Mecánico', ELE: 'Eléctrico', EST: 'Estructura', INS: 'Instrumentación', PIP: 'Piping', ARQ: 'Arquitectura' };
const actividades = [], sinCatalogo = new Map();
let dePrevio = 0, del4D = 0, respetados = 0;
for (const f of filas) {
  const cod = String(f['Activity ID']).trim();
  const previo = cwpPrevio.get(cod) ?? null;
  let cwp = previo;
  if (previo) {
    dePrevio++;
    const d4 = cwpDeActividad.get(cod);
    if (d4 && d4 !== previo) respetados++;      // el 4D dice otra cosa; se respeta el previo
  } else {
    cwp = cwpDeActividad.get(cod) ?? null;
    if (cwp && !catalogo.has(cwp)) { sinCatalogo.set(cwp, (sinCatalogo.get(cwp) ?? 0) + 1); cwp = null; }
    if (cwp) del4D++;
  }
  actividades.push({
    project_id: PROJECT_ID,
    cod_actividad: cod,
    nombre_actividad: String(f['Activity Name'] ?? '').trim() || null,
    cwp_id: cwp,
    cwa_id: txt(f['#CWA']),
    cv_id: txt(f['CV']),
    sector: txt(f['SECTOR']),
    tipo: ESPECIALIDAD[String(f['Especialidad'] ?? '').trim()] ?? txt(f['Especialidad']),
    hh: num(f['Budgeted Labor Units']),
    duracion_dias: num(f['Original Duration']),
    fecha_inicio: fechaCelda(f['Start']),
    fecha_fin: fechaCelda(f['Finish']),
    fuente: 'MC',
    en_mc: true,
  });
}

const porArea = {};
for (const a of actividades) porArea[a.cwa_id ?? 'sin CWA'] = (porArea[a.cwa_id ?? 'sin CWA'] ?? 0) + 1;
const conCwp = dePrevio + del4D;
console.log(`\nA cargar: ${actividades.length} actividades`);
console.log(`  CWP que ya tenían    : ${dePrevio}${respetados ? `   (en ${respetados} el 4D dice otro CWP y se respeta el que estaba)` : ''}`);
console.log(`  CWP nuevo, del 4D    : ${del4D}`);
console.log(`  sin CWP              : ${actividades.length - conCwp}`);
console.log(`  HH del programa      : ${Math.round(actividades.reduce((s, a) => s + (a.hh ?? 0), 0)).toLocaleString('es-CL')}`);
console.log(`  por CWA: ${Object.entries(porArea).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  ')}`);
if (sinCatalogo.size) {
  console.log(`\n  CWP que el 4D declara y no están en mining_cwp (se dejan nulos):`);
  for (const [k, v] of sinCatalogo) console.log(`    ${String(v).padStart(4)}  ${k}`);
}
console.log(`\nSe reemplazan las ${previasMC?.length ?? 0} filas 'MC' que hay en la base.`);

if (!APLICAR) { console.log(`\nSimulación. Repite con --aplicar para escribir en la base.`); process.exit(0); }

// ── Carga ───────────────────────────────────────────────────────────────────
console.log(`\nCargando…`);
const { error: eDel } = await sb.from('mining_programa').delete().eq('project_id', PROJECT_ID).eq('fuente', 'MC');
if (eDel) { console.error('  error al limpiar:', eDel.message); process.exit(1); }
for (let i = 0; i < actividades.length; i += 500) {
  const { error } = await sb.from('mining_programa').insert(actividades.slice(i, i + 500));
  if (error) { console.error(`  error en el lote ${i}:`, error.message); process.exit(1); }
}
console.log(`  ${actividades.length} actividades cargadas`);
