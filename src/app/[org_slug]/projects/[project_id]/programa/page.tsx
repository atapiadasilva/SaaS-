'use client';

import { use, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CalendarDays, Upload, FileText, Loader2, RefreshCw, X, AlertCircle, CheckCircle2, Filter, Flame, FileDown, ArrowRight, Monitor, FolderOpen, Save, FileCode2, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import GanttChart, { Activity, getDiscColor, DISC_PALETTE } from '@/components/awp/GanttChart';
import { supabase } from '@/lib/supabase';

// ─── Excel helpers ────────────────────────────────────────────────────────────

function findCol(headers: string[], candidates: string[]): string | undefined {
  return headers.find(h =>
    candidates.some(c => h.toUpperCase().replace(/\s/g, '').includes(c.toUpperCase().replace(/\s/g, '')))
  );
}

function parseHH(v: any): number {
  if (!v) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  // Spanish/European format: "1.011,5" → has both . and ,
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',') && !s.includes('.')) {
    // Comma only: thousands if exactly 3 digits follow ("1,011"), decimal otherwise ("1,5")
    const parts = s.split(',');
    s = (parts.length === 2 && parts[1].length === 3)
      ? s.replace(',', '')
      : s.replace(',', '.');
  } else if (s.includes('.') && !s.includes(',')) {
    // Period only: Spanish thousands if all groups are digits and last group has 3 digits
    const parts = s.split('.');
    if (parts.length >= 2 && parts[parts.length - 1].length === 3 && parts.every(p => /^\d+$/.test(p))) {
      s = s.replace(/\./g, '');
    }
  }
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseDate(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(v).trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  return undefined;
}

// ─── Discipline normalization ─────────────────────────────────────────────────
// Maps raw P6/XER resource/code names → canonical platform discipline names

const DISC_NORM: [RegExp, string][] = [
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
  [/PRECOM|PRE.*COM|PRUEBA.*SISTEMA/i,              'PRECOMISIONAMIENTO'],
  [/COMISION|COMMISSION|PUESTA.*MARCH|START.*UP/i,  'COMISIONAMIENTO'],
  [/ANDAMI|SCAFFOLD/i,                              'ANDAMIOS'],
  [/SUBCONT|TERCERO/i,                              'SUBCONTRATO'],
  [/GESTI[ÓO]N|ADMIN|MANAGEMENT|DIRECC/i,          'GESTIÓN'],
  [/HITO|MILESTONE|COMPLET/i,                       'HITOS'],
];

function normalizeDiscipline(raw: string): string {
  if (!raw) return '';
  for (const [re, canon] of DISC_NORM) {
    if (re.test(raw)) return canon;
  }
  // If it's a known canonical name already, return as-is (case-normalized)
  const upper = raw.trim().toUpperCase();
  const match = Object.keys(DISC_PALETTE).find(k => k.toUpperCase() === upper);
  return match ?? raw.trim();
}

// ─── XER parser ───────────────────────────────────────────────────────────────

interface XerTable { fields: string[]; rows: Record<string, string>[] }

function parseXer(text: string): Map<string, XerTable> {
  const tables = new Map<string, XerTable>();
  let cur: string | null = null;
  let fields: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('%T\t'))      { cur = line.split('\t')[1]; tables.set(cur, { fields: [], rows: [] }); fields = []; }
    else if (line.startsWith('%F\t') && cur) { fields = line.split('\t').slice(1); tables.get(cur)!.fields = fields; }
    else if (line.startsWith('%R\t') && cur) {
      const vals = line.split('\t').slice(1);
      const row: Record<string, string> = {};
      fields.forEach((f, i) => { row[f] = vals[i] ?? ''; });
      tables.get(cur)!.rows.push(row);
    }
  }
  return tables;
}

function p6Date(s: string): string | undefined {
  if (!s || s.length < 10) return undefined;
  return s.substring(0, 10);
}

export interface XerMeta {
  projName: string;
  planStart: string;
  planEnd: string;
  fileName: string;
  totalTasks: number;
  detailTasks: number;
  milestones: number;
  criticalCount: number;
  hhPlan: number;
  hhAssigned: number;
  discBreakdown: { discipline: string; hh: number; count: number }[];
  rsrcNames: string[];
}

