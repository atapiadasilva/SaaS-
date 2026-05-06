/**
 * Import: Programa CCSS_TRANSELEC_MONTEMINA REV F 01.04.26
 * Reads Excel, assigns disciplines, outputs JSON to stdout.
 * Leaf HH total = 293,100
 */
import XLSX from 'xlsx';
import { readFileSync } from 'fs';

const XLSX_PATH = 'C:/Users/atapiad/Downloads/Programa CCSS_TRANSELEC_MONTEMINA en trabajo WBS_REV F  01.04.26.xlsx';
const PROJECT_ID = '39ce1776-17e2-4b27-8a52-8066b31ffae6';

// ── Date parser: "lun 02-03-26" → "2026-03-02" ──────────────────────────────
function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  // Strip Spanish day prefix (lun, mar, mié, jue, vie, sáb, dom)
  s = s.replace(/^(lun|mar|mi[eé]|jue|vie|s[aá]b|dom)\s+/i, '').trim();
  // Format: DD-MM-YY
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  y = parseInt(y); d = parseInt(d); mo = parseInt(mo);
  if (y < 100) y += 2000;
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// xlsx serial date → "YYYY-MM-DD"
function xlsxDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const date = XLSX.SSF.parse_date_code(serial);
  if (!date) return null;
  return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
}

