/**
 * Carga los elementos del modelo (extraídos de APS) vinculándolos a su CWP.
 *
 * Uso: node --env-file=.env.local scripts/aps-cargar-elementos.mjs <project_id> [--aplicar]
 *      Sin --aplicar solo informa; no escribe nada.
 *
 * El modelo de Andina trae el CWP como propiedad del objeto (AutoCad::CWP,
 * Personalizar::CWP o Custom::CWP según de qué archivo venga cada parte), así que el
 * vínculo es exacto: no hay similitud de nombres ni heurística de por medio.
 *
 * El identificador que se guarda es `externalId`, estable entre traducciones. Usar
 * `objectid` haría que el vínculo se rompiera con cada versión nueva del modelo.
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const PROJECT_ID = args.find(a => !a.startsWith('--'));
const ENTRADA = (args.find(a => a.startsWith('--props=')) ?? '').split('=')[1] || 'graphify-out/propiedades-modelo.json';
if (!PROJECT_ID) { console.error('Uso: aps-cargar-elementos.mjs <project_id> [--aplicar]'); process.exit(1); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const filas = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));

// El mismo dato aparece con distinto nombre según el archivo de origen del objeto.
const primero = (f, campos) => {
  for (const c of campos) { const v = String(f[c] ?? '').trim(); if (v && v !== '-' && v !== 'N/A' && v !== 'NA') return v; }
  return null;
};
const CWP  = ['AutoCad::CWP', 'Personalizar::CWP', 'Custom::CWP'];
const TAG  = ['AutoCad::TAG', 'Personalizar::TAG', 'Custom::TAG'];
const partes = (c) => { const m = String(c).match(/^CWP-(\d{4})-(\d{2})-([A-Za-z]{2,3})-(\d{2,4})$/i); return m ? { cwa: m[1], cv: m[1] + m[2], disc: m[3].toUpperCase() } : null; };

const { data: cwps } = await sb.from('mining_cwp').select('cwp_id').eq('project_id', PROJECT_ID);
const catalogo = new Set((cwps ?? []).map(c => c.cwp_id));

const elementos = [];
const vistos = new Set();
let sinCwp = 0, fueraCatalogo = 0, duplicados = 0;

for (const f of filas) {
  const cwp = primero(f, CWP);
  if (!cwp) { sinCwp++; continue; }
  if (!catalogo.has(cwp)) { fueraCatalogo++; continue; }
  const id = String(f.externalId ?? '').trim();
  if (!id) continue;
  if (vistos.has(id)) { duplicados++; continue; }
  vistos.add(id);

  const p = partes(cwp);
  elementos.push({
    project_id: PROJECT_ID,
    sp3d_moniker: id,
    guid_modelo: id,
    cwp_id: cwp, cwa_id: p?.cwa ?? null, cv_id: p?.cv ?? null, disciplina: p?.disc ?? null,
    tag_equipo: primero(f, TAG),
    name: f.name ?? null,
    tipo_elemento: f['Item::Type'] ?? null,
    material: f['Item::Material'] ?? null,
    obra_raw: f['Item::Source File'] ?? null,   // archivo de origen: sirve para rastrear la fuente
    cwp_fuente: 'modelo-aps',
  });
}

console.log(`Objetos en el modelo      : ${filas.length.toLocaleString('es-CL')}`);
console.log(`Sin propiedad CWP         : ${sinCwp.toLocaleString('es-CL')}`);
console.log(`Con CWP fuera del catálogo: ${fueraCatalogo}`);
if (duplicados) console.log(`externalId repetidos      : ${duplicados}`);
console.log(`\nA CARGAR: ${elementos.length.toLocaleString('es-CL')} elementos vinculados a su CWP`);

const porCwp = new Map();
for (const e of elementos) porCwp.set(e.cwp_id, (porCwp.get(e.cwp_id) ?? 0) + 1);
for (const [c, n] of [...porCwp].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(5)}  ${c}`);

if (!APLICAR) { console.log(`\nSimulación. Repite con --aplicar para escribir en la base.`); process.exit(0); }

await sb.from('mining_elementos').delete().eq('project_id', PROJECT_ID);
let n = 0;
for (let i = 0; i < elementos.length; i += 500) {
  const { error } = await sb.from('mining_elementos').insert(elementos.slice(i, i + 500));
  if (error) { console.error('  error:', error.message); break; }
  n += Math.min(500, elementos.length - i);
}
console.log(`\nCargados: ${n.toLocaleString('es-CL')} elementos`);
