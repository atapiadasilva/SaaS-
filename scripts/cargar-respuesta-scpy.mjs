/**
 * Carga la respuesta del experto a la solicitud de datos (hojas R1..R7).
 *
 * Notas de lectura que cuestan caro descubrir después:
 *
 *  · R1b trae DOS dimensiones mezcladas: los hitos físicos de la partida, que suman 100, y una
 *    fila extra "Aprobación del EDP" que también pesa 100 y es el paso administrativo de pago.
 *    Se cargan con `tipo` distinto ('fisico' / 'edp'). Sumarlas juntas da 200 y no es un error
 *    del dato — la plantilla no traía columna Tipo, ese fue el error.
 *
 *  · El itemizado no guarda el código BMP, así que el mapeo BMP → partida M&P se aplica cruzando
 *    por `item` contra fact_partida del paquete de base de datos, que sí lo trae.
 *
 *  · Los tipos de restricción pasan por normalizarTipo(): el catálogo es cerrado y el experto
 *    escribe en castellano libre ("Terreno/Acceso", "Mano de obra").
 *
 * Uso:
 *   node --env-file=.env.local scripts/cargar-respuesta-scpy.mjs <respuesta.xlsx> <project_id> [--aplicar]
 *     --pack=<carpeta json>   fact_partida.json, para el cruce item → BMP
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { normalizarTipo, deptoDe } from '../src/lib/constraints.ts';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const opt = (n, d = '') => (args.find(a => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=') || d;
const [ARCHIVO, PROJECT_ID] = args.filter(a => !a.startsWith('--'));
if (!ARCHIVO || !PROJECT_ID) { console.error('Uso: cargar-respuesta-scpy.mjs <respuesta.xlsx> <project_id> [--aplicar] [--pack=…]'); process.exit(1); }
const PACK = opt('pack', null);

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const wb = XLSX.read(fs.readFileSync(ARCHIVO), { type: 'buffer', cellDates: true });
const H = (n) => { const h = wb.SheetNames.find(s => s.startsWith(n)); return h ? XLSX.utils.sheet_to_json(wb.Sheets[h], { defval: '', raw: false }) : []; };
const txt = (v) => String(v ?? '').trim();
/**
 * Número tolerante al formato chileno. El punto solo se trata como separador de miles cuando
 * TAMBIÉN hay coma decimal ("1.234,5"): borrarlo siempre convertía 0.82 en 82 y multiplicaba por
 * cien el factor de productividad — y con él, la capacidad semanal de todas las cuadrillas.
 */
