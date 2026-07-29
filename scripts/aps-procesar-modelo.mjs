/**
 * Flujo completo de incorporación de un modelo BIM a Hilo Digital, en un solo comando.
 *
 *   subir → traducir → extraer propiedades → vincular a CWP → conectar el visor
 *
 * Uso:
 *   node --env-file=.env.local scripts/aps-procesar-modelo.mjs <archivo.nwd> <project_id> [opciones]
 *
 *   --solo-analizar   Sube, traduce y muestra el inventario de propiedades SIN escribir en la base.
 *                     Es el modo recomendado la primera vez con un modelo desconocido: dice qué
 *                     propiedad sirve para vincular antes de tocar nada.
 *   --prop-cwp=A,B    Propiedades que contienen el CWP (por defecto: AutoCad::CWP,Personalizar::CWP,Custom::CWP)
 *   --prop-tag=A,B    Propiedades que contienen el TAG de equipo
 *   --nombre="..."    Nombre del modelo para el visor
 *
 * Por qué APS y no un export de Navisworks: el .nwd es formato cerrado, y los exports manuales
 * salen pobres — en Andina, un CSV de 105.069 filas donde casi todas se llamaban "3D Solid".
 * Vía APS aparecieron 114.365 objetos con 1.892 propiedades, incluido el CWP ya escrito en cada
 * objeto. El match pasó de 270 elementos aproximados a 5.119 exactos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const opt = (n, def = '') => (args.find(a => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=') || def;
const SOLO_ANALIZAR = args.includes('--solo-analizar');
const [ARCHIVO, PROJECT_ID] = args.filter(a => !a.startsWith('--'));
if (!ARCHIVO || (!PROJECT_ID && !SOLO_ANALIZAR)) {
  console.error('Uso: aps-procesar-modelo.mjs <archivo.nwd> <project_id> [--solo-analizar]');
  process.exit(1);
}
if (!fs.existsSync(ARCHIVO)) { console.error(`No existe: ${ARCHIVO}`); process.exit(1); }

const CAMPOS_CWP = opt('prop-cwp', 'AutoCad::CWP,Personalizar::CWP,Custom::CWP').split(',');
const CAMPOS_TAG = opt('prop-tag', 'AutoCad::TAG,Personalizar::TAG,Custom::TAG').split(',');
const NOMBRE_MODELO = opt('nombre', path.basename(ARCHIVO));
const OBJETO = path.basename(ARCHIVO).replace(/[^A-Za-z0-9._-]/g, '_');

const ID = process.env.AUTODESK_CLIENT_ID, SECRET = process.env.AUTODESK_CLIENT_SECRET;
const BUCKET = (process.env.APS_BUCKET_KEY || `hilo-${ID}`.toLowerCase()).slice(0, 128).replace(/[^a-z0-9-_.]/g, '');
const API = 'https://developer.api.autodesk.com';

const paso = (n, t) => console.log(`\n[${n}] ${t}\n${'─'.repeat(70)}`);

async function token(scope = 'data:read data:write data:create bucket:create bucket:read viewables:read') {
  const r = await fetch(`${API}/authentication/v2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: ID, client_secret: SECRET, scope }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Auth: ' + JSON.stringify(j));
  return j.access_token;
}

const tok = await token();
const cab = { Authorization: `Bearer ${tok}` };

// ── 1. Subida ───────────────────────────────────────────────────────────────
paso(1, `Subiendo ${NOMBRE_MODELO}`);
await fetch(`${API}/oss/v2/buckets`, {
  method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' },
  body: JSON.stringify({ bucketKey: BUCKET, policyKey: 'persistent' }),
});

const datos = fs.readFileSync(ARCHIVO);
const TAM = 100 * 1024 * 1024;
const nPartes = Math.max(1, Math.ceil(datos.length / TAM));
console.log(`  ${(datos.length / 1024 / 1024).toFixed(1)} MB en ${nPartes} parte/s`);

const urlFirma = `${API}/oss/v2/buckets/${BUCKET}/objects/${encodeURIComponent(OBJETO)}/signeds3upload`;
const firma = await (await fetch(`${urlFirma}?parts=${nPartes}`, { headers: cab })).json();
if (!firma.urls) throw new Error('Sin URLs firmadas: ' + JSON.stringify(firma));

for (let i = 0; i < firma.urls.length; i++) {
  const trozo = datos.subarray(i * TAM, Math.min((i + 1) * TAM, datos.length));
  const up = await fetch(firma.urls[i], { method: 'PUT', body: trozo });
  if (!up.ok) throw new Error(`parte ${i + 1}: ${up.status}`);
  console.log(`  parte ${i + 1}/${firma.urls.length} ok`);
}
const fin = await (await fetch(urlFirma, {
  method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' },
  body: JSON.stringify({ uploadKey: firma.uploadKey }),
})).json();
if (!fin.objectId) throw new Error('Subida incompleta: ' + JSON.stringify(fin));
const URN = Buffer.from(fin.objectId).toString('base64').replace(/=/g, '');
console.log(`  URN: ${URN.slice(0, 46)}…`);

// ── 2. Traducción ───────────────────────────────────────────────────────────
paso(2, 'Traduciendo a SVF2');
await fetch(`${API}/modelderivative/v2/designdata/job`, {
  method: 'POST', headers: { ...cab, 'Content-Type': 'application/json', 'x-ads-force': 'true' },
  body: JSON.stringify({ input: { urn: URN }, output: { formats: [{ type: 'svf2', views: ['3d', '2d'] }] } }),
});

for (let i = 0; ; i++) {
  const man = await (await fetch(`${API}/modelderivative/v2/designdata/${URN}/manifest`, { headers: cab })).json();
  process.stdout.write(`\r  ${man.status} · ${man.progress ?? ''}          `);
  if (man.status === 'success') { console.log(); break; }
  if (man.status === 'failed') throw new Error('Traducción fallida: ' + JSON.stringify(man.derivatives?.[0]?.messages ?? {}).slice(0, 300));
  if (i > 180) throw new Error('La traducción no terminó tras 30 minutos');
  await new Promise(s => setTimeout(s, 10000));
}

// ── 3. Propiedades ──────────────────────────────────────────────────────────
paso(3, 'Extrayendo propiedades');
const meta = await (await fetch(`${API}/modelderivative/v2/designdata/${URN}/metadata`, { headers: cab })).json();
const vista = (meta?.data?.metadata ?? []).find(v => v.role === '3d') ?? meta?.data?.metadata?.[0];
if (!vista) throw new Error('El modelo no expone vistas');

let props = null;
for (let i = 1; i <= 40; i++) {
  const r = await fetch(`${API}/modelderivative/v2/designdata/${URN}/metadata/${vista.guid}/properties?forceget=true`, { headers: cab });
  if (r.status === 202) { process.stdout.write(`\r  preparando… ${i}`); await new Promise(s => setTimeout(s, 10000)); continue; }
  if (!r.ok) throw new Error(`properties ${r.status}: ${(await r.text()).slice(0, 200)}`);
  props = await r.json(); break;
}
const objetos = props?.data?.collection ?? [];
console.log(`\r  ${objetos.length.toLocaleString('es-CL')} objetos                    `);

const filas = objetos.map(o => {
  const p = { externalId: o.externalId ?? null, name: o.name ?? null };
  for (const [g, campos] of Object.entries(o.properties ?? {})) {
    if (typeof campos !== 'object') continue;
    for (const [c, v] of Object.entries(campos)) if (v !== null && v !== '') p[`${g}::${c}`] = v;
  }
  return p;
});
fs.mkdirSync('graphify-out', { recursive: true });
const archivoProps = `graphify-out/props-${OBJETO}.json`;
fs.writeFileSync(archivoProps, JSON.stringify(filas));

// Inventario de las propiedades que sirven para vincular
const conteo = new Map();
for (const f of filas) for (const k of Object.keys(f)) conteo.set(k, (conteo.get(k) ?? 0) + 1);
const utiles = /cwp|wbs|sistem|tag|disciplin|area|zona|sector|guid|source file/i;
console.log(`\n  Propiedades relevantes (de ${conteo.size} en total):`);
for (const [k, v] of [...conteo].filter(([k]) => utiles.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  const ej = filas.find(f => f[k])?.[k];
  console.log(`    ${String(v).padStart(7)} (${((v / filas.length) * 100).toFixed(0).padStart(3)}%)  ${k.padEnd(42)} ej: ${String(ej).slice(0, 28)}`);
}

// ── 4. Vínculo a CWP ────────────────────────────────────────────────────────
const valor = (f, campos) => {
  for (const c of campos) { const v = String(f[c] ?? '').trim(); if (v && !['-', 'N/A', 'NA', 'null'].includes(v)) return v; }
  return null;
};
const conCwp = filas.filter(f => valor(f, CAMPOS_CWP));
console.log(`\n  Objetos con propiedad CWP: ${conCwp.length.toLocaleString('es-CL')}`);

if (SOLO_ANALIZAR || !PROJECT_ID) {
  console.log(`\nModo análisis. Propiedades en ${archivoProps}`);
  console.log(`Para cargar:  node --env-file=.env.local scripts/aps-procesar-modelo.mjs "${ARCHIVO}" <project_id>`);
  process.exit(0);
}

paso(4, 'Vinculando elementos a su CWP');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cwps } = await sb.from('mining_cwp').select('cwp_id').eq('project_id', PROJECT_ID);
const catalogo = new Set((cwps ?? []).map(c => c.cwp_id));
console.log(`  CWP en el catálogo del proyecto: ${catalogo.size}`);

const partes = (c) => {
  const p = String(c).match(/^CWP-(\d{4})-(\d{2})-([A-Za-z]{2,3})-(\d{2,4})$/i);
  if (p) return { cwa: p[1], cv: p[1] + p[2], disc: p[3].toUpperCase() };
  const m = String(c).match(/^(\d{4,8})\.([A-Za-z]+)(\d+)$/);
  return m ? { cwa: m[1].slice(0, 4), cv: m[1], disc: m[2].toUpperCase() } : null;
};

const elementos = [], vistos = new Set();
let fuera = 0;
for (const f of filas) {
  const cwp = valor(f, CAMPOS_CWP);
  if (!cwp) continue;
  if (!catalogo.has(cwp)) { fuera++; continue; }
  const id = String(f.externalId ?? '').trim();
  if (!id || vistos.has(id)) continue;
  vistos.add(id);
  const p = partes(cwp);
  elementos.push({
    project_id: PROJECT_ID, sp3d_moniker: id, guid_modelo: id,
    cwp_id: cwp, cwa_id: p?.cwa ?? null, cv_id: p?.cv ?? null, disciplina: p?.disc ?? null,
    tag_equipo: valor(f, CAMPOS_TAG), name: f.name ?? null,
    tipo_elemento: f['Item::Type'] ?? null, material: f['Item::Material'] ?? null,
    obra_raw: f['Item::Source File'] ?? null, cwp_fuente: 'modelo-aps',
  });
}
console.log(`  A cargar: ${elementos.length.toLocaleString('es-CL')}${fuera ? `   (${fuera} con CWP fuera del catálogo)` : ''}`);

if (elementos.length) {
  await sb.from('mining_elementos').delete().eq('project_id', PROJECT_ID);
  for (let i = 0; i < elementos.length; i += 500) {
    const { error } = await sb.from('mining_elementos').insert(elementos.slice(i, i + 500));
    if (error) { console.error('  error:', error.message); break; }
  }
  console.log(`  cargados`);
}

// ── 5. Visor ────────────────────────────────────────────────────────────────
paso(5, 'Conectando el visor');
const { data: proj } = await sb.from('projects').select('module_config, name').eq('id', PROJECT_ID).single();
await sb.from('projects').update({
  module_config: {
    ...(proj?.module_config ?? {}),
    bim: { urn: URN, modelName: NOMBRE_MODELO, configuredAt: new Date().toISOString(), cwpPropName: 'CWP', itemPropName: 'TAG' },
  },
}).eq('id', PROJECT_ID);
console.log(`  ${proj?.name ?? PROJECT_ID} → visor conectado`);
console.log(`\nLISTO: ${elementos.length.toLocaleString('es-CL')} elementos vinculados · modelo navegable desde el paquete.`);
