/**
 * Aplica a `mining_elementos` el CWP que SmartPlant 3D declara en un export de datos, usando
 * el SP3d Moniker como llave.
 *
 * El problema que resuelve. Los modelos SP3D de BHP entraron por APS con llave `externalId`
 * ("1/0/0/0/…"), que es lo único que el visor resuelve siempre, y su CWP se dedujo del árbol
 * del modelo (`aps-vincular-sp3d.mjs`): de 11.443 elementos de SCPY, 5.860 quedaron vinculados
 * y 2.924 sin sector. El export de datos de SP3D sí trae el CWP escrito como propiedad del
 * objeto — pero indexado por moniker, que no es lo que guarda la base.
 *
 * El puente son las propiedades que dejó `aps-procesar-modelo.mjs`: cada objeto trae a la vez
 * su `externalId` y su `SmartPlant 3D::SP3d Moniker`. Con eso se traduce el export a la llave
 * de la base y el CWP declarado reemplaza al deducido.
 *
 * El CWP viene en el código del mandante (`CWP-0044-200-PP-114`) y hay que llevarlo al de Hilo
 * (`0044200.P001`): área + sector forman el CV, y la disciplina cambia de sigla. El correlativo
 * del mandante NO se traduce — en Hilo hay un CWP por CV y disciplina, así que los 114, 122 y
 * 101 de un mismo par caen todos en el mismo paquete. Es a propósito: el alcance lo define el
 * catálogo de `mining_cwp`, no el numeral del modelo.
 *
 * Uso:
 *   node --env-file=.env.local scripts/sp3d-cwp-declarado.mjs <export.xlsx> <props-*.json> <project_id> [--aplicar]
 */
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const [FILE, PROPS, PROJECT_ID] = args.filter(a => !a.startsWith('--'));
if (!FILE || !PROPS || !PROJECT_ID) {
  console.error('Uso: sp3d-cwp-declarado.mjs <export.xlsx> <props-*.json> <project_id> [--aplicar]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan las variables de Supabase (usa --env-file=.env.local)'); process.exit(1); }
const sb = createClient(url, key);

/** Sigla de disciplina del mandante → código de disciplina de Hilo. */
const DISCIPLINA = { PP: 'P', ST: 'S', CL: 'C', EL: 'E', IC: 'J', ME: 'M', GE: 'GE' };
/** Valores de la columna CWP que no son un paquete: son estados del objeto en el modelo. */
const NO_ES_CWP = /^(instalaciones existentes|desmantelamiento|modelos auxiliares|\d+\s*-\s*\w)/i;

/** "CWP-0044-200-PP-114" → "0044200.P001" */
function aCodigoHilo(cwp) {
  const m = String(cwp ?? '').trim().match(/^CWP-(\d{4})-(\d{3})-([A-Z]{2})-\d+$/);
  if (!m) return null;
  const disc = DISCIPLINA[m[3]];
  return disc ? `${m[1]}${m[2]}.${disc}001` : null;
}

// ── El puente moniker → externalId ──────────────────────────────────────────
const objetos = JSON.parse(fs.readFileSync(PROPS, 'utf8'));
const aExternalId = new Map();
for (const o of objetos) {
  const mon = String(o['SmartPlant 3D::SP3d Moniker'] ?? '').trim();
  const ext = String(o.externalId ?? '').trim();
  if (mon && ext && !aExternalId.has(mon)) aExternalId.set(mon, ext);
}
console.log(`Modelo: ${objetos.length.toLocaleString('es-CL')} objetos, ${aExternalId.size.toLocaleString('es-CL')} con moniker`);

// ── El export de datos ──────────────────────────────────────────────────────
const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer', cellDates: false });
const declarado = new Map();          // moniker → CWP en código Hilo
let filas = 0, sinCwp = 0, noEsCwp = 0, noTraducible = new Map();
for (const nombre of wb.SheetNames) {
  for (const f of XLSX.utils.sheet_to_json(wb.Sheets[nombre], { defval: '', raw: false })) {
    // Las columnas vienen prefijadas "SmartPlant 3D: " y el prefijo varía entre hojas.
    const col = (k) => { const e = Object.keys(f).find(x => x.replace(/^SmartPlant 3D:\s*/, '').trim() === k); return e ? String(f[e]).trim() : ''; };
    const mon = col('SP3d Moniker');
    if (!mon) continue;
    filas++;
    const bruto = col('CWP');
    if (!bruto) { sinCwp++; continue; }
    if (NO_ES_CWP.test(bruto)) { noEsCwp++; continue; }
    const hilo = aCodigoHilo(bruto);
    if (!hilo) { noTraducible.set(bruto, (noTraducible.get(bruto) ?? 0) + 1); continue; }
    declarado.set(mon, hilo);
  }
}
console.log(`Export: ${filas.toLocaleString('es-CL')} filas con moniker`);
console.log(`  sin CWP declarado            : ${sinCwp.toLocaleString('es-CL')}`);
console.log(`  con estado en vez de CWP     : ${noEsCwp.toLocaleString('es-CL')}   (existentes, desmantelamiento…)`);
console.log(`  con CWP traducible           : ${declarado.size.toLocaleString('es-CL')}`);
if (noTraducible.size) {
  console.log(`  con CWP no traducible        : ${[...noTraducible.values()].reduce((a, b) => a + b, 0)}`);
  for (const [k, v] of [...noTraducible].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`      ${String(v).padStart(5)}  ${k}`);
}

