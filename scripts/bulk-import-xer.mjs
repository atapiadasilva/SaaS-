/**
 * Bulk XER import → Supabase program_activities
 *
 * Usage:
 *   node scripts/bulk-import-xer.mjs <SERVICE_ROLE_KEY>
 *
 * Or add SUPABASE_SERVICE_KEY to .env.local and run without args.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { join } from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://lsoesbsrlfingfckozsq.supabase.co';
const SERVICE_KEY  = process.argv[2] || process.env.SUPABASE_SERVICE_KEY || '';

if (!SERVICE_KEY) {
  console.error('ERROR: Pasa el service_role key como argumento:');
  console.error('  node scripts/bulk-import-xer.mjs eyJhbGci...');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Baseline XER files ───────────────────────────────────────────────────────

const BASE = 'C:\\Users\\atapiad\\EISA\\MontajesIndustriales - Documentos\\01. Entregables\\02. Planificación y Control\\02. Programas';

// Code → { file, label }
const XER_FILES = {
  'EIMI00357': { file: `${BASE}\\EIMI00357\\1.- Línea Base\\PRIMARY CRUSHER, OVERLAND CONVEYOR, STOCK PILE BECHTEL ENTREGABLE  REV 0.xer`,          label: 'QB2 VP1 — Primary Crusher & Overland Conveyor' },
  'EIMI00381': { file: `${BASE}\\EIMI00381\\1.- Línea Base\\PROGRAMA PDP SG - Linea Base.xer`,                                                        label: 'PDP SG — Parada de Planta' },
  'EIMI00385': { file: `${BASE}\\EIMI00385\\1.- Línea Base\\Programa Rehabilitación Espesador TK-001 Rev0.xer`,                                        label: 'Rehabilitación Espesador TK-001' },
  'EIMI00387': { file: `${BASE}\\EIMI00387\\00. linea Base\\1002-03-ID-EPC-007-0600-Z-PG-0002_1 - Programa Avance del Encargo ODPT 07-02-2025 2.xer`, label: 'AMSA ODPT — Programa EPC' },
  'EIMI00388': { file: `${BASE}\\EIMI00388\\00. linea Base\\Montaje Estanque - S.E. N°52  Ctto 9503C-002. Programa Rev2.xer`,                          label: 'Montaje Estanque S.E. N°52' },
  'EIMI00389': { file: `${BASE}\\EIMI00389\\00. Línea Base\\GCC Rev.3.0 Av.87 12.12.2025.xer`,                                                        label: 'GCC Rev 3.0' },
  'EIMI00393': { file: `${BASE}\\EIMI00393\\00. Línea Base\\Programa Reparación Taller La Junta.xer`,                                                  label: 'Reparación Taller La Junta' },
  'EIMI00398': { file: `${BASE}\\EIMI00398\\00. Línea Base\\Programa Proyecto Piloto IP3 Rev2C.xer`,                                                   label: 'Proyecto Piloto IP3' },
  'EIMI00400': { file: `${BASE}\\EIMI00400\\00. Línea Base\\3.- Programa Obra EIMISA - Paquete PG3A2 Contrato Montaje Electromecanico Rev 0.xer`,      label: 'Bechtel PG3A2 — Montaje Electromecánico' },
  'EIMI00401': { file: `${BASE}\\EIMI00401\\00. Línea Base\\TRABAJOS TK N4 OXIDO.xer`,                                                                label: 'TK N4 Óxido' },
  'EIMI00403': { file: `${BASE}\\EIMI00403\\00. Línea Base\\4600029434-03600-PRGPC-00001.xer`,                                                         label: 'Contrato 4600029434' },
  'EIMI00405': { file: `${BASE}\\EIMI00405\\00. Línea Base\\4600029580 PDT-DPPP-01 Línea Base Cambio Sistema Motriz Espesador P5 Rev.1  (05-06-2024) Enviado a DET.xer`, label: 'Sistema Motriz Espesador P5' },
  'EIMI00406': { file: `${BASE}\\EIMI00406\\00. Línea Base\\6331.xer`,                                                                                label: 'Contrato 6331' },
  'EIMI00408': { file: `${BASE}\\EIMI00408\\01. Linea Base\\Constr. y Mont. Área Seca Óxidos e Hidrometalúrgica.xer`,                                  label: 'Área Seca Óxidos e Hidrometalúrgica' },
  'MIPE0101':  { file: `${BASE}\\MIPE0101\\00. Línea Base\\2.- LB02\\OBRAS ELECTROMECANICAS DEL SISTEMA DE MANEJO DE MATERIALES 17.02.xer`,            label: 'Sistema Manejo Materiales LB02' },
};

// ─── Discipline normalization ─────────────────────────────────────────────────

const DISC_NORM = [
  [/MOV.*TIER|EARTHWORK|GROUND/i,                   'MOV. TIERRAS'],
  [/CIVIL|OBRA.*CIV|CONCRETE|HORMIG/i,              'CIVIL'],
  [/ESTRUCT|STEEL|ACERO|METAL.*STRUC/i,             'ESTRUCTURAS'],
  [/CALDER|BOILERWORK/i,                            'CALDERERÍA'],
  [/MEC[ÁA]N|MECHAN|EQUIPO.*MEC|MONT.*EQ/i,        'MECÁNICA'],
  [/PIPING|CA[ÑN]ER|PLOMERI|TUBER/i,               'PIPING'],
  [/EL[ÉE]CTR|ELECTR|POWER/i,                      'ELÉCTRICA'],
  [/INSTRUM|CONTROL.*AUTO|AUTOMAT/i,                'INSTRUMENTACIÓN'],
  [/ARQU|ARCHITECT|TERMINAC/i,                      'ARQUITECTURA'],
  [/AISLAC|INSULAT/i,                               'AISLACIÓN'],
  [/PRECOM|PRE.*COM/i,                              'PRECOMISIONAMIENTO'],
  [/COMISION|COMMISSION|PUESTA.*MARCH|START.*UP/i,  'COMISIONAMIENTO'],
  [/ANDAMI|SCAFFOLD/i,                              'ANDAMIOS'],
  [/SUBCONT|TERCERO/i,                              'SUBCONTRATO'],
  [/GESTI[ÓO]N|ADMIN|MANAGEMENT/i,                 'GESTIÓN'],
];

function normalizeDiscipline(raw) {
  if (!raw) return '';
  for (const [re, canon] of DISC_NORM) {
    if (re.test(raw)) return canon;
  }
  return raw.trim();
}

// ─── XER parser ───────────────────────────────────────────────────────────────

function parseXer(filePath) {
  const bytes  = readFileSync(filePath);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder('windows-1252').decode(bytes); }

  const tables = new Map();
  let cur = null, fields = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line || line.length < 3) continue;
    if (line.startsWith('%T\t')) {
      cur = line.slice(3);
      tables.set(cur, { fields: [], rows: [] });
      fields = [];
    } else if (line.startsWith('%F\t') && cur) {
      fields = line.slice(3).split('\t');
      tables.get(cur).fields = fields;
    } else if (line.startsWith('%R\t') && cur) {
      const vals = line.slice(3).split('\t');
      const row  = {};
      fields.forEach((f, i) => { row[f] = vals[i] ?? ''; });
      tables.get(cur).rows.push(row);
    }
  }
  return tables;
}

function p6Date(s) {
  if (!s || s.length < 10) return null;
  return s.substring(0, 10);
}

function xerToRows(tables, fileName, projectId) {
  const taskTable  = tables.get('TASK');
  const wbsTable   = tables.get('PROJWBS');
  const rsrcTable  = tables.get('RSRC');
  const taskRsrc   = tables.get('TASKRSRC');
  if (!taskTable) return [];

  // RSRC lookup
  const rsrcById = new Map();
  rsrcTable?.rows.forEach(r => rsrcById.set(r.rsrc_id, { name: r.rsrc_name, type: r.rsrc_type }));

  // TASKRSRC: task_id → primary discipline
  const taskDisc    = new Map();
  const taskHHAssig = new Map();
  if (taskRsrc) {
    const byTask = new Map();
    for (const r of taskRsrc.rows) {
      const qty = parseFloat(r.target_qty) || 0;
      if (!byTask.has(r.task_id)) byTask.set(r.task_id, []);
      byTask.get(r.task_id).push({ rsrcId: r.rsrc_id, qty });
      taskHHAssig.set(r.task_id, (taskHHAssig.get(r.task_id) ?? 0) + qty);
    }
    for (const [taskId, assigns] of byTask) {
      const labor = assigns.filter(a => rsrcById.get(a.rsrcId)?.type === 'RT_Labor');
      const primary = (labor.length ? labor : assigns).sort((a, b) => b.qty - a.qty)[0];
      if (primary) {
        const rsrc = rsrcById.get(primary.rsrcId);
        if (rsrc) taskDisc.set(taskId, normalizeDiscipline(rsrc.name));
      }
    }
  }

  // WBS path
  const wbsById = new Map();
  wbsTable?.rows.forEach(r => wbsById.set(r.wbs_id, r));
  const wbsPath = (wbsId) => {
    const parts = [];
    let id = wbsId, safety = 0;
    while (id && safety++ < 20) {
      const w = wbsById.get(id);
      if (!w || w.proj_node_flag === 'Y') break;
      parts.unshift(w.wbs_short_name || w.wbs_name || id);
      id = w.parent_wbs_id;
    }
    return parts.join('.');
  };

  const rows = taskTable.rows.filter(r => r.task_type !== 'TT_Rsrc');
  return rows.map((r, i) => {
    const isSummary   = r.task_type === 'TT_WBS' || r.task_type === 'TT_LOE';
    const isMilestone = r.task_type === 'TT_Mile' || r.task_type === 'TT_FinMile';
    const floatHr     = parseFloat(r.total_float_hr_cnt) || 0;
    const isCritical  = r.float_path === '1' || (!isSummary && !isMilestone && floatHr <= 0 && r.total_float_hr_cnt !== '');
    const discipline  = (!isSummary && !isMilestone) ? (taskDisc.get(r.task_id) ?? null) : null;
    const hhPlan      = parseFloat(r.target_work_qty) || 0;
    const hhAssig     = taskHHAssig.get(r.task_id) ?? 0;
    const hh          = hhPlan > 0 && hhPlan < 1e9 ? hhPlan : (hhAssig < 1e9 ? hhAssig : 0);

    return {
      project_id:     projectId,
      wbs_code:       r.task_code || r.task_id,
      description:    r.task_name || null,
      cwp_code:       wbsPath(r.wbs_id) || null,
      discipline:     discipline,
      hh:             Math.round(hh * 100) / 100,
      start_date:     p6Date(r.target_start_date || r.early_start_date || r.act_start_date),
      end_date:       p6Date(r.target_end_date   || r.early_end_date   || r.act_end_date),
      progress:       parseFloat(r.phys_complete_pct) || 0,
      is_summary:     isSummary,
      is_milestone:   isMilestone,
      is_critical:    isCritical,
      float_days:     isSummary ? null : Math.round(floatHr / 8),
      program_source: fileName,
      sort_order:     i,
    };
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍 Consultando proyectos en Supabase...\n');

  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, description')
    .order('name');

  if (error) {
    console.error('Error consultando proyectos:', error.message);
    process.exit(1);
  }

  console.log(`✅ ${projects.length} proyectos encontrados:\n`);
  projects.forEach((p, i) => console.log(`  ${i+1}. [${p.id.substring(0,8)}...] ${p.name}`));

  // ── Auto-map: match EIMI/MIPE codes in project name ────────────────────────
  const mapping = {}; // xerCode → projectId
  for (const [xerCode, info] of Object.entries(XER_FILES)) {
    const match = projects.find(p =>
      p.name?.includes(xerCode) ||
      p.description?.includes(xerCode) ||
      p.name?.toUpperCase().includes(xerCode.toUpperCase())
    );
    if (match) mapping[xerCode] = match.id;
  }

  console.log('\n📋 Mapeo automático XER → Proyecto:\n');
  const unmapped = [];
  for (const [code, info] of Object.entries(XER_FILES)) {
    if (mapping[code]) {
      const proj = projects.find(p => p.id === mapping[code]);
      console.log(`  ✅ ${code} → ${proj.name}`);
    } else {
      console.log(`  ❌ ${code} (${info.label}) — SIN PROYECTO VINCULADO`);
      unmapped.push(code);
    }
  }

  if (unmapped.length > 0) {
    console.log(`\n⚠️  ${unmapped.length} programas sin proyecto. Se crearán proyectos nuevos automáticamente.\n`);

    // Auto-create missing projects
    for (const code of unmapped) {
      const info = XER_FILES[code];
      // Get org id from an existing project
      const { data: anyProj } = await supabase.from('projects').select('organization_id').limit(1).single();
      if (!anyProj) continue;

      const { data: newProj, error: createErr } = await supabase.from('projects').insert({
        organization_id: anyProj.organization_id,
        name: `${code} — ${info.label}`,
        description: `Importado desde XER: ${info.label}`,
        stage: 'operacion',
        active_modules: { programa: true, cwp: true, bim: false },
      }).select('id, name').single();

      if (createErr) {
        console.error(`  Error creando ${code}:`, createErr.message);
      } else {
        console.log(`  ✅ Creado: ${newProj.name} [${newProj.id.substring(0,8)}...]`);
        mapping[code] = newProj.id;
      }
    }
  }

  // ── Import each XER ────────────────────────────────────────────────────────
  console.log('\n🚀 Iniciando importación masiva...\n');

  let totalInserted = 0, totalErrors = 0;

  for (const [code, info] of Object.entries(XER_FILES)) {
    const projectId = mapping[code];
    if (!projectId) { console.log(`  ⚠️  ${code}: sin proyecto, saltando`); continue; }
    if (!existsSync(info.file)) { console.log(`  ⚠️  ${code}: archivo no encontrado`); continue; }

    process.stdout.write(`  📂 ${code} — parseando XER...`);
    const tables = parseXer(info.file);
    const rows   = xerToRows(tables, info.file.split('\\').pop(), projectId);
    process.stdout.write(` ${rows.length} actividades`);

    // Delete existing and insert fresh
    await supabase.from('program_activities').delete().eq('project_id', projectId);

    // Insert in batches of 500
    const BATCH = 500;
    let inserted = 0, hasError = false;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error: insErr } = await supabase.from('program_activities').insert(batch);
      if (insErr) {
        console.log(`\n    ❌ Error batch ${i}-${i+BATCH}: ${insErr.message}`);
        hasError = true;
        totalErrors++;
        break;
      }
      inserted += batch.length;
    }

    if (!hasError) {
      console.log(` → ✅ ${inserted} insertadas`);
      totalInserted += inserted;
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅ IMPORTACIÓN COMPLETA`);
  console.log(`   ${totalInserted.toLocaleString()} actividades insertadas`);
  console.log(`   ${totalErrors} errores`);
  console.log(`${'─'.repeat(60)}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
