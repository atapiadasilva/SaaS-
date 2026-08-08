/**
 * Carga a `mining_doc_aconex` el respaldo de Aconex y reconstruye el vínculo documento → CWP
 * en `mining_planos`.
 *
 * Por qué importa. El estado del ciclo de vida es lo que gobierna el gate de liberación del
 * IWP: un paquete no se libera contra ingeniería que no está emitida para construcción. Ese
 * dato vive sólo en Aconex, y hasta ahora los 696 documentos del Puerto lo tenían vacío.
 *
 * El respaldo trae dos planillas que se complementan y hay que leer juntas:
 *
 *   ExportDocs-*.xlsx            hoja "Docs", encabezado a media hoja. Trae fecha de
 *                                modificación, nombre del archivo y el transmittal.
 *   PlantillaDeMetadatos-*.xlsx  hoja "Plantilla de metadatos". Trae CWP, EWP y el TAG del
 *                                equipo — campos que el usuario llena a mano en Aconex.
 *
 * El vínculo con el CWP se resuelve por prioridad, y la inferencia es el último recurso:
 *
 *   1. el CWP escrito a mano en Aconex (columna CWP de la plantilla);
 *   2. el CWP nombrado en el título — "Procedimiento CWP 312101.F001 Malla a Tierra";
 *   3. el vínculo que ya existía en `mining_planos` hacia un CWP real;
 *   4. inferido del código del documento (`333-PRC23084-312-46-DW-8750`: área 312, disciplina 46).
 *
 * El orden 3 antes que 4 no es un detalle. Los vínculos que ya estaban tienen criterio que el
 * código no alcanza: los planos de cajones (disciplina 45, Mecánica) están puestos en
 * `312101.MB001` (calderería) y no en `M001`, y los de disciplina 47 (Electricidad) repartidos
 * entre `E001`, `EW001` y `T001` según sean equipos, cableado o canalizaciones. Reconstruirlos
 * desde el código los aplastaría a todos contra una sola disciplina.
 *
 * Los CWP de relleno (`SIN-CWP.POR_ASIGNAR`, `*.SIN-CV.SIN-CWP`) no cuentan como vínculo: si un
 * documento sólo cuelga de uno de esos, se intenta resolver de nuevo.
 *
 * Uso:
 *   node --env-file=.env.local scripts/aconex-cargar-metadatos.mjs <carpeta-o-xlsx> <project_id> [--aplicar]
 *
 *   Se le puede pasar la carpeta del respaldo y busca las dos planillas solo.
 *   Sin --aplicar solo simula.
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const [ENTRADA, PROJECT_ID] = args.filter(a => !a.startsWith('--'));
if (!ENTRADA || !PROJECT_ID) {
  console.error('Uso: aconex-cargar-metadatos.mjs <carpeta-o-xlsx> <project_id> [--aplicar]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan las variables de Supabase (usa --env-file=.env.local)'); process.exit(1); }
const sb = createClient(url, key);

/**
 * Disciplina de ingeniería del código de documento → disciplina de Hilo.
 * Las que faltan no son disciplinas de construcción: 10 medio ambiente, 20 calidad,
 * 33/35/37 control, 49 metalurgia, 50/52 administración de construcción, 60 seguridad.
 * Sus documentos se guardan, pero no cuelgan de un CWP: son del proyecto, no de un paquete.
 */
const DISCIPLINA = {
  41: 'C',   // Movimiento de tierra → Obras Civiles
  42: 'D',   // Civil/Hormigón       → Hormigones
  43: 'S',   // Estructura
  44: 'A',   // Arquitectura
  45: 'M',   // Mecánica             → Equipos mecánicos
  46: 'P',   // Cañerías             → Piping
  47: 'E',   // Electricidad         → Equipos eléctricos
  48: 'J',   // Instrumentación y Control → Instrumentos
};
/** Área del código de documento → CWA del contrato. */
const AREA_A_CWA = { 312: '3121', 322: '3221', 710: '7101', 720: '7201' };
/** El área 000 es transversal: estándares y especificaciones que aplican a todo el proyecto. */
const AREA_TRANSVERSAL = '000';

