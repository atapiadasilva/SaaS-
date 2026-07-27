/**
 * Vincula los elementos del modelo (export de Assemble) con los CWP de Andina.
 *
 * El export trae un WBS de Assemble por elemento ("1.01 Construcción Banco de ductos") que
 * NO es el código CWP, pero cuyo texto corresponde al nombre del paquete en el programa.
 * El match se hace por similitud de nombre y SIEMPRE se imprime para revisión humana:
 * un elemento asignado al paquete equivocado es peor que un elemento sin asignar.
 *
 * Uso: node --env-file=.env.local scripts/match-elementos-andina.mjs <assemble.xlsx> <project_id> [--aplicar]
 *      Sin --aplicar solo muestra el mapeo propuesto; no escribe nada.
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { num } from './numeros.mjs';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const [F, PROJECT_ID] = args.filter(a => !a.startsWith('--'));
if (!F || !PROJECT_ID) { console.error('Uso: match-elementos-andina.mjs <assemble.xlsx> <project_id> [--aplicar]'); process.exit(1); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const normalizar = (s) => String(s ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/^[\d.]+\s*/, '')            // quita el prefijo "1.01 "
  .replace(/[^a-z0-9 ]/g, ' ')
  .split(/\s+/).filter(w => w.length > 3 && !['construccion', 'para', 'incluye', 'desde'].includes(w));

/** Similitud = proporción de palabras significativas compartidas (índice de Jaccard). */
function similitud(a, b) {
  const A = new Set(normalizar(a)), B = new Set(normalizar(b));
  if (!A.size || !B.size) return 0;
  const comunes = [...A].filter(w => B.has(w)).length;
  return comunes / Math.min(A.size, B.size);
}

// ── CWP del proyecto ────────────────────────────────────────────────────────
const { data: cwps, error } = await sb.from('mining_cwp')
  .select('cwp_id, cwp_nombre, cwa_id, cv_id, disciplina_cod').eq('project_id', PROJECT_ID);
if (error) { console.error(error.message); process.exit(1); }
console.log(`CWP en el proyecto: ${cwps.length}`);

// ── Export de Assemble ──────────────────────────────────────────────────────
const filas = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(F), { type: 'buffer' }).Sheets['POR CWP'], { header: 1, defval: '', raw: false });
const iH = filas.findIndex(r => r.filter(c => String(c).trim()).length > 5);
const hdr = filas[iH].map(c => String(c).trim());
const col = (n) => hdr.findIndex(h => h.toLowerCase().startsWith(n.toLowerCase()));
const iWbs = col('WBS_1'), iTag = col('TAG'), iItem = col('Item'), iSrc = col('Source ID'), iQty = col('Quantity'), iVol = col('VOLUMEN');
const datos = filas.slice(iH + 1).filter(r => r.some(c => String(c).trim()));

// ── Mapeo WBS → CWP, para revisión ──────────────────────────────────────────
const wbsUnicos = [...new Set(datos.map(r => String(r[iWbs] ?? '').trim()).filter(w => w && w !== 'Not Assigned'))];
const mapa = new Map();
console.log(`\nMAPEO PROPUESTO (revisar antes de aplicar)\n${'-'.repeat(88)}`);
for (const w of wbsUnicos) {
  const ranking = cwps.map(c => ({ c, s: similitud(w, c.cwp_nombre) })).sort((a, b) => b.s - a.s);
  const mejor = ranking[0], segundo = ranking[1];
  const aceptado = mejor.s >= 0.6;
  if (aceptado) mapa.set(w, mejor.c);
  console.log(`${aceptado ? 'OK ' : '?? '} "${w}"`);
  console.log(`      -> ${mejor.c.cwp_id}  "${mejor.c.cwp_nombre}"   similitud ${(mejor.s * 100).toFixed(0)}%`);
  if (segundo && segundo.s > 0.3) console.log(`      (2º candidato: ${segundo.c.cwp_id} "${segundo.c.cwp_nombre}" ${(segundo.s * 100).toFixed(0)}%)`);
}

// ── Elementos ───────────────────────────────────────────────────────────────
// El export repite el mismo Source ID en varias filas (una por cantidad/material), pero en
// el modelo es UN elemento. La llave de mining_elementos es el moniker, así que se deduplica.
const elementos = [];
const vistos = new Set();
let sinWbs = 0, sinMatch = 0, duplicados = 0;
for (const r of datos) {
  const src = String(r[iSrc] ?? '').trim();
  const tag = String(r[iTag] ?? '').trim();
  if (!src && !tag) continue;
  const w = String(r[iWbs] ?? '').trim();
  if (!w || w === 'Not Assigned') { sinWbs++; continue; }
  const cwp = mapa.get(w);
  if (!cwp) { sinMatch++; continue; }
  const moniker = src || tag;
  if (vistos.has(moniker)) { duplicados++; continue; }
  vistos.add(moniker);
  elementos.push({
    project_id: PROJECT_ID,
    sp3d_moniker: moniker,
    guid_modelo: src || null,
    tag_equipo: tag || null,
    name: String(r[iItem] ?? '').trim() || tag || null,
    tipo_elemento: String(r[iItem] ?? '').split(':')[0].trim() || null,
    cwp_id: cwp.cwp_id, cwa_id: cwp.cwa_id, cv_id: cwp.cv_id, disciplina: cwp.disciplina_cod,
    volumen_m3: num(r[iVol]),
    cwp_fuente: 'assemble-wbs',
  });
}

console.log(`\n${'-'.repeat(88)}`);
console.log(`Elementos a vincular : ${elementos.length}`);
console.log(`Sin WBS en Assemble  : ${sinWbs}  (el modelo aún no está paquetizado en esa parte)`);
if (duplicados) console.log(`Filas repetidas      : ${duplicados}  (mismo elemento en varias filas del export)`);
if (sinMatch) console.log(`WBS sin CWP asociado : ${sinMatch}`);

if (!APLICAR) { console.log(`\nSimulación. Repite con --aplicar para escribir en la base.`); process.exit(0); }

await sb.from('mining_elementos').delete().eq('project_id', PROJECT_ID);
let n = 0;
for (let i = 0; i < elementos.length; i += 500) {
  const { error: e } = await sb.from('mining_elementos').insert(elementos.slice(i, i + 500));
  if (e) { console.error('  error:', e.message); break; }
  n += Math.min(500, elementos.length - i);
}
console.log(`\nElementos cargados: ${n}`);
