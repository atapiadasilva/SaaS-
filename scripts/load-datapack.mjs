/**
 * Loader parametrizado de un "data pack" Hilo Digital (Excel de Cowork) a un proyecto.
 * Carga Catálogo CWP, Programa, Itemizado y Bases de M&P usando CWP_hilo como clave.
 * Uso: node --env-file=.env.local scripts/load-datapack.mjs <archivo.xlsx> <project_id>
 */
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import fs from 'node:fs';

const [, , FILE, PROJECT_ID] = process.argv;
if (!FILE || !PROJECT_ID) { console.error('Uso: load-datapack.mjs <xlsx> <project_id>'); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);

const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer', cellDates: false });
const hoja = (pref) => {
  const name = wb.SheetNames.find(n => n.startsWith(pref));
  return name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false }) : [];
};
const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/\s/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',', '.')); return isNaN(n) ? null : n; };
const fecha = v => { const m = String(v ?? '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null; };
const CWP = r => String(r.CWP_hilo || r.CWP || '').trim() || null;

async function reemplazar(tabla, rows) {
  await sb.from(tabla).delete().eq('project_id', PROJECT_ID);
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(tabla).insert(rows.slice(i, i + 500));
    if (error) { console.error(`  ${tabla}:`, error.message); return n; }
    n += Math.min(500, rows.length - i);
  }
  return n;
}

// P1 Catálogo CWP + derivar CWA/CV
const p1 = hoja('P1');
const cwps = p1.map(r => ({ project_id: PROJECT_ID, cwp_id: CWP(r), cwp_nombre: r.Nombre || null,
  ewp_id: r.EWP || (CWP(r) ? CWP(r) + 'E' : null), cwa_id: r.CWA || null, cv_id: r.CV || null,
  disciplina_cod: r.Disciplina || null, disciplina: r.Disciplina_nombre || null,
  alcance: r.Alcance || null, costo_oferta_clp: num(r.Costo_oferta_CLP), hh_planner: num(r.HH_planner),
  fecha_ini: fecha(r.Fecha_ini), fecha_fin: fecha(r.Fecha_fin), es_oficial: true })).filter(x => x.cwp_id);
const cwaMap = new Map(), cvMap = new Map();
for (const r of p1) { if (r.CWA) cwaMap.set(r.CWA, { project_id: PROJECT_ID, cwa_id: r.CWA, cwa_nombre: r.CWA, es_oficial: true });
  if (r.CV) cvMap.set(r.CV, { project_id: PROJECT_ID, cv_id: r.CV, cv_nombre: r.CV_legible || r.CV, cwa_id: r.CWA || null, es_oficial: true }); }

// P2 Programa
const programa = hoja('P2').map(r => ({ project_id: PROJECT_ID, cod_actividad: String(r.Cod_actividad || '').trim(),
  nombre_actividad: r.Nombre_actividad || null, hh: num(r.HH), fecha_inicio: fecha(r.Fecha_inicio),
  fecha_fin: fecha(r.Fecha_fin), cwp_id: CWP(r), fuente: 'P333', tipo: r.Tipo_actividad || null,
  cantidad: num(r.Cantidad), unidad: r.Unidad || null, wbs: r.WBS || null, cwa_id: r.CWA || null,
  })).filter(x => x.cod_actividad);

// P3 Itemizado
const items = hoja('P3').map(r => ({ project_id: PROJECT_ID, item: String(r.Item || '').trim(),
  descripcion: r.Descripcion || null, unidad: r.Unidad || null, cantidad: num(r.Cantidad),
  hh_unidad: num(r.Rendimiento_HH_unidad), hh_item: num(r.HH), cwp_id: CWP(r),
  partida_bmp: r.Cod_programa || null, commodity: r.Commodity || null, partida_mp: r.Partida_MyP || null,
  area: r.Area || null, wbs: r.WBS || null, pu_clp: num(r.Precio_unitario_CLP), p_total_clp: num(r.Total_CLP) })).filter(x => x.item);

// P4 Bases M&P
const pond = hoja('P4').map((r, i) => ({ project_id: PROJECT_ID, item_code: r.Partida || null,
  item_nombre: r.Nombre_partida || null, commodity: r.Commodity || null, tipo: r.Tipo || null,
  hito: r.Paso_o_hito || null, peso: num(r.Peso), orden: num(r.Orden) ?? i })).filter(x => x.item_code);

// P8 Personal
const personal = hoja('P8').map(r => ({ project_id: PROJECT_ID, n: num(r.N), nombre: r.Nombre || null,
  cargo: r.Cargo || null, tipo: r.Directo_Indirecto || null, cuadrilla: r.Cuadrilla || null,
  fecha_compromiso: fecha(r.Fecha_compromiso), estado_acreditacion: r.Estado_acreditacion || null })).filter(x => x.nombre);

// P9 Suministros
const suministros = hoja('P9').map(r => ({ project_id: PROJECT_ID, cwp_id: null,
  descripcion_material: r.Descripcion || null, proveedor: r.Responsable || null,
  fecha_entrega_plan: fecha(r.Fecha_comprometida), liberado: false, numero_po: r.PEP_id || null,
  observacion: [r.Criticidad, r.CWA && `CWA ${r.CWA}`].filter(Boolean).join(' · ') || null })).filter(x => x.descripcion_material);

// P6 Documentos + P6b vínculos doc↔CWP
const docs = hoja('P6');
const docMeta = new Map(docs.map(d => [String(d.N_documento), d]));
const docAconex = docs.map(d => ({ project_id: PROJECT_ID, n_cmdic: String(d.N_documento || '').trim() || null,
  titulo: d.Titulo || null, tipo_doc: d.Tipo || null, rev: d.Revision != null ? String(d.Revision) : null,
  estado_aconex: d.Estado_Aconex || null, disciplina_doc: d.Disciplina_aconex || null, cwa_id: d.CWA || null,
  n_interno: d.Codigo_interno || null, archivo: d.Ruta_archivo || null, fecha_modificacion: fecha(d.Fecha_Aconex),
  origen: d.Empresa || null, cwp_id_exacto: (String(d.CWP||'').includes('.') ? String(d.CWP) : null) })).filter(x => x.n_cmdic);
const planos = hoja('P6b').map(r => { const m = docMeta.get(String(r.N_documento)) ?? {};
  return { project_id: PROJECT_ID, cwp_id: String(r.CWP_hilo || r.CWP || '').trim() || null,
    codigo_documento: String(r.N_documento || '').trim() || null, descripcion: m.Titulo || null,
    tipo: m.Tipo || 'Documento', confianza: r.Origen_del_vinculo || 'pack' }; }).filter(x => x.cwp_id && x.codigo_documento);

console.log(`CWA ${cwaMap.size} · CV ${cvMap.size} · CWP ${cwps.length} · Programa ${programa.length} · Itemizado ${items.length} · Ponderaciones ${pond.length} · Personal ${personal.length} · Suministros ${suministros.length} · Docs ${docAconex.length} · Planos ${planos.length}`);
console.log('cwa:', await reemplazar('mining_cwa', [...cwaMap.values()]));
console.log('cv:', await reemplazar('mining_cv', [...cvMap.values()]));
console.log('cwp:', await reemplazar('mining_cwp', cwps));
console.log('programa:', await reemplazar('mining_programa', programa));
console.log('itemizado:', await reemplazar('mining_itemizado', items));
console.log('ponderaciones:', await reemplazar('mining_ponderaciones', pond));
console.log('personal:', await reemplazar('mining_personal', personal));
console.log('suministros:', await reemplazar('mining_suministro', suministros));
console.log('doc_aconex:', await reemplazar('mining_doc_aconex', docAconex));
console.log('planos:', await reemplazar('mining_planos', planos));
console.log('✓ listo');
