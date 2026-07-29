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

// ── B) Itemizado: hoja "Resumen ECO-01A" del itemizado codificado ───────────
// Es la fuente completa: trae disciplina, clasificación y área POR ÍTEM, además del
// desglose de costos y las HH. Las columnas van por posición porque el encabezado real
// está en la segunda fila y varias columnas no tienen título.
const wbC = leer(F_CRUCE);
const hojaEco = wbC.SheetNames.find(n => n.startsWith('Resumen ECO')) ?? wbC.SheetNames[0];
const filasC = XLSX.utils.sheet_to_json(wbC.Sheets[hojaEco], { header: 1, defval: '', raw: false });
const C = { disciplina: 0, clasif: 1, area: 2, item: 3, desc: 4, unidad: 5, cantidad: 6,
            pu: 14, total: 15, hhUnidad: 16, hhTotal: 18 };

const P3 = [];
for (const f of filasC.slice(2)) {
  const item = String(f[C.item] ?? '').trim();
  // Solo ítems reales ("2.1.1"): los títulos de capítulo llevan el número en otra columna
  // y no traen unidad ni cantidad, así que sumarlos duplicaría el contrato.
  if (!item || !/^\d+(\.\d+)+$/.test(item)) continue;
  P3.push({
    Item: item,
    Descripcion: String(f[C.desc] ?? '').trim(),
    Unidad: String(f[C.unidad] ?? '').trim(),
    Cantidad: num(f[C.cantidad]) ?? '',
    HH: num(f[C.hhTotal]) ?? '',
    CWP_hilo: itemACwp.get(item) ?? '',
    Cod_programa: itemAActividad.get(item) ?? '',
    Commodity: String(f[C.disciplina] ?? '').trim(),
    Partida_MyP: '',                  // Bases de M&P aún no entregadas
    Area: String(f[C.area] ?? '').trim(),
    WBS: String(f[C.clasif] ?? '').trim(),
    Rendimiento_HH_unidad: num(f[C.hhUnidad]) ?? '',
    Precio_unitario_CLP: num(f[C.pu]) ?? '',
    Total_CLP: num(f[C.total]) ?? '',
  });
}

// ── C) Documentos de ingeniería (opcional: --documentos=<xlsx>) ─────────────
// Código: {contrato}-{rev}-{área}-{TIPO?}{DISC}-{correlativo}
//   4600022667-001-03350-100AR-00001  → plano de arquitectura, sector 100
//   4600022667-001-03350-MDCEL-00003  → memoria de cálculo eléctrica
// Las tres letras iniciales del cuarto bloque son el tipo; las dos finales, la disciplina.
const arg = (n) => (process.argv.find(a => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=');

const TIPO_DOC = {
  MDC: 'Memoria de cálculo', ESP: 'Especificación técnica', HDD: 'Hoja de datos',
  LST: 'Listado', ADD: 'Addendum', CRD: 'Criterio de diseño', CUB: 'Cubicación',
  INF: 'Informe', MEM: 'Memoria', MNL: 'Manual', EST: 'Estudio',
};
const DISC_DOC = {
  AR: 'Arquitectura', CI: 'Civil', ES: 'Estructura', CA: 'Cañería', EL: 'Eléctrico',
  AT: 'Automatización', ME: 'Mecánica', MD: 'Multidisciplina', CB: 'Constructibilidad', PR: 'Proceso',
};
// Disciplina del documento -> disciplina del CWP. Solo se sugiere cuando la equivalencia es
// inequívoca y esa disciplina tiene un único paquete; el resto queda para Conciliación.
// OJO: "CA" en los documentos es Cañería, pero en los CWP de Andina es fundación civil.
const DOC_A_CWP = { CA: 'PA', AT: 'SA', EL: 'QJ' };

const P6 = [], P6b = [];
const fDocs = arg('documentos');
if (fDocs && fs.existsSync(fDocs)) {
  const wbD = leer(fDocs);
  const filas = XLSX.utils.sheet_to_json(wbD.Sheets[wbD.SheetNames[0]], { defval: '', raw: false })
    .filter(r => String(r['Tipo de elemento'] ?? '').trim() !== 'Carpeta');

  // Un CWP por disciplina, solo si es el único de esa disciplina.
  const cwpPorDisc = new Map();
  for (const c of P1) {
    const d = c.Disciplina;
    cwpPorDisc.set(d, cwpPorDisc.has(d) ? null : c.CWP_hilo);   // null = ambiguo
  }

  for (const r of filas) {
    const nombre = String(r.Nombre ?? '').trim();
    const m = nombre.match(/^(\d{10})-(\d{3})-(\d{5})-(\w{2,6})-(\d{5})/);
    if (!m) continue;
    const [, , rev, area, bloque] = m;
    const disc = bloque.slice(-2).toUpperCase();
    const tipoCod = bloque.length > 2 ? bloque.slice(0, bloque.length - 2).replace(/^\d+$/, '') : '';
    const esPlano = /^\d+$/.test(bloque.slice(0, bloque.length - 2));
    const codigo = nombre.replace(/\.pdf$/i, '');
    const cwpSugerido = cwpPorDisc.get(DOC_A_CWP[disc] ?? '') ?? '';

    P6.push({
      N_documento: codigo,
      Titulo: nombre,
      Tipo: esPlano ? 'Plano' : (TIPO_DOC[tipoCod] ?? 'Documento'),
      Revision: rev,
      CWP: cwpSugerido,
      Estado_Aconex: '', Es_IFC: '', Codigo_interno: '',
      CWA: area,
      Disciplina_aconex: DISC_DOC[disc] ?? disc,
      Empresa: String(r['Modificado por'] ?? '').trim(),
      Fecha_Aconex: fechaMsProject(r.Modificado) ?? '',
      Ruta_archivo: String(r['Ruta de acceso'] ?? '').trim(),
    });

    // Solo los planos propiamente tales van a la vista de planos del CWP, y solo cuando
    // hay una sugerencia de paquete: un plano colgado del CWP equivocado confunde más
    // que uno sin asignar.
    if (esPlano && cwpSugerido) {
      P6b.push({ N_documento: codigo, CWP_hilo: cwpSugerido, Origen_del_vinculo: 'sugerido-por-disciplina' });
    }
  }
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
if (P6.length) hoja('P6 Documentos', P6, ['N_documento','Titulo','Tipo','Revision','CWP','Estado_Aconex','Es_IFC','Codigo_interno','CWA','Disciplina_aconex','Empresa','Fecha_Aconex','Ruta_archivo']);
if (P6b.length) hoja('P6b Documento-CWP', P6b, ['N_documento','CWP_hilo','Origen_del_vinculo']);
XLSX.writeFile(wb, SALIDA);

const conCwp = P2.filter(r => r.CWP_hilo).length;
const itemsConCwp = P3.filter(r => r.CWP_hilo).length;
console.log(`Pack generado: ${SALIDA}`);
console.log(`  P1  ${P1.length} CWP · ${P1.reduce((s, r) => s + (Number(r.HH_planner) || 0), 0).toLocaleString('es-CL')} HH`);
console.log(`  P2  ${P2.length} actividades (${conCwp} con CWP, ${P2.length - conCwp} sin)`);
console.log(`  P3  ${P3.length} ítems (${itemsConCwp} con CWP, ${P3.length - itemsConCwp} sin)`);
