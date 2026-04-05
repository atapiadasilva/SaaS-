'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, ZoomIn, ZoomOut } from 'lucide-react';

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
  is_summary: boolean;
  parent_wbs?: string;
  sort_order: number;
}

// ─── Discipline colors ────────────────────────────────────────────────────────

const DISC_COLORS: Record<string, { bar: string; bg: string; text: string; label: string }> = {
  AA: { bar: '#2563EB', bg: '#DBEAFE', text: '#1D4ED8', label: 'Estructura Acero' },
  AB: { bar: '#D97706', bg: '#FEF3C7', text: '#B45309', label: 'Albañilería' },
  BA: { bar: '#7C3AED', bg: '#EDE9FE', text: '#6D28D9', label: 'Carpintería' },
  CA: { bar: '#0891B2', bg: '#CFFAFE', text: '#0E7490', label: 'Cañerías' },
  DA: { bar: '#16A34A', bg: '#DCFCE7', text: '#15803D', label: 'Drenaje' },
  GA: { bar: '#CA8A04', bg: '#FEF9C3', text: '#A16207', label: 'Equipos A' },
  GB: { bar: '#EA580C', bg: '#FFEDD5', text: '#C2410C', label: 'Equipos B' },
  HC: { bar: '#6B7280', bg: '#F3F4F6', text: '#4B5563', label: 'Hormigón Civil' },
  JA: { bar: '#9333EA', bg: '#F3E8FF', text: '#7E22CE', label: 'Electricidad' },
  JG: { bar: '#4F46E5', bg: '#EEF2FF', text: '#4338CA', label: 'Inst. Eléctrica' },
  PA: { bar: '#DB2777', bg: '#FCE7F3', text: '#BE185D', label: 'Pintura' },
  QF: { bar: '#0D9488', bg: '#CCFBF1', text: '#0F766E', label: 'Instrumentación F' },
  QI: { bar: '#059669', bg: '#D1FAE5', text: '#047857', label: 'Instrumentación I' },
  QJ: { bar: '#65A30D', bg: '#ECFCCB', text: '#4D7C0F', label: 'Instrumentación J' },
  RB: { bar: '#DC2626', bg: '#FEE2E2', text: '#B91C1C', label: 'Revestimiento B' },
  RD: { bar: '#E11D48', bg: '#FFE4E6', text: '#BE123C', label: 'Revestimiento D' },
  RE: { bar: '#C026D3', bg: '#FAE8FF', text: '#A21CAF', label: 'Revestimiento E' },
  SA: { bar: '#475569', bg: '#F1F5F9', text: '#334155', label: 'Soldadura A' },
  SE: { bar: '#374151', bg: '#F9FAFB', text: '#1F2937', label: 'Soldadura E' },
};