/** `333-PRC23084-312-46-DW-8750` → { contrato, area, disc, tipo, num } */
function partes(codigo) {
  const m = String(codigo).match(/^(\d{3})-([A-Z]{3}\d+)-(\d{3})-(\d{2})-([A-Z]{2})-(\d+)/i);
  return m ? { contrato: m[2].toUpperCase(), area: m[3], disc: Number(m[4]), tipo: m[5].toUpperCase() } : {};
}

/** Los PDF del export traen el código con sufijos (`_0`, ` SC`, `[0]`). El índice lo trae limpio. */
const normalizar = (s) => String(s ?? '').trim().replace(/\[\d+\]$/, '').replace(/[_ ]+(\d+|SC|RESP)$/i, '').trim();

/** El Excel puede entregar Date (cellDates) o texto. Nunca al revés. */
function fecha(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

/** Busca una hoja por nombre exacto o, si no está, la primera que tenga la columna pedida. */
function hojaCon(wb, nombre, columnaClave) {
  if (nombre && wb.SheetNames.includes(nombre)) return wb.Sheets[nombre];
  for (const n of wb.SheetNames) {
    const f = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: false })[0];
    if (f && columnaClave in f) return wb.Sheets[n];
  }
  return null;
}

/**
 * El ExportDocs trae seis a diez filas de portada antes del encabezado ("Proyecto:",
 * "Generado por:", "Número de resultados:"…) y el número varía entre exports. Se busca la
 * fila que empieza con "Archivo" y se lee desde ahí.
 */
function leerExportDocs(archivo) {
  const wb = XLSX.read(fs.readFileSync(archivo), { type: 'buffer', cellDates: true });
  const hoja = wb.Sheets[wb.SheetNames.includes('Docs') ? 'Docs' : wb.SheetNames[0]];
  const bruto = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: true });
  const i = bruto.findIndex(r => String(r[0] ?? '').trim() === 'Archivo' && r.includes('No. de documento'));
  if (i < 0) return [];
  const hdr = bruto[i].map(h => String(h ?? '').trim());
  return bruto.slice(i + 1)
    .filter(r => String(r[hdr.indexOf('No. de documento')] ?? '').trim())
    .map(r => Object.fromEntries(hdr.map((h, j) => [h, r[j]]).filter(([h]) => h)));
}

// ── Qué archivos leer ───────────────────────────────────────────────────────
const st = fs.statSync(ENTRADA);
let fExport = null, fPlantilla = null;
if (st.isDirectory()) {
  for (const n of fs.readdirSync(ENTRADA)) {
    if (!n.toLowerCase().endsWith('.xlsx')) continue;
    const p = path.join(ENTRADA, n);
    if (/^ExportDocs/i.test(n)) { if (!fExport || fs.statSync(p).size > fs.statSync(fExport).size) fExport = p; }
    else if (/metadatos/i.test(n)) fPlantilla = p;
  }
} else if (/metadatos/i.test(path.basename(ENTRADA))) fPlantilla = ENTRADA;
else fExport = ENTRADA;
if (!fExport && !fPlantilla) { console.error('No encontré ni ExportDocs-*.xlsx ni PlantillaDeMetadatos-*.xlsx.'); process.exit(1); }
console.log(`ExportDocs : ${fExport ? path.basename(fExport) : '(no hay)'}`);
console.log(`Plantilla  : ${fPlantilla ? path.basename(fPlantilla) : '(no hay)'}`);

// ── Lectura y fusión ────────────────────────────────────────────────────────
const registros = new Map();          // código normalizado → fila fusionada
const guardar = (codigo, datos) => {
  const k = normalizar(codigo);
  if (!k) return;
  registros.set(k, { ...(registros.get(k) ?? {}), ...Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== null && v !== '')) });
};