function parseHH(v) {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function getParentWbs(wbs) {
  if (!wbs || !wbs.includes('.')) return null;
  const parts = wbs.split('.');
  return parts.slice(0, -1).join('.');
}

// ── Discipline assignment ────────────────────────────────────────────────────
function assignDiscipline(nombre, wbs, isSummary) {
  if (isSummary) return null;
  const n = (nombre || '').toLowerCase();
  const wbsTop = wbs.split('.')[0];

  // Puesta en Servicio
  if (wbs.startsWith('6') || /prueba|puesta en servicio|energiz|\bsat\b|comision|dinám|estátic|funcional|precomis/.test(n))
    return 'Puesta en Servicio';

  // Gestión / Hitos (WBS 0-4)
  if (['0','1','2','3','4'].includes(wbsTop) || /\bhito\b|procurement|permiso|convenio|ingeniería|licitac/.test(n))
    return 'Gestión';

  // Instalaciones Preliminares
  if (/instalaciones preliminares|movilizaci[oó]n|bodega|oficina|cerco perimetral|faena|preliminar|campamento/.test(n))
    return 'Instalaciones Preliminares';

  // Telecomunicaciones
  if (/fibra [oó]ptica|telecomunic|scada|comunicac|radiocomunic/.test(n))
    return 'Telecomunicaciones';

  // Instrumentación y Control
  if (/protecci[oó]n|tablero.{0,10}protec|control y protec|c&p|instrumentac|armario c&|iec 61850|rel[eé] de/.test(n))
    return 'Instrumentación y Control';

  // Mecánica
  if (/rotor|estator|condensador sincro|\bccss\b|montaje ccss|refrigerac|lubricac|bomba|cañer[ií]a|tuber[ií]a|hvac|sala mec[aá]nic|sistema de aceite|sistema de agua|ventilac|excitatriz|montaje equipo|izaje|hidr[aá]ulic/.test(n))
    return 'Mecánica';

  // Eléctrica
  if (/conductor|cable|tendido|conexionado|mufa|empalme|\bgis\b|disyuntor|seccionador|transformador|aislador|tablero el[eé]c|armario el[eé]c|armario de|\bat\b|\bbt\b|\bmt\b|puesta a tierra|malla puesta|\bmpt\b|aterramient|electroducto|bandeja porta|charola|luminaria|alumbrado|alimentador|sistema el[eé]c|panel el[eé]c|celda|barra colectora|canaliz.*el[eé]c/.test(n))
    return 'Eléctrica';

  // Estructuras
  if (/estructura met[aá]l|estructura de acero|estructura soporte|marco l[ií]nea|galer[ií]a|cerramiento|cubierta|mezzanine|sala el[eé]ctrica|sala control|sala bater[ií]as|edificio|techo|p[oó]rtico|celos[ií]a|construcción sala|obra civil sala/.test(n))
    return 'Estructuras';

  // Civil
  if (/fundaci[oó]n|escarpe|corte|relleno|plataforma|terrapl|drenaje|canaleta|pavimento|camino|zanja|hormig[oó]n|excavac|movimiento de tierra|tierra armada|acceso|muro|sostenimiento|talud|trinchera|radier|losa|pilote|micropilote|entibaci[oó]n|sello|impermeabilizac/.test(n))
    return 'Civil';

  // Fallback by WBS section
  if (wbs.startsWith('5.1')) return 'Instalaciones Preliminares';
  if (wbs.startsWith('5.3')) return 'Eléctrica';    // Enlace soterrado = HV underground cable
  if (wbs.startsWith('5.5')) return 'Civil';         // Áreas comunes

  return 'Civil';  // default for unlabeled CT activities
}

// ── Main ─────────────────────────────────────────────────────────────────────
const wb = XLSX.readFile(XLSX_PATH, { cellDates: false, raw: false });
const ws = wb.Sheets['Hoja1'];
const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

const rows = [];
for (let i = 1; i < raw.length; i++) {
  const [edt, id_, nombre, trabajo, duracion, comienzo, fin] = raw[i];
  if (edt == null) continue;

  const wbs = String(edt).trim();
  // Try serial date first, then string parse
  const startDate = (typeof comienzo === 'number') ? xlsxDateToISO(comienzo) : parseDate(comienzo);
  const endDate   = (typeof fin === 'number')      ? xlsxDateToISO(fin)      : parseDate(fin);

  rows.push({
    wbs,
    nombre: nombre ? String(nombre).trim() : '',
    hh: parseHH(trabajo),
    durStr: duracion ? String(duracion).trim() : '',
    startDate,
    endDate,
    sort: i,
  });
}

// Detect summary rows (have children in WBS hierarchy)
// WBS "0" is the project root — its children are "1","2",... (no dot prefix), special-cased.
const allWbs = new Set(rows.map(r => r.wbs));
// Set of all parent_wbs values from dot-notation
const parentWbsFromDot = new Set(rows.map(r => getParentWbs(r.wbs)).filter(Boolean));

const hasChildren = wbs => {
  if (wbs === '0') return true;                    // project root always summary
  if (parentWbsFromDot.has(wbs)) return true;      // appears as parent via dot notation
  const prefix = wbs + '.';
  for (const w of allWbs) if (w !== wbs && w.startsWith(prefix)) return true;
  return false;
};

// Build records
const records = rows.map(r => {
  const isSummary   = hasChildren(r.wbs);
  const isMilestone = r.durStr === '0 d';
  const discipline  = assignDiscipline(r.nombre, r.wbs, isSummary);
  return {
    project_id:     PROJECT_ID,
    wbs_code:       r.wbs,
    description:    r.nombre,
    hh:             r.hh,
    start_date:     r.startDate,
    end_date:       r.endDate,
    is_summary:     isSummary,
    is_milestone:   isMilestone,
    parent_wbs:     getParentWbs(r.wbs),
    sort_order:     r.sort,
    discipline:     discipline,
    status:         'pending',
    progress:       0,
    program_source: 'CCSS_REV_F_01.04.26',
  };
});

// ── Stats ────────────────────────────────────────────────────────────────────
const leaves    = records.filter(r => !r.is_summary);
const leafHH    = leaves.reduce((s, r) => s + r.hh, 0);
const byDisc    = {};
leaves.forEach(r => { const d = r.discipline || 'Sin disciplina'; byDisc[d] = (byDisc[d] || 0) + r.hh; });

process.stderr.write(`Total filas:  ${records.length}\n`);
process.stderr.write(`Summaries:    ${records.filter(r=>r.is_summary).length}\n`);
process.stderr.write(`Milestones:   ${records.filter(r=>r.is_milestone).length}\n`);
process.stderr.write(`Leaf HH sum:  ${leafHH.toLocaleString('es')} (esperado: 293,100)\n`);
process.stderr.write(`\nHH por Disciplina:\n`);
Object.entries(byDisc).sort((a,b)=>b[1]-a[1]).forEach(([d,hh]) => {
  process.stderr.write(`  ${d.padEnd(35)} ${hh.toLocaleString('es').padStart(10)} HH\n`);
});

// Output JSON
process.stdout.write(JSON.stringify(records));
