/**
 * Importa el programa trisemanal (3WLA) a mining_3wla + mining_3wla_restriccion,
 * resolviendo el CWP de cada actividad vía su ID P6 (P333) -> mining_programa.cwp_id.
 *
 * Entrada: los JSON que produce el parser de Python
 *   C:\tmp\trisemanal_3wla_full.json  y  C:\tmp\trisemanal_restricciones.json
 * Uso: node --env-file=.env.local scripts/import-3wla.mjs <fecha_control YYYY-MM-DD> [project_id]
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const FECHA = process.argv[2] ?? '2026-07-18';
const PROJECT_ID = process.argv[3] ?? 'b2ad07a9-1dec-4e5a-9a46-7b6a41a73001';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Falta .env.local (--env-file=.env.local)'); process.exit(1); }
const sb = createClient(url, key);

// 1) Mapa P333 -> cwp_id desde el programa
const { data: prog, error: pe } = await sb.from('mining_programa')
  .select('cod_actividad, cwp_id').eq('project_id', PROJECT_ID).eq('fuente', 'P333');
if (pe) { console.error(pe.message); process.exit(1); }
const cwpDe = new Map(prog.filter(p => p.cwp_id).map(p => [p.cod_actividad, p.cwp_id]));
console.log(`Programa P333: ${prog.length} actividades, ${cwpDe.size} con CWP`);

const acts = JSON.parse(fs.readFileSync('C:\\tmp\\trisemanal_3wla_full.json', 'utf-8'));
const restr = JSON.parse(fs.readFileSync('C:\\tmp\\trisemanal_restricciones.json', 'utf-8'));

// 2) Idempotencia: borrar lo previo de esta fecha de control
await sb.from('mining_3wla').delete().eq('project_id', PROJECT_ID).eq('fecha_control', FECHA);
await sb.from('mining_3wla_restriccion').delete().eq('project_id', PROJECT_ID).eq('fecha_control', FECHA);

// 3) Actividades
const actRows = acts.map(a => ({
  project_id: PROJECT_ID, fecha_control: FECHA,
  id_p6: a.id_p6, id_3wla: a.id_3wla, cwp_id: cwpDe.get(a.id_p6) ?? null,
  actividad: a.actividad, especialidad: a.especialidad, commodity: a.commodity,
  alcance: a.alcance, wbs: a.wbs, unidad: a.unidad, cantidad: a.cantidad,
  hh_total: a.hh_total, fecha_ini: a.fecha_ini, fecha_fin: a.fecha_fin,
  hh_sem1: a.hh_sem1, hh_sem2: a.hh_sem2, hh_sem3: a.hh_sem3,
}));
const e1 = (await sb.from('mining_3wla').insert(actRows)).error;
if (e1) { console.error('Actividades:', e1.message); process.exit(1); }

// 4) Restricciones
const rRows = restr.map(r => ({
  project_id: PROJECT_ID, fecha_control: FECHA,
  id_p6: r.id_p6, cwp_id: cwpDe.get(r.id_p6) ?? null,
  tipo: r.tipo, descripcion: r.descripcion, actividad_p6: r.actividad_p6,
  fecha_identificacion: r.fecha_identificacion, fecha_compromiso: r.fecha_compromiso,
  responsable: r.responsable, entidad: r.entidad, status: r.status,
  fecha_cierre: r.fecha_cierre, observacion: r.observacion,
}));
const e2 = (await sb.from('mining_3wla_restriccion').insert(rRows)).error;
if (e2) { console.error('Restricciones:', e2.message); process.exit(1); }

const sinCwp = actRows.filter(a => !a.cwp_id).length;
console.log(`✓ ${actRows.length} actividades (${sinCwp} sin CWP), ${rRows.length} restricciones importadas para ${FECHA}`);
