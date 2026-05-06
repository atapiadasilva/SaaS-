'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronRight, ChevronDown, ZoomIn, ZoomOut, CalendarDays, BarChart,
  CheckCircle2, Search, X, Layers,
} from 'lucide-react';
import { cleanDescription } from '@/components/awp/PlanCharts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Activity {
  id: string;
  wbs_code: string;
  cwp_code?: string;
  ewp_code?: string;
  pwp_code?: string;
  description?: string;
  discipline?: string;
  hh: number;
  start_date?: string;
  end_date?: string;
  progress: number;
  bim_progress?: number;   // ← NEW: Avance BIM (0–100)
  is_summary: boolean;
  is_milestone?: boolean;
  is_critical?: boolean;
  float_days?: number;
  program_source?: string;
  parent_wbs?: string;
  sort_order: number;
}

type DragType = 'left' | 'right' | 'move';
type Override = { start: number; end: number };
export type TimeScale = 'days' | 'weeks' | 'months' | 'years';

// ─── Discipline colors ────────────────────────────────────────────────────────

export const DISC_PALETTE: Record<string, { bar: string; bg: string; text: string }> = {
  'CIVIL':              { bar: '#78716C', bg: '#F5F5F4', text: '#57534E' },
  'MOV. TIERRAS':       { bar: '#92400E', bg: '#FEF3C7', text: '#78350F' },
  'ESTRUCTURAS':        { bar: '#2563EB', bg: '#DBEAFE', text: '#1D4ED8' },
  'CALDERERÍA':         { bar: '#1D4ED8', bg: '#EFF6FF', text: '#1E40AF' },
  'MECÁNICA':           { bar: '#EA580C', bg: '#FFEDD5', text: '#C2410C' },
  'PIPING':             { bar: '#0891B2', bg: '#CFFAFE', text: '#0E7490' },
  'ELÉCTRICA':          { bar: '#9333EA', bg: '#F3E8FF', text: '#7E22CE' },
  'INSTRUMENTACIÓN':    { bar: '#0D9488', bg: '#CCFBF1', text: '#0F766E' },
  'ARQUITECTURA':       { bar: '#DB2777', bg: '#FCE7F3', text: '#BE185D' },
  'AISLACIÓN':          { bar: '#CA8A04', bg: '#FEF9C3', text: '#A16207' },
  'PRECOMISIONAMIENTO': { bar: '#7C3AED', bg: '#EDE9FE', text: '#6D28D9' },
  'COMISIONAMIENTO':    { bar: '#4F46E5', bg: '#EEF2FF', text: '#4338CA' },
  'ANDAMIOS':           { bar: '#475569', bg: '#F1F5F9', text: '#334155' },
  'SUBCONTRATO':        { bar: '#16A34A', bg: '#DCFCE7', text: '#15803D' },
  'GESTIÓN':            { bar: '#6B7280', bg: '#F3F4F6', text: '#4B5563' },
  'HITOS':              { bar: '#374151', bg: '#F9FAFB', text: '#1F2937' },
};

const FALLBACK_DISC = { bar: '#94A3B8', bg: '#F1F5F9', text: '#64748B' };

