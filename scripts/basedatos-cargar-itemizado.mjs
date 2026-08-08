/**
 * Carga el itemizado E-1 Rev.5 desde el paquete `SCPY_EIMI00418_BaseDatos` a `mining_itemizado`.
 *
 * Qué gana: pasa de 253 partidas a 1.280, y con costo — `costo_oferta_clp` estaba vacío en los 58
 * CWP porque el dato no existía en ninguna fuente cargada.
 *
 * Las dos llaves de cruce, que se confunden fácil (ver CLAUDE.md):
 *   partida_bmp  = código de ACTIVIDAD del programa (A1250). Sale de `map_partida_actividad`,
 *                  que es la Matriz de Correspondencia partida ↔ cronograma. NO es `fact_partida.bmp`,
 *                  que es un código de agrupación de Bases M&P (C02, P07) con otro significado.
 *   partida_mp   = código de Bases M&P (E06.02), el que alimenta el avance físico del Estado de Pago.
 *                  NO viene en el paquete nuevo: se arrastra de lo que ya estaba cargado, por item.
 *                  Las partidas nuevas quedan sin él y se reportan — inventarlo corrompería el avance.
 *
 * Uso:
 *   node --env-file=.env.local scripts/basedatos-cargar-itemizado.mjs <carpeta-json> <project_id> [--aplicar]
 */
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const opt = (n, d = '') => (args.find(a => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=') || d;
const [DIR, PROJECT_ID] = args.filter(a => !a.startsWith('--'));
if (!DIR || !PROJECT_ID) {
  console.error('Uso: basedatos-cargar-itemizado.mjs <carpeta-json> <project_id> [--aplicar] [--catalogo=ruta.xlsx]');
  process.exit(1);
}
const CATALOGO = opt('catalogo', 'C:\\Users\\atapiad\\Downloads\\EIMI00418_SCPY_Paquetes_HiloDigital.xlsx');
/** Matriz de Correlación del programa vigente. Si se pasa, manda sobre la del paquete. */
const MATRIZ = opt('matriz', null);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const leer = (n) => JSON.parse(fs.readFileSync(path.join(DIR, `${n}.json`), 'utf8'));
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };

// ── Diccionario de CWP: el paquete usa el código legado (0044-100-CL), Hilo el suyo ─────────
const wb = XLSX.read(fs.readFileSync(CATALOGO), { type: 'buffer' });
const aHilo = new Map(XLSX.utils.sheet_to_json(wb.Sheets['P1 Catálogo CWP'], { defval: '', raw: false })
  .map(r => [String(r.CWP).trim(), String(r.CWP_hilo).trim()]));

const fp = leer('fact_partida');
const mapa = leer('map_partida_actividad');
console.log(`fact_partida: ${fp.length} partidas   ·   map_partida_actividad: ${mapa.length} vínculos`);

/** item_no → código de actividad. Un item mapea a una sola actividad salvo un caso; se toma la primera. */
const actPorItem = new Map();
for (const m of mapa) {
  const k = String(m.item_no ?? '').trim();
  if (k && !actPorItem.has(k)) actPorItem.set(k, String(m.act_codigo ?? '').trim() || null);
}
// La Matriz de Correlación del programa vigente es más nueva que la del paquete y manda sobre ella:
// el Rev.0 movió actividades, y quedarse con el puente viejo dejaría partidas apuntando a códigos
// que ya no existen en el cronograma.
if (MATRIZ && fs.existsSync(MATRIZ)) {
  const wb2 = XLSX.read(fs.readFileSync(MATRIZ), { type: 'buffer' });
  const hoja = wb2.Sheets[wb2.SheetNames.find(n => /correlaci/i.test(n)) ?? wb2.SheetNames[0]];
  const bruto = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: true });
  const iHdr = bruto.findIndex(r => r.some(c => String(c).trim() === 'ID P6'));
  const hdr = (bruto[iHdr] ?? []).map(c => String(c ?? '').trim());
  const iItem = hdr.findIndex(h => /^Item No/i.test(h)), iId = hdr.indexOf('ID P6');
  let n = 0;
  for (const r of bruto.slice(iHdr + 1)) {
    const item = String(r[iItem] ?? '').trim(), act = String(r[iId] ?? '').trim();
    if (!item || !act) continue;
    actPorItem.set(item, act);
    n++;
  }
  console.log(`Matriz de Correlación vigente: ${n} vínculos partida → actividad (reemplazan a los del paquete)`);
}