if (fExport) {
  const filas = leerExportDocs(fExport);
  console.log(`  ${filas.length} filas en el ExportDocs`);
  for (const r of filas) guardar(r['No. de documento'], {
    titulo: String(r['Título'] ?? '').trim(),
    rev: String(r['Revisión'] ?? '').trim(),
    estado_aconex: String(r['Estatus'] ?? '').trim(),
    tipo_doc: String(r['Tipo'] ?? '').trim(),
    categoria: String(r['Categoría'] ?? '').trim(),
    funcion: String(r['Función'] ?? '').trim(),
    archivo: String(r['Nombre de archivo'] ?? '').trim(),
    ext: String(r['Archivo'] ?? '').trim().toLowerCase(),
    fecha_modificacion: fecha(r['Fecha de modificación']),
    n_interno: String(r['Transmitido en'] ?? '').trim(),
  });
}
if (fPlantilla) {
  const wb = XLSX.read(fs.readFileSync(fPlantilla), { type: 'buffer', cellDates: true });
  const hoja = hojaCon(wb, 'Plantilla de metadatos', 'No. de documento');
  if (!hoja) { console.error('La plantilla no tiene la hoja "Plantilla de metadatos".'); process.exit(1); }
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true }).filter(r => String(r['No. de documento'] ?? '').trim());
  console.log(`  ${filas.length} filas en la plantilla de metadatos`);
  for (const r of filas) guardar(r['No. de documento'], {
    titulo: String(r['Título'] ?? '').trim(),
    rev: String(r['Revisión'] ?? '').trim(),
    estado_aconex: String(r['Estatus'] ?? '').trim(),
    tipo_doc: String(r['Tipo'] ?? '').trim(),
    categoria: String(r['Categoría'] ?? '').trim(),
    funcion: String(r['Función'] ?? '').trim(),
    cwp_declarado: String(r['CWP'] ?? '').trim(),
    ewp_declarado: String(r['EWP'] ?? '').trim(),
    tag: String(r['N° Equipo / TAG'] ?? '').trim(),
    n_bechtel: String(r['No. de documento ESED'] ?? '').trim(),
  });
}
console.log(`\nDocumentos distintos: ${registros.size}`);

// ── Catálogo y vínculos que ya existen ──────────────────────────────────────
const ES_CWP = /^\d{6}\.[A-Z]{1,2}\d{3}$/;
const { data: cwps, error: eC } = await sb.from('mining_cwp')
  .select('cwp_id, cwa_id, disciplina_cod').eq('project_id', PROJECT_ID).order('cwp_id');
if (eC) { console.error(eC.message); process.exit(1); }
const catalogo = new Set(cwps.filter(c => ES_CWP.test(c.cwp_id)).map(c => c.cwp_id));
console.log(`CWP en el catálogo: ${cwps.length} (${catalogo.size} reales, el resto son cajones)`);

const { data: planosPrevios, error: eP } = await sb.from('mining_planos')
  .select('cwp_id, codigo_documento, confianza').eq('project_id', PROJECT_ID).order('codigo_documento');
if (eP) { console.error(eP.message); process.exit(1); }
const previos = new Map();            // código → Set(cwp real)
for (const p of planosPrevios ?? []) {
  if (!ES_CWP.test(String(p.cwp_id ?? ''))) continue;      // los cajones no cuentan como vínculo
  const k = normalizar(p.codigo_documento);
  if (!previos.has(k)) previos.set(k, new Map());
  previos.get(k).set(p.cwp_id, p.confianza ?? 'asignado antes');
}
console.log(`Vínculos que ya existen: ${planosPrevios?.length ?? 0}, de los cuales ${[...previos.values()].reduce((a, m) => a + m.size, 0)} apuntan a un CWP real (${previos.size} documentos)`);

// ── Armado ──────────────────────────────────────────────────────────────────
const docs = [], enlaces = [];
const porEstado = new Map(), porArea = new Map(), motivos = new Map(), porVia = new Map();
const desplazados = [];

