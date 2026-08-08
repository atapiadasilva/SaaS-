/**
 * Corrige y enriquece `mining_elementos` con la tabla de datos 4D de SmartPlant 3D.
 *
 * De dónde viene el dato. En el Puerto los elementos entraron al modelo por APS y su CWP se
 * dedujo del árbol del modelo (`cwp_fuente` dice "derivado (árbol+especialidad)", "modelo (sin
 * validar)"…). La tabla 4D es otra cosa: es la asignación que hizo el planificador, elemento por
 * elemento, para amarrar el modelo al programa P6. Trae el CWP DECLARADO, la actividad P6 y las
 * HH proporcionales. Donde las dos fuentes discrepan, manda la declarada — el árbol del modelo
 * agrupa por dónde se dibujó el objeto, no por quién lo construye.
 *
 * Qué hace:
 *   1. CWP — adopta el de la tabla 4D cuando el elemento no tenía uno real (`SIN-CWP.*`,
 *      `EXISTENTE.*`, vacío) y cuando el que tenía discrepa. El CWP debe existir en
 *      `mining_cwp` del proyecto; si no existe, no toca nada y lo informa.
 *   2. Enriquece isométrico, spool, línea, P&ID, especificación, peso y largo SOLO donde el
 *      campo está vacío. Nunca pisa un valor cargado: el modelo es más fino que la planilla.
 *
 * El vínculo elemento → actividad P6 (5 actividades por elemento en promedio) NO se carga aquí:
 * es una relación N:M y necesita su propia tabla. Ver scripts/sql/04-elemento-actividad.sql.
 *
 * Uso:
 *   node --env-file=.env.local scripts/sp3d-4d-vincular.mjs <tabla-4d.xlsx> <project_id> [--aplicar]
 *
 *   Sin --aplicar solo simula e imprime el resultado; no escribe nada.
 *   --hoja="…"        nombre de la hoja (por defecto, la primera que traiga SP3d_Moniker)
 *   --solo-rescate    adopta el CWP únicamente donde la base no tenía uno real; no arbitra
 *                     las discrepancias. Útil para una primera pasada conservadora.
 */
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { num } from './numeros.mjs';

const args = process.argv.slice(2);
const opt = (n, d = '') => (args.find(a => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=') || d;
const APLICAR = args.includes('--aplicar');
const SOLO_RESCATE = args.includes('--solo-rescate');
const [FILE, PROJECT_ID] = args.filter(a => !a.startsWith('--'));
if (!FILE || !PROJECT_ID) {
  console.error('Uso: sp3d-4d-vincular.mjs <tabla-4d.xlsx> <project_id> [--aplicar] [--hoja="…"] [--solo-rescate]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan las variables de Supabase (usa --env-file=.env.local)'); process.exit(1); }
const sb = createClient(url, key);

/** Un CWP de verdad: 6 dígitos, punto, disciplina y correlativo. Todo lo demás es un cajón. */
const ES_CWP = /^\d{6}\.[A-Z]{1,2}\d{3}$/;
const vacio = (v) => v === null || v === undefined || v === '' || v === 0;

// ── La tabla 4D ─────────────────────────────────────────────────────────────
const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer', cellDates: false });
const nombreHoja = opt('hoja') || wb.SheetNames.find(n => {
  const f = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: false, range: 0 })[0];
  return f && 'SP3d_Moniker' in f;
});
if (!nombreHoja) { console.error('Ninguna hoja tiene la columna SP3d_Moniker.'); process.exit(1); }
const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { defval: '', raw: false });
console.log(`Tabla 4D: hoja "${nombreHoja}", ${filas.length.toLocaleString('es-CL')} filas`);

/**
 * La tabla repite el elemento una vez por actividad del programa. Se colapsa por moniker y se
 * anotan los CWP distintos que aparecen: si un elemento cuelga de dos CWP la fuente se
 * contradice a sí misma y no se toca.
 */