// ── Lo que ya está cargado: de ahí se arrastra partida_mp y commodity ───────────────────────
const previas = new Map();
for (let p = 0; ; p++) {
  const { data, error } = await sb.from('mining_itemizado')
    .select('item, partida_mp, commodity').eq('project_id', PROJECT_ID).order('item').range(p * 1000, p * 1000 + 999);
  if (error) { console.error(error.message); process.exit(1); }
  for (const r of data ?? []) previas.set(String(r.item).trim(), r);
  if ((data?.length ?? 0) < 1000) break;
}
console.log(`Ya cargadas: ${previas.size} partidas (de ahí se arrastra partida_mp y commodity)`);

// ── Armado ──────────────────────────────────────────────────────────────────
const filas = [];
let sinCwp = 0, cwpNoTraducible = 0, conActividad = 0, conMp = 0, cero = 0;
const cwpsFuera = new Set();
for (const r of fp) {
  const item = String(r.item_no ?? '').trim();
  if (!item) continue;
  const legado = String(r.cwp ?? '').trim();
  if (!legado) { sinCwp++; continue; }
  const cwp = aHilo.get(legado);
  if (!cwp) { cwpNoTraducible++; cwpsFuera.add(legado); continue; }

  const act = actPorItem.get(item) ?? null;
  if (act) conActividad++;
  const prev = previas.get(item);
  if (prev?.partida_mp) conMp++;
  const hh = num(r.hh_total) ?? 0;
  if (!hh) cero++;

  filas.push({
    project_id: PROJECT_ID,
    item,
    descripcion: String(r.descripcion ?? '').trim() || null,
    unidad: String(r.unidad ?? '').trim() || null,
    cantidad: num(r.cantidad),
    hh_unidad: num(r.rend_hh_un),
    hh_item: hh,
    pu_clp: num(r.pu_clp),
    p_total_clp: num(r.total_clp),
    cwp_id: cwp,
    cwa_id: cwp.slice(0, 4),
    area: String(r.cwa ?? '').trim() || null,
    wbs: String(r.grupo ?? '').trim() || null,
    tipo_partida: String(r.disciplina_nombre ?? '').trim() || null,
    partida_bmp: act,                       // código de actividad del programa
    partida_mp: prev?.partida_mp ?? null,   // Bases M&P: solo lo que ya existía
    commodity: prev?.commodity ?? null,
    vinculado: !!act,
  });
}

console.log(`\nA cargar: ${filas.length} partidas`);
console.log(`  descartadas sin CWP en la oferta        : ${sinCwp}`);
console.log(`  descartadas con CWP fuera del catálogo  : ${cwpNoTraducible}  → ${[...cwpsFuera].sort().join(', ')}`);
console.log(`  con código de actividad del programa    : ${conActividad}`);
console.log(`  con partida_mp arrastrada de lo anterior: ${conMp}   (el resto queda sin avance físico asociado)`);
console.log(`  con 0 HH (vaciadas por la Adenda 3)     : ${cero}`);

const porCwp = new Map();
for (const f of filas) porCwp.set(f.cwp_id, (porCwp.get(f.cwp_id) ?? 0) + 1);
const hhTotal = filas.reduce((a, f) => a + (f.hh_item || 0), 0);
const clpTotal = filas.reduce((a, f) => a + (f.p_total_clp || 0), 0);
console.log(`  CWP cubiertos: ${porCwp.size}   ·   ${Math.round(hhTotal).toLocaleString('es-CL')} HH   ·   ${Math.round(clpTotal).toLocaleString('es-CL')} CLP`);

if (!APLICAR) { console.log('\nSimulación. Repite con --aplicar para escribir.'); process.exit(0); }

console.log('\nEscribiendo…');
const { error: eDel } = await sb.from('mining_itemizado').delete().eq('project_id', PROJECT_ID);
if (eDel) { console.error('  error al limpiar:', eDel.message); process.exit(1); }
let n = 0;
for (let i = 0; i < filas.length; i += 500) {
  const lote = filas.slice(i, i + 500);
  const { error } = await sb.from('mining_itemizado').insert(lote);
  if (error) { console.error('  error:', error.message); process.exit(1); }
  n += lote.length;
  process.stdout.write(`\r  ${n} / ${filas.length}`);
}
console.log(`\n  ${n} partidas cargadas`);