for (const [codigo, r] of registros) {
  const p = partes(codigo);
  const disc = DISCIPLINA[p.disc] ?? null;
  const cwa = AREA_A_CWA[p.area] ?? null;
  const estado = r.estado_aconex || null;
  porEstado.set(estado ?? '(vacío)', (porEstado.get(estado ?? '(vacío)') ?? 0) + 1);
  if (p.area) porArea.set(p.area, (porArea.get(p.area) ?? 0) + 1);

  // El CWP declarado a mano en Aconex manda sobre cualquier inferencia.
  const declarado = catalogo.has(r.cwp_declarado ?? '') ? r.cwp_declarado : null;
  // …y el que el propio título nombra vale casi lo mismo: "Procedimiento CWP 312101.F001 …".
  const enTitulo = [...new Set(String(r.titulo ?? '').match(/\d{6}\.[A-Z]{1,2}\d{3}/g) ?? [])].filter(c => catalogo.has(c));

  docs.push({
    project_id: PROJECT_ID,
    n_cmdic: codigo,
    n_bechtel: r.n_bechtel || null,
    titulo: r.titulo || null,
    rev: r.rev || null,
    tipo_doc: r.tipo_doc || null,
    estado_aconex: estado,
    estado_ciclo_vida: estado,       // en el Aconex del Puerto el "Estatus" ES el ciclo de vida
    categoria: r.categoria || null,
    funcion: r.funcion || null,
    disciplina_doc: r.funcion || null,
    disciplina_id: disc,
    cwa_id: cwa,
    cwp_id_exacto: declarado,
    archivo: r.archivo || null,
    ext: r.ext || null,
    fecha_modificacion: r.fecha_modificacion || null,
    n_interno: r.n_interno || null,
    origen: p.contrato === 'PRC23084' ? 'Ingeniería Bechtel (PRC23084)' : `Construcción EI (${p.contrato ?? 's/c'})`,
  });

  // ── Vínculo con el CWP, por prioridad ──
  const anota = (via, n = 1) => porVia.set(via, (porVia.get(via) ?? 0) + n);

  // Si una regla de más peso desplaza un CWP que alguien ya había asignado, hay que verlo:
  // el criterio de una persona puede ser mejor que el del propio Aconex.
  const desplaza = (nuevos) => {
    const antes = [...(previos.get(codigo)?.keys() ?? [])];
    const perdidos = antes.filter(c => !nuevos.includes(c));
    if (perdidos.length) desplazados.push(`${codigo}: ${perdidos.join(', ')} → ${nuevos.join(', ')}`);
  };

  if (declarado) { desplaza([declarado]); enlaces.push({ codigo, cwp: declarado, confianza: 'declarado en Aconex' }); anota('declarado en Aconex'); continue; }
  if (enTitulo.length) { desplaza(enTitulo); for (const c of enTitulo) enlaces.push({ codigo, cwp: c, confianza: 'el título nombra el CWP' }); anota('el título nombra el CWP', enTitulo.length); continue; }

  const previo = previos.get(codigo);
  if (previo?.size) { for (const [c, conf] of previo) enlaces.push({ codigo, cwp: c, confianza: conf }); anota('se conserva el vínculo que ya existía', previo.size); continue; }

  if (!disc) { motivos.set(`función ${p.disc ?? '?'} no es disciplina de construcción`, (motivos.get(`función ${p.disc ?? '?'} no es disciplina de construcción`) ?? 0) + 1); continue; }
  const destino = cwps.filter(c => ES_CWP.test(c.cwp_id) && c.disciplina_cod === disc &&
    (p.area === AREA_TRANSVERSAL || c.cwa_id === cwa));
  if (!destino.length) {
    const k = cwa ? `${cwa}.${disc} no existe en el catálogo` : `área ${p.area} fuera del contrato`;
    motivos.set(k, (motivos.get(k) ?? 0) + 1);
    continue;
  }
  anota(p.area === AREA_TRANSVERSAL ? 'transversal por disciplina (área 000)' : 'inferido del área+disciplina del código', destino.length);
  for (const c of destino) enlaces.push({
    codigo, cwp: c.cwp_id,
    confianza: p.area === AREA_TRANSVERSAL ? 'transversal por disciplina' : 'inferido por área+disciplina del código',
  });
}