export function getDiscColor(discipline?: string) {
  if (!discipline) return { ...FALLBACK_DISC, label: '—' };
  const key = discipline.trim().toUpperCase();
  const exact = Object.entries(DISC_PALETTE).find(([k]) => k.toUpperCase() === key);
  if (exact) return { ...exact[1], label: exact[0] };
  const partial = Object.entries(DISC_PALETTE).find(([k]) => key.startsWith(k.toUpperCase().substring(0, 4)));
  if (partial) return { ...partial[1], label: partial[0] };
  return { ...FALLBACK_DISC, label: discipline };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const MS_DAY = 86400000;

// ─── Row heights ──────────────────────────────────────────────────────────────

const ROW_H = (act: Activity) => act.is_summary ? 38 : act.is_milestone ? 28 : 32;

// ─── Row component ────────────────────────────────────────────────────────────

interface RowProps {
  act: Activity;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  projectStart: Date;
  colW: number;
  effective: Override;
  onBarMouseDown: (e: React.MouseEvent, type: DragType, act: Activity) => void;
  onActivityClick?: (act: Activity) => void;
  selectedActivityId?: string;
  bimProgress: number;
  onBimChange: (id: string, value: number) => void;
}

function GanttRow({
  act, depth, expanded, hasChildren, onToggle,
  projectStart, colW, effective, onBarMouseDown,
  onActivityClick, selectedActivityId,
  bimProgress, onBimChange,
}: RowProps) {
  const disc      = getDiscColor(act.discipline);
  const isCrit    = act.is_critical;
  const isMile    = act.is_milestone;
  const is100     = act.progress === 100 && !act.is_summary;
  const rowH      = ROW_H(act);

  const barLeft   = (effective.start - projectStart.getTime()) / MS_DAY * colW;
  const barWidth  = Math.max((effective.end - effective.start) / MS_DAY * colW, isMile ? 10 : 4);
  const barH      = act.is_summary ? 14 : isMile ? 10 : 18;
  const barColor  = isCrit ? '#DC2626' : disc.bar;
  const isSelected = selectedActivityId === act.id;

  const [editingBim, setEditingBim] = useState(false);
  const [bimInput,   setBimInput]   = useState('');
  const bimRef = useRef<HTMLInputElement>(null);

  const startBimEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (act.is_summary) return;
    setBimInput(String(bimProgress));
    setEditingBim(true);
    setTimeout(() => bimRef.current?.select(), 30);
  };

  const commitBim = () => {
    const val = Math.min(100, Math.max(0, parseInt(bimInput) || 0));
    onBimChange(act.id, val);
    setEditingBim(false);
  };

  const rowBg = act.is_summary
    ? 'bg-slate-50/70 hover:bg-slate-100/60'
    : is100
      ? 'hover:bg-emerald-50/40'
      : isCrit
        ? 'bg-red-50/20 hover:bg-red-50/50'
        : 'hover:bg-blue-50/30';

  return (
    <div
      className={`flex items-center border-b border-slate-100/80 transition-colors group cursor-pointer ${rowBg} ${isSelected ? 'ring-1 ring-inset ring-blue-300 bg-blue-50/40' : ''}`}
      style={{ height: rowH, minHeight: rowH }}
      onClick={() => onActivityClick?.(act)}
    >
      {/* WBS */}
      <div
        className={`flex items-center gap-1 shrink-0 border-r border-slate-100 px-2 ${act.is_summary ? 'bg-slate-50/50' : ''}`}
        style={{ width: 200, paddingLeft: 8 + depth * 14 }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`w-4 h-4 shrink-0 flex items-center justify-center ${is100 ? 'text-emerald-400' : 'text-slate-300'} ${!hasChildren ? 'opacity-0 pointer-events-none' : 'hover:text-slate-700'}`}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {isMile ? (
          <span className={`w-2.5 h-2.5 shrink-0 rotate-45 border ${is100 ? 'border-emerald-500 bg-emerald-100' : 'border-amber-500 bg-amber-100'}`} />
        ) : (
          <span
            className="w-2 h-2 rounded-full shrink-0 flex items-center justify-center"
            style={{ backgroundColor: is100 ? '#10B981' : barColor + (act.is_summary ? 'ff' : '40'), border: `1.5px solid ${is100 ? '#10B981' : barColor}` }}
          />
        )}

        <span className={`truncate leading-none ${act.is_summary ? 'font-black text-[11px] text-slate-700' : is100 ? 'font-bold text-[10px] text-emerald-600 line-through decoration-emerald-300' : isCrit ? 'font-bold text-[10px] text-red-700' : 'font-medium text-[10px] text-slate-600'}`}>
          {act.wbs_code}
        </span>
        {isCrit && !act.is_summary && !is100 && (
          <span className="shrink-0 text-[7px] font-black text-white bg-red-500 rounded px-0.5 ml-auto leading-tight">RC</span>
        )}
      </div>

      {/* Description */}
      <div
        className={`shrink-0 border-r border-slate-100 px-3 overflow-hidden flex items-center ${act.is_summary ? 'bg-slate-50/50' : ''}`}
        style={{ width: 360, height: rowH }}
      >
        <span
          className={`truncate block w-full ${act.is_summary ? 'font-black text-[11px] text-slate-700' : is100 ? 'font-medium text-[11px] text-emerald-600' : 'font-medium text-[11px] text-slate-700'}`}
          title={act.description ?? act.cwp_code}
        >
          {cleanDescription(act.description) || act.cwp_code || '—'}
        </span>
      </div>

      {/* HH */}
      <div className="shrink-0 border-r border-slate-100 px-2 text-right flex items-center justify-end" style={{ width: 64 }}>
        <span className={`text-[10px] font-black tabular-nums ${is100 ? 'text-emerald-500' : 'text-slate-500'}`}>
          {act.hh ? act.hh.toLocaleString('es-CL', { maximumFractionDigits: 0 }) : '—'}
        </span>
      </div>

      {/* Avance constructivo */}
      <div className="shrink-0 border-r border-slate-100 px-2 flex flex-col justify-center gap-0.5" style={{ width: 64 }}>
        <div className="w-full h-1.5 rounded-full overflow-hidden bg-slate-100">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${act.progress}%`, backgroundColor: is100 ? '#10B981' : barColor }}
          />
        </div>
        <span className={`text-[8px] font-black tabular-nums ${is100 ? 'text-emerald-500' : 'text-slate-400'}`}>
          {act.progress}%
        </span>
      </div>

      {/* Avance BIM — editable */}
      <div
        className={`shrink-0 border-r border-slate-100 px-2 flex flex-col justify-center gap-0.5 ${act.is_summary ? 'opacity-40' : 'cursor-pointer'}`}
        style={{ width: 72 }}
        onClick={startBimEdit}
      >
        {editingBim && !act.is_summary ? (
          <input
            ref={bimRef}
            type="number" min="0" max="100"
            value={bimInput}
            onChange={e => setBimInput(e.target.value)}
            onBlur={commitBim}
            onKeyDown={e => { if (e.key === 'Enter') commitBim(); if (e.key === 'Escape') setEditingBim(false); }}
            onClick={e => e.stopPropagation()}
            className="w-full text-[10px] font-black text-center text-red-700 bg-red-50 border border-red-300 rounded outline-none py-0.5"
          />
        ) : (
          <>
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-red-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${bimProgress}%`, backgroundColor: '#DC2626' }}
              />
            </div>
            <span className={`text-[8px] font-black tabular-nums ${bimProgress > 0 ? 'text-red-600' : 'text-slate-300'}`}>
              {bimProgress > 0 ? `${bimProgress}%` : '—'}
            </span>
          </>
        )}
      </div>

      {/* ── Gantt bar area ── */}
      <div className="relative flex-1 overflow-hidden" style={{ height: rowH }}>
        {barLeft >= 0 && !isMile && (
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-sm select-none box-border overflow-hidden"
            style={{
              left: barLeft,
              width: barWidth,
              height: barH,
              backgroundColor: act.is_summary ? barColor : disc.bg,
              border: act.is_summary ? 'none' : `1px solid ${is100 ? '#10B981' : barColor + '80'}`,
              cursor: 'grab',
              boxShadow: isCrit && !is100 ? `0 0 0 1.5px #DC262650` : undefined,
            }}
            onMouseDown={(e) => onBarMouseDown(e, 'move', act)}
          >
            {/* Construction progress fill */}
            {!act.is_summary && act.progress > 0 && (
              <div
                className="absolute left-0 top-0 bottom-0 rounded-sm"
                style={{
                  width: `${act.progress}%`,
                  backgroundColor: is100 ? '#10B98130' : barColor + '30',
                  borderRight: `1.5px solid ${is100 ? '#10B981' : barColor}`,
                }}
              />
            )}

            {/* BIM progress marker — vertical red line */}
            {!act.is_summary && bimProgress > 0 && bimProgress < 100 && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left: `${bimProgress}%`,
                  width: 2,
                  background: 'linear-gradient(to bottom, #DC2626, #DC262680)',
                  zIndex: 2,
                }}
              >
                {/* Triangle marker at top */}
                <div
                  className="absolute -top-1 -translate-x-1/2"
                  style={{
                    width: 0, height: 0,
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderTop: '5px solid #DC2626',
                  }}
                />
              </div>
            )}
            {!act.is_summary && bimProgress === 100 && (
              <div className="absolute inset-0 rounded-sm border-2 border-red-500 pointer-events-none" />
            )}

            {/* Drag handles */}
            <div className="absolute left-0 top-0 bottom-0 w-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-w-resize bg-black/10 rounded-l-sm"
              onMouseDown={(e) => { e.stopPropagation(); onBarMouseDown(e, 'left', act); }} />
            <div className="absolute right-0 top-0 bottom-0 w-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-e-resize bg-black/10 rounded-r-sm"
              onMouseDown={(e) => { e.stopPropagation(); onBarMouseDown(e, 'right', act); }} />
          </div>
        )}

        {barLeft >= 0 && isMile && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rotate-45 border-2 select-none ${is100 ? 'border-emerald-500 bg-emerald-100' : 'border-amber-500 bg-amber-50'}`}
            style={{ left: barLeft - 7 }}
            title={act.description}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main Gantt ───────────────────────────────────────────────────────────────

interface GanttChartProps {
  activities: Activity[];
  onActivityClick?: (act: Activity) => void;
  selectedActivityId?: string;
  onBimProgressChange?: (id: string, value: number) => void;
}

export default function GanttChart({
  activities, onActivityClick, selectedActivityId, onBimProgressChange,
}: GanttChartProps) {
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set());
  const [scale,        setScale]        = useState<TimeScale>('months');
  const [zoomFactor,   setZoomFactor]   = useState(1);
  const [overrides,    setOverrides]    = useState<Map<string, Override>>(new Map());
  const [searchQuery,  setSearchQuery]  = useState('');
  const [levelFilter,  setLevelFilter]  = useState<number | null>(null); // null = all
  const [localBim,     setLocalBim]     = useState<Map<string, number>>(new Map());

  // Seed localBim from activities.bim_progress
  useEffect(() => {
    setLocalBim(prev => {
      const m = new Map(prev);
      for (const a of activities) {
        if (a.bim_progress != null && !m.has(a.id)) m.set(a.id, a.bim_progress);
      }
      return m;
    });
  }, [activities]);

  const handleBimChange = useCallback((id: string, value: number) => {
    setLocalBim(m => { const n = new Map(m); n.set(id, value); return n; });
    onBimProgressChange?.(id, value);
  }, [onBimProgressChange]);

  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  // ── WBS Tree ─────────────────────────────────────────────────────────────
  const tree = useMemo(() => {
    const byWbs    = new Map<string, Activity>();
    const children = new Map<string, Activity[]>();
    const roots: Activity[] = [];

    for (const a of activities) byWbs.set(a.wbs_code, a);

    function getOrCreateVirtual(pathParts: string[]): Activity | undefined {
      if (!pathParts.length) return undefined;
      const wbs = pathParts.join('.');
      if (byWbs.has(wbs)) return byWbs.get(wbs)!;
      const act: Activity = {
        id: `virtual-${wbs}`, wbs_code: wbs,
        description: pathParts[pathParts.length - 1],
        is_summary: true, progress: 0, hh: 0, sort_order: -1,
      };
      byWbs.set(wbs, act);
      const parentParts = pathParts.slice(0, -1);
      if (parentParts.length > 0) {
        const parent = getOrCreateVirtual(parentParts);
        if (parent) {
          act.parent_wbs = parent.wbs_code;
          if (!children.has(parent.wbs_code)) children.set(parent.wbs_code, []);
          children.get(parent.wbs_code)!.push(act);
        }
      } else {
        roots.push(act);
      }
      return act;
    }

    for (const a of activities) {
      let parentWbs = a.parent_wbs;
      if (!parentWbs && a.wbs_code && a.wbs_code.includes('.')) {
        const parts = a.wbs_code.split('.');
        const parentParts = parts.slice(0, -1);
        if (parentParts.length > 0) {
          const virtualParent = getOrCreateVirtual(parentParts);
          if (virtualParent) parentWbs = virtualParent.wbs_code;
        }
      }
      if (!parentWbs && a.cwp_code && a.cwp_code.includes('.')) {
        const parts = a.cwp_code.split('.');
        if (a.wbs_code !== a.cwp_code) {
          const virtualParent = getOrCreateVirtual(parts);
          if (virtualParent) parentWbs = virtualParent.wbs_code;
        }
      }
      if (parentWbs) {
        if (!byWbs.has(parentWbs)) getOrCreateVirtual(parentWbs.split('.'));
        if (!children.has(parentWbs)) children.set(parentWbs, []);
        if (!children.get(parentWbs)!.includes(a)) children.get(parentWbs)!.push(a);
      } else if (!roots.includes(a)) {
        roots.push(a);
      }
    }

    function rollUp(wbs: string): { minS: number, maxE: number, sumHH: number, sumProgHH: number } {
      const node = byWbs.get(wbs);
      if (!node) return { minS: Infinity, maxE: -Infinity, sumHH: 0, sumProgHH: 0 };
      let minS = parseDate(node.start_date)?.getTime() ?? Infinity;
      let maxE = parseDate(node.end_date)?.getTime() ?? -Infinity;
      let sumHH = node.is_summary ? 0 : (node.hh || 0);
      let sumProgHH = node.is_summary ? 0 : (node.hh || 0) * (node.progress / 100);
      for (const k of children.get(wbs) ?? []) {
        const r = rollUp(k.wbs_code);
        if (r.minS < minS) minS = r.minS;
        if (r.maxE > maxE) maxE = r.maxE;
        sumHH += r.sumHH;
        sumProgHH += r.sumProgHH;
      }
      if (node.id.startsWith('virtual-') || node.is_summary) {
        if (minS !== Infinity && !node.start_date) node.start_date = new Date(minS).toISOString().substring(0,10);
        if (maxE !== -Infinity && !node.end_date) node.end_date = new Date(maxE).toISOString().substring(0,10);
        node.hh = sumHH;
        node.progress = sumHH > 0 ? Math.round((sumProgHH / sumHH) * 100) : 0;
      }
      return { minS, maxE, sumHH, sumProgHH };
    }
    for (const r of roots) rollUp(r.wbs_code);

    for (const kids of children.values()) {
      kids.sort((a, b) => {
        if (a.is_summary && !b.is_summary) return -1;
        if (!a.is_summary && b.is_summary) return 1;
        return a.sort_order - b.sort_order;
      });
    }
    roots.sort((a, b) => a.sort_order - b.sort_order);
    return { roots, children };
  }, [activities]);

  const treeRef = useRef(tree);
  treeRef.current = tree;

  // ── Level collapse ────────────────────────────────────────────────────────
  const applyLevelCollapse = useCallback((level: number | null) => {
    setLevelFilter(level);
    if (level === null) { setCollapsed(new Set()); return; }
    const toCollapse = new Set<string>();
    function walk(acts: Activity[], depth: number) {
      for (const a of acts) {
        if (depth >= level && tree.children.get(a.wbs_code)?.length) {
          toCollapse.add(a.wbs_code);
        }
        walk(tree.children.get(a.wbs_code) ?? [], depth + 1);
      }
    }
    walk(tree.roots, 0);
    setCollapsed(toCollapse);
  }, [tree]);

  // ── Effective dates ───────────────────────────────────────────────────────
  const getEff = useCallback((act: Activity, ovs?: Map<string, Override>): Override => {
    const map = ovs ?? overridesRef.current;
    const ov  = map.get(act.id);
    if (ov) return ov;
    return {
      start: parseDate(act.start_date)?.getTime() ?? 0,
      end:   parseDate(act.end_date)?.getTime()   ?? 0,
    };
  }, []);

  // ── Timeline bounds ───────────────────────────────────────────────────────
  const { projectStart, maxD, totalDays, monthsArr } = useMemo(() => {
    const dates = activities.flatMap(a => [parseDate(a.start_date), parseDate(a.end_date)]).filter(Boolean) as Date[];
    if (!dates.length) {
      const now = new Date(); now.setDate(1);
      return { projectStart: now, maxD: now, totalDays: 30, monthsArr: [{ date: now, days: 30 }] };
    }
    const minD = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
    minD.setDate(minD.getDate() - 15);
    maxD.setDate(maxD.getDate() + 30);
    const totalDays = Math.ceil((maxD.getTime() - minD.getTime()) / MS_DAY);
    const monthsArr: { date: Date, days: number }[] = [];
    const cur = new Date(minD.getFullYear(), minD.getMonth(), 1);
    while (cur <= maxD) {
      const y = cur.getFullYear(), m = cur.getMonth();
      monthsArr.push({ date: new Date(y, m, 1), days: new Date(y, m + 1, 0).getDate() });
      cur.setMonth(m + 1);
    }
    return { projectStart: minD, maxD, totalDays, monthsArr };
  }, [activities]);

  // TODAY position
  const todayOffset = useMemo(() => {
    const today = new Date();
    return (today.getTime() - projectStart.getTime()) / MS_DAY;
  }, [projectStart]);

  const colW = useMemo(() => {
    const base = { days: 24, weeks: 5, months: 1.2, years: 0.2 }[scale];
    return base * zoomFactor;
  }, [scale, zoomFactor]);

  // ── Search filter ─────────────────────────────────────────────────────────
  const matchedIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    const matched = new Set<string>();
    const addWithAncestors = (act: Activity) => {
      matched.add(act.id);
      if (act.parent_wbs) {
        const parent = activities.find(a => a.wbs_code === act.parent_wbs);
        if (parent) addWithAncestors(parent);
      }
    };
    for (const a of activities) {
      if (
        a.wbs_code.toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q) ||
        (a.cwp_code ?? '').toLowerCase().includes(q)
      ) {
        addWithAncestors(a);
      }
    }
    return matched;
  }, [searchQuery, activities]);

  // ── Visible rows ──────────────────────────────────────────────────────────
  const visibleRows = useMemo(() => {
    const rows: { act: Activity; depth: number }[] = [];
    function walk(acts: Activity[], depth: number) {
      for (const a of acts) {
        if (matchedIds && !matchedIds.has(a.id)) continue;
        rows.push({ act: a, depth });
        if (!collapsed.has(a.wbs_code)) walk(tree.children.get(a.wbs_code) ?? [], depth + 1);
      }
    }
    walk(tree.roots, 0);
    return rows;
  }, [tree, collapsed, matchedIds]);

  const totalHH = useMemo(() => activities.filter(a => !a.is_summary).reduce((s, a) => s + (a.hh || 0), 0), [activities]);
  const bimCount = useMemo(() => [...localBim.values()].filter(v => v > 0).length, [localBim]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const dragRef = useRef<{ type: DragType; act: Activity; origSelf: Override; childSnap: Map<string, Override>; mouseX0: number; } | null>(null);
  const zoomRef = useRef(colW); zoomRef.current = colW;

  const onBarMouseDown = useCallback((e: React.MouseEvent, type: DragType, act: Activity) => {
    e.preventDefault(); e.stopPropagation();
    const origSelf = getEff(act);
    const childSnap = new Map<string, Override>();
    function snap(wbs: string) {
      for (const child of treeRef.current.children.get(wbs) ?? []) {
        childSnap.set(child.id, getEff(child)); snap(child.wbs_code);
      }
    }
    snap(act.wbs_code);
    dragRef.current = { type, act, origSelf, childSnap, mouseX0: e.clientX };
  }, [getEff]);

  useEffect(() => {
    let rafId: number | null = null;
    let pending: Map<string, Override> | null = null;
    const flush = () => { rafId = null; if (pending) { setOverrides(new Map(pending)); pending = null; } };

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      const msPerPx = MS_DAY / zoomRef.current;
      const deltaMs = (e.clientX - d.mouseX0) * msPerPx;
      const MIN_MS  = 60_000;
      let newStart = d.origSelf.start, newEnd = d.origSelf.end;
      if (d.type === 'left') newStart = Math.min(d.origSelf.start + deltaMs, d.origSelf.end - MIN_MS);
      else if (d.type === 'right') newEnd = Math.max(d.origSelf.end + deltaMs, d.origSelf.start + MIN_MS);
      else { newStart += deltaMs; newEnd += deltaMs; }
      const next = new Map(overridesRef.current);
      next.set(d.act.id, { start: newStart, end: newEnd });
      function scaleChildren(wbs: string, oldS: number, oldE: number, nS: number, nE: number) {
        const oldSpan = oldE - oldS, newSpan = nE - nS;
        for (const child of treeRef.current.children.get(wbs) ?? []) {
          const orig = d!.childSnap.get(child.id); if (!orig) continue;
          let cs = nS, ce = nE;
          if (oldSpan > 0) { cs = nS + ((orig.start - oldS)/oldSpan)*newSpan; ce = nS + ((orig.end - oldS)/oldSpan)*newSpan; }
          if (ce - cs < MIN_MS) ce = cs + MIN_MS;
          next.set(child.id, { start: cs, end: ce });
          scaleChildren(child.wbs_code, orig.start, orig.end, cs, ce);
        }
      }
      scaleChildren(d.act.wbs_code, d.origSelf.start, d.origSelf.end, newStart, newEnd);
      pending = next;
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (pending) { setOverrides(new Map(pending)); pending = null; }
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); if (rafId) cancelAnimationFrame(rafId); };
  }, []);

  const toggleCollapse = (wbs: string) => setCollapsed(prev => { const n = new Set(prev); n.has(wbs) ? n.delete(wbs) : n.add(wbs); return n; });

  const LEFT_W = 200 + 360 + 64 + 64 + 72;

  // ── Headers ───────────────────────────────────────────────────────────────
  const renderHeaders = () => {
    if (scale === 'years') {
      const years = new Map<number, number>();
      monthsArr.forEach(m => { const y = m.date.getFullYear(); years.set(y, (years.get(y) || 0) + m.days); });
      return (
        <div className="flex h-10 border-b border-slate-200 bg-slate-50/80">
          {Array.from(years.entries()).map(([y, d]) => (
            <div key={y} className="shrink-0 border-r border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 tracking-widest" style={{ width: d * colW }}>
              {y}
            </div>
          ))}
        </div>
      );
    }

    if (scale === 'months') {
      const years = new Map<number, number>();
      monthsArr.forEach(m => { const y = m.date.getFullYear(); years.set(y, (years.get(y) || 0) + m.days); });
      return (
        <div className="flex flex-col border-b border-slate-200 bg-slate-50/80" style={{ height: 40 }}>
          <div className="flex border-b border-slate-200" style={{ height: 18 }}>
            {Array.from(years.entries()).map(([y, d]) => (
              <div key={y} className="shrink-0 border-r border-slate-200 flex items-center justify-center text-[9px] font-black text-slate-400 tracking-widest" style={{ width: d * colW }}>
                {y}
              </div>
            ))}
          </div>
          <div className="flex flex-1">
            {monthsArr.map((m, i) => {
              const isCurrentMonth = new Date().getMonth() === m.date.getMonth() && new Date().getFullYear() === m.date.getFullYear();
              return (
                <div key={i} className={`shrink-0 border-r border-slate-200 flex items-center justify-center text-[9px] font-bold uppercase ${isCurrentMonth ? 'text-red-600 bg-red-50/60' : 'text-slate-500'}`} style={{ width: m.days * colW }}>
                  {m.date.toLocaleDateString('es-CL', { month: 'short' })}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (scale === 'weeks' || scale === 'days') {
      return (
        <div className="flex flex-col border-b border-slate-200 bg-slate-50/80" style={{ height: 48 }}>
          <div className="flex border-b border-slate-200" style={{ height: 20 }}>
            {monthsArr.map((m, i) => (
              <div key={i} className="shrink-0 border-r border-slate-200 flex items-center justify-center text-[9px] font-black text-slate-500 uppercase tracking-widest" style={{ width: m.days * colW }}>
                {m.date.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
              </div>
            ))}
          </div>
          <div className="flex flex-1 overflow-hidden relative">
            {monthsArr.map((m, i) => {
              const days = Array.from({ length: m.days }, (_, i) => i + 1);
              return (
                <div key={i} className="shrink-0 flex border-r border-slate-200" style={{ width: m.days * colW }}>
                  {days.map(d => {
                    const date = new Date(m.date.getFullYear(), m.date.getMonth(), d);
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const isFirstOfWeek = date.getDay() === 1;
                    const isToday = date.toDateString() === new Date().toDateString();
                    if (scale === 'weeks') {
                      if (!isFirstOfWeek && d !== 1) return null;
                      return (
                        <div key={d} className="absolute border-l border-slate-200/50 h-full flex items-center pl-1 text-[8px] font-bold text-slate-400"
                          style={{ left: ((date.getTime() - projectStart.getTime()) / MS_DAY) * colW }}>
                          Sem {Math.ceil(date.getDate() / 7)}
                        </div>
                      );
                    }
                    return (
                      <div key={d} className={`flex-1 border-r border-slate-100 flex flex-col items-center justify-center ${isWeekend ? 'bg-slate-100/50' : ''} ${isToday ? 'bg-red-50' : ''}`}>
                        <span className={`text-[8px] font-black ${isToday ? 'text-red-600' : 'text-slate-600'}`}>{d}</span>
                        <span className="text-[7px] font-bold text-slate-400 uppercase">{date.toLocaleDateString('es-CL', { weekday: 'narrow' })}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-white">

        {/* Search */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 min-w-[200px]">
          <Search size={12} className="text-slate-400 shrink-0" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar WBS / descripción…"
            className="flex-1 text-[10px] font-bold bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600 transition">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Level collapse */}
        <div className="flex items-center gap-1">
          <Layers size={11} className="text-slate-400 shrink-0" />
          <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {([null, 1, 2, 3, 4] as (number | null)[]).map(lvl => (
              <button
                key={String(lvl)}
                onClick={() => applyLevelCollapse(lvl)}
                className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${levelFilter === lvl ? 'bg-white shadow-sm text-[#0C1E4F]' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {lvl === null ? 'Todo' : `N${lvl}`}
              </button>
            ))}
          </div>
        </div>

        {/* Scale */}
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {(['days', 'weeks', 'months', 'years'] as TimeScale[]).map(s => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${scale === s ? 'bg-white shadow-sm text-[#0C1E4F]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {s === 'days' ? 'Días' : s === 'weeks' ? 'Sem' : s === 'months' ? 'Mes' : 'Año'}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400">
            <BarChart size={11} className="text-[#0C1E4F]" />
            <span><span className="text-[#0C1E4F]">{activities.filter(a => !a.is_summary).length}</span> act</span>
            <span className="text-slate-200">·</span>
            <span><span className="text-[#0C1E4F]">{totalHH.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span> HH</span>
            {bimCount > 0 && (
              <>
                <span className="text-slate-200">·</span>
                <span className="text-red-500"><span className="font-black">{bimCount}</span> BIM</span>
              </>
            )}
          </div>

          {overrides.size > 0 && (
            <button
              onClick={() => setOverrides(new Map())}
              className="text-[9px] font-black text-rose-500 hover:text-rose-600 border border-rose-200 hover:border-rose-400 px-3 py-1.5 rounded-lg transition-colors bg-rose-50"
            >
              Restaurar
            </button>
          )}

          <div className="flex items-center gap-1 bg-slate-50 rounded-lg border border-slate-100 p-0.5">
            <button onClick={() => setZoomFactor(z => Math.max(0.2, z - 0.2))} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-slate-500">
              <ZoomOut size={13} />
            </button>
            <span className="text-[9px] font-black text-slate-400 w-10 text-center">{Math.round(zoomFactor * 100)}%</span>
            <button onClick={() => setZoomFactor(z => Math.min(3, z + 0.2))} className="p-1 hover:bg-white hover:shadow-sm rounded transition-all text-slate-500">
              <ZoomIn size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Column headers ── */}
      <div className="shrink-0 flex border-b border-slate-200 bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
        <div className="shrink-0 border-r border-slate-200 px-3 py-2 flex items-center bg-white" style={{ width: 200 }}>WBS / Código</div>
        <div className="shrink-0 border-r border-slate-200 px-3 py-2 flex items-center bg-white" style={{ width: 360 }}>Descripción de Actividad</div>
        <div className="shrink-0 border-r border-slate-200 px-2 py-2 flex items-center justify-end bg-white" style={{ width: 64 }}>HH</div>
        <div className="shrink-0 border-r border-slate-200 px-2 py-2 flex items-center bg-white" style={{ width: 64 }}>Avance</div>
        <div className="shrink-0 border-r border-slate-200 px-2 py-2 flex items-center gap-1 bg-white" style={{ width: 72 }}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          BIM
        </div>
        <div className="flex-1 overflow-hidden">
          {renderHeaders()}
        </div>
      </div>

      {/* ── Rows ── */}
      <div className="flex-1 overflow-auto bg-white relative">
        <div style={{ minWidth: LEFT_W + totalDays * colW, paddingBottom: 64 }}>

          {/* Weekend grid */}
          {scale === 'days' && (
            <div className="absolute top-0 bottom-0 pointer-events-none flex" style={{ left: LEFT_W }}>
              {monthsArr.map((m, i) => {
                const days = Array.from({ length: m.days }, (_, i) => i + 1);
                return (
                  <div key={i} className="shrink-0 flex" style={{ width: m.days * colW }}>
                    {days.map(d => {
                      const date = new Date(m.date.getFullYear(), m.date.getMonth(), d);
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                      return <div key={d} className={`flex-1 border-r border-slate-50 ${isWeekend ? 'bg-slate-50/60' : ''}`} />;
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Month grid lines */}
          {scale === 'months' && (
            <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: LEFT_W }}>
              {monthsArr.map((m, i) => {
                const x = (new Date(m.date.getFullYear(), m.date.getMonth(), 1).getTime() - projectStart.getTime()) / MS_DAY * colW;
                const isCurrentMonth = new Date().getMonth() === m.date.getMonth() && new Date().getFullYear() === m.date.getFullYear();
                return (
                  <div key={i} className={`absolute top-0 bottom-0 pointer-events-none ${isCurrentMonth ? 'bg-red-50/20' : ''}`}
                    style={{ left: x, width: m.days * colW, borderLeft: '1px solid #F1F5F9' }} />
                );
              })}
            </div>
          )}

          {/* TODAY line */}
          {todayOffset >= 0 && todayOffset <= totalDays && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-20"
              style={{ left: LEFT_W + todayOffset * colW, width: 2, background: 'linear-gradient(to bottom, #DC2626, #DC262630)' }}
            >
              <div className="absolute -top-0 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-b whitespace-nowrap shadow-sm">
                HOY
              </div>
            </div>
          )}

          <div className="relative z-10">
            {visibleRows.map(({ act, depth }) => (
              <GanttRow
                key={act.id}
                act={act}
                depth={depth}
                expanded={!collapsed.has(act.wbs_code)}
                hasChildren={!!tree.children.get(act.wbs_code)?.length}
                onToggle={() => toggleCollapse(act.wbs_code)}
                projectStart={projectStart}
                colW={colW}
                effective={getEff(act)}
                onBarMouseDown={onBarMouseDown}
                onActivityClick={onActivityClick}
                selectedActivityId={selectedActivityId}
                bimProgress={localBim.get(act.id) ?? act.bim_progress ?? 0}
                onBimChange={handleBimChange}
              />
            ))}
          </div>

          {visibleRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-3">
              <CalendarDays size={48} className="opacity-20" />
              <p className="text-sm font-black uppercase tracking-widest">
                {searchQuery ? 'Sin resultados' : 'Sin actividades cargadas'}
              </p>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline">
                  Limpiar búsqueda
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="shrink-0 border-t border-slate-100 px-4 py-2 flex items-center gap-6 bg-slate-50/50">
        <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-500">
          <div className="w-8 h-2 rounded-sm bg-slate-300/50 border border-slate-400/30 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-3/5 bg-slate-400/40 border-r border-slate-500" />
          </div>
          Avance constructivo
        </div>
        <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-500">
          <div className="w-2 h-4 relative flex items-center justify-center">
            <div className="absolute inset-0 flex justify-center">
              <div className="w-0.5 h-full bg-red-500" />
            </div>
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2" style={{ width: 0, height: 0, borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderTop: '4px solid #DC2626' }} />
          </div>
          Avance BIM
        </div>
        <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-500">
          <div className="w-2 h-4 bg-gradient-to-b from-red-600 to-red-200 rounded-sm" />
          Hoy
        </div>
        <div className="flex items-center gap-1.5 text-[8px] font-bold text-red-600">
          <span className="text-[7px] font-black bg-red-500 text-white px-0.5 rounded">RC</span>
          Ruta crítica
        </div>
      </div>
    </div>
  );
}