const porMoniker = new Map();
for (const f of filas) {
  const m = String(f.SP3d_Moniker ?? '').trim();
  if (!m) continue;
  let e = porMoniker.get(m);
  if (!e) porMoniker.set(m, e = { cwps: new Set(), acts: new Set() });
  const cwp = String(f.CWP ?? '').trim();
  if (cwp) e.cwps.add(cwp);
  if (f.Activity_P6) e.acts.add(String(f.Activity_P6).trim());
  e.iso ??= String(f.Isometrico ?? '').trim() || null;
  e.spool ??= String(f.Spool ?? '').trim() || null;
  e.linea ??= String(f.Pipeline ?? '').trim() || null;
  e.pid ??= String(f.PID ?? '').trim() || null;
  e.espec ??= String(f.Espec_Tecnica ?? '').trim() || null;
  e.peso ??= num(f.Peso_kg);
  e.largo ??= num(f.Longitud);
}
console.log(`  ${porMoniker.size.toLocaleString('es-CL')} elementos distintos`);
const ambiguos = [...porMoniker].filter(([, e]) => e.cwps.size > 1);
if (ambiguos.length) console.log(`  ${ambiguos.length} con más de un CWP — se omiten`);

// ── Catálogo y elementos del proyecto ───────────────────────────────────────
const { data: cwps, error: eCwp } = await sb.from('mining_cwp').select('cwp_id').eq('project_id', PROJECT_ID);
if (eCwp) { console.error(eCwp.message); process.exit(1); }
const catalogo = new Set((cwps ?? []).map(c => c.cwp_id));
console.log(`Catálogo: ${catalogo.size} CWP en el proyecto`);

// La paginación NECESITA order: sin él PostgREST reordena entre páginas y devuelve filas
// repetidas mientras se salta otras. Se mide como "duplicados" que no existen.
let db = [], from = 0;
for (;;) {
  const { data, error } = await sb.from('mining_elementos')
    .select('sp3d_moniker,cwp_id,cwa_id,cv_id,isometrico,spool,pipeline_linea,pid,especificacion,peso_kg,longitud_m')
    .eq('project_id', PROJECT_ID).order('sp3d_moniker').range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  db = db.concat(data ?? []);
  if (!data || data.length < 1000) break;
  from += 1000;
}
const porDb = new Map(db.map(e => [String(e.sp3d_moniker ?? '').trim(), e]));
console.log(`Base: ${db.length.toLocaleString('es-CL')} elementos\n`);

// ── Qué cambia ──────────────────────────────────────────────────────────────
const cambios = new Map();          // moniker → parche
const rescate = new Map(), arbitraje = new Map(), fuera = new Map();
let noEstan = 0, iguales = 0, enriquecidos = 0;
const enriqPorCampo = {};

for (const [m, e4] of porMoniker) {
  const eb = porDb.get(m);
  if (!eb) { noEstan++; continue; }
  const parche = {};

  // 1. CWP
  const c4 = e4.cwps.size === 1 ? [...e4.cwps][0] : null;
  const cb = String(eb.cwp_id ?? '');
  if (c4 && c4 !== cb) {
    const clave = `${cb || '(vacío)'}  →  ${c4}`;
    if (!catalogo.has(c4)) fuera.set(clave, (fuera.get(clave) ?? 0) + 1);
    else if (!ES_CWP.test(cb)) {
      rescate.set(clave, (rescate.get(clave) ?? 0) + 1);
      // motivo_no_valido no viaja en el parche: lo limpia aplicar_parches_4d() cuando el
      // elemento pasa a tener CWP. En la tabla puente NULL significa "no tocar".
      Object.assign(parche, { cwp_id: c4, cv_id: c4.split('.')[0], cwa_id: c4.slice(0, 4), cwp_fuente: 'tabla 4D (declarado)', categoria_enlace: 'enlazado', validado: 'SI' });
    } else {
      arbitraje.set(clave, (arbitraje.get(clave) ?? 0) + 1);
      if (!SOLO_RESCATE) Object.assign(parche, { cwp_id: c4, cv_id: c4.split('.')[0], cwa_id: c4.slice(0, 4), cwp_fuente: 'tabla 4D (declarado, corrige el derivado del modelo)' });
    }
  } else if (c4) iguales++;

  // 2. Enriquecimiento — solo campos vacíos.
  for (const [col, val] of [['isometrico', e4.iso], ['spool', e4.spool], ['pipeline_linea', e4.linea],
                            ['pid', e4.pid], ['especificacion', e4.espec], ['peso_kg', e4.peso], ['longitud_m', e4.largo]]) {
    if (!vacio(val) && vacio(eb[col])) { parche[col] = val; enriqPorCampo[col] = (enriqPorCampo[col] ?? 0) + 1; }
  }
  if (Object.keys(parche).length) {
    if (Object.keys(parche).some(k => !['cwp_id', 'cv_id', 'cwa_id', 'cwp_fuente', 'categoria_enlace', 'validado'].includes(k))) enriquecidos++;
    cambios.set(m, parche);
  }
}