// ── Informe ─────────────────────────────────────────────────────────────────
console.log('\nEstado del ciclo de vida (el que gobierna el gate de liberación):');
for (const [k, v] of [...porEstado].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
const ifc = [...porEstado].filter(([k]) => /construcci/i.test(k)).reduce((a, [, v]) => a + v, 0);
console.log(`  → emitidos para construcción: ${ifc}`);

console.log('\nDocumentos por área del código:');
for (const [k, v] of [...porArea].sort()) console.log(`  ${String(v).padStart(4)}  ${k}${AREA_A_CWA[k] ? ` → CWA ${AREA_A_CWA[k]}` : k === AREA_TRANSVERSAL ? ' → transversal' : ' → fuera del contrato'}`);

const porDoc = new Map();
for (const e of enlaces) porDoc.set(e.codigo, (porDoc.get(e.codigo) ?? 0) + 1);
console.log(`\nVínculos documento → CWP: ${enlaces.length}`);
console.log(`  documentos que quedan con al menos un CWP : ${porDoc.size} de ${docs.length}`);
console.log(`  CWP que quedan con al menos un documento  : ${new Set(enlaces.map(e => e.cwp)).size} de ${catalogo.size} reales`);
console.log('\n  Cómo se resolvió cada vínculo:');
for (const [k, v] of [...porVia].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`);
// Los que estaban asignados y el export ya no menciona: se pierden si no se avisa.
const huerfanos = [...previos.keys()].filter(c => !registros.has(c));
if (huerfanos.length) console.log(`\n  ${huerfanos.length} documentos con vínculo que el export ya no trae (se conservan igual): ${huerfanos.slice(0, 4).join(', ')}…`);
if (desplazados.length) {
  console.log(`\n  ATENCIÓN: ${desplazados.length} documentos donde Aconex o el título desplazan un CWP ya asignado:`);
  for (const d of desplazados.slice(0, 20)) console.log(`    ${d}`);
} else console.log('\n  Ningún CWP ya asignado queda desplazado.');
console.log('\n  Documentos que no cuelgan de ningún CWP:');
for (const [k, v] of [...motivos].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(4)}  ${k}`);

if (!APLICAR) { console.log('\nSimulación. Repite con --aplicar para escribir.'); process.exit(0); }

// ── Escritura ───────────────────────────────────────────────────────────────
// No hay índice único sobre (project_id, n_cmdic) — otro proyecto tiene códigos repetidos sin
// depurar — así que el upsert se resuelve leyendo primero.
console.log('\nEscribiendo…');
const { data: existentes } = await sb.from('mining_doc_aconex').select('id, n_cmdic').eq('project_id', PROJECT_ID).order('n_cmdic');
const idPorCodigo = new Map((existentes ?? []).map(r => [normalizar(r.n_cmdic), r.id]));
let actualizados = 0, insertados = 0, nuevos = [];
for (const d of docs) {
  const id = idPorCodigo.get(d.n_cmdic);
  if (id) {
    const { error } = await sb.from('mining_doc_aconex').update(d).eq('id', id);
    if (error) { console.error(`  ${d.n_cmdic}: ${error.message}`); continue; }
    actualizados++;
  } else nuevos.push(d);
}
for (let i = 0; i < nuevos.length; i += 500) {
  const { error } = await sb.from('mining_doc_aconex').insert(nuevos.slice(i, i + 500));
  if (error) { console.error(`  error al insertar: ${error.message}`); process.exit(1); }
  insertados += nuevos.slice(i, i + 500).length;
}
console.log(`  documentos: ${actualizados} actualizados · ${insertados} nuevos`);

const { error: eDel } = await sb.from('mining_planos').delete().eq('project_id', PROJECT_ID);
if (eDel) { console.error('  error al limpiar vínculos:', eDel.message); process.exit(1); }
// Los documentos que ya tenían vínculo y el export nuevo no menciona se reponen tal cual:
// borrar la tabla no puede significar perder una asignación que nadie pidió deshacer.
const porCodigo = new Map(docs.map(d => [d.n_cmdic, d]));
const todos = [...enlaces];
for (const c of huerfanos) for (const [cwp, conf] of previos.get(c)) todos.push({ codigo: c, cwp, confianza: conf });

const filasPlano = todos.map(e => {
  const d = porCodigo.get(e.codigo);
  const p = (planosPrevios ?? []).find(x => normalizar(x.codigo_documento) === e.codigo && x.cwp_id === e.cwp);
  return {
    project_id: PROJECT_ID, cwp_id: e.cwp, codigo_documento: e.codigo,
    descripcion: d?.titulo ?? null, tipo: d?.tipo_doc ?? null, rev: d?.rev ?? null,
    estado_ciclo_vida: d?.estado_ciclo_vida ?? null,
    confianza: e.confianza ?? p?.confianza ?? null,
  };
});
let n = 0;
for (let i = 0; i < filasPlano.length; i += 500) {
  const { error } = await sb.from('mining_planos').insert(filasPlano.slice(i, i + 500));
  if (error) { console.error('  error en vínculos:', error.message); process.exit(1); }
  n += Math.min(500, filasPlano.length - i);
}
console.log(`  vínculos documento → CWP: ${n}`);