// ── Base ────────────────────────────────────────────────────────────────────
const { data: cwps, error: eCwp } = await sb.from('mining_cwp').select('cwp_id, cwa_id, cv_id, disciplina, disciplina_cod').eq('project_id', PROJECT_ID);
if (eCwp) { console.error(eCwp.message); process.exit(1); }
const catalogo = new Map((cwps ?? []).map(c => [c.cwp_id, c]));

let db = [], from = 0;
for (;;) {
  // Sin order, PostgREST repite filas entre páginas.
  const { data, error } = await sb.from('mining_elementos')
    .select('sp3d_moniker, cwp_id, categoria_enlace').eq('project_id', PROJECT_ID).order('sp3d_moniker').range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  db = db.concat(data ?? []); if (!data || data.length < 1000) break; from += 1000;
}
const porExt = new Map(db.map(e => [String(e.sp3d_moniker ?? '').trim(), e]));
console.log(`\nBase: ${db.length.toLocaleString('es-CL')} elementos`);

// ── Qué cambia ──────────────────────────────────────────────────────────────
const cambios = new Map();
let sinPuente = 0, sinElemento = 0, fueraCatalogo = new Map(), iguales = 0;
const rescate = new Map(), correccion = new Map();
for (const [mon, cwp] of declarado) {
  const ext = aExternalId.get(mon);
  if (!ext) { sinPuente++; continue; }
  const eb = porExt.get(ext);
  if (!eb) { sinElemento++; continue; }
  if (!catalogo.has(cwp)) { fueraCatalogo.set(cwp, (fueraCatalogo.get(cwp) ?? 0) + 1); continue; }
  const actual = String(eb.cwp_id ?? '');
  if (actual === cwp) { iguales++; continue; }
  const c = catalogo.get(cwp);
  const destino = actual ? correccion : rescate;
  const clave = `${actual || '(sin CWP)'}  →  ${cwp}`;
  destino.set(clave, (destino.get(clave) ?? 0) + 1);
  cambios.set(ext, {
    project_id: PROJECT_ID, sp3d_moniker: ext,
    cwp_id: cwp, cv_id: c.cv_id, cwa_id: c.cwa_id,
    cwp_fuente: 'declarado en el modelo SP3D', categoria_enlace: 'VINCULADO', validado: 'SI',
  });
}
const suma = (m) => [...m.values()].reduce((a, b) => a + b, 0);
console.log(`\nCRUCE`);
console.log(`  ya coincidían             : ${iguales.toLocaleString('es-CL')}`);
console.log(`  el moniker no está en el modelo publicado : ${sinPuente.toLocaleString('es-CL')}`);
console.log(`  el elemento no está en la base            : ${sinElemento.toLocaleString('es-CL')}`);
console.log(`  CWP fuera del catálogo                    : ${suma(fueraCatalogo).toLocaleString('es-CL')}`);
for (const [k, v] of [...fueraCatalogo].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`      ${String(v).padStart(5)}  ${k}`);
const lista = (t, m) => { if (!m.size) return; console.log(`\n  ${t} (${suma(m).toLocaleString('es-CL')})`); for (const [k, v] of [...m].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`    ${String(v).padStart(6)}  ${k}`); };
lista('Elementos que ganan un CWP', rescate);
lista('Elementos cuyo CWP deducido se corrige', correccion);
console.log(`\nTotal a actualizar: ${cambios.size.toLocaleString('es-CL')}`);

if (!APLICAR) { console.log(`\nSimulación. Repite con --aplicar para escribir en la base.`); process.exit(0); }

// ── Escritura, vía la tabla puente ──────────────────────────────────────────
console.log(`\nCargando los parches…`);
const { error: eDel } = await sb.from('_stage_elementos_4d').delete().eq('project_id', PROJECT_ID);
if (eDel) { console.error('  no existe la tabla puente _stage_elementos_4d:', eDel.message); process.exit(1); }
const parches = [...cambios.values()];
for (let i = 0; i < parches.length; i += 500) {
  const { error } = await sb.from('_stage_elementos_4d').insert(parches.slice(i, i + 500));
  if (error) { console.error(`  error en el lote ${i}:`, error.message); process.exit(1); }
}
const { data: n, error: eRpc } = await sb.rpc('aplicar_parches_4d', { p_project_id: PROJECT_ID });
if (eRpc) { console.error('  error al aplicar:', eRpc.message); process.exit(1); }
console.log(`  ${Number(n).toLocaleString('es-CL')} elementos actualizados`);
await sb.from('_stage_elementos_4d').delete().eq('project_id', PROJECT_ID);