const numero = (v) => {
  let s = String(v ?? '').trim();
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};
const fecha = (v) => { if (v instanceof Date && !isNaN(v)) { const p = n => String(n).padStart(2, '0'); return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`; } const s = txt(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const esRuido = (r) => Object.values(r).some(v => txt(v).startsWith('>>>') || txt(v).includes('EJEMPLO'));

const hoy = new Date().toISOString().slice(0, 10);
const resumen = [];

// ── R1b · Bases de Medición y Pago ──────────────────────────────────────────
const RE_EDP = /aprobaci[óo]n del edp/i;
const pond = H('R1b').filter(r => txt(r['Partida M&P']) && !esRuido(r)).map(r => ({
  project_id: PROJECT_ID,
  item_code: txt(r['Partida M&P']),
  item_nombre: txt(r['Nombre de la partida']) || null,
  commodity: txt(r['Commodity / grupo']) || null,
  hito: txt(r['Hito de pago']),
  peso: numero(r['Peso %']) ?? 0,
  orden: numero(r['Orden']) ?? null,
  tipo: RE_EDP.test(txt(r['Hito de pago'])) ? 'edp' : 'fisico',
}));
const fisicos = new Map();
for (const p of pond.filter(p => p.tipo === 'fisico')) fisicos.set(p.item_code, (fisicos.get(p.item_code) ?? 0) + p.peso);
const malSuma = [...fisicos].filter(([, s]) => Math.round(s) !== 100);
resumen.push(`R1b  ${pond.length} filas · ${fisicos.size} partidas · ${pond.filter(p => p.tipo === 'edp').length} de aprobación EDP` +
  (malSuma.length ? `  ⚠ pesos físicos ≠ 100 en: ${malSuma.map(([k, s]) => `${k}(${Math.round(s)})`).join(' ')}` : '  · todos los pesos físicos suman 100'));

// ── R1 · BMP → partida M&P, aplicado al itemizado por item ──────────────────
const r1 = H('R1').filter(r => txt(r['Código BMP']) && !esRuido(r));
const cMp = Object.keys(r1[0] ?? {}).find(k => /Partida M&P/i.test(k));
const bmpAmp = new Map(r1.map(r => [txt(r['Código BMP']), txt(r[cMp])]).filter(([, v]) => v));
let itemAmp = new Map(), sinBmp = 0;
if (PACK && fs.existsSync(path.join(PACK, 'fact_partida.json'))) {
  for (const f of JSON.parse(fs.readFileSync(path.join(PACK, 'fact_partida.json'), 'utf8'))) {
    const item = txt(f.item_no), bmp = txt(f.bmp);
    if (!item) continue;
    const mp = bmpAmp.get(bmp);
    if (mp) itemAmp.set(item, mp); else sinBmp++;
  }
}
const definidas = new Set(pond.map(p => p.item_code));
const usadasSinDefinir = [...new Set(bmpAmp.values())].filter(m => !definidas.has(m));
resumen.push(`R1   ${bmpAmp.size} códigos BMP mapeados → ${new Set(bmpAmp.values()).size} partidas M&P · ${itemAmp.size} partidas del itemizado quedarán con partida_mp` +
  (usadasSinDefinir.length ? `  ⚠ sin definición en R1b: ${usadasSinDefinir.join(' ')}` : ''));

// ── R2 · Cuadrillas ─────────────────────────────────────────────────────────
const { data: turnos } = await sb.from('mining_turno').select('id, codigo').eq('project_id', PROJECT_ID);
const turnoPorCodigo = new Map((turnos ?? []).map(t => [txt(t.codigo).toUpperCase(), t.id]));
const cCod = Object.keys(H('R2')[0] ?? {}).find(k => /C[óo]digo cuadrilla/i.test(k));
const cuadrillas = H('R2')
  .filter(r => /^CUAD/i.test(txt(r[cCod])) && !esRuido(r))
  .map(r => ({
    project_id: PROJECT_ID,
    codigo: txt(r[cCod]),
    nombre: `${txt(r['Disciplina'])} · ${txt(r[cCod])}`,
    disciplina_cod: null,                      // se completa abajo contra el catálogo
    composicion: txt(r['Composición (rol x cantidad)']) ? [{ detalle: txt(r['Composición (rol x cantidad)']) }] : [],
    n_personas: numero(r['N° personas']) ?? 0,
    turno_id: turnoPorCodigo.get(txt(r['Turno']).toUpperCase()) ?? null,
    factor_productividad: numero(r['Factor productividad']) ?? 1,
    activa: true,
    observacion: [txt(r['Disponible desde']) && `disponible desde ${txt(r['Disponible desde'])}`,
                  txt(r['CWA o sector donde opera']) && `opera en ${txt(r['CWA o sector donde opera'])}`,
                  txt(r['Observaciones'])].filter(Boolean).join(' · ') || null,
    _disciplina: txt(r['Disciplina']),
    _turno: txt(r['Turno']),
  }));
const { data: cats } = await sb.from('mining_cwp').select('disciplina, disciplina_cod').eq('project_id', PROJECT_ID);
const discPorNombre = new Map((cats ?? []).map(c => [txt(c.disciplina).toLowerCase(), c.disciplina_cod]));
for (const c of cuadrillas) c.disciplina_cod = discPorNombre.get(c._disciplina.toLowerCase()) ?? null;
const sinTurno = cuadrillas.filter(c => !c.turno_id).map(c => `${c.codigo}(${c._turno})`);
const sinDisc = cuadrillas.filter(c => !c.disciplina_cod).map(c => `${c.codigo}(${c._disciplina})`);
resumen.push(`R2   ${cuadrillas.length} cuadrillas · ${cuadrillas.reduce((s, c) => s + c.n_personas, 0)} personas` +
  (sinTurno.length ? `  ⚠ sin turno: ${sinTurno.join(' ')}` : '') + (sinDisc.length ? `  ⚠ sin disciplina: ${sinDisc.join(' ')}` : ''));

// ── R3 · Restricciones ──────────────────────────────────────────────────────
const SEV = { SI: 'BLOQUEANTE', NO: 'ADVERTENCIA' };
const restricciones = H('R3').filter(r => txt(r['CWP']) && !esRuido(r)).map(r => {
  const tipo = normalizarTipo(r['Tipo de restricción']);
  return {
    project_id: PROJECT_ID,
    fecha_reporte: hoy,
    fuente: 'solicitud-datos-eimisa',
    depto: deptoDe(tipo, txt(r['Departamento'])),
    cwp_id: txt(r['CWP']) || null,
    tipo,
    titulo: txt(r['Descripción']).slice(0, 180) || tipo,
    detalle: [txt(r['Descripción']), txt(r['Observaciones'])].filter(Boolean).join(' — ') || null,
    severidad: SEV[txt(r['Crítica (SI/NO)']).toUpperCase()] ?? 'ADVERTENCIA',
    estado: txt(r['Estado']).toUpperCase().startsWith('CERR') ? 'CERRADA' : txt(r['Estado']).toUpperCase().startsWith('EN') ? 'EN_CURSO' : 'ABIERTA',
    fecha_limite: fecha(r['Fecha compromiso']),
    responsable: txt(r['Responsable']) || null,
  };
});
const tiposUsados = new Map();
for (const r of restricciones) tiposUsados.set(r.tipo, (tiposUsados.get(r.tipo) ?? 0) + 1);
resumen.push(`R3   ${restricciones.length} restricciones · ${new Set(restricciones.map(r => r.cwp_id)).size} CWP · ${[...tiposUsados].map(([k, v]) => `${k}:${v}`).join(' ')}`);

// ── R6 · Suministros por CWP ────────────────────────────────────────────────
const r6 = H('R6');
const cCwp6 = Object.keys(r6[0] ?? {}).find(k => /CWP que bloquea/i.test(k));
const cFec6 = Object.keys(r6[0] ?? {}).find(k => /Fecha requerida/i.test(k));
const suministros = r6.filter(r => txt(r[cCwp6]) && !esRuido(r)).map(r => ({
  project_id: PROJECT_ID,
  cwp_id: txt(r[cCwp6]),
  descripcion_material: txt(r['Descripción']) || null,
  proveedor: txt(r['Proveedor']) || null,
  fecha_entrega_plan: fecha(r['Fecha comprometida']),
  liberado: false,
  numero_po: txt(r['Código / PEP']) || null,
  observacion: [txt(r['Criticidad']), txt(r[cFec6]) && `requerido en obra ${txt(r[cFec6])}`, txt(r['Observaciones'])].filter(Boolean).join(' · ') || null,
}));
resumen.push(`R6   ${suministros.length} vínculos · ${new Set(suministros.map(s => s.numero_po)).size} suministros · ${new Set(suministros.map(s => s.cwp_id)).size} CWP`);

// ── R7 · Hitos contractuales ────────────────────────────────────────────────
const { data: cwpsCat } = await sb.from('mining_cwp').select('cwp_id').eq('project_id', PROJECT_ID);
const idsCwp = new Set((cwpsCat ?? []).map(c => c.cwp_id));
const hitos = H('R7').filter(r => txt(r['Hito']) && !esRuido(r));
const hitosPorCwp = new Map();
for (const h of hitos) {
  const destino = txt(h['CWP o CWA asociado']);
  if (!idsCwp.has(destino)) continue;
  const etiqueta = `${txt(h['Hito'])} ${txt(h['Fecha contractual'])}${txt(h['Tiene multa (SI/NO)']).toUpperCase() === 'SI' ? ' · CON MULTA' : ''}`;
  hitosPorCwp.set(destino, [...(hitosPorCwp.get(destino) ?? []), etiqueta].join(' | '));
}
const conMulta = hitos.filter(h => txt(h['Tiene multa (SI/NO)']).toUpperCase() === 'SI').length;
resumen.push(`R7   ${hitos.length} hitos · ${conMulta} con multa · ${hitosPorCwp.size} enganchan con un CWP del catálogo`);

console.log(resumen.join('\n'));
if (!APLICAR) { console.log('\nSimulación. Repite con --aplicar para escribir.'); process.exit(0); }

// ── Escritura ───────────────────────────────────────────────────────────────
console.log('\nEscribiendo…');
const limpiarYCargar = async (tabla, filas) => {
  const { error: e } = await sb.from(tabla).delete().eq('project_id', PROJECT_ID);
  if (e) { console.error(`  ${tabla}: ${e.message}`); return; }
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await sb.from(tabla).insert(filas.slice(i, i + 500));
    if (error) { console.error(`  ${tabla}: ${error.message}`); return; }
  }
  console.log(`  ${tabla}: ${filas.length}`);
};
await limpiarYCargar('mining_ponderaciones', pond);
await limpiarYCargar('mining_cuadrilla', cuadrillas.map(({ _disciplina, _turno, ...c }) => c));
await limpiarYCargar('mining_consideraciones', restricciones);
await limpiarYCargar('mining_suministro', suministros);

// Se agrupa por partida M&P y se actualiza en lote: item por item serían 1.286 viajes a la base.
const itemsPorMp = new Map();
for (const [item, mp] of itemAmp) itemsPorMp.set(mp, [...(itemsPorMp.get(mp) ?? []), item]);
let nMp = 0;
for (const [mp, items] of itemsPorMp) {
  for (let i = 0; i < items.length; i += 200) {
    const { data, error } = await sb.from('mining_itemizado').update({ partida_mp: mp })
      .eq('project_id', PROJECT_ID).in('item', items.slice(i, i + 200)).select('item');
    if (error) { console.error(`  partida_mp ${mp}: ${error.message}`); break; }
    nMp += data?.length ?? 0;
  }
}
console.log(`  mining_itemizado.partida_mp: ${nMp} partidas`);

let nH = 0;
for (const [cwp, etiqueta] of hitosPorCwp) {
  const { error } = await sb.from('mining_cwp').update({ hito_contractual: etiqueta }).eq('project_id', PROJECT_ID).eq('cwp_id', cwp);
  if (!error) nH++;
}
console.log(`  mining_cwp.hito_contractual: ${nH}`);
