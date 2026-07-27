/**
 * Arma el data pack de EIMI00413 Andina a partir de los archivos reales del proyecto.
 * No inventa datos: solo reordena lo que ya existe al formato P1–P10.
 *
 * Fuentes:
 *   A) "07-01 Matriz Correspondencia .xlsx" hoja Hoja2  → catálogo CWP (P1) y programa (P2).
 *      Es el master AWP: cada actividad del programa trae su CWP y, cuando aplica, su ítem
 *      del ECO. De ahí salen los 27 paquetes, sus HH, sus fechas y el vínculo al itemizado.
 *   B) "EIMI00413_Andina_P1_POBLADO.xlsx" hoja "Cruce Itemizado" → itemizado (P3) con
 *      cantidad y precio unitario de los 420 ítems del ECO-01A.
 *
 * Uso: node scripts/armar-pack-andina.mjs <matriz.xlsx> <cruce.xlsx> <salida.xlsx>
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import { num, fecha as fechaMsProject } from './numeros.mjs';

const [, , F_MATRIZ, F_CRUCE, SALIDA] = process.argv;
if (!F_MATRIZ || !F_CRUCE || !SALIDA) {
  console.error('Uso: armar-pack-andina.mjs <matriz.xlsx> <cruce.xlsx> <salida.xlsx>');
  process.exit(1);
}

const leer = (f) => XLSX.read(fs.readFileSync(f), { type: 'buffer', cellDates: false });

// ── A) Matriz de correspondencia: programa + CWP ────────────────────────────
const wbM = leer(F_MATRIZ);
const prog = XLSX.utils.sheet_to_json(wbM.Sheets['Hoja2'], { defval: '', raw: false });

const P2 = [], porCwp = new Map();
for (const r of prog) {
  const cwp = String(r.CWP || '').trim() || null;
  const edt = String(r.EDT || '').trim();
  const nombre = String(r['Nombre de tarea'] || '').trim();
  if (!edt || !nombre) continue;

  const hh = num(r.Trabajo) ?? 0;
  const ini = fechaMsProject(r.Comienzo), fin = fechaMsProject(r.Fin);
  const item = String(r.Item || '').trim() || null;
  const esResumen = String(r.Resumen || '').trim().toUpperCase() === 'SÍ' || String(r.Resumen || '').trim().toUpperCase() === 'SI';

  // Las filas resumen de MS Project totalizan a sus hijas. Cargarlas junto con las tareas
  // haría que toda suma de HH quedara multiplicada por la profundidad del árbol.
  if (!esResumen) {
    P2.push({
      Cod_actividad: edt, Nombre_actividad: nombre, HH: hh || '',
      Fecha_inicio: ini ?? '', Fecha_fin: fin ?? '', CWP_hilo: cwp ?? '',
      Cantidad: num(r.Cant) ?? '', Unidad: String(r.Uni || '').trim(),
      WBS: edt, CWA: cwp ? cwp.split('-')[1] : '',
      Tipo_actividad: 'tarea',
    });
  }

  if (!cwp) continue;
  const g = porCwp.get(cwp) ?? { hh: 0, ini: [], fin: [], resumenes: [], items: new Map() };
  // Las filas resumen ya totalizan a sus hijas: sumarlas todas duplicaría las HH del paquete.
  if (!esResumen) g.hh += hh;
  if (ini) g.ini.push(ini);
  if (fin) g.fin.push(fin);
  g.resumenes.push({ edt, nombre, nivel: edt.split('.').length });
  // Una actividad puede cubrir varios ítems del ECO y el master los escribe en la misma
  // celda separados por coma ("4.5.1, 4.5.2, 4.5.3"). Cada uno es un ítem distinto.
  if (item) for (const it of item.split(/[,;]/).map(s => s.trim()).filter(Boolean)) g.items.set(it, edt);
  porCwp.set(cwp, g);
}

// ── P1: un CWP por paquete, con el nombre de su tarea de mayor nivel ────────
const P1 = [...porCwp.entries()].map(([cwp, g]) => {
  const [, area, sector, disc] = cwp.match(/^CWP-(\d{4})-(\d{2})-([A-Za-z]{2,3})-(\d{2,4})$/i) ?? [];
  const cabecera = g.resumenes.slice().sort((a, b) => a.nivel - b.nivel || a.edt.localeCompare(b.edt))[0];
  return {
    CWP_hilo: cwp,
    Nombre: cabecera?.nombre ?? cwp,
    Disciplina: (disc ?? '').toUpperCase(),
    Disciplina_nombre: '',            // el proyecto no publica el nombre largo de cada código
    CWA: area ?? '', CWA_legible: area ? `Área ${area}` : '',
    CV: area && sector ? area + sector : '', CV_legible: area && sector ? `${area} sector ${sector}` : '',
    EWP: '', Alcance: '',
    Costo_oferta_CLP: '',
    HH_planner: Math.round(g.hh) || '',
    Fecha_ini: g.ini.sort()[0] ?? '',
    Fecha_fin: g.fin.sort().slice(-1)[0] ?? '',
  };
}).sort((a, b) => a.CWP_hilo.localeCompare(b.CWP_hilo));

// Ítem del ECO → CWP y actividad, según el master
const itemACwp = new Map(), itemAActividad = new Map();
for (const [cwp, g] of porCwp) {
  for (const [item, edt] of g.items) {
    if (!itemACwp.has(item)) { itemACwp.set(item, cwp); itemAActividad.set(item, edt); }
  }
}

// ── B) Cruce itemizado: cantidades y precios del ECO-01A ────────────────────
const wbC = leer(F_CRUCE);
const filasC = XLSX.utils.sheet_to_json(wbC.Sheets['Cruce Itemizado'], { header: 1, defval: '', raw: false });
const iHdr = filasC.findIndex(f => f.filter(c => String(c).trim()).length > 4);
const hdrC = filasC[iHdr].map(c => String(c).trim());
const col = (n) => hdrC.findIndex(h => h.toLowerCase() === n.toLowerCase());
const cI = col('Ítem'), cDesc = col('Descripción ECO'), cUni = col('Uni.'), cCant = col('Cantidad'),
      cPU = col('Precio unitario'), cDisc = col('Disciplina ECO'), cArea = col('Área ECO');

const P3 = [];
for (const f of filasC.slice(iHdr + 1)) {
  const item = String(f[cI] ?? '').trim();
  if (!item) continue;
  const cant = num(f[cCant]), pu = num(f[cPU]);
  P3.push({
    Item: item,
    Descripcion: String(f[cDesc] ?? '').trim(),
    Unidad: String(f[cUni] ?? '').trim(),
    Cantidad: cant ?? '',
    HH: '',
    CWP_hilo: itemACwp.get(item) ?? '',
    Cod_programa: itemAActividad.get(item) ?? '',
    Commodity: String(f[cDisc] ?? '').trim(),
    Partida_MyP: '',                  // Bases de M&P aún no entregadas
    Area: String(f[cArea] ?? '').trim(),
    WBS: '',
    Rendimiento_HH_unidad: '',
    Precio_unitario_CLP: pu ?? '',
    Total_CLP: cant != null && pu != null ? Math.round(cant * pu) : '',
  });
}

// ── Salida ──────────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();
const hoja = (nombre, filas, cols) => {
  const ws = filas.length ? XLSX.utils.json_to_sheet(filas, { header: cols })
                          : XLSX.utils.aoa_to_sheet([cols]);
  XLSX.utils.book_append_sheet(wb, ws, nombre);
};
hoja('P1 Catálogo CWP', P1, ['CWP_hilo','Nombre','Disciplina','Disciplina_nombre','CWA','CWA_legible','CV','CV_legible','EWP','Alcance','Costo_oferta_CLP','HH_planner','Fecha_ini','Fecha_fin']);
hoja('P2 Programa P6', P2, ['Cod_actividad','Nombre_actividad','HH','Fecha_inicio','Fecha_fin','CWP_hilo','Cantidad','Unidad','WBS','CWA','Tipo_actividad']);
hoja('P3 Itemizado ECO-2', P3, ['Item','Descripcion','Unidad','Cantidad','HH','CWP_hilo','Cod_programa','Commodity','Partida_MyP','Area','WBS','Rendimiento_HH_unidad','Precio_unitario_CLP','Total_CLP']);
XLSX.writeFile(wb, SALIDA);

const conCwp = P2.filter(r => r.CWP_hilo).length;
const itemsConCwp = P3.filter(r => r.CWP_hilo).length;
console.log(`Pack generado: ${SALIDA}`);
console.log(`  P1  ${P1.length} CWP · ${P1.reduce((s, r) => s + (Number(r.HH_planner) || 0), 0).toLocaleString('es-CL')} HH`);
console.log(`  P2  ${P2.length} actividades (${conCwp} con CWP, ${P2.length - conCwp} sin)`);
console.log(`  P3  ${P3.length} ítems (${itemsConCwp} con CWP, ${P3.length - itemsConCwp} sin)`);