function xerToActivities(tables: Map<string, XerTable>, fileName: string): { activities: Activity[]; meta: XerMeta } {
  const wbsTable   = tables.get('PROJWBS');
  const taskTable  = tables.get('TASK');
  const rsrcTable  = tables.get('RSRC');
  const taskRsrc   = tables.get('TASKRSRC');

  // ── RSRC lookup: rsrc_id → { name, type } ──
  const rsrcById = new Map<string, { name: string; type: string }>();
  rsrcTable?.rows.forEach(r => rsrcById.set(r.rsrc_id, { name: r.rsrc_name, type: r.rsrc_type }));

  // ── TASKRSRC: task_id → primary discipline (highest target_qty labor resource) ──
  const taskDiscipline = new Map<string, string>();
  const taskHHAssigned = new Map<string, number>(); // all resources (for meta reporting)
  const taskLaborHH    = new Map<string, number>(); // labor only (for activity hh field)
  if (taskRsrc) {
    // Group by task_id
    const byTask = new Map<string, { rsrcId: string; qty: number }[]>();
    for (const r of taskRsrc.rows) {
      const qty = parseFloat(r.target_qty) || 0;
      if (!byTask.has(r.task_id)) byTask.set(r.task_id, []);
      byTask.get(r.task_id)!.push({ rsrcId: r.rsrc_id, qty });
      // all resources → used for meta.hhAssigned
      taskHHAssigned.set(r.task_id, (taskHHAssigned.get(r.task_id) ?? 0) + qty);
      // labor only → used as fallback hh when target_work_qty = 0
      const rsrcInfo = rsrcById.get(r.rsrc_id);
      if (rsrcInfo?.type === 'RT_Labor') {
        taskLaborHH.set(r.task_id, (taskLaborHH.get(r.task_id) ?? 0) + qty);
      }
    }
    for (const [taskId, assignments] of byTask) {
      // Primary = labor resource with highest qty
      const laborAssigns = assignments.filter(a => {
        const r = rsrcById.get(a.rsrcId);
        return r?.type === 'RT_Labor';
      });
      const primary = (laborAssigns.length ? laborAssigns : assignments).sort((a, b) => b.qty - a.qty)[0];
      if (primary) {
        const rsrc = rsrcById.get(primary.rsrcId);
        if (rsrc) taskDiscipline.set(taskId, normalizeDiscipline(rsrc.name));
      }
    }
  }

  // ── WBS lookup ──
  const wbsById = new Map<string, Record<string, string>>();
  wbsTable?.rows.forEach(r => wbsById.set(r.wbs_id, r));

  const wbsPath = (wbsId: string): string => {
    const parts: string[] = [];
    let id = wbsId;
    let safety = 0;
    while (id && safety++ < 20) {
      const w = wbsById.get(id);
      if (!w || w.proj_node_flag === 'Y') break;
      parts.unshift(w.wbs_short_name || w.wbs_name || id);
      id = w.parent_wbs_id;
    }
    return parts.join('.');
  };

  // ── PROJECT meta ──
  let projName = '', planStart = '', planEnd = '';
  const projTable = tables.get('PROJECT');
  if (projTable?.rows.length) {
    const pr = projTable.rows[0];
    projName  = pr.proj_short_name ?? pr.proj_name ?? '';
    planStart = (pr.plan_start_date ?? '').substring(0, 10);
    planEnd   = (pr.scd_end_date ?? pr.last_fin_date ?? '').substring(0, 10);
  }

  if (!taskTable) return {
    activities: [],
    meta: { projName, planStart, planEnd, fileName, totalTasks: 0, detailTasks: 0, milestones: 0, criticalCount: 0, hhPlan: 0, hhAssigned: 0, discBreakdown: [], rsrcNames: [] },
  };

  const rows = taskTable.rows.filter(r => r.task_type !== 'TT_Rsrc');
  const activities: Activity[] = rows.map((r, i) => {
    const isSummary   = r.task_type === 'TT_WBS' || r.task_type === 'TT_LOE';
    const isMilestone = r.task_type === 'TT_Mile' || r.task_type === 'TT_FinMile';
    const floatHr     = parseFloat(r.total_float_hr_cnt) || 0;
    const isCritical  = r.float_path === '1' || (!isSummary && !isMilestone && floatHr <= 0 && r.total_float_hr_cnt !== '');

    const discipline  = (!isSummary && !isMilestone) ? (taskDiscipline.get(r.task_id) ?? '') : '';
    const hhPlan      = parseFloat(r.target_work_qty) || 0;
    const hhAssig     = taskLaborHH.get(r.task_id) ?? 0; // labor-only fallback

    return {
      id:             r.task_id || `xer-${i}`,
      wbs_code:       r.task_code || r.task_id,
      description:    r.task_name,
      cwp_code:       wbsPath(r.wbs_id) || undefined,
      hh:             hhPlan > 0 ? hhPlan : hhAssig,
      start_date:     p6Date(r.target_start_date || r.early_start_date || r.act_start_date),
      end_date:       p6Date(r.target_end_date   || r.early_end_date   || r.act_end_date),
      progress:       Math.round(Math.min(100, Math.max(0, (parseFloat(r.phys_complete_pct) || 0) * 100))),
      is_summary:     isSummary,
      is_milestone:   isMilestone,
      is_critical:    isCritical,
      float_days:     Math.round(floatHr / 8),
      discipline:     discipline || undefined,
      program_source: fileName,
      sort_order:     i,
    } as Activity;
  });

  // ── Compute breakdown by discipline ──
  const discMap = new Map<string, { hh: number; count: number }>();
  for (const a of activities) {
    if (a.is_summary || a.is_milestone || !a.discipline) continue;
    const d = a.discipline;
    const cur = discMap.get(d) ?? { hh: 0, count: 0 };
    cur.hh    += a.hh || 0;
    cur.count += 1;
    discMap.set(d, cur);
  }
  const discBreakdown = [...discMap.entries()]
    .map(([discipline, v]) => ({ discipline, ...v }))
    .sort((a, b) => b.hh - a.hh);

  const rsrcNames = [...new Set([...rsrcById.values()].filter(r => r.type === 'RT_Labor').map(r => r.name))].slice(0, 12);

  const detail    = activities.filter(a => !a.is_summary && !a.is_milestone);
  const critical  = detail.filter(a => a.is_critical);
  const hhPlan    = detail.reduce((s, a) => s + (a.hh || 0), 0);
  const hhAssig   = [...taskHHAssigned.values()].reduce((s, v) => s + v, 0);

  return {
    activities,
    meta: {
      projName, planStart, planEnd, fileName,
      totalTasks:    activities.length,
      detailTasks:   detail.length,
      milestones:    activities.filter(a => a.is_milestone).length,
      criticalCount: critical.length,
      hhPlan:        hhPlan > 1e9 ? 0 : Math.round(hhPlan),
      hhAssigned:    hhAssig > 1e9 ? 0 : Math.round(hhAssig),
      discBreakdown,
      rsrcNames,
    },
  };
}

// ─── MS Project XML (MSPDI) ───────────────────────────────────────────────────