// ── Informe ─────────────────────────────────────────────────────────────────
const suma = (mapa) => [...mapa.values()].reduce((a, b) => a + b, 0);
console.log(`CWP`);
console.log(`  ya coincidían            : ${iguales.toLocaleString('es-CL')}`);
console.log(`  rescatados (no tenían)   : ${suma(rescate).toLocaleString('es-CL')}`);
console.log(`  corregidos (discrepaban) : ${suma(arbitraje).toLocaleString('es-CL')}${SOLO_RESCATE ? '   — NO se aplican (--solo-rescate)' : ''}`);
console.log(`  CWP fuera del catálogo   : ${suma(fuera).toLocaleString('es-CL')}   (se omiten)`);
console.log(`  no están en la base      : ${noEstan.toLocaleString('es-CL')}`);

const lista = (t, mapa) => { if (!mapa.size) return; console.log(`\n  ${t}`); for (const [k, v] of [...mapa].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(6)}  ${k}`); };
lista('Rescates:', rescate);
lista('Correcciones:', arbitraje);
lista('Fuera del catálogo:', fuera);

console.log(`\nEnriquecimiento (solo campos vacíos): ${enriquecidos.toLocaleString('es-CL')} elementos`);
for (const [k, v] of Object.entries(enriqPorCampo).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);

console.log(`\nTotal de elementos a actualizar: ${cambios.size.toLocaleString('es-CL')}`);
if (!APLICAR) { console.log(`\nSimulación. Repite con --aplicar para escribir en la base.`); process.exit(0); }

// ── Escritura ───────────────────────────────────────────────────────────────
// Un UPDATE por fila vía PostgREST daba 46 filas/minuto: dos horas para 5.000 elementos.
// Se cargan los parches en una tabla puente y se aplican con un solo UPDATE ... FROM.
console.log(`\nCargando los parches en la tabla puente…`);
const { error: eDel } = await sb.from('_stage_elementos_4d').delete().eq('project_id', PROJECT_ID);
if (eDel) { console.error('  no existe la tabla puente _stage_elementos_4d:', eDel.message); process.exit(1); }

const parches = [...cambios].map(([m, p]) => ({ project_id: PROJECT_ID, sp3d_moniker: m, ...p }));
for (let i = 0; i < parches.length; i += 500) {
  const { error } = await sb.from('_stage_elementos_4d').insert(parches.slice(i, i + 500));
  if (error) { console.error(`  error en el lote ${i}:`, error.message); process.exit(1); }
  process.stdout.write(`\r  ${Math.min(i + 500, parches.length).toLocaleString('es-CL')} / ${parches.length.toLocaleString('es-CL')}`);
}
console.log(`\n  ${parches.length.toLocaleString('es-CL')} parches en la tabla puente.`);

console.log(`\nAplicando…`);
const { data: actualizados, error: eRpc } = await sb.rpc('aplicar_parches_4d', { p_project_id: PROJECT_ID });
if (eRpc) { console.error('  error al aplicar:', eRpc.message); process.exit(1); }
console.log(`  ${Number(actualizados).toLocaleString('es-CL')} elementos actualizados`);

// La puente es scratch: se vacía para que la próxima corrida no arrastre parches viejos.
await sb.from('_stage_elementos_4d').delete().eq('project_id', PROJECT_ID);
