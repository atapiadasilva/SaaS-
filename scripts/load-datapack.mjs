/**
 * Loader parametrizado de un "data pack" Hilo Digital (Excel) a un proyecto.
 * Carga las hojas P1–P10 usando CWP_hilo como llave. Ver docs/DATA_PACK.md.
 *
 * Uso: node --env-file=.env.local scripts/load-datapack.mjs <archivo.xlsx> <project_id> [--forzar]
 *
 * Antes de escribir nada corre el validador (scripts/validar-datapack.mjs) y aborta si
 * encuentra errores bloqueantes: es preferible no cargar a dejar un proyecto con datos
 * que no cruzan. --forzar salta esa protección.
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import { validarDataPack, imprimirInforme } from './validar-datapack.mjs';
import { num, fecha } from './numeros.mjs';

const args = process.argv.slice(2);
const FORZAR = args.includes('--forzar');
const SECO = args.includes('--dry-run'); // simula la carga sin escribir en la base
const [FILE, PROJECT_ID] = args.filter(a => !a.startsWith('--'));
if (!FILE || !PROJECT_ID) { console.error('Uso: load-datapack.mjs <xlsx> <project_id> [--dry-run] [--forzar]'); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local)'); process.exit(1); }
const sb = createClient(url, key);

// ── Validación previa ────────────────────────────────────────────────────────
console.log(`Validando: ${FILE}`);
const informe = validarDataPack(FILE);
const nErrores = imprimirInforme(informe);
if (nErrores && !FORZAR) {
  console.error('\nCarga abortada. Corrige el pack o repite con --forzar.');
  process.exit(1);
}
if (nErrores && FORZAR) console.warn('\n--forzar activo: se carga pese a los errores.\n');

// ── Lectura ──────────────────────────────────────────────────────────────────
const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer', cellDates: false });
const hoja = (pref) => {
  const name = wb.SheetNames.find(n => n.startsWith(pref));
  return name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false }) : [];
};
// Parseo de números y fechas: ver scripts/numeros.mjs (los packs mezclan formatos es-CL y
// en-US, y confundirlos produce cifras plausibles pero equivocadas).
const CWP = r => String(r.CWP_hilo || r.CWP || '').trim() || null;
// CWA = primeros 4 caracteres del CV; el CV es de largo variable (6 en Collahuasi, 7 en Spence).
// Formatos de CWP admitidos (espejo de src/lib/awp-codigo.ts):
//   canónico   312101.C001            CV + disciplina + secuencia
//   prefijado  CWP-3351-10-BA-010     área + sector + disciplina + secuencia (Andina)
const partesCwp = (c) => {
  const s = String(c ?? '').trim();
  const p = s.match(/^CWP-(\d{4})-(\d{2})-([A-Za-z]{2,3})-(\d{2,4})$/i);
  if (p) return { cv: p[1] + p[2], cwa: p[1], disc: p[3].toUpperCase() };
  const m = s.match(/^(\d{4,8})\.([A-Za-z]+)(\d+)$/);
  return m ? { cv: m[1], cwa: m[1].slice(0, 4), disc: m[2].toUpperCase() } : null;
};
const esCwpValido = (c) => partesCwp(c) !== null;

// Tablas que ya pertenecen a un servicio versionado (ver docs/ARQUITECTURA_SERVICIOS.md).
// Ahí NO se borra lo anterior: los datos nuevos caen en un borrador y la carga previa queda
// como versión histórica. Borrarla sería imposible además de indeseable — el trigger de
// inmutabilidad rechaza tocar una versión publicada.
const SERVICIO_DE_TABLA = {
  mining_personal: 'recursos',
  mining_dotacion: 'recursos',
};
const serviciosTocados = new Set();

async function reemplazar(tabla, rows) {
  if (SECO) return `${rows.length} (simulado)`;
  const servicio = SERVICIO_DE_TABLA[tabla];
  if (servicio) serviciosTocados.add(servicio);
  else await sb.from(tabla).delete().eq('project_id', PROJECT_ID);

  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(tabla).insert(rows.slice(i, i + 500));
    if (error) { console.error(`  ${tabla}:`, error.message); return n; }
    n += Math.min(500, rows.length - i);
  }
  return servicio ? `${n} (en borrador de "${servicio}")` : n;
}

// Publicar es un acto deliberado: lo cargado no lo ve nadie hasta que ocurre. El loader lo
// hace explícito al final para que una carga completa quede utilizable de inmediato.
async function publicarServicios(nota) {
  for (const servicio of serviciosTocados) {
    const { error } = await sb.schema('pub').rpc('publicar_version', {
      p_project: PROJECT_ID, p_servicio: servicio, p_nota: nota,
    });
    if (error) {
      console.error(`  publicar ${servicio}:`, error.message);
      if (/schema must be one of/i.test(error.message)) {
        console.error('  → Falta exponer el schema "pub": Supabase → Settings → API → Exposed schemas.');
        console.error('     Los datos quedaron cargados en el borrador; publícalos cuando lo hagas.');
      }
    } else console.log(`servicio "${servicio}": versión publicada`);
  }
}

// ── P10 Ruta a ejecución: no es una tabla aparte, enriquece el catálogo CWP ──
const rutaPorCwp = new Map();
for (const r of hoja('P10')) {
  const c = CWP(r); if (!c) continue;
  rutaPorCwp.set(c, {
    fecha_ifc: fecha(r.Fecha_IFC),
    suministro: r.Estado_suministro || null,
    fecha_ini: fecha(r.Inicio_construccion),
    fecha_fin: fecha(r.Termino_construccion),
    hh_planner: num(r.HH),
  });
}

// ── P1 Catálogo CWP (+ P10) y derivación de CWA/CV ──
const p1 = hoja('P1');
const cwps = p1.map(r => {
  const id = CWP(r);
  const p = partesCwp(id);
  const ruta = rutaPorCwp.get(id) ?? {};
  return {
    project_id: PROJECT_ID, cwp_id: id, cwp_nombre: r.Nombre || null,
    ewp_id: r.EWP || (id ? id + 'E' : null),
    cwa_id: r.CWA || p?.cwa || null, cv_id: r.CV || p?.cv || null,
    disciplina_cod: r.Disciplina || p?.disc || null, disciplina: r.Disciplina_nombre || null,
    alcance: r.Alcance || null, costo_oferta_clp: num(r.Costo_oferta_CLP),
    hh_planner: ruta.hh_planner ?? num(r.HH_planner),
    fecha_ini: ruta.fecha_ini ?? fecha(r.Fecha_ini),
    fecha_fin: ruta.fecha_fin ?? fecha(r.Fecha_fin),
    fecha_ifc: ruta.fecha_ifc ?? null,
    suministro: ruta.suministro ?? null,
    es_oficial: true,
  };
}).filter(x => x.cwp_id);

const cwaMap = new Map(), cvMap = new Map();
for (const r of p1) {
  const p = partesCwp(CWP(r));
  const cwa = r.CWA || p?.cwa, cv = r.CV || p?.cv;
  if (cwa) cwaMap.set(cwa, { project_id: PROJECT_ID, cwa_id: cwa, cwa_nombre: r.CWA_legible || cwa, es_oficial: true });
  if (cv) cvMap.set(cv, { project_id: PROJECT_ID, cv_id: cv, cv_nombre: r.CV_legible || cv, cwa_id: cwa || null, es_oficial: true });
}

// ── P2 Programa ──
const programa = hoja('P2').map(r => ({ project_id: PROJECT_ID, cod_actividad: String(r.Cod_actividad || '').trim(),
  nombre_actividad: r.Nombre_actividad || null, hh: num(r.HH), fecha_inicio: fecha(r.Fecha_inicio),
  fecha_fin: fecha(r.Fecha_fin), cwp_id: CWP(r), fuente: 'P333', tipo: r.Tipo_actividad || null,
  cantidad: num(r.Cantidad), unidad: r.Unidad || null, wbs: r.WBS || null, cwa_id: r.CWA || null,
  })).filter(x => x.cod_actividad);

// ── P4b Mapeo Commodity→Partida M&P: rellena Partida_MyP cuando el itemizado no la trae ──
const partidaPorCommodity = new Map();
for (const r of hoja('P4b')) {
  const com = String(r.Commodity_itemizado || '').trim();
  const par = String(r.Partida || '').trim();
  if (com && par) partidaPorCommodity.set(com.toUpperCase(), par);
}

// ── P3 Itemizado ──
// OJO: partida_bmp guarda el CÓDIGO DE PROGRAMA (Cod_programa) y partida_mp la partida de
// Bases de M&P. Son columnas distintas y se usan para cruces distintos; no intercambiarlas.
let rellenadosPorCommodity = 0;
const items = hoja('P3').map(r => {
  let mp = String(r.Partida_MyP || '').trim() || null;
  if (!mp && r.Commodity) {
    const cand = partidaPorCommodity.get(String(r.Commodity).trim().toUpperCase());
    if (cand) { mp = cand; rellenadosPorCommodity++; }
  }
  return { project_id: PROJECT_ID, item: String(r.Item || '').trim(),
    descripcion: r.Descripcion || null, unidad: r.Unidad || null, cantidad: num(r.Cantidad),
    hh_unidad: num(r.Rendimiento_HH_unidad), hh_item: num(r.HH), cwp_id: CWP(r),
    partida_bmp: r.Cod_programa || null, commodity: r.Commodity || null, partida_mp: mp,
    area: r.Area || null, wbs: r.WBS || null, pu_clp: num(r.Precio_unitario_CLP), p_total_clp: num(r.Total_CLP) };
}).filter(x => x.item);

// ── P4 Bases M&P ──
const pond = hoja('P4').map((r, i) => ({ project_id: PROJECT_ID, item_code: r.Partida || null,
  item_nombre: r.Nombre_partida || null, commodity: r.Commodity || null,
  tipo: String(r.Tipo || '').toLowerCase().replace('físico', 'fisico') || null,
  hito: r.Paso_o_hito || null, peso: num(r.Peso), orden: num(r.Orden) ?? i })).filter(x => x.item_code);

// ── P5 Elementos BIM ──
const elementos = hoja('P5').map(r => {
  const id = CWP(r); const p = partesCwp(id);
  return { project_id: PROJECT_ID, sp3d_moniker: String(r.SP3D_MONIKER || '').trim() || null,
    name: r.Nombre || null, disciplina: r.Disciplina || null, tipo_elemento: r.Tipo_elemento || null,
    guid_modelo: r.GUID || null, cwp_id: id, cwa_id: r.CWA || p?.cwa || null, cv_id: r.CV || p?.cv || null,
    descripcion: r.Descripcion || null, material: r.Material || null, wbs: r.WBS || null };
}).filter(x => x.sp3d_moniker || x.guid_modelo);

// ── P7 Trisemanal (3WLA): alimenta actividades y, por separado, sus restricciones ──
// Las 4 columnas de restricción del pack se normalizan a filas de mining_3wla_restriccion,
// que es donde el módulo Trisemanal lee los bloqueos por CWP.
const hoy = new Date().toISOString().slice(0, 10);
const p7 = hoja('P7');
const trisemanal = p7.map(r => ({ project_id: PROJECT_ID, fecha_control: fecha(r.Fecha_control) ?? hoy,
  id_p6: String(r.ID_P6 || '').trim() || null, cwp_id: CWP(r), actividad: r.Actividad || null,
  especialidad: r.Especialidad || null, commodity: r.Commodity || null, hh_total: num(r.HH),
  fecha_ini: fecha(r.Fecha_inicio), fecha_fin: fecha(r.Fecha_fin),
  unidad: r.Unidad || null, cantidad: num(r.Cantidad), wbs: r.WBS || null })).filter(x => x.actividad || x.id_p6);

const TIPOS_RESTRICCION = [
  ['Restriccion_ingenieria_RFI', 'Ingeniería'],
  ['Restriccion_seguridad',      'Seguridad'],
  ['Restriccion_suministro',     'Suministro'],
  ['Restriccion_maquinaria',     'Maquinaria'],
];
const restricciones = [];
for (const r of p7) {
  for (const [col, tipo] of TIPOS_RESTRICCION) {
    const desc = String(r[col] || '').trim();
    if (!desc || /^(no|n\/a|ninguna|sin)$/i.test(desc)) continue;
    restricciones.push({ project_id: PROJECT_ID, fecha_control: fecha(r.Fecha_control) ?? hoy,
      id_p6: String(r.ID_P6 || '').trim() || null, cwp_id: CWP(r), tipo, descripcion: desc,
      actividad_p6: r.Actividad || null, fecha_identificacion: hoy,
      fecha_compromiso: fecha(r.Fecha_compromiso), responsable: r.Responsable || null,
      status: r.Estado || 'Abierta' });
  }
}

// ── P8 Personal ──
const personal = hoja('P8').map(r => ({ project_id: PROJECT_ID, n: num(r.N), nombre: r.Nombre || null,
  cargo: r.Cargo || null, tipo: r.Directo_Indirecto || null, cuadrilla: r.Cuadrilla || null,
  fecha_compromiso: fecha(r.Fecha_compromiso), estado_acreditacion: r.Estado_acreditacion || null })).filter(x => x.nombre);

// ── P9 Suministros ──
const suministros = hoja('P9').map(r => ({ project_id: PROJECT_ID, cwp_id: CWP(r),
  descripcion_material: r.Descripcion || null, proveedor: r.Responsable || null,
  fecha_entrega_plan: fecha(r.Fecha_comprometida), liberado: false, numero_po: r.PEP_id || null,
  observacion: [r.Criticidad, r.CWA && `CWA ${r.CWA}`].filter(Boolean).join(' · ') || null })).filter(x => x.descripcion_material);

// ── P6 Documentos + P6b vínculos doc↔CWP ──
const docs = hoja('P6');
const docMeta = new Map(docs.map(d => [String(d.N_documento), d]));
const docAconex = docs.map(d => ({ project_id: PROJECT_ID, n_cmdic: String(d.N_documento || '').trim() || null,
  titulo: d.Titulo || null, tipo_doc: d.Tipo || null, rev: d.Revision != null ? String(d.Revision) : null,
  estado_aconex: d.Estado_Aconex || null, disciplina_doc: d.Disciplina_aconex || null, cwa_id: d.CWA || null,
  n_interno: d.Codigo_interno || null, archivo: d.Ruta_archivo || null, fecha_modificacion: fecha(d.Fecha_Aconex),
  // El CWP del documento se acepta si respeta alguno de los formatos válidos. Antes se
  // exigía que contuviera un punto, lo que descartaba en silencio el formato prefijado
  // (CWP-3351-10-PA-220) y dejaba toda la capa documental sin llave.
  origen: d.Empresa || null, cwp_id_exacto: (esCwpValido(d.CWP) ? String(d.CWP).trim() : null) })).filter(x => x.n_cmdic);
const planos = hoja('P6b').map(r => { const m = docMeta.get(String(r.N_documento)) ?? {};
  return { project_id: PROJECT_ID, cwp_id: CWP(r),
    codigo_documento: String(r.N_documento || '').trim() || null, descripcion: m.Titulo || null,
    tipo: m.Tipo || 'Documento', confianza: r.Origen_del_vinculo || 'pack' }; }).filter(x => x.cwp_id && x.codigo_documento);

// ── Escritura ────────────────────────────────────────────────────────────────
console.log(`\n${SECO ? 'SIMULACIÓN (--dry-run: no se escribe nada)' : 'Cargando'} en el proyecto ${PROJECT_ID}`);
console.log(`CWA ${cwaMap.size} · CV ${cvMap.size} · CWP ${cwps.length} · Programa ${programa.length} · Itemizado ${items.length} · Ponderaciones ${pond.length} · Elementos ${elementos.length} · Trisemanal ${trisemanal.length} · Restricciones ${restricciones.length} · Personal ${personal.length} · Suministros ${suministros.length} · Docs ${docAconex.length} · Planos ${planos.length}`);
if (rutaPorCwp.size) console.log(`P10: ruta a ejecución aplicada a ${rutaPorCwp.size} CWP (fecha IFC, suministro, ventana de construcción).`);
if (rellenadosPorCommodity) console.log(`P4b: ${rellenadosPorCommodity} ítems recibieron Partida_MyP derivada del commodity.`);

console.log('cwa:', await reemplazar('mining_cwa', [...cwaMap.values()]));
console.log('cv:', await reemplazar('mining_cv', [...cvMap.values()]));
console.log('cwp:', await reemplazar('mining_cwp', cwps));
console.log('programa:', await reemplazar('mining_programa', programa));
console.log('itemizado:', await reemplazar('mining_itemizado', items));
console.log('ponderaciones:', await reemplazar('mining_ponderaciones', pond));
if (elementos.length) console.log('elementos:', await reemplazar('mining_elementos', elementos));
if (trisemanal.length) console.log('trisemanal:', await reemplazar('mining_3wla', trisemanal));
if (restricciones.length) console.log('restricciones:', await reemplazar('mining_3wla_restriccion', restricciones));
console.log('personal:', await reemplazar('mining_personal', personal));
console.log('suministros:', await reemplazar('mining_suministro', suministros));
console.log('doc_aconex:', await reemplazar('mining_doc_aconex', docAconex));
console.log('planos:', await reemplazar('mining_planos', planos));

if (!SECO) await publicarServicios(`Carga de data pack: ${FILE.split(/[\\/]/).pop()}`);

console.log('\nListo. Revisa la madurez del proyecto en /<org>/proyectos.');