function parseMspXml(text: string, fileName: string): { activities: Activity[]; meta: XerMeta } {
  const doc   = new DOMParser().parseFromString(text, 'text/xml');
  
  // 1. Project Info
  const projName = doc.querySelector('Project > Name')?.textContent ?? '';
  const planStart = (doc.querySelector('Project > StartDate')?.textContent ?? '').substring(0, 10);
  const planEnd = (doc.querySelector('Project > FinishDate')?.textContent ?? '').substring(0, 10);

  // 2. Resources: UID -> { name, type }
  const rsrcById = new Map<string, { name: string; isLabor: boolean }>();
  const rsrcNames = new Set<string>();
  const resources = Array.from(doc.querySelectorAll('Resources > Resource'));
  for (const r of resources) {
    const uid = r.querySelector('UID')?.textContent;
    const name = r.querySelector('Name')?.textContent;
    // Type 1 is Work (Labor), 0 is Material, 2 is Cost
    const type = r.querySelector('Type')?.textContent;
    if (uid && name && type === '1') {
      rsrcById.set(uid, { name, isLabor: true });
      rsrcNames.add(name);
    }
  }

  // 3. Assignments: TaskUID -> ResourceUIDs + Work
  const assignments = Array.from(doc.querySelectorAll('Assignments > Assignment'));
  const taskDiscipline = new Map<string, string>();
  const taskHHAssigned = new Map<string, number>();

  const byTask = new Map<string, { rsrcUid: string; work: number }[]>();
  for (const a of assignments) {
    const taskUid = a.querySelector('TaskUID')?.textContent;
    const rsrcUid = a.querySelector('ResourceUID')?.textContent;
    const workStr = a.querySelector('Work')?.textContent; // PT8H
    if (!taskUid || !rsrcUid) continue;
    
    let work = 0;
    const match = workStr?.match(/PT?(\d+(?:\.\d+)?)H/);
    if (match) work = parseFloat(match[1]);

    if (!byTask.has(taskUid)) byTask.set(taskUid, []);
    byTask.get(taskUid)!.push({ rsrcUid, work });
    taskHHAssigned.set(taskUid, (taskHHAssigned.get(taskUid) ?? 0) + work);
  }

  for (const [taskUid, assigns] of byTask) {
    const laborAssigns = assigns.filter(a => rsrcById.get(a.rsrcUid)?.isLabor);
    const primary = (laborAssigns.length ? laborAssigns : assigns).sort((a, b) => b.work - a.work)[0];
    if (primary) {
      const rsrc = rsrcById.get(primary.rsrcUid);
      if (rsrc) taskDiscipline.set(taskUid, normalizeDiscipline(rsrc.name));
    }
  }

  // 4. Tasks
  const tasks = Array.from(doc.querySelectorAll('Tasks > Task'));
  const activities: Activity[] = [];
  
  for (const t of tasks) {
    const uid  = t.querySelector('UID')?.textContent ?? '';
    if (uid === '0') continue; // Project Summary Task
    
    const name    = t.querySelector('Name')?.textContent ?? '';
    const wbs     = t.querySelector('WBS')?.textContent ?? '';
    const start   = (t.querySelector('Start')?.textContent ?? '').substring(0, 10);
    const finish  = (t.querySelector('Finish')?.textContent ?? '').substring(0, 10);
    const pct     = Math.min(100, Math.max(0, parseFloat(t.querySelector('PercentComplete')?.textContent ?? '0')));
    const summary = t.querySelector('Summary')?.textContent === '1';
    const isMile  = t.querySelector('Milestone')?.textContent === '1';
    const critical = t.querySelector('Critical')?.textContent === '1';
    
    let hh = 0;
    const work = t.querySelector('Work')?.textContent ?? '';
    const mh = work.match(/PT?(\d+(?:\.\d+)?)H/);
    if (mh) hh = parseFloat(mh[1]);

    const hhAssig = taskHHAssigned.get(uid) ?? 0;
    const finalHH = hh > 0 ? hh : hhAssig;

    const discipline = (!summary && !isMile) ? (taskDiscipline.get(uid) ?? '') : '';

    // Calculate float days
    let floatDays = 0;
    const totalSlack = t.querySelector('TotalSlack')?.textContent;
    if (totalSlack) {
      const slackMatch = totalSlack.match(/PT?(\d+(?:\.\d+)?)H/);
      if (slackMatch) floatDays = Math.round(parseFloat(slackMatch[1]) / 8);
    }

    activities.push({
      id:          uid,
      wbs_code:    wbs || uid,
      description: name,
      cwp_code:    wbs || undefined,
      hh:          finalHH,
      start_date:  start || undefined,
      end_date:    finish || undefined,
      progress:    pct,
      is_summary:  summary,
      is_milestone: isMile,
      is_critical: critical,
      float_days:  floatDays,
      discipline:  discipline || undefined,
      program_source: fileName,
      sort_order: activities.length,
    } as Activity);
  }

  // 5. Meta calculations
  const detail    = activities.filter(a => !a.is_summary && !a.is_milestone);
  const criticalCount = detail.filter(a => a.is_critical).length;
  const hhPlan    = detail.reduce((s, a) => s + (a.hh || 0), 0);
  const totalAssig = [...taskHHAssigned.values()].reduce((s, v) => s + v, 0);

  const discMap = new Map<string, { hh: number; count: number }>();
  for (const a of detail) {
    if (!a.discipline) continue;
    const cur = discMap.get(a.discipline) ?? { hh: 0, count: 0 };
    cur.hh += a.hh || 0;
    cur.count += 1;
    discMap.set(a.discipline, cur);
  }
  const discBreakdown = [...discMap.entries()]
    .map(([discipline, v]) => ({ discipline, ...v }))
    .sort((a, b) => b.hh - a.hh);

  return {
    activities,
    meta: {
      projName, planStart, planEnd, fileName,
      totalTasks: activities.length,
      detailTasks: detail.length,
      milestones: activities.filter(a => a.is_milestone).length,
      criticalCount,
      hhPlan: Math.round(hhPlan),
      hhAssigned: Math.round(totalAssig),
      discBreakdown,
      rsrcNames: Array.from(rsrcNames).slice(0, 12),
    },
  };
}

// ─── P6 XML ───────────────────────────────────────────────────────────────────