function getDiscColor(discipline?: string) {
  if (!discipline) return { bar: '#94A3B8', bg: '#F1F5F9', text: '#64748B', label: discipline ?? '—' };
  const code = discipline.toUpperCase().substring(0, 2);
  return DISC_COLORS[code] ?? { bar: '#94A3B8', bg: '#F1F5F9', text: '#64748B', label: discipline };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function monthsBetween(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
}

function formatMonth(d: Date) {
  return d.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
}

// ─── Row component ────────────────────────────────────────────────────────────

interface RowProps {
  act: Activity;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  projectStart: Date;
  totalDays: number;
  colW: number; // px per day
}

function GanttRow({ act, depth, expanded, hasChildren, onToggle, projectStart, totalDays, colW }: RowProps) {
  const start = parseDate(act.start_date);
  const end   = parseDate(act.end_date);
  const disc  = getDiscColor(act.discipline);

  const barLeft  = start ? Math.max(0, (start.getTime() - projectStart.getTime()) / 86400000) * colW : null;
  const barWidth = (start && end) ? Math.max(colW, (end.getTime() - start.getTime()) / 86400000 * colW) : null;

  const rowH = act.is_summary ? 36 : 30;

  return (
    <div
      className={`flex items-center border-b border-slate-50 hover:bg-blue-50/40 transition-colors group`}
      style={{ height: rowH, minHeight: rowH }}
    >
      {/* ── Left fixed panel ── */}
      <div
        className="flex items-center gap-1 shrink-0 border-r border-slate-100 px-2"
        style={{ width: 340, paddingLeft: 8 + depth * 16 }}
      >
        <button
          onClick={onToggle}
          className={`w-4 h-4 shrink-0 flex items-center justify-center text-slate-400 ${!hasChildren ? 'opacity-0 pointer-events-none' : 'hover:text-slate-700'}`}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Discipline dot */}
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: disc.bar }}
        />

        <span className={`truncate ${act.is_summary ? 'font-black text-[11px] text-slate-800' : 'font-bold text-[10px] text-slate-600'}`}>
          {act.wbs_code}
        </span>
      </div>

      {/* Description */}
      <div className="shrink-0 border-r border-slate-100 px-2 overflow-hidden" style={{ width: 200 }}>
        <span className={`truncate block ${act.is_summary ? 'font-black text-[10px] text-slate-700' : 'font-medium text-[9px] text-slate-500'}`}>
          {act.description ?? act.cwp_code ?? '—'}
        </span>
      </div>

      {/* HH */}
      <div className="shrink-0 border-r border-slate-100 px-2 text-right" style={{ width: 72 }}>
        <span className="text-[10px] font-black text-slate-600">
          {act.hh ? act.hh.toLocaleString('es-CL', { maximumFractionDigits: 0 }) : '—'}
        </span>
      </div>

      {/* Progress */}
      <div className="shrink-0 border-r border-slate-100 px-2" style={{ width: 56 }}>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${act.progress}%`, backgroundColor: disc.bar }}
          />
        </div>
        <span className="text-[8px] font-black text-slate-400">{act.progress}%</span>
      </div>

      {/* ── Gantt bar area ── */}
      <div className="relative flex-1 overflow-hidden" style={{ height: rowH }}>
        {barLeft !== null && barWidth !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-sm flex items-center overflow-hidden"
            style={{
              left: barLeft,
              width: Math.max(barWidth, 4),
              height: act.is_summary ? 14 : 10,
              backgroundColor: disc.bar,
              opacity: act.is_summary ? 1 : 0.75,
            }}
          >
            {/* Progress fill */}
            <div
              className="h-full opacity-40"
              style={{ width: `${act.progress}%`, backgroundColor: '#fff' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Gantt ───────────────────────────────────────────────────────────────

interface GanttChartProps {
  activities: Activity[];
}

export default function GanttChart({ activities }: GanttChartProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(14); // px per day
  const timelineRef = useRef<HTMLDivElement>(null);

  // Build tree
  const tree = useMemo(() => {
    const byWbs = new Map(activities.map(a => [a.wbs_code, a]));
    const children = new Map<string, Activity[]>();
    const roots: Activity[] = [];

    for (const a of activities) {
      if (a.parent_wbs && byWbs.has(a.parent_wbs)) {
        if (!children.has(a.parent_wbs)) children.set(a.parent_wbs, []);
        children.get(a.parent_wbs)!.push(a);
      } else {
        roots.push(a);
      }
    }
    return { roots, children };
  }, [activities]);

  // Flatten visible rows
  const visibleRows = useMemo(() => {
    const rows: { act: Activity; depth: number }[] = [];
    function walk(acts: Activity[], depth: number) {
      for (const a of acts) {
        rows.push({ act: a, depth });
        if (!collapsed.has(a.wbs_code)) {
          walk(tree.children.get(a.wbs_code) ?? [], depth + 1);
        }
      }
    }
    walk(tree.roots, 0);
    return rows;
  }, [tree, collapsed]);

  // Timeline bounds
  const { projectStart, projectEnd, totalDays, months } = useMemo(() => {
    const dates = activities.flatMap(a => [parseDate(a.start_date), parseDate(a.end_date)]).filter(Boolean) as Date[];
    if (!dates.length) {
      const now = new Date(); now.setDate(1);
      const end = addDays(now, 365);
      return { projectStart: now, projectEnd: end, totalDays: 365, months: [] as Date[] };
    }
    const minD = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
    minD.setDate(1);
    maxD.setDate(28); maxD.setMonth(maxD.getMonth() + 1); maxD.setDate(0); // end of month

    const totalDays = Math.ceil((maxD.getTime() - minD.getTime()) / 86400000) + 1;
    const months: Date[] = [];
    const cur = new Date(minD);
    while (cur <= maxD) {
      months.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return { projectStart: minD, projectEnd: maxD, totalDays, months };
  }, [activities]);

  const totalHH = useMemo(() =>
    activities.filter(a => !a.is_summary).reduce((s, a) => s + (a.hh || 0), 0),
    [activities]
  );

  const toggleCollapse = (wbs: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(wbs) ? next.delete(wbs) : next.add(wbs);
      return next;
    });

  const LEFT_W = 340 + 200 + 72 + 56; // fixed columns total

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-4">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            {activities.filter(a => !a.is_summary).length} actividades ·{' '}
            <span className="text-[#0C1E4F]">{totalHH.toLocaleString('es-CL', { maximumFractionDigits: 0 })} HH</span>
          </p>
          {/* Legend */}
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(DISC_COLORS).slice(0, 6).map(([code, c]) => (
              <div key={code} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.bar }} />
                <span className="text-[9px] font-bold text-slate-400">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(4, z - 4))} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500">
            <ZoomOut size={13} />
          </button>
          <span className="text-[10px] font-black text-slate-400 w-10 text-center">{zoom}px</span>
          <button onClick={() => setZoom(z => Math.min(40, z + 4))} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-500">
            <ZoomIn size={13} />
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="shrink-0 flex border-b border-slate-200 bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
        <div className="shrink-0 border-r border-slate-100 px-3 py-2 flex items-center" style={{ width: 340 }}>WBS / Código</div>
        <div className="shrink-0 border-r border-slate-100 px-2 py-2 flex items-center" style={{ width: 200 }}>Descripción</div>
        <div className="shrink-0 border-r border-slate-100 px-2 py-2 flex items-center justify-end" style={{ width: 72 }}>HH</div>
        <div className="shrink-0 border-r border-slate-100 px-2 py-2 flex items-center" style={{ width: 56 }}>Avance</div>
        {/* Timeline months */}
        <div className="flex-1 overflow-hidden flex">
          {months.map((m, i) => {
            const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
            return (
              <div
                key={i}
                className="shrink-0 border-r border-slate-100 px-1 py-2 text-center"
                style={{ width: daysInMonth * zoom }}
              >
                {formatMonth(m)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-auto">
        <div style={{ minWidth: LEFT_W + totalDays * zoom }}>
          {visibleRows.map(({ act, depth }) => (
            <GanttRow
              key={act.id}
              act={act}
              depth={depth}
              expanded={!collapsed.has(act.wbs_code)}
              hasChildren={!!tree.children.get(act.wbs_code)?.length}
              onToggle={() => toggleCollapse(act.wbs_code)}
              projectStart={projectStart}
              totalDays={totalDays}
              colW={zoom}
            />
          ))}
          {visibleRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-2">
              <p className="text-sm font-black uppercase tracking-widest">Sin actividades cargadas</p>
              <p className="text-xs">Importa el programa maestro desde Excel</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