function parseP6Xml(text: string, fileName: string): { activities: Activity[]; meta: XerMeta } {
  const doc   = new DOMParser().parseFromString(text, 'text/xml');
  const tasks = Array.from(doc.querySelectorAll('Activity, task'));
  const activities: Activity[] = tasks.map((t, i) => {
    const get = (sel: string) => t.querySelector(sel)?.textContent?.trim() ?? '';
    const durHr = get('PlannedDuration') || get('Duration');
    let hh = 0;
    const mh = durHr.match(/PT?(\d+(?:\.\d+)?)H/);
    if (mh) hh = parseFloat(mh[1]);
    return {
      id:           get('Id') || get('task_code') || `ACT-${i+1}`,
      wbs_code:     get('Id') || get('task_code') || `ACT-${i+1}`,
      description:  get('Name') || get('task_name'),
      cwp_code:     get('WBSCode') || get('WBSObjectId') || undefined,
      hh,
      start_date:   (get('PlannedStartDate') || get('StartDate') || '').substring(0, 10) || undefined,
      end_date:     (get('PlannedFinishDate') || get('FinishDate') || '').substring(0, 10) || undefined,
      progress:     Math.min(100, Math.max(0, parseFloat(get('PhysicalPercentComplete') || get('PercentComplete') || '0'))),
      is_summary:   false, program_source: fileName, sort_order: i,
    } as Activity;
  });
  const detail = activities.filter(a => !a.is_summary);
  return {
    activities,
    meta: {
      projName: '', planStart: '', planEnd: '', fileName,
      totalTasks: activities.length, detailTasks: detail.length,
      milestones: 0, criticalCount: 0,
      hhPlan: Math.round(detail.reduce((s, a) => s + (a.hh || 0), 0)),
      hhAssigned: 0, discBreakdown: [], rsrcNames: [],
    },
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportStep = 'idle' | 'excel-map' | 'xer-confirm' | 'saving' | 'mpp-guide' | 'mpp-parsing';

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProgramaPage({ params }: { params: Promise<{ org_slug: string; project_id: string }> }) {
  const { project_id } = use(params);

  const [activities, setActivities]   = useState<Activity[]>([]);
  const [loading, setLoading]         = useState(true);
  const [step, setStep]               = useState<ImportStep>('idle');
  const [mapped, setMapped]           = useState<Activity[]>([]);
  const [xerMeta, setXerMeta]         = useState<XerMeta | null>(null);
  const [preview, setPreview]         = useState<any[]>([]);
  const [colMap, setColMap]           = useState<Record<string, string>>({});
  const [headers, setHeaders]         = useState<string[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const [importSource, setImportSource] = useState('');
  const [discFilter, setDiscFilter]   = useState<string | null>(null);
  const [mppFileName, setMppFileName] = useState('');
  const [critOnly, setCritOnly]       = useState(false);
  const [versions, setVersions]       = useState<{ name: string; count: number }[]>([]);
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [replaceMode, setReplaceMode] = useState<'replace' | 'new'>('replace');

  // Pending BIM updates — flushed to Supabase with 1.5s debounce
  const bimPendingRef = useRef<Record<string, number>>({});
  const bimFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBimToSupabase = useCallback(async () => {
    const updates = { ...bimPendingRef.current };
    if (!Object.keys(updates).length) return;
    bimPendingRef.current = {};
    try {
      const { data: proj } = await (supabase as any)
        .from('projects').select('module_config').eq('id', project_id).single();
      const mc = (proj?.module_config ?? {}) as Record<string, unknown>;
      const existing = (mc.bim_progress_map ?? {}) as Record<string, number>;
      const merged = { ...existing, ...updates };
      await (supabase as any).from('projects').update({
        module_config: { ...mc, bim_progress_map: merged },
      }).eq('id', project_id);
      // Update local activities state
      setActivities(prev => prev.map(a => updates[a.id] !== undefined ? { ...a, bim_progress: updates[a.id] } : a));
    } catch (e) { console.warn('[BIM progress] Error guardando:', e); }
  }, [project_id]);

  const handleBimProgressChange = useCallback((id: string, value: number) => {
    bimPendingRef.current[id] = value;
    if (bimFlushTimer.current) clearTimeout(bimFlushTimer.current);
    bimFlushTimer.current = setTimeout(flushBimToSupabase, 1500);
  }, [flushBimToSupabase]);

  const load = useCallback(async (versionFilter?: string | null) => {
    setLoading(true);
    const versionParam = versionFilter !== undefined ? versionFilter : activeVersion;
    const url = versionParam
      ? `/api/program?project_id=${project_id}&source=${encodeURIComponent(versionParam)}`
      : `/api/program?project_id=${project_id}`;
    const [progRes, versRes, projRes] = await Promise.all([
      fetch(url),
      fetch(`/api/program/versions?project_id=${project_id}`),
      (supabase as any).from('projects').select('module_config').eq('id', project_id).single(),
    ]);
    const rawData: Activity[] = await progRes.json();
    const versData = await versRes.json();

    // Normalize legacy progress stored as 0-1 decimal (P6 XER before fix)
    const hasDecimal = rawData.some((a: Activity) => a.progress > 0 && a.progress < 1);
    const data: Activity[] = hasDecimal
      ? rawData.map(a => ({ ...a, progress: Math.round(a.progress * 100) }))
      : rawData;

    if (Array.isArray(versData)) setVersions(versData);

    const bimMap = (projRes.data?.module_config as any)?.bim_progress_map as Record<string, number> | undefined;
    if (bimMap) {
      setActivities(data.map(a => bimMap[a.id] !== undefined ? { ...a, bim_progress: bimMap[a.id] } : a));
    } else {
      setActivities(data);
    }
    setLoading(false);
  }, [project_id, activeVersion]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setStep('idle'); setPreview([]); setMapped([]); setHeaders([]); setError(null); setXerMeta(null); setMppFileName(''); };

  const saveActivities = async (acts: Activity[]) => {
    setStep('saving');
    const sourceName = acts[0]?.program_source ?? importSource.split(' · ')[0] ?? 'Programa';
    const body = replaceMode === 'replace'
      ? { project_id, activities: acts, replace_source: activeVersion ?? sourceName, source_name: sourceName }
      : { project_id, activities: acts, source_name: sourceName };
    const res = await fetch('/api/program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.json(); setError(e.error ?? 'Error guardando'); setStep('xer-confirm'); return; }
    const newSource = sourceName;
    setActiveVersion(newSource);
    reset();
    await load(newSource);
  };

  // ── File handler ───────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (ext === 'mpp') {
      setMppFileName(file.name);
      setStep('mpp-parsing');
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/parse-mpp', { method: 'POST', body: fd });
        const result = await res.json();

        // Caso 1: El servidor encontró XML embebido dentro del MPP
        if (result.success && result.format === 'xml' && result.xmlContent) {
          const xmlResult = parseMspXml(result.xmlContent, file.name);
          if (xmlResult.activities.length > 0) {
            setMapped(xmlResult.activities);
            setXerMeta(xmlResult.meta);
            setImportSource(`MS Project MPP (XML) · ${xmlResult.meta.detailTasks} actividades`);
            setStep('xer-confirm');
            return;
          }
        }

        // Caso 2: El servidor extrajo actividades directamente del binario
        if (result.success && result.format === 'tasks' && result.activities?.length) {
          setMapped(result.activities);
          setXerMeta({
            projName: result.meta?.projectName ?? '',
            planStart: '', planEnd: '',
            fileName: file.name,
            totalTasks: result.activities.length,
            detailTasks: result.activities.filter((a: any) => !a.is_summary && !a.is_milestone).length,
            milestones: result.activities.filter((a: any) => a.is_milestone).length,
            criticalCount: 0, hhPlan: 0, hhAssigned: 0,
            discBreakdown: [], rsrcNames: [],
          });
          setImportSource(`MS Project MPP · ${result.activities.length} actividades`);
          setStep('xer-confirm');
          return;
        }

        // Caso 3: No se pudo parsear — mostrar guía
        setStep('mpp-guide');
        return;
      } catch {
        setStep('mpp-guide');
        return;
      }
    }

    if (ext === 'xer') {
      try {
        const buf  = await file.arrayBuffer();
        let text: string;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
        catch { text = new TextDecoder('windows-1252').decode(buf); }
        const tables = parseXer(text);
        const { activities: acts, meta } = xerToActivities(tables, file.name);
        if (!acts.length) { setError('No se encontraron actividades en el archivo XER.'); return; }
        setMapped(acts);
        setXerMeta(meta);
        setImportSource(`Primavera P6 XER · ${meta.detailTasks} actividades · ${meta.criticalCount} en RC`);
        setStep('xer-confirm');
      } catch (err: any) { setError(`Error leyendo XER: ${err.message}`); }
      return;
    }

    if (ext === 'xml') {
      try {
        const text = await file.text();
        let result: { activities: Activity[]; meta: XerMeta };
        if (text.includes('<Tasks>') || text.includes('http://schemas.microsoft.com/project')) {
          result = parseMspXml(text, file.name);
          setImportSource(`MS Project XML · ${result.meta.detailTasks} actividades`);
        } else {
          result = parseP6Xml(text, file.name);
          setImportSource(`P6 XML · ${result.meta.detailTasks} actividades`);
        }
        if (!result.activities.length) { setError('No se encontraron actividades en el XML.'); return; }
        setMapped(result.activities);
        setXerMeta(result.meta);
        setStep('xer-confirm');
      } catch (err: any) { setError(`Error leyendo XML: ${err.message}`); }
      return;
    }

    // Excel / CSV
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb   = XLSX.read(evt.target?.result, { type: 'array', cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
        if (!rows.length) { setError('Archivo vacío'); return; }
        const hdrs = Object.keys(rows[0]);
        setHeaders(hdrs);
        setPreview(rows);
        setColMap({
          wbs:      findCol(hdrs, ['WBS','CODIGO','CÓDIGO','ID']) ?? '',
          desc:     findCol(hdrs, ['DESCRIPCION','DESCRIPCIÓN','NOMBRE','NAME','ACTIVIDAD']) ?? '',
          cwp:      findCol(hdrs, ['CWP']) ?? '',
          ewp:      findCol(hdrs, ['EWP']) ?? '',
          pwp:      findCol(hdrs, ['PWP']) ?? '',
          disc:     findCol(hdrs, ['DISCIPLINA','DISC']) ?? '',
          hh:       findCol(hdrs, ['HH','HORAS','MAN','MANHOUR']) ?? '',
          start:    findCol(hdrs, ['INICIO','START','COMIENZO']) ?? '',
          end:      findCol(hdrs, ['TERMINO','TÉRMINO','FIN','END']) ?? '',
          progress: findCol(hdrs, ['AVANCE','PROGRESO','PROGRESS','%']) ?? '',
          parent:   findCol(hdrs, ['PADRE','PARENT']) ?? '',
          summary:  findCol(hdrs, ['RESUMEN','SUMMARY','NIVEL']) ?? '',
        });
        setStep('excel-map');
      } catch { setError('Error leyendo el archivo Excel'); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExcelSave = async () => {
    const acts: Activity[] = preview.map((row, i) => ({
      id:          `xl-${i}`,
      wbs_code:    String(row[colMap.wbs] ?? `ACT-${i+1}`).trim(),
      description: String(row[colMap.desc] ?? '').trim(),
      cwp_code:    String(row[colMap.cwp] ?? '').trim() || undefined,
      ewp_code:    String(row[colMap.ewp] ?? '').trim() || undefined,
      pwp_code:    String(row[colMap.pwp] ?? '').trim() || undefined,
      discipline:  normalizeDiscipline(String(row[colMap.disc] ?? '').trim()) || undefined,
      hh:          parseHH(row[colMap.hh]),
      start_date:  parseDate(row[colMap.start]),
      end_date:    parseDate(row[colMap.end]),
      progress:    parseHH(row[colMap.progress]),
      parent_wbs:  colMap.parent ? String(row[colMap.parent] ?? '').trim() || undefined : undefined,
      is_summary:  colMap.summary
        ? ['true','1','si','sí','yes','s','x'].includes(String(row[colMap.summary]).toLowerCase().trim())
        : false,
      sort_order:  i,
    } as Activity));
    await saveActivities(acts);
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const detail       = activities.filter(a => !a.is_summary && !a.is_milestone);
  const totalHH      = Math.round(detail.reduce((s, a) => s + (a.hh || 0), 0));
  const critCount    = detail.filter(a => a.is_critical).length;

  const fmtHH = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`;
    if (n >= 10_000)    return `${Math.round(n / 1_000).toLocaleString('es-CL')}K`;
    return n.toLocaleString('es-CL', { maximumFractionDigits: 0 });
  };

  const discBreakdown = useMemo(() => {
    const map = new Map<string, { hh: number; count: number }>();
    for (const a of detail) {
      if (!a.discipline) continue;
      const cur = map.get(a.discipline) ?? { hh: 0, count: 0 };
      cur.hh += a.hh || 0; cur.count += 1;
      map.set(a.discipline, cur);
    }
    return [...map.entries()].map(([d, v]) => ({ discipline: d, ...v })).sort((a, b) => b.hh - a.hh);
  }, [activities]);

  const visibleActivities = useMemo(() => {
    let filtered = activities;
    if (discFilter)  filtered = filtered.filter(a => a.is_summary || a.discipline === discFilter);
    if (critOnly)    filtered = filtered.filter(a => a.is_summary || a.is_critical);
    return filtered;
  }, [activities, discFilter, critOnly]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] gap-3">

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#0C1E4F] rounded-2xl flex items-center justify-center text-white shrink-0">
            <CalendarDays size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#0C1E4F] leading-none">Programa Maestro</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Carta Gantt ·{' '}
              <span className="text-[#0C1E4F]">{detail.length} actividades</span>
              {' · '}
              <span className="text-[#0C1E4F]">{fmtHH(totalHH)} HH</span>
              {critCount > 0 && <span className="text-red-500"> · {critCount} RC</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {critCount > 0 && (
            <button
              onClick={() => setCritOnly(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border ${critOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white border-red-200 text-red-600 hover:bg-red-50'}`}
            >
              <Flame size={11} /> Ruta Crítica
            </button>
          )}
          <button onClick={() => load()} disabled={loading} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <label className="flex items-center gap-2 px-4 py-2 bg-[#0C1E4F] text-white rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer hover:bg-blue-700 transition-colors">
            <Upload size={13} /> Importar
            <input type="file" accept=".xer,.xml,.xlsx,.xls,.csv,.mpp" className="hidden" onChange={handleFile} />
          </label>
          <div className="text-[9px] text-slate-400 font-bold leading-tight text-right">
            <div className="text-emerald-600">● XER · XML · Excel · MPP</div>
            <div className="text-slate-300">Primavera P6 · MS Project</div>
          </div>
        </div>
      </div>

      {/* ── Version selector pills ── */}
      {versions.length > 1 && (
        <div className="shrink-0 flex flex-wrap gap-1.5 items-center">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Save size={9} /> Versión:</span>
          <button
            onClick={() => { setActiveVersion(null); setTimeout(() => load(null), 0); }}
            className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors ${!activeVersion ? 'bg-[#0C1E4F] text-white border-[#0C1E4F]' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
          >
            Todas ({versions.reduce((s, v) => s + v.count, 0)})
          </button>
          {versions.map(v => (
            <button
              key={v.name}
              onClick={() => { setActiveVersion(v.name); setTimeout(() => load(v.name), 0); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-colors truncate max-w-[180px] ${activeVersion === v.name ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
              title={v.name}
            >
              <FolderOpen size={9} /> {v.name.length > 20 ? v.name.substring(0, 18) + '…' : v.name} · {v.count}
            </button>
          ))}
        </div>
      )}

      {/* ── Discipline filter pills ── */}
      {discBreakdown.length > 0 && (
        <div className="shrink-0 flex flex-wrap gap-1.5 items-center">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Filter size={9} /> Disciplina:</span>
          <button
            onClick={() => setDiscFilter(null)}
            className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors ${!discFilter ? 'bg-slate-700 text-white border-slate-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
          >
            Todas
          </button>
          {discBreakdown.map(({ discipline, hh, count }) => {
            const dc = getDiscColor(discipline);
            const isActive = discFilter === discipline;
            return (
              <button
                key={discipline}
                onClick={() => setDiscFilter(isActive ? null : discipline)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-colors"
                style={{
                  backgroundColor: isActive ? dc.bar : dc.bg,
                  borderColor:     isActive ? dc.bar : dc.bar + '40',
                  color:           isActive ? '#fff' : dc.text,
                }}
              >
                {discipline} · {fmtHH(Math.round(hh))} HH
              </button>
            );
          })}
        </div>
      )}

      {/* ── XER confirm modal ── */}
      {step === 'xer-confirm' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Confirmar importación</p>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">{importSource}</p>
              </div>
              <button onClick={reset} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Project info from XER */}
              {xerMeta?.projName && (
                <div className="bg-blue-50 rounded-2xl p-3 border border-blue-100">
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Programa detectado en XER</p>
                  <p className="text-sm font-black text-[#0C1E4F] mt-0.5">{xerMeta.projName}</p>
                  {xerMeta.planStart && (
                    <p className="text-[10px] text-blue-600 font-bold mt-0.5">
                      {xerMeta.planStart} → {xerMeta.planEnd || '—'}
                    </p>
                  )}
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total',        value: xerMeta?.totalTasks ?? mapped.length,     color: '#0C1E4F' },
                  { label: 'Detalle',      value: xerMeta?.detailTasks ?? mapped.filter(a => !a.is_summary).length, color: '#0C1E4F' },
                  { label: 'Hitos',        value: xerMeta?.milestones ?? 0,                 color: '#D97706' },
                  { label: 'Ruta Crítica', value: xerMeta?.criticalCount ?? 0,              color: '#DC2626' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-100">
                    <p className="text-lg font-black" style={{ color: s.color }}>{s.value.toLocaleString()}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* HH grid */}
              {xerMeta && xerMeta.hhPlan > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-center">
                    <p className="text-base font-black text-[#0C1E4F]">{xerMeta.hhPlan.toLocaleString('es-CL')}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">HH Plan (Programadas)</p>
                  </div>
                  {xerMeta.hhAssigned > 0 && xerMeta.hhAssigned !== xerMeta.hhPlan && (
                    <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-center">
                      <p className="text-base font-black text-emerald-700">{xerMeta.hhAssigned.toLocaleString('es-CL')}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">HH Asignadas (RSRC)</p>
                    </div>
                  )}
                </div>
              )}

              {/* Discipline breakdown */}
              {xerMeta && xerMeta.discBreakdown.length > 0 && (
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Desglose por Disciplina</p>
                  <div className="space-y-1.5">
                    {xerMeta.discBreakdown.map(({ discipline, hh, count }) => {
                      const dc  = getDiscColor(discipline);
                      const pct = xerMeta.hhPlan > 0 ? (hh / xerMeta.hhPlan * 100) : 0;
                      return (
                        <div key={discipline} className="flex items-center gap-2">
                          <span className="w-24 shrink-0 text-[9px] font-black truncate" style={{ color: dc.text }}>{discipline}</span>
                          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: dc.bg }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: dc.bar }} />
                          </div>
                          <span className="text-[9px] font-bold text-slate-400 shrink-0 w-24 text-right">
                            {hh.toLocaleString('es-CL', { maximumFractionDigits: 0 })} HH · {count} act
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Resources */}
              {xerMeta && xerMeta.rsrcNames.length > 0 && (
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Recursos de Mano de Obra</p>
                  <div className="flex flex-wrap gap-1">
                    {xerMeta.rsrcNames.map(r => (
                      <span key={r} className="px-2 py-0.5 bg-slate-100 rounded-lg text-[9px] font-bold text-slate-600">{r}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview table */}
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Vista previa (primeras 6)</p>
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-[9px]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-black text-slate-400 uppercase tracking-wide">Código</th>
                        <th className="px-2 py-1.5 text-left font-black text-slate-400 uppercase tracking-wide">Descripción</th>
                        <th className="px-2 py-1.5 text-left font-black text-slate-400 uppercase tracking-wide">Disciplina</th>
                        <th className="px-2 py-1.5 text-left font-black text-slate-400 uppercase tracking-wide">Inicio</th>
                        <th className="px-2 py-1.5 text-left font-black text-slate-400 uppercase tracking-wide">Fin</th>
                        <th className="px-2 py-1.5 text-left font-black text-slate-400 uppercase tracking-wide">RC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapped.filter(a => !a.is_summary).slice(0, 6).map((a, i) => {
                        const dc = getDiscColor(a.discipline);
                        return (
                          <tr key={i} className={`border-t border-slate-50 ${a.is_critical ? 'bg-red-50/40' : ''}`}>
                            <td className="px-2 py-1 font-mono text-slate-600">{a.wbs_code}</td>
                            <td className="px-2 py-1 text-slate-700 truncate max-w-[160px]">{a.description}</td>
                            <td className="px-2 py-1">
                              {a.discipline && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-black" style={{ backgroundColor: dc.bg, color: dc.text }}>
                                  {a.discipline}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-slate-500">{a.start_date ?? '—'}</td>
                            <td className="px-2 py-1 text-slate-500">{a.end_date ?? '—'}</td>
                            <td className="px-2 py-1 text-center">{a.is_critical ? <span className="text-red-500 font-black text-[9px]">●</span> : ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {mapped.filter(a => !a.is_summary).length > 6 && (
                    <p className="text-center text-[9px] text-slate-400 py-1.5">… y {mapped.filter(a => !a.is_summary).length - 6} actividades más</p>
                  )}
                </div>
              </div>

              {/* Version mode selector */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Modo de importación</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setReplaceMode('replace')}
                    className={`flex-1 px-3 py-2 rounded-xl border text-[10px] font-black transition-colors ${replaceMode === 'replace' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    Reemplazar versión{activeVersion ? ` "${activeVersion.length > 15 ? activeVersion.substring(0, 13) + '…' : activeVersion}"` : ' actual'}
                  </button>
                  <button
                    onClick={() => setReplaceMode('new')}
                    className={`flex-1 px-3 py-2 rounded-xl border text-[10px] font-black transition-colors ${replaceMode === 'new' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    Nueva versión (mantener historial)
                  </button>
                </div>
                {replaceMode === 'new' && (
                  <p className="text-[9px] text-emerald-700 font-bold mt-1.5">
                    Se creará una nueva versión sin eliminar las existentes.
                  </p>
                )}
                {replaceMode === 'replace' && versions.length === 0 && (
                  <p className="text-[9px] text-amber-600 font-bold mt-1.5">
                    Esto reemplazará todas las actividades del proyecto.
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-rose-600 text-[11px] font-bold bg-rose-50 rounded-xl px-3 py-2">
                  <AlertCircle size={13} /> {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={reset} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={() => saveActivities(mapped)}
                disabled={!mapped.length}
                className="px-6 py-2 bg-[#0C1E4F] text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                <CheckCircle2 size={13} /> Cargar {mapped.length} actividades
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Excel mapping modal ── */}
      {step === 'excel-map' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Mapeo de Columnas — Excel</p>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">{preview.length} filas detectadas</p>
              </div>
              <button onClick={reset} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {[
                { key: 'wbs',      label: 'Código WBS *' },
                { key: 'desc',     label: 'Descripción' },
                { key: 'cwp',      label: 'CWP' },
                { key: 'ewp',      label: 'EWP' },
                { key: 'pwp',      label: 'PWP' },
                { key: 'disc',     label: 'Disciplina' },
                { key: 'hh',       label: 'HH (Man-Hours)' },
                { key: 'start',    label: 'Fecha Inicio' },
                { key: 'end',      label: 'Fecha Término' },
                { key: 'progress', label: '% Avance' },
                { key: 'parent',   label: 'WBS Padre' },
                { key: 'summary',  label: '¿Es resumen? (true/1)' },
              ].map(field => (
                <div key={field.key} className="flex items-center gap-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest w-40 shrink-0">{field.label}</label>
                  <select value={colMap[field.key] ?? ''} onChange={e => setColMap(p => ({ ...p, [field.key]: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-100">
                    <option value="">— sin mapear —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {error && (
              <div className="mx-6 mb-2 flex items-center gap-2 text-rose-600 text-[11px] font-bold bg-rose-50 rounded-xl px-3 py-2">
                <AlertCircle size={13} /> {error}
              </div>
            )}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={reset} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleExcelSave} disabled={!colMap.wbs}
                className="px-6 py-2 bg-[#0C1E4F] text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                <FileText size={13} /> Cargar {preview.length} actividades
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="fixed inset-0 z-50 bg-white/80 flex items-center justify-center gap-3">
          <Loader2 size={28} className="animate-spin text-[#0C1E4F]" />
          <p className="font-black text-slate-500 uppercase tracking-widest text-sm">Procesando programa...</p>
        </div>
      )}

      {step === 'mpp-parsing' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-blue-600" />
            </div>
            <p className="text-sm font-black text-slate-700 uppercase tracking-tight">Analizando archivo MPP</p>
            <p className="text-[11px] text-slate-400 font-bold text-center">
              Intentando leer <span className="text-blue-600">{mppFileName}</span> del lado del servidor...
            </p>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full animate-pulse" style={{ width: '70%' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal MPP: no se pudo parsear completamente ── */}
      {step === 'mpp-guide' && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-[#0C1E4F] to-blue-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center backdrop-blur">
                    <FileCode2 size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white uppercase tracking-tight">Archivo MPP Detectado</p>
                    <p className="text-[10px] text-white/60 font-bold mt-0.5">{mppFileName}</p>
                  </div>
                </div>
                <button onClick={reset} className="p-2 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Info */}
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <Info size={14} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-amber-700">No se pudieron extraer todas las actividades</p>
                  <p className="text-[10px] text-amber-600/80 mt-0.5 leading-relaxed">
                    El archivo <span className="font-black">.mpp</span> usa un formato binario propietario de Microsoft.
                    Para una importación completa, convierte el archivo a <span className="font-black">XML</span> usando
                    una de las opciones gratuitas de abajo.
                  </p>
                </div>
              </div>

              {/* Opción 1: Conversor online */}
              <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Opción 1 — Convertir online (gratis, sin instalar nada)</p>
                <div className="flex items-start gap-3 group">
                  <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center text-white text-[11px] font-black shrink-0 group-hover:scale-110 transition-transform">1</div>
                  <div className="flex-1 bg-slate-50 rounded-2xl p-3 border border-slate-100 group-hover:border-emerald-200 transition-colors">
                    <p className="text-[11px] font-black text-slate-700 mb-1">Convierte tu archivo .mpp a .xml gratis</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed mb-2">
                      Usa cualquiera de estos conversores gratuitos en línea. Sube tu <span className="font-bold text-blue-600">{mppFileName}</span>,
                      elige formato de salida <span className="font-black text-emerald-600">XML</span>, y descarga el resultado.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { name: 'Zamzar', url: 'https://www.zamzar.com/convert/mpp-to-xml/' },
                        { name: 'ConvertFiles', url: 'https://www.convertfiles.com/' },
                        { name: 'Aspose (gratis)', url: 'https://products.aspose.app/tasks/conversion/mpp-to-xml' },
                      ].map(c => (
                        <a key={c.name} href={c.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] font-black text-emerald-700 hover:bg-emerald-100 transition">
                          <ArrowRight size={10} /> {c.name}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 group">
                  <div className="w-8 h-8 bg-emerald-600 rounded-xl flex items-center justify-center text-white text-[11px] font-black shrink-0 group-hover:scale-110 transition-transform">2</div>
                  <div className="flex-1 bg-slate-50 rounded-2xl p-3 border border-slate-100 group-hover:border-emerald-200 transition-colors">
                    <p className="text-[11px] font-black text-slate-700">Sube el archivo XML convertido aquí</p>
                    <p className="text-[10px] text-slate-500">Una vez convertido, sube el archivo .xml resultante.</p>
                  </div>
                </div>
              </div>

              {/* Opción 2: Otros formatos */}
              <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Opción 2 — Exportar desde tu software de planificación</p>
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[10px] text-slate-500 leading-relaxed mb-3">
                    Si tienes acceso a algún software de planificación (MS Project, Primavera P6, ProjectLibre, etc.),
                    exporta como cualquiera de estos formatos:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { ext: '.xml', name: 'MS Project XML', color: 'text-blue-600 bg-blue-50 border-blue-200' },
                      { ext: '.xer', name: 'Primavera P6', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
                      { ext: '.xlsx', name: 'Excel', color: 'text-purple-600 bg-purple-50 border-purple-200' },
                      { ext: '.csv', name: 'CSV', color: 'text-amber-600 bg-amber-50 border-amber-200' },
                    ].map(f => (
                      <div key={f.ext} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${f.color}`}>
                        <CheckCircle2 size={11} />
                        <div>
                          <span className="text-[10px] font-black">{f.ext}</span>
                          <span className="text-[9px] opacity-70 ml-1">{f.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <button onClick={reset} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50 transition">
                Cancelar
              </button>
              <label className="flex items-center gap-2 px-5 py-2.5 bg-[#0C1E4F] text-white rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer hover:bg-blue-700 transition-colors">
                <Upload size={13} />
                Subir archivo convertido
                <input type="file" accept=".xml,.xer,.xlsx,.xls,.csv" className="hidden" onChange={(e) => { reset(); handleFile(e); }} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ── Gantt ── */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-3">
            <Loader2 size={24} className="animate-spin text-[#0C1E4F]" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Cargando programa...</p>
          </div>
        ) : (
          <GanttChart
            activities={visibleActivities}
            onBimProgressChange={handleBimProgressChange}
          />
        )}
      </div>

      {error && step === 'idle' && (
        <div className="shrink-0 flex items-center gap-2 text-rose-600 text-[11px] font-bold bg-rose-50 rounded-xl px-4 py-2 border border-rose-100">
          <AlertCircle size={13} /> {error}
        </div>
      )}
    </div>
  );
}
