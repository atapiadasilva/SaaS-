'use client';

/**
 * SortableSequenceList v8 — Estabilización de Tipos y Alto Rendimiento
 * ───────────────────────────────────────────────────────────
 * • Virtualización masiva para +40,000 IWPs.
 * • Motor de reproducción optimizado O(K).
 * • Tipado estricto para estabilidad de compilación (JSX/TSX).
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Play, Pause, Square, Trash2, Eye, EyeOff,
  Loader2, Download, ChevronDown, ChevronRight, ChevronUp,
  List, BarChart2, CalendarDays, ZoomIn, ZoomOut, RotateCcw,
  Rewind, FastForward, Scissors, RefreshCw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { get, set } from 'idb-keyval';
import type { ForgeViewerHandle } from './ForgeViewer';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface SeqTag {
  id: string; name: string; duration: number; guids: string[]; visible: boolean;
}
interface SeqSubGroup { id: string; name: string; tagIds: string[]; }
interface SeqGroup {
  id: string; name: string; color: string; collapsed: boolean; tags: SeqTag[];
  sectionId?: string; sectionName?: string;
  startOffset?: number;
  subGroups?: SeqSubGroup[];
}
interface ScheduledSubGroup { id: string; name: string; startDay: number; endDay: number; guids: string[]; }
interface ScheduledTag   extends SeqTag   { startDay: number; endDay: number }
interface ScheduledGroup extends SeqGroup { tags: ScheduledTag[]; startDay: number; endDay: number; scheduledSubGroups?: ScheduledSubGroup[]; }

type ViewMode = 'list' | 'gantt';
type PlayMode = 'all' | 'isolate' | 'ghost';

interface Props {
  projectId: string;
  viewerRef: React.RefObject<ForgeViewerHandle | null>;
  viewerReady: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const short = (s: string, n = 26) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function addDays(base: Date, n: number): Date {
  const d = new Date(base); d.setDate(d.getDate() + n); return d;
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
function formatDate(d: Date): string {
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

async function ensureUniversalIndex(vr: ForgeViewerHandle): Promise<boolean> {
  if (vr.isUniversalIndexReady()) return true;
  try { await vr.buildUniversalIndex(); return true; }
  catch (e) { console.warn('[4D] No se pudo construir índice universal:', e); return false; }
}

function applyModeToViewer(vr: ForgeViewerHandle, mode: PlayMode, ids: number[]) {
  vr.setGhosting(false);
  if (!ids.length) { vr.showAll(); return; }
  if (mode === 'isolate') { vr.isolateDbIds([...ids]); }
  else if (mode === 'ghost') { vr.isolateDbIds([...ids]); vr.setGhosting(true); }
  else { vr.showAll(); } 
}


const STORAGE_KEY = (pid: string) => `fourd_seq2_${pid}`;

function buildGroupsFromBimLinker(bl: any): SeqGroup[] {
  // Prefer hierarchyNodes (always by treeCol) over colorNodes (may be by colorCol)
  const src: any[] = (bl.hierarchyNodes?.length ? bl.hierarchyNodes : bl.colorNodes) || [];
  if (!src.length) return [];
  const ts = Date.now();
  const CWP_DAYS = 91;
  const splitExact = (total: number, n: number): number[] => Array.from({ length: n }, () => total / n);
  const cwpMap: Record<string, any[]> = {};
  src.forEach((n: any) => { const k = n.parent || 'General'; if (!cwpMap[k]) cwpMap[k] = []; cwpMap[k].push(n); });
  const imported: SeqGroup[] = [];
  Object.entries(cwpMap).sort(([a], [b]) => a.localeCompare(b)).forEach(([cwpName, iwps]) => {
    const sectionId = `sec_${cwpName}`;
    const iwpDaysArr = splitExact(CWP_DAYS, iwps.length);
    iwps.forEach((n: any, iwpIdx: number) => {
      const iwpDays = iwpDaysArr[iwpIdx];
      const guids: string[] = n.guids || [];
      const tagNames: string[] = n.tagNames || [];
      // Use tagNames to build TAG-level nodes even when guids have been stripped
      const itemCount = tagNames.length || guids.length;
      const tags: SeqTag[] = itemCount > 0
        ? splitExact(iwpDays, itemCount).map((d, ti) => ({
            id: `t_${sectionId}_${iwpIdx}_${ti}_${ts}`,
            name: tagNames[ti] || guids[ti] || `TAG ${ti + 1}`,
            duration: d,
            guids: guids.length > ti ? [guids[ti]] : [],
            visible: true,
          }))
        : [{ id: `t_${sectionId}_${iwpIdx}_0_${ts}`, name: n.value || `IWP ${iwpIdx + 1}`, duration: iwpDays, guids: [], visible: true }];
      imported.push({
        id: `g_${sectionId}_${iwpIdx}_${ts}`,
        name: n.value || `Grupo ${iwpIdx + 1}`,
        color: n.color || '#ccc',
        collapsed: true,
        sectionId,
        sectionName: cwpName,
        tags,
      });
    });
  });
  return imported;
}


const ZOOM_PRESETS = [
  { pxPerDay: 22, label: 'Sem.' },
  { pxPerDay:  5, label: 'Mes'  },
  { pxPerDay:  2, label: 'Trim.'},
  { pxPerDay:  1, label: 'Año'  },
];

// ─── Mini helper: split-N input inside Gantt group row ───────────────────────

function GanttSplitBtn({ groupId, onSplit }: { groupId: string; onSplit: (id: string, n: number) => void }) {
  const [n, setN] = useState(2);
  return (
    <div className="shrink-0 flex items-center gap-0.5">
      <input
        type="number" min={2} max={50} value={n}
        onChange={e => setN(Math.max(2, parseInt(e.target.value) || 2))}
        onClick={e => e.stopPropagation()}
        className="w-7 text-center border border-slate-200 rounded text-[7px] bg-white outline-none focus:border-blue-400"
      />
      <button
        onClick={e => { e.stopPropagation(); onSplit(groupId, n); }}
        title={`Dividir en ${n} grupos`}
        className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[7px] font-black text-blue-500 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition"
      >
        <Scissors size={8}/>
      </button>
    </div>
  );
}

// ─── Gantt View (Virtualized) ────────────────────────────────────────────────

interface GanttProps {
  groups: ScheduledGroup[];
  totalDays: number;
  pxPerDay: number;
  currentDay: number;
  activeTagId: string | null;
  projectStart: Date;
  collapsedSections: Set<string>;
  sectionOrder: string[];
  levelNames: { cwp: string; iwp: string; tag: string };
  onGroupResize: (id: string, d: number) => void;
  onSectionResize: (id: string, d: number) => void;
  onSectionToggle: (id: string) => void;
  onSectionMove: (id: string, dir: 'up' | 'down') => void;
  onGroupMove: (id: string, d: number) => void;
  onGroupToggle: (id: string) => void;
  onTagResize: (groupId: string, tagId: string, newDuration: number) => void;
  onTagMove: (groupId: string, tagId: string, deltaDay: number) => void;
  onScrub: (day: number) => void;
  onScrubEnd: (day: number) => void;
  onSplitGroup: (id: string, n: number) => void;
  onRemoveSubGroups: (id: string) => void;
}

const GanttView = React.memo(({ groups, totalDays, pxPerDay, currentDay, activeTagId, projectStart, collapsedSections, sectionOrder, levelNames, onGroupResize, onSectionResize, onSectionToggle, onSectionMove, onGroupMove, onGroupToggle, onTagResize, onTagMove, onScrub, onScrubEnd, onSplitGroup, onRemoveSubGroups }: GanttProps) => {
  const TW = Math.max((totalDays + 30) * pxPerDay, 400);
  const NW = 320;
  
  const [vScroll, setVScroll] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(600);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const onScroll = () => setVScroll(el.scrollTop);
    const obs = new ResizeObserver(entries => setContainerH(entries[0].contentRect.height || 600));
    el.addEventListener('scroll', onScroll); obs.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); obs.disconnect(); };
  }, []);

  const virtualRows = useMemo(() => {
    const list: any[] = []; let currentY = 0;
    groups.forEach((group, gi) => {
      const prevSection = gi > 0 ? groups[gi - 1].sectionId : undefined;
      if (group.sectionId && group.sectionId !== prevSection) {
        const secCollapsed = collapsedSections.has(group.sectionId);
        list.push({ type: 'section', id: group.sectionId, group, y: currentY, h: 34, secCollapsed }); currentY += 34;
      }
      // If the CWP section is collapsed, skip all its IWPs and TAGs
      if (group.sectionId && collapsedSections.has(group.sectionId)) return;
      list.push({ type: 'group', id: group.id, group, y: currentY, h: 30 }); currentY += 30;
      if (!group.collapsed) {
        if (group.scheduledSubGroups?.length) {
          group.scheduledSubGroups.forEach(sg => { list.push({ type: 'subgroup', id: sg.id, group, sg, y: currentY, h: 24 }); currentY += 24; });
        } else {
          group.tags.forEach(tag => { list.push({ type: 'tag', id: tag.id, group, tag, y: currentY, h: 20 }); currentY += 20; });
        }
      }
    });
    return { list, totalH: currentY };
  }, [groups, collapsedSections]);

  const startIndex = Math.max(0, virtualRows.list.findIndex(r => r.y + r.h > vScroll - 100));
  const endIndex   = virtualRows.list.findIndex(r => r.y > vScroll + containerH + 100);
  const visibleRows = virtualRows.list.slice(startIndex, endIndex === -1 ? virtualRows.list.length : endIndex);

  const markers = useMemo(() => {
    const marks: any[] = [];
    let step = pxPerDay >= 14 ? 7 : pxPerDay >= 3 ? 30 : 365;
    for (let d = 0; d <= totalDays + 30; d += step) {
      const dt = addDays(projectStart, d);
      marks.push({ day: d, label: formatDate(dt), major: d % 365 === 0 });
    }
    return marks;
  }, [totalDays, projectStart, pxPerDay]);

  const dragRef = useRef<any>(null);
  const [dragPreview, setDragPreview] = useState<any>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { startX, origStartDay, origEndDay, type, id } = dragRef.current;
      const delta = (e.clientX - startX) / pxPerDay;
      let newStart = origStartDay; let newEnd = origEndDay;
      if (type.endsWith('-start')) newStart = Math.min(origStartDay + delta, origEndDay - 1);
      else if (type.endsWith('-end')) newEnd = Math.max(origStartDay + 1, origEndDay + delta);
      else if (type.endsWith('-move')) { newStart = origStartDay + delta; newEnd = origEndDay + delta; }
      setDragPreview({ id, type, startDay: newStart, endDay: newEnd });
    };
    const onUp = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { startX, origStartDay, origEndDay, type, id, parentId } = dragRef.current;
      const delta = Math.round((e.clientX - startX) / pxPerDay);
      if (type.startsWith('tag')) {
        if (type === 'tag-move') { if (delta !== 0) onTagMove(parentId, id, delta); }
        else {
          const nd = type === 'tag-start'
            ? Math.max(1, origEndDay - (origStartDay + delta) + 1)
            : Math.max(1, (origEndDay + delta) - origStartDay + 1);
          onTagResize(parentId, id, nd);
        }
      } else if (type.endsWith('-move')) {
        if (delta !== 0) onGroupMove(id, delta);
      } else {
        const nt = type.endsWith('-start') ? origEndDay - (origStartDay + delta) : (origEndDay + delta) - origStartDay;
        if (type.startsWith('section')) onSectionResize(id, nt); else onGroupResize(id, nt);
      }
      dragRef.current = null; setDragPreview(null);
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [pxPerDay, onGroupMove, onGroupResize, onSectionResize, onTagResize, onTagMove]);

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-auto relative select-none bg-slate-50">
      <div style={{ minWidth: NW + TW, height: virtualRows.totalH + 200 }} className="relative">
        <div className="flex sticky top-0 z-30 bg-white border-b border-slate-200" style={{ height: 32 }}>
          <div className="shrink-0 bg-white border-r border-slate-200 z-40 flex items-center sticky left-0" style={{ width: NW }}>
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-3 flex-1">Nombre / Actividad</span>
          </div>
          <div
            className="relative flex-1 cursor-crosshair"
            style={{ width: TW }}
            onClick={e => {
              const rect  = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const newDay = Math.max(0, Math.min(totalDays, (e.clientX - rect.left) / pxPerDay));
              onScrubEnd(newDay);
            }}
          >
            {markers.map(m => (
              <div key={m.day} className={`absolute top-0 bottom-0 border-l ${m.major ? 'border-slate-300' : 'border-slate-100'}`} style={{ left: m.day * pxPerDay }}>
                <span className={`text-[7px] font-black ${m.major ? 'text-slate-500' : 'text-slate-300'} pl-1`}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          {visibleRows.map((row) => {
            const { group, type, tag, y } = row;
            if (type === 'section') {
               const sGroups = groups.filter(g => g.sectionId === group.sectionId);
               if (!sGroups.length) return null;
               const secCollapsed = row.secCollapsed as boolean;
               const sStart = secCollapsed ? 0 : Math.min(...sGroups.map(g => g.startDay));
               const sEnd   = secCollapsed ? 0 : Math.max(...sGroups.map(g => g.endDay));
               const isPre  = !secCollapsed && dragPreview?.id === group.sectionId;
               const dS = isPre ? dragPreview.startDay : sStart;
               const dE = isPre ? dragPreview.endDay   : sEnd;
               const pL = dS * pxPerDay;
               const pW = Math.max((dE - dS) * pxPerDay, 6);
               const durLabel = (() => { const d = dE-dS; return d>=365?`${(d/365).toFixed(1)}a`:d>=30?`${Math.round(d/30)}m`:d>=7?`${Math.round(d/7)}s`:`${d}d`; })();
               const iwpCount = sGroups.length;
               return (
                 <div key={`${row.id}_${y}`} className="flex items-center border-b-2 border-[#0C1E4F]/20 bg-[#0C1E4F]/8 absolute w-full group/sec" style={{ top: y, height: 34 }}>
                   <div className="shrink-0 sticky left-0 bg-[#dde4ef] border-r-2 border-[#0C1E4F]/20 z-20 flex items-center h-full gap-1 px-2" style={{ width: NW }}>
                     {/* CWP collapse toggle */}
                     <button onClick={() => onSectionToggle(group.sectionId!)}
                       className="w-5 h-5 flex items-center justify-center text-[#0C1E4F]/70 hover:text-[#0C1E4F] shrink-0 rounded hover:bg-[#0C1E4F]/10 transition-colors">
                       {secCollapsed ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}
                     </button>
                     <div className="w-2.5 h-2.5 rounded-sm bg-[#0C1E4F]/50 shrink-0" />
                     <span className="text-[10px] font-black text-[#0C1E4F] uppercase tracking-wide truncate flex-1">{group.sectionName}</span>
                     <span className="text-[7px] font-mono text-[#0C1E4F]/40 shrink-0 bg-[#0C1E4F]/10 px-1 rounded">{iwpCount} {levelNames.iwp}</span>
                     {/* Move CWP up/down */}
                     <div className="flex flex-col shrink-0">
                       <button onClick={() => onSectionMove(group.sectionId!, 'up')}
                         disabled={sectionOrder.indexOf(group.sectionId!) === 0}
                         className="w-5 h-4 flex items-center justify-center text-[#0C1E4F]/50 hover:text-[#0C1E4F] disabled:opacity-10 hover:bg-[#0C1E4F]/10 rounded-sm transition-colors">
                         <ChevronUp size={11}/>
                       </button>
                       <button onClick={() => onSectionMove(group.sectionId!, 'down')}
                         disabled={sectionOrder.indexOf(group.sectionId!) === sectionOrder.length - 1}
                         className="w-5 h-4 flex items-center justify-center text-[#0C1E4F]/50 hover:text-[#0C1E4F] disabled:opacity-10 hover:bg-[#0C1E4F]/10 rounded-sm transition-colors">
                         <ChevronDown size={11}/>
                       </button>
                     </div>
                   </div>
                   <div className="relative flex-1 h-full">
                     {!secCollapsed && <>
                       {/* Summary bar */}
                       <div className="absolute top-2 bottom-2 rounded border border-[#0C1E4F]/30 bg-[#0C1E4F]/15 cursor-grab"
                          style={{ left: pL + 6, width: Math.max(pW - 12, 2) }}
                          onMouseDown={e => { e.preventDefault(); dragRef.current = { id: group.sectionId, type: 'section-move', startX: e.clientX, origStartDay: sStart, origEndDay: sEnd }; }} />
                       {/* Left resize handle */}
                       <div className="absolute top-1 bottom-1 w-3 flex items-center justify-center cursor-w-resize z-10 opacity-0 group-hover/sec:opacity-100 transition-opacity"
                          style={{ left: pL }}
                          onMouseDown={e => { e.preventDefault(); dragRef.current = { id: group.sectionId, type: 'section-start', startX: e.clientX, origStartDay: sStart, origEndDay: sEnd }; }}>
                         <div className="w-1 h-5 rounded-full bg-[#0C1E4F]/50" />
                       </div>
                       {/* Right resize handle */}
                       <div className="absolute top-1 bottom-1 w-3 flex items-center justify-center cursor-e-resize z-10 opacity-0 group-hover/sec:opacity-100 transition-opacity"
                          style={{ left: pL + pW - 12 }}
                          onMouseDown={e => { e.preventDefault(); dragRef.current = { id: group.sectionId, type: 'section-end', startX: e.clientX, origStartDay: sStart, origEndDay: sEnd }; }}>
                         <div className="w-1 h-5 rounded-full bg-[#0C1E4F]/50" />
                       </div>
                       {pW > 60 && <span className="absolute top-0 bottom-0 flex items-center text-[8px] font-black text-[#0C1E4F]/50 pointer-events-none pl-2" style={{ left: pL + 6 }}>{durLabel}</span>}
                     </>}
                   </div>
                 </div>
               );
            }
            if (type === 'group') {
              const isPre = dragPreview?.id === group.id;
              const dS = isPre ? dragPreview.startDay : group.startDay;
              const dE = isPre ? dragPreview.endDay   : group.endDay;
              const pL = dS * pxPerDay;
              const pW = Math.max((dE - dS) * pxPerDay, 6);
              const durLabel = (() => { const d = dE-dS; return d>=365?`${(d/365).toFixed(1)}a`:d>=30?`${Math.round(d/30)}m`:d>=7?`${Math.round(d/7)}s`:`${d}d`; })();
              const hasSection = !!group.sectionId;
              return (
                <div key={`${row.id}_${y}`} className={`flex items-center h-[30px] border-b border-slate-100 absolute w-full group/grp ${hasSection ? 'bg-slate-50/80' : 'bg-white'}`} style={{ top: y }}>
                  <div className={`shrink-0 sticky left-0 border-r border-slate-100 z-20 flex items-center h-full gap-1 ${hasSection ? 'bg-slate-50 pl-7 pr-1' : 'bg-white pl-2 pr-1'}`} style={{ width: NW }}>
                    <button onClick={() => onGroupToggle?.(group.id)} className="w-5 h-5 flex items-center justify-center text-slate-400 shrink-0">
                      {group.collapsed ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}
                    </button>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: group.color }}/>
                    <span className="text-[9px] font-black text-slate-700 truncate flex-1">{group.name}</span>
                    <span className="text-[7px] font-mono text-slate-400 shrink-0 hidden group-hover/grp:block">{durLabel}</span>
                    {/* Sub-group split controls */}
                    {group.scheduledSubGroups?.length ? (
                      <button
                        onClick={() => onRemoveSubGroups(group.id)}
                        title="Quitar sub-grupos"
                        className="shrink-0 flex items-center gap-0.5 px-1 py-0.5 rounded text-[7px] font-black text-orange-500 bg-orange-50 hover:bg-orange-100 border border-orange-200 transition"
                      >
                        <Scissors size={8}/>{group.scheduledSubGroups.length}g
                      </button>
                    ) : (
                      <GanttSplitBtn groupId={group.id} onSplit={onSplitGroup} />
                    )}
                  </div>
                  <div className="relative flex-1 h-full">
                    {/* Bar body */}
                    <div className="absolute top-1.5 bottom-1.5 rounded shadow-sm cursor-grab"
                       style={{ left: pL + 6, width: Math.max(pW - 12, 2), background: group.color, opacity: 0.25 }}
                       onMouseDown={e => { e.preventDefault(); dragRef.current = { id: group.id, type: 'group-move', startX: e.clientX, origStartDay: group.startDay, origEndDay: group.endDay }; }} />
                    {/* Left resize */}
                    <div className="absolute top-1 bottom-1 w-3 flex items-center justify-center cursor-w-resize z-10 opacity-0 group-hover/grp:opacity-100 transition-opacity"
                       style={{ left: pL }}
                       onMouseDown={e => { e.preventDefault(); dragRef.current = { id: group.id, type: 'group-start', startX: e.clientX, origStartDay: group.startDay, origEndDay: group.endDay }; }}>
                      <div className="w-0.5 h-4 rounded-full" style={{ background: group.color }}/>
                    </div>
                    {/* Right resize */}
                    <div className="absolute top-1 bottom-1 w-3 flex items-center justify-center cursor-e-resize z-10 opacity-0 group-hover/grp:opacity-100 transition-opacity"
                       style={{ left: pL + pW - 12 }}
                       onMouseDown={e => { e.preventDefault(); dragRef.current = { id: group.id, type: 'group-end', startX: e.clientX, origStartDay: group.startDay, origEndDay: group.endDay }; }}>
                      <div className="w-0.5 h-4 rounded-full" style={{ background: group.color }}/>
                    </div>
                    {pW > 50 && <span className="absolute top-0 bottom-0 flex items-center text-[8px] font-black pointer-events-none pl-2" style={{ left: pL + 6, color: group.color, opacity: 0.7 }}>{durLabel}</span>}
                  </div>
                </div>
              );
            }
            if (type === 'subgroup' && row.sg) {
              const sg = row.sg as ScheduledSubGroup;
              const sL = sg.startDay * pxPerDay;
              const sW = Math.max((sg.endDay - sg.startDay) * pxPerDay, 4);
              const indent = group.sectionId ? 'pl-9' : 'pl-7';
              return (
                <div key={`sg_${sg.id}_${y}`} className="flex items-center border-b border-slate-50 absolute w-full" style={{ top: y, height: 24 }}>
                  <div className={`shrink-0 sticky left-0 border-r border-slate-100 z-20 flex items-center h-full gap-1 ${group.sectionId ? 'bg-slate-50/80' : 'bg-white'} ${indent}`} style={{ width: NW }}>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: group.color, opacity: 0.7 }}/>
                    <span className="text-[8px] font-bold text-slate-500 truncate flex-1">{sg.name}</span>
                    <span className="text-[7px] text-slate-300 font-mono shrink-0 pr-1">{sg.guids.length}t</span>
                  </div>
                  <div className="relative flex-1 h-full">
                    <div className="absolute top-1.5 bottom-1.5 rounded shadow-sm"
                      style={{ left: sL + 6, width: Math.max(sW - 12, 2), background: group.color, opacity: 0.5 }} />
                  </div>
                </div>
              );
            }
            if (type === 'tag' && tag) {
              const isPreTag = dragPreview?.type?.startsWith('tag') && dragPreview?.id === tag.id;
              const tStart  = isPreTag ? dragPreview.startDay : tag.startDay;
              const tEnd    = isPreTag ? dragPreview.endDay   : tag.endDay;
              const durDays = tEnd - tStart;
              const isSubDay = durDays < 1;
              // Sub-día = línea delgada (2px); ≥1 día = barra normal (mín 4px)
              const tW      = Math.max(durDays * pxPerDay, isSubDay ? 2 : 4);
              const tL      = tStart * pxPerDay;
              return (
                <div key={`${tag.id}_${y}`} className={`flex items-center h-5 border-b border-slate-50 absolute w-full group/tag ${activeTagId === tag.id ? 'bg-blue-50' : group.sectionId ? 'bg-slate-50/50 hover:bg-slate-100/50' : 'bg-white hover:bg-slate-50/60'}`} style={{ top: y }}>
                  <div className={`shrink-0 sticky left-0 border-r border-slate-100 z-20 flex items-center h-full ${group.sectionId ? 'bg-slate-50/50 pl-12' : 'bg-white pl-10'}`} style={{ width: NW }}>
                    <span className={`text-[8px] truncate ${tag.visible ? 'text-slate-500' : 'text-slate-200 line-through'}`}>{tag.name}</span>
                  </div>
                  <div className="relative flex-1 h-full">
                    {/* Bar body — drag to move */}
                    <div
                      className="absolute top-1 bottom-1 rounded-sm shadow-sm cursor-grab active:cursor-grabbing select-none"
                      style={{ left: tL + 6, width: Math.max(tW - 12, 2), background: group.color, opacity: !tag.visible ? 0.08 : isPreTag ? 0.7 : tag.endDay < currentDay ? 0.85 : 0.45 }}
                      onMouseDown={e => { e.preventDefault(); dragRef.current = { id: tag.id, parentId: group.id, type: 'tag-move', startX: e.clientX, origStartDay: tag.startDay, origEndDay: tag.endDay }; }}
                    />
                    {/* Left resize handle */}
                    <div
                      className="absolute top-0.5 bottom-0.5 w-2.5 flex items-center justify-center cursor-w-resize z-10 opacity-0 group-hover/tag:opacity-100 transition-opacity"
                      style={{ left: tL }}
                      onMouseDown={e => { e.preventDefault(); dragRef.current = { id: tag.id, parentId: group.id, type: 'tag-start', startX: e.clientX, origStartDay: tag.startDay, origEndDay: tag.endDay }; }}
                    >
                      <div className="w-0.5 h-3 rounded-full" style={{ background: group.color }} />
                    </div>
                    {/* Right resize handle */}
                    <div
                      className="absolute top-0.5 bottom-0.5 w-2.5 flex items-center justify-center cursor-e-resize z-10 opacity-0 group-hover/tag:opacity-100 transition-opacity"
                      style={{ left: tL + tW - 10 }}
                      onMouseDown={e => { e.preventDefault(); dragRef.current = { id: tag.id, parentId: group.id, type: 'tag-end', startX: e.clientX, origStartDay: tag.startDay, origEndDay: tag.endDay }; }}
                    >
                      <div className="w-0.5 h-3 rounded-full" style={{ background: group.color }} />
                    </div>
                    {/* Duration tooltip on hover */}
                    {tW > 30 && (
                      <span className="absolute top-0 bottom-0 flex items-center pointer-events-none text-[7px] font-mono text-white/80 pl-1 overflow-hidden"
                        style={{ left: tL + 6, width: tW - 12 }}>
                        {isSubDay ? '<1d' : `${Math.round(durDays)}d`}
                      </span>
                    )}
                  </div>
                </div>
              );
            }
            return null;
          })}
        </div>
        {/* ── Línea roja draggable ── */}
        <div
          className="absolute top-0 bottom-0 z-50 w-5 -translate-x-1/2 cursor-col-resize flex justify-center group/scrub"
          style={{ left: NW + currentDay * pxPerDay }}
          onMouseDown={e => {
            e.preventDefault();
            const startX   = e.clientX;
            const startDay = currentDay;
            const onMove = (ev: MouseEvent) => {
              const delta  = (ev.clientX - startX) / pxPerDay;
              const newDay = Math.max(0, Math.min(totalDays, startDay + delta));
              onScrub(newDay);
            };
            const onUp = (ev: MouseEvent) => {
              const delta  = (ev.clientX - startX) / pxPerDay;
              const newDay = Math.max(0, Math.min(totalDays, startDay + delta));
              onScrubEnd(newDay);
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        >
          {/* Línea */}
          <div className="w-px h-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)] pointer-events-none group-hover/scrub:w-0.5 transition-all" />
          {/* Cabeza triangular */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-red-500 pointer-events-none" />
          {/* Tooltip día */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover/scrub:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-lg">
            Día {Math.round(currentDay)}
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── Rows (Strict Typing) ──────────────────────────────────────────────────

interface RowTagProps {
  tag: ScheduledTag; idx: number; groupColor: string; isActive: boolean;
  indent?: string;
  onDuration: (id: string, v: number) => void;
  onVisibility: (id: string) => void;
  onDelete: (id: string) => void;
}
const SortableTagRow = React.memo(({ tag, idx, groupColor, isActive, indent = 'pl-9', onDuration, onVisibility, onDelete }: RowTagProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: tag.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-2 ${indent} pr-2 py-0.5 border-b border-slate-50 text-[10px] ${isActive ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
      <button {...attributes} {...listeners} className="text-slate-200 hover:text-slate-400 px-1"><GripVertical size={10} /></button>
      <span className="flex-1 truncate text-slate-500">{tag.name}</span>
      <input type="number" step="any" value={tag.duration} onChange={e => onDuration(tag.id, parseFloat(e.target.value) || 1)} className="w-12 text-center border rounded tabular-nums text-[9px]" />
      <button onClick={() => onVisibility(tag.id)} className="text-slate-300">{tag.visible ? <Eye size={10} /> : <EyeOff size={10} />}</button>
      <button onClick={() => onDelete(tag.id)} className="text-slate-200 hover:text-red-500"><Trash2 size={10} /></button>
    </div>
  );
});

interface RowGroupProps {
  group: ScheduledGroup; scheduled: ScheduledGroup;
  activeGroupId: string | null; activeTagId: string | null;
  tagSensors: any;
  onTagDragEnd: (gId: string, e: DragEndEvent) => void;
  onTagDuration: (gId: string, tId: string, v: number) => void;
  onTagVisibility: (gId: string, tId: string) => void;
  onTagDelete: (gId: string, tId: string) => void;
  onGroupDelete: (gId: string) => void;
  onGroupToggle: (gId: string) => void;
  onSplitGroup: (gId: string, n: number) => void;
  onRemoveSubGroups: (gId: string) => void;
}
const SortableGroupRow = React.memo(({ group, scheduled, activeGroupId, activeTagId, tagSensors, onTagDragEnd, onTagDuration, onTagVisibility, onTagDelete, onGroupDelete, onGroupToggle, onSplitGroup, onRemoveSubGroups }: RowGroupProps) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: group.id });
  const [splitN, setSplitN] = useState(2);
  const [collapsedSGs, setCollapsedSGs] = useState<Set<string>>(new Set());
  const toggleSG = (sgId: string) => setCollapsedSGs(prev => { const n = new Set(prev); n.has(sgId) ? n.delete(sgId) : n.add(sgId); return n; });

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>

      {/* ── Nivel 2: IWP header ── */}
      <div className={`flex items-center gap-1.5 px-3 py-1 bg-slate-50 border-b border-slate-100 ${activeGroupId === group.id ? 'bg-blue-100' : ''}`}>
        <button {...attributes} {...listeners} className="text-slate-300 hover:text-slate-500 shrink-0"><GripVertical size={12} /></button>
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: group.color }} />
        <span className="flex-1 text-[11px] font-black text-slate-700 truncate">{group.name}</span>
        {/* Sub-group controls */}
        {group.scheduledSubGroups?.length ? (
          <button onClick={() => onRemoveSubGroups(group.id)} title="Quitar sub-grupos"
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black text-orange-500 bg-orange-50 hover:bg-orange-100 border border-orange-200 shrink-0">
            <Scissors size={9}/>{group.scheduledSubGroups.length} grupos
          </button>
        ) : (
          <div className="flex items-center gap-0.5 shrink-0">
            <input type="number" min={2} max={50} value={splitN}
              onChange={e => setSplitN(Math.max(2, parseInt(e.target.value) || 2))}
              className="w-8 text-center border border-slate-200 rounded text-[8px] bg-white outline-none"
            />
            <button onClick={() => onSplitGroup(group.id, splitN)} title="Dividir en sub-grupos"
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black text-blue-500 bg-blue-50 hover:bg-blue-100 border border-blue-200 shrink-0">
              <Scissors size={9}/>Dividir
            </button>
          </div>
        )}
        <button onClick={() => onGroupToggle(group.id)} className="shrink-0">{group.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>
        <button onClick={() => onGroupDelete(group.id)} className="text-slate-200 hover:text-red-500 shrink-0"><Trash2 size={12} /></button>
      </div>

      {/* ── Expanded content ── */}
      {!group.collapsed && (
        group.subGroups?.length ? (
          // ── Nivel 3: Sub-grupos + Nivel 4: TAGs ──────────────────────────
          <div>
            {group.subGroups.map(sg => {
              const sgTags = scheduled.tags.filter(t => sg.tagIds.includes(t.id));
              const sgCollapsed = collapsedSGs.has(sg.id);
              return (
                <div key={sg.id}>
                  {/* Nivel 3: sub-grupo header */}
                  <div className="flex items-center gap-1.5 pl-5 pr-2 py-1 border-b border-slate-100 bg-slate-100/60 hover:bg-slate-100 cursor-pointer"
                    onClick={() => toggleSG(sg.id)}>
                    <button className="w-4 h-4 flex items-center justify-center text-slate-400 shrink-0 pointer-events-none">
                      {sgCollapsed ? <ChevronRight size={11}/> : <ChevronDown size={11}/>}
                    </button>
                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: group.color, opacity: 0.55 }}/>
                    <span className="flex-1 text-[9px] font-bold text-slate-600 truncate">{sg.name}</span>
                    <span className="text-[7px] text-slate-400 font-mono shrink-0 bg-white px-1 rounded border border-slate-200">{sgTags.length}t</span>
                  </div>
                  {/* Nivel 4: TAGs del sub-grupo */}
                  {!sgCollapsed && (
                    <DndContext sensors={tagSensors} collisionDetection={closestCenter} onDragEnd={e => onTagDragEnd(group.id, e)}>
                      <SortableContext items={sgTags.map(t => t.id)} strategy={verticalListSortingStrategy}>
                        {sgTags.map((tag, idx) => (
                          <SortableTagRow key={tag.id} tag={tag} idx={idx} groupColor={group.color}
                            isActive={activeTagId === tag.id} indent="pl-12"
                            onDuration={(id, v) => onTagDuration(group.id, id, v)}
                            onVisibility={() => onTagVisibility(group.id, tag.id)}
                            onDelete={() => onTagDelete(group.id, tag.id)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // ── Sin sub-grupos: flat tags (Nivel 3 original) ─────────────────
          <DndContext sensors={tagSensors} collisionDetection={closestCenter} onDragEnd={e => onTagDragEnd(group.id, e)}>
            <SortableContext items={group.tags.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {scheduled.tags.map((tag, idx) => (
                <SortableTagRow key={tag.id} tag={tag} idx={idx} groupColor={group.color}
                  isActive={activeTagId === tag.id}
                  onDuration={(id, v) => onTagDuration(group.id, id, v)}
                  onVisibility={() => onTagVisibility(group.id, tag.id)}
                  onDelete={() => onTagDelete(group.id, tag.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )
      )}
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SortableSequenceList({ projectId, viewerRef, viewerReady }: Props) {
  const [groups, setGroups]               = useState<SeqGroup[]>([]);
  const [viewMode, setViewMode]           = useState<ViewMode>('gantt');
  const [pxPerDay, setPxPerDay]           = useState(5);
  const [projectStart, setProjectStart]   = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [isPlaying, setIsPlaying]         = useState(false);
  const [indexing, setIndexing]           = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeTagId, setActiveTagId]     = useState<string | null>(null);
  const [currentDay, setCurrentDay]       = useState(0);
  const [horizon, setHorizon]             = useState<'daily'|'weekly'|'monthly'>('daily');
  const [stepSeconds, setStepSeconds]     = useState(1);
  const [playMode, setPlayMode]           = useState<PlayMode>('isolate');
  const [importing, setImporting]         = useState(false);
  const [saving, setSaving]               = useState(false);
  const [savedOk, setSavedOk]             = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [levelNames, setLevelNames] = useState({ cwp: 'CWP', iwp: 'IWP', tag: 'TAG' });

  const toggleSection = (sectionId: string) => setCollapsedSections(prev => {
    const next = new Set(prev); next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId); return next;
  });

  // Effective order: user-defined order first, then any new sections not yet ordered
  const effectiveSectionOrder = useMemo(() => {
    const allSecs = [...new Set(groups.map(g => g.sectionId || '').filter(Boolean))];
    const known = sectionOrder.filter(s => allSecs.includes(s));
    const unknown = allSecs.filter(s => !known.includes(s));
    return [...known, ...unknown];
  }, [groups, sectionOrder]);

  const moveSection = (sectionId: string, dir: 'up' | 'down') => {
    const order = effectiveSectionOrder;
    const idx = order.indexOf(sectionId);
    if (idx < 0) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= order.length) return;
    const next = [...order];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setSectionOrder(next);
  };

  const playRef        = useRef(false);
  const horizonRef     = useRef<'daily'|'weekly'|'monthly'>('daily');
  const stepSecondsRef = useRef(1);
  const playModeRef    = useRef<PlayMode>('isolate');
  const currentDayRef  = useRef(0);
  const scheduledRef   = useRef<ScheduledGroup[]>([]);
  const applyTimer     = useRef<any>(null);
  const isDirtyRef     = useRef(false);
  const autoSaveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── RAF play-loop refs (no React state inside tight loop) ─────────────────
  const rafIdRef       = useRef<number | null>(null);
  const lastFrameRef   = useRef<number>(0);
  const playTagsRef    = useRef<any[]>([]);          // sorted flat tag list
  const playPrevTRef   = useRef<number>(0);          // last processed day
  const playAccColRef  = useRef<Map<string, number[]>>(new Map()); // accumulated colorMap


  horizonRef.current = horizon; stepSecondsRef.current = stepSeconds; playModeRef.current = playMode; currentDayRef.current = currentDay;
  const groupSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const tagSensors   = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Carga: Supabase primero, fallback a IndexedDB, luego auto-import bim_linker ──
  useEffect(() => {
    (async () => {
      try {
        const sb = createClient() as any;
        const { data } = await sb.from('projects').select('module_config').eq('id', projectId).single();
        const seq = data?.module_config?.fourd_sequence;
        const bl  = data?.module_config?.bim_linker;

        // Always load level names from bim_linker config if available
        if (bl?.parentCol || bl?.treeCol || bl?.keyCol) {
          setLevelNames({
            cwp: bl.parentCol || 'CWP',
            iwp: bl.treeCol   || 'IWP',
            tag: bl.keyCol    || 'TAG',
          });
        }

        // Use fourd_sequence only if it is at least as recent as bim_linker.
        // If bim_linker was updated after the last sequence save, auto-reimport so
        // the 3-level hierarchy (CWP → IWP → TAG) stays in sync.
        const seqTs = seq?.savedAt ? new Date(seq.savedAt).getTime() : 0;
        const blTs  = bl?.savedAt  ? new Date(bl.savedAt).getTime()  : 0;
        const seqIsUpToDate = seq?.groups?.length && seqTs >= blTs;

        if (seqIsUpToDate) {
          setGroups(seq.groups);
          if (seq.projectStart) setProjectStart(seq.projectStart);
          if (seq.sectionOrder) setSectionOrder(seq.sectionOrder);
          return;
        }

        // fourd_sequence is stale or absent — auto-import from bim_linker
        if (bl?.colorNodes?.length || bl?.hierarchyNodes?.length) {
          const imported = buildGroupsFromBimLinker(bl);
          if (imported.length) {
            setGroups(imported);
            set(STORAGE_KEY(projectId), { groups: imported, projectStart: new Date().toISOString().split('T')[0] }).catch(() => {});
            return;
          }
        }
      } catch {}
      // Fallback a IndexedDB local
      const r = await get(STORAGE_KEY(projectId));
      if (r) { setGroups(r.groups || []); if (r.projectStart) setProjectStart(r.projectStart); }
    })();
  }, [projectId]); // eslint-disable-line

  const save = useCallback((list: SeqGroup[], start = projectStart) => {
    setGroups(list);
    isDirtyRef.current = true;
    set(STORAGE_KEY(projectId), { groups: list, projectStart: start });
  }, [projectId, projectStart]);

  // ── Guardar en servidor (Supabase) ────────────────────────────────────────
  const saveToServer = useCallback(async () => {
    setSaving(true); setSavedOk(false);
    try {
      const sb = createClient() as any;
      const { data } = await sb.from('projects').select('module_config').eq('id', projectId).single();
      const cfg = data?.module_config || {};
      await sb.from('projects').update({
        module_config: {
          ...cfg,
          fourd_sequence: { groups, projectStart, sectionOrder: effectiveSectionOrder, savedAt: new Date().toISOString() },
        },
      }).eq('id', projectId);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (e) {
      console.error('[4D] Error al guardar en servidor:', e);
    } finally {
      setSaving(false);
    }
  }, [projectId, groups, projectStart, effectiveSectionOrder]);

  // Auto-save a Supabase 2s después de cualquier cambio del usuario
  useEffect(() => {
    if (!isDirtyRef.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      isDirtyRef.current = false;
      saveToServer();
    }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [saveToServer]); // eslint-disable-line

  const scheduled = useMemo<ScheduledGroup[]>(() => {
    // Sort by effectiveSectionOrder (user-controlled), then preserve internal IWP order
    const sorted = [...groups].sort((a, b) => {
      const ai = effectiveSectionOrder.indexOf(a.sectionId || '');
      const bi = effectiveSectionOrder.indexOf(b.sectionId || '');
      return ai - bi;
    });
    let day = 0;
    return sorted.map(g => {
      day += (g.startOffset || 0); if (day < 0) day = 0; const gs = day;
      const tags = g.tags.map(t => { const s = day; day += t.duration; return { ...t, startDay: s, endDay: day }; });
      if (!tags.length) day += 10;

      // Compute scheduled sub-groups (combine guids of member tags into one playback unit)
      let scheduledSubGroups: ScheduledSubGroup[] | undefined;
      if (g.subGroups?.length) {
        scheduledSubGroups = g.subGroups.map(sg => {
          const sgTags = tags.filter(t => sg.tagIds.includes(t.id));
          const sgStart = sgTags.length ? Math.min(...sgTags.map(t => t.startDay)) : gs;
          const sgEnd   = sgTags.length ? Math.max(...sgTags.map(t => t.endDay))   : gs;
          const guids   = sgTags.flatMap(t => t.guids);
          return { id: sg.id, name: sg.name, startDay: sgStart, endDay: sgEnd, guids };
        }).filter(sg => sg.guids.length > 0);
      }

      return { ...g, tags, startDay: gs, endDay: day, scheduledSubGroups } as ScheduledGroup;
    });
  }, [groups]);
  scheduledRef.current = scheduled; const totalDays = scheduled.length ? scheduled[scheduled.length-1].endDay : 0;

  // ── Aplicar estado Navisworks: futuro=original · activo=verde · completado=gris ─
  // Navisworks 3 estados: futuro=oculto · activo=verde · completado=gris
  const applyDay = useCallback(async (targetDay: number) => {
    const vr = viewerRef.current;
    if (!vr || !vr.isUniversalIndexReady()) return;
    const t0 = performance.now();

    const winDays  = horizonRef.current === 'weekly' ? 7 : horizonRef.current === 'monthly' ? 30 : 1;
    const winStart = Math.max(0, targetDay - winDays);

    const allTags: any[] = [];
    scheduledRef.current.forEach(g => {
      if (g.scheduledSubGroups?.length) {
        g.scheduledSubGroups.forEach(sg => allTags.push({ startDay: sg.startDay, endDay: sg.endDay, guids: sg.guids, visible: true }));
      } else {
        g.tags.forEach(t => allTags.push({ ...t }));
      }
    });
    allTags.sort((a, b) => a.startDay - b.startDay);

    const completedIds: number[] = [];
    const activeIds:    number[] = [];
    for (const tg of allTags) {
      if (tg.startDay > targetDay) break;  // futuro → oculto
      if (!tg.visible) continue;
      const ids = vr.resolveByUniversalSync(tg.guids);
      if (!ids.length) continue;
      if (tg.endDay >= winStart) activeIds.push(...ids);    // activo → verde
      else                       completedIds.push(...ids); // completado → gris
    }

    const colorMap = new Map<string, number[]>();
    if (completedIds.length) colorMap.set('#94A3B8', completedIds);
    if (activeIds.length)    colorMap.set('#00d94d', activeIds);

    const startedIds = [...completedIds, ...activeIds];
    const mode = playModeRef.current;
    vr.setGhosting(false);
    if (startedIds.length > 0) {
      if      (mode === 'isolate') { vr.isolateDbIds(startedIds); }
      else if (mode === 'ghost')   { vr.isolateDbIds(startedIds); vr.setGhosting(true); }
      else                         { vr.showAll(); }   // 'all': futuros visibles en color original
      vr.applyThemingBatch(colorMap);
    } else {
      vr.showAll();
      vr.clearHighlights();
    }

    console.debug(`[4D][SCRUB] día ${targetDay.toFixed(1)} | ventana:[${winStart.toFixed(0)},${targetDay.toFixed(0)}] | activos:${activeIds.length} completados:${completedIds.length} | ${(performance.now()-t0).toFixed(1)}ms`);
    playAccColRef.current = new Map();
    playPrevTRef.current  = targetDay;
  }, [viewerRef]);

  // ── Play / Pause toggle — RAF loop ──────────────────────────────────────────
  // requestAnimationFrame garantiza que los eventos de mouse/zoom se procesen
  // ENTRE frames → el viewer nunca se bloquea durante el 4D
  const handlePlay = useCallback(async () => {
    const vr = viewerRef.current; if (!vr) return;

    // PAUSA
    if (isPlaying) {
      playRef.current = false;
      if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
      setIsPlaying(false);
      return;
    }

    // Construir índice universal si falta (async, solo la primera vez)
    if (!vr.isUniversalIndexReady()) {
      setIndexing(true);
      await ensureUniversalIndex(vr);
      setIndexing(false);
    }

    // Snapshot de tags/sub-grupos ordenados — guardado en ref para el RAF callback
    const allTags: any[] = [];
    scheduledRef.current.forEach(g => {
      if (g.scheduledSubGroups?.length) {
        g.scheduledSubGroups.forEach(sg => allTags.push({ id: sg.id, startDay: sg.startDay, endDay: sg.endDay, guids: sg.guids, color: g.color, visible: true }));
      } else {
        g.tags.forEach(t => allTags.push({ ...t, color: g.color }));
      }
    });
    allTags.sort((a, b) => a.startDay - b.startDay);
    playTagsRef.current = allTags;

    let t = currentDayRef.current;
    if (t >= totalDays) { t = 0; setCurrentDay(0); currentDayRef.current = 0; }

    // Resetear caché incremental si arrancamos desde el principio
    if (t === 0) {
      playAccColRef.current = new Map();
      playPrevTRef.current  = 0;
    }

    lastFrameRef.current = performance.now();
    setIsPlaying(true);
    playRef.current = true;

    let _tickCount = 0;
    let _lastLogTs = performance.now();
    let _lastAppliedNodes = -1;  // dedup guard: skip GPU call if nothing changed

    // ── RAF tick incremental ─────────────────────────────────────────────────
    // OPTIMIZACIÓN CLAVE: solo procesa los tags NUEVOS en cada tick (O(n_nuevos))
    // en lugar de reconstruir desde cero (O(n_acumulados)).
    // playAccColRef: mapa hex→dbIds acumulado persistente durante el play.
    // playPrevTRef:  último día procesado — solo iteramos tags más allá de este.
    const tick = (now: number) => {
      if (!playRef.current) { setIsPlaying(false); rafIdRef.current = null; return; }

      const elapsed = now - lastFrameRef.current;
      const stepTimeMs = stepSecondsRef.current * 1000;
      const stepDays = horizonRef.current === 'weekly' ? 7 : horizonRef.current === 'monthly' ? 30 : 1;

      if (elapsed >= stepTimeMs) {
        lastFrameRef.current = now - (elapsed % stepTimeMs);
        const t0tick = performance.now();

        const prevT = playPrevTRef.current;
        t = Math.min(currentDayRef.current + stepDays, totalDays);
        currentDayRef.current = t;
        setCurrentDay(t);

        // NAVISWORKS 3 estados: futuro=original · activo=verde · completado=gris
        const winStart      = Math.max(0, t - stepDays);
        const completedIds: number[] = [];
        const activeIds:    number[] = [];
        for (const tg of playTagsRef.current) {
          if (tg.startDay > t) break;
          if (!tg.visible) continue;
          const ids = vr.resolveByUniversalSync(tg.guids);
          if (!ids.length) continue;
          if (tg.endDay >= winStart) activeIds.push(...ids);
          else                       completedIds.push(...ids);
        }
        playPrevTRef.current = t;
        const totalNodes = activeIds.length + completedIds.length;

        // Emitir GPU solo si cambió el total de nodos ya iniciados
        let gpuEmitted = false;
        if (totalNodes !== _lastAppliedNodes) {
          _lastAppliedNodes = totalNodes;
          gpuEmitted = true;
          const colorMap = new Map<string, number[]>();
          if (completedIds.length) colorMap.set('#94A3B8', completedIds);
          if (activeIds.length)    colorMap.set('#00d94d', activeIds);
          const startedIds = [...completedIds, ...activeIds];
          const mode = playModeRef.current;
          vr.setGhosting(false);
          if (startedIds.length > 0) {
            if      (mode === 'isolate') { vr.isolateDbIds(startedIds); }
            else if (mode === 'ghost')   { vr.isolateDbIds(startedIds); vr.setGhosting(true); }
            else                         { vr.showAll(); }
            vr.applyThemingBatch(colorMap);
          } else {
            vr.showAll(); vr.clearHighlights();
          }
        }

        _tickCount++;
        const tickMs = (performance.now() - t0tick).toFixed(1);

        // Log cada 2s para no saturar la consola
        if (now - _lastLogTs > 2000) {
          _lastLogTs = now;
          console.debug(
            `[4D][PLAY] día ${t.toFixed(1)}/${totalDays} | ` +
            `ticks: ${_tickCount} | activos: ${totalNodes} nodos | ` +
            `GPU: ${gpuEmitted ? 'emit' : 'skip'} | tick: ${tickMs}ms`
          );
          _tickCount = 0;
        }

        if (t >= totalDays) {
          setIsPlaying(false); playRef.current = false; rafIdRef.current = null;
          vr.clearHighlights(); vr.showAll();
          console.info(`[4D][PLAY] Reproducción terminada`);
          return;
        }
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [viewerRef, isPlaying, totalDays]);

  // ── Stop: cancelar RAF, restaurar colores originales y volver a día 0 ────────
  const handleStop = useCallback(() => {
    playRef.current = false;
    if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    setIsPlaying(false);
    playAccColRef.current = new Map();
    playPrevTRef.current  = 0;
    setCurrentDay(0); currentDayRef.current = 0;
    // Restaurar colores originales inmediatamente
    const vr = viewerRef.current;
    if (vr) { vr.clearHighlights(); vr.showAll(); }
  }, [viewerRef]);

  // ── Step backward / forward 1 día ────────────────────────────────────────
  const handleStepBack = useCallback(async () => {
    if (isPlaying) return;
    const newDay = Math.max(0, currentDayRef.current - 1);
    setCurrentDay(newDay); currentDayRef.current = newDay;
    await applyDay(newDay);
  }, [isPlaying, applyDay]);

  const handleStepForward = useCallback(async () => {
    if (isPlaying) return;
    const newDay = Math.min(totalDays, currentDayRef.current + 1);
    setCurrentDay(newDay); currentDayRef.current = newDay;
    await applyDay(newDay);
  }, [isPlaying, totalDays, applyDay]);

  const handleGroupDragEnd = (e: any) => { const { active, over } = e; if (!over || active.id === over.id) return; const oi = groups.findIndex(g => g.id === active.id); const ni = groups.findIndex(g => g.id === over.id); save(arrayMove(groups, oi, ni)); };
  const handleTagDragEnd = (gId: string, e: any) => { const { active, over } = e; if (!over) return; const g = groups.find(x => x.id === gId); if (!g) return; const oi = g.tags.findIndex(t => t.id === active.id); const ni = g.tags.findIndex(t => t.id === over.id); save(groups.map(x => x.id === gId ? { ...x, tags: arrayMove(x.tags, oi, ni) } : x)); };
  const handleTagDuration = (gId: string, tId: string, v: number) => save(groups.map(g => g.id !== gId ? g : { ...g, tags: g.tags.map(t => t.id === tId ? { ...t, duration: v } : t) }));
  const handleTagVisibility = (gId: string, tId: string) => save(groups.map(g => g.id !== gId ? g : { ...g, tags: g.tags.map(t => t.id === tId ? { ...t, visible: !t.visible } : t) }));
  const handleTagDelete = (gId: string, tId: string) => save(groups.map(g => g.id !== gId ? g : { ...g, tags: g.tags.filter(t => t.id !== tId) }));
  const handleGroupDelete = (gId: string) => save(groups.filter(g => g.id !== gId));
  const handleGroupToggle = (gId: string) => save(groups.map(g => g.id === gId ? { ...g, collapsed: !g.collapsed } : g));

  // ── Sub-group split / remove ──────────────────────────────────────────────
  const handleSplitGroup = (gId: string, n: number) => {
    const g = groups.find(x => x.id === gId); if (!g || n < 1 || !g.tags.length) return;
    const size = Math.ceil(g.tags.length / n);
    const ts = Date.now();
    const subGroups: SeqSubGroup[] = Array.from({ length: n }, (_, i) => ({
      id: `sg_${gId}_${i}_${ts}`,
      name: `Grupo ${i + 1}`,
      tagIds: g.tags.slice(i * size, (i + 1) * size).map(t => t.id),
    })).filter(sg => sg.tagIds.length > 0);
    save(groups.map(x => x.id === gId ? { ...x, subGroups } : x));
  };

  const handleRemoveSubGroups = (gId: string) =>
    save(groups.map(x => x.id === gId ? { ...x, subGroups: undefined } : x));

  // Resize/move group bar → redistribute tags proportionally (mantiene fracciones sub-día)
  const handleGroupResize = (gId: string, newTotalDays: number) => {
    const g = groups.find(x => x.id === gId); if (!g || !g.tags.length) return;
    const old = g.tags.reduce((s, t) => s + t.duration, 0) || newTotalDays;
    const minD = 0.001;
    let rem = Math.max(minD * g.tags.length, newTotalDays);
    const tags = g.tags.map((t, i) => {
      if (i === g.tags.length - 1) return { ...t, duration: Math.max(minD, rem) };
      const d = Math.max(minD, t.duration / old * newTotalDays);
      rem -= d; return { ...t, duration: d };
    });
    save(groups.map(x => x.id === gId ? { ...x, tags } : x));
  };

  // Resize CWP section bar — proportionally scales all child IWPs and their TAGs
  const handleSectionResize = (sectionId: string, newTotalDays: number) => {
    const sGroups = groups.filter(g => g.sectionId === sectionId);
    if (!sGroups.length) return;
    const oldTotal = sGroups.reduce((s, g) => s + g.tags.reduce((ts, t) => ts + t.duration, 0), 0) || newTotalDays;
    const minD = 0.001;
    const newGroups = groups.map(g => {
      if (g.sectionId !== sectionId) return g;
      const gOld = g.tags.reduce((s, t) => s + t.duration, 0) || 1;
      const gNew = Math.max(minD * g.tags.length, gOld / oldTotal * newTotalDays);
      let rem = gNew;
      const tags = g.tags.map((t, i) => {
        if (i === g.tags.length - 1) return { ...t, duration: Math.max(minD, rem) };
        const d = Math.max(minD, t.duration / gOld * gNew);
        rem -= d; return { ...t, duration: d };
      });
      return { ...g, tags };
    });
    save(newGroups);
  };

  // Resize individual tag bar (permite sub-día)
  const handleTagResize = (gId: string, tId: string, newDuration: number) =>
    save(groups.map(g => g.id !== gId ? g : { ...g, tags: g.tags.map(t => t.id !== tId ? t : { ...t, duration: Math.max(0.001, newDuration) }) }));

  // Move tag (shift start by absorbing/giving duration to neighbour)
  const handleTagMove = (gId: string, tId: string, delta: number) => {
    const g = groups.find(x => x.id === gId); if (!g) return;
    const ti = g.tags.findIndex(t => t.id === tId); if (ti < 0) return;
    const tags = g.tags.map(t => ({ ...t }));
    // Moving right: shorten previous tag, lengthen current
    // Moving left: lengthen previous tag, shorten current
    if (delta > 0 && ti > 0) {
      tags[ti - 1].duration = Math.max(1, tags[ti - 1].duration + delta);
      tags[ti].duration     = Math.max(1, tags[ti].duration - delta);
    } else if (delta < 0 && ti > 0) {
      tags[ti - 1].duration = Math.max(1, tags[ti - 1].duration + delta);
      tags[ti].duration     = Math.max(1, tags[ti].duration - delta);
    }
    save(groups.map(x => x.id === gId ? { ...x, tags } : x));
  };

  const importFromBim = async () => {
    setImporting(true);
    try {
      const sb = createClient() as any;
      const { data } = await sb.from('projects').select('module_config').eq('id', projectId).single();
      const bl = data?.module_config?.bim_linker; if (!bl) return;
      if (bl.parentCol || bl.treeCol || bl.keyCol) {
        setLevelNames({ cwp: bl.parentCol || 'CWP', iwp: bl.treeCol || 'IWP', tag: bl.keyCol || 'TAG' });
      }
      setSectionOrder([]); setCollapsedSections(new Set());
      const imported = buildGroupsFromBimLinker(bl);
      if (imported.length) save(imported);
    } finally { setImporting(false); }
  };

  // ── Expand/collapse — 3 niveles jerárquicos ──────────────────────────────
  // Nivel 1 (CWP): solo secciones visibles, grupos y tags ocultos
  const collapseToNivel = () => {
    const allSecs = [...new Set(groups.map(g => g.sectionId || '').filter(Boolean))];
    setCollapsedSections(new Set(allSecs));
    save(groups.map(g => ({ ...g, collapsed: true })));
  };
  // Nivel 2 (IWP): secciones + grupos visibles, tags ocultos
  const collapseToIwp = () => {
    setCollapsedSections(new Set());
    save(groups.map(g => ({ ...g, collapsed: true })));
  };
  // Nivel 3 (TAG): todo visible
  const expandToTag = () => {
    setCollapsedSections(new Set());
    save(groups.map(g => ({ ...g, collapsed: false })));
  };

  const hasSections  = groups.some(g => !!g.sectionId);
  const isAtNivelLevel = hasSections && collapsedSections.size > 0;
  const isAtIwpLevel   = !isAtNivelLevel && groups.length > 0 && groups.every(g =>  g.collapsed);
  const isAtTagLevel   = !isAtNivelLevel && groups.length > 0 && groups.every(g => !g.collapsed);

  const totalCwps = effectiveSectionOrder.length;
  const totalIwps = groups.length;
  const totalTags = groups.reduce((s, g) => s + g.tags.length, 0);

  // ── Limpiar programa ──────────────────────────────────────────────────────
  const clearSchedule = () => {
    save([]);
    setSectionOrder([]);
    setCollapsedSections(new Set());
    setClearConfirm(false);
  };

  // ── Resequenciar: redistribuye duraciones proporcionalmente en el orden actual ──
  const resequence = useCallback(() => {
    const CWP_DAYS = 91;
    const cwpMap: Record<string, SeqGroup[]> = {};
    groups.forEach(g => {
      const k = g.sectionId || 'General';
      if (!cwpMap[k]) cwpMap[k] = [];
      cwpMap[k].push(g);
    });
    const newGroups: SeqGroup[] = [];
    effectiveSectionOrder.forEach(sectionId => {
      const iwps = cwpMap[sectionId]; if (!iwps) return;
      const iwpDays = CWP_DAYS / iwps.length;
      iwps.forEach(g => {
        const tagDays = iwpDays / (g.tags.length || 1);
        newGroups.push({ ...g, tags: g.tags.map(t => ({ ...t, duration: tagDays })) });
      });
    });
    // Append any groups without a section (shouldn't exist but guard anyway)
    groups.forEach(g => { if (!g.sectionId && !newGroups.find(x => x.id === g.id)) newGroups.push(g); });
    setSectionOrder(effectiveSectionOrder);
    save(newGroups);
  }, [groups, effectiveSectionOrder, save]);

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── Toolbar row 1: vista + fecha + zoom + niveles ──────────────── */}
      <div className="shrink-0 px-3 py-1.5 border-b flex items-center gap-2 bg-white flex-wrap">

        {/* Vista */}
        <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5 shrink-0">
          <button onClick={() => setViewMode('list')}  className={`px-2 py-1 text-[9px] font-black rounded-md transition ${viewMode==='list'  ? 'bg-white shadow text-slate-700':'text-slate-400 hover:text-slate-600'}`}><List size={10} className="inline mr-0.5"/>Lista</button>
          <button onClick={() => setViewMode('gantt')} className={`px-2 py-1 text-[9px] font-black rounded-md transition ${viewMode==='gantt' ? 'bg-white shadow text-slate-700':'text-slate-400 hover:text-slate-600'}`}><BarChart2 size={10} className="inline mr-0.5"/>Gantt</button>
        </div>

        {/* Fecha inicio */}
        {viewMode === 'gantt' && (
          <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-2 h-7 shrink-0">
            <CalendarDays size={9} className="text-slate-400" />
            <input type="date" value={projectStart}
              onChange={e => { setProjectStart(e.target.value); save(groups, e.target.value); }}
              className="text-[9px] font-mono text-slate-600 bg-transparent outline-none w-24" />
          </div>
        )}

        {/* Zoom presets */}
        {viewMode === 'gantt' && (
          <>
            <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5 shrink-0">
              {ZOOM_PRESETS.map(z => (
                <button key={z.label} onClick={() => setPxPerDay(z.pxPerDay)}
                  className={`px-2 py-1 text-[9px] font-black rounded-md transition ${pxPerDay===z.pxPerDay?'bg-white shadow text-slate-700':'text-slate-400 hover:text-slate-600'}`}>
                  {z.label}
                </button>
              ))}
            </div>
            <div className="flex border border-slate-200 rounded-lg overflow-hidden shrink-0">
              <button onClick={() => setPxPerDay(p => Math.max(1, p-1))} className="w-6 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100"><ZoomOut size={10}/></button>
              <button onClick={() => setPxPerDay(p => Math.min(40, p+1))} className="w-6 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-100"><ZoomIn size={10}/></button>
            </div>
          </>
        )}

        {/* Expand / Collapse — 3 niveles jerárquicos */}
        {groups.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[8px] text-slate-400 font-bold shrink-0">Niveles:</span>
            {hasSections && (
              <button
                onClick={collapseToNivel}
                title={`Solo ${levelNames.cwp}`}
                className={`flex items-center gap-0.5 px-2 py-1 rounded-lg border text-[9px] font-black transition ${isAtNivelLevel ? 'border-[#0C1E4F] bg-[#0C1E4F] text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                <ChevronRight size={9}/> {levelNames.cwp}
              </button>
            )}
            <button
              onClick={collapseToIwp}
              title={`${levelNames.cwp} + ${levelNames.iwp}`}
              className={`flex items-center gap-0.5 px-2 py-1 rounded-lg border text-[9px] font-black transition ${isAtIwpLevel ? 'border-[#0C1E4F] bg-[#0C1E4F] text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              <ChevronRight size={9}/> {levelNames.iwp}
            </button>
            <button
              onClick={expandToTag}
              title={`${levelNames.cwp} + ${levelNames.iwp} + ${levelNames.tag}`}
              className={`flex items-center gap-0.5 px-2 py-1 rounded-lg border text-[9px] font-black transition ${isAtTagLevel ? 'border-[#0C1E4F] bg-[#0C1E4F] text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              <ChevronDown size={9}/> {levelNames.tag}
            </button>
          </div>
        )}

        {/* Stats — 3 niveles */}
        {groups.length > 0 && (
          <span className="text-[8px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
            {hasSections ? `${totalCwps} ${levelNames.cwp} · ` : ''}{totalIwps} {levelNames.iwp} · {totalTags} {levelNames.tag} · {Math.round(totalDays)}d
          </span>
        )}

        <div className="flex-1" />

        {/* Limpiar programa */}
        {groups.length > 0 && (
          clearConfirm ? (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[8px] text-red-500 font-black">¿Limpiar todo?</span>
              <button onClick={clearSchedule} className="px-2 py-1 bg-red-500 text-white rounded-lg text-[9px] font-black hover:bg-red-600">Sí</button>
              <button onClick={() => setClearConfirm(false)} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black hover:bg-slate-200">No</button>
            </div>
          ) : (
            <button onClick={() => setClearConfirm(true)} className="flex items-center gap-1 px-3 py-1 bg-red-50 text-red-500 border border-red-200 rounded-lg text-[9px] font-black hover:bg-red-100 shrink-0">
              <RotateCcw size={10}/> Limpiar
            </button>
          )
        )}

        {/* Resequenciar */}
        {groups.length > 0 && hasSections && (
          <button onClick={resequence} className="flex items-center gap-1 px-3 py-1 bg-violet-50 text-violet-600 border border-violet-200 rounded-lg text-[9px] font-black hover:bg-violet-100 shrink-0">
            <RefreshCw size={10}/> Resequenciar
          </button>
        )}

        {/* Import */}
        <button onClick={importFromBim} disabled={importing} className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-[9px] font-black hover:bg-blue-100 shrink-0">
          {importing ? <Loader2 size={10} className="animate-spin"/> : <Download size={10}/>} Importar BIM
        </button>

        {/* Guardar en servidor */}
        {groups.length > 0 && (
          <button
            onClick={saveToServer}
            disabled={saving}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg text-[9px] font-black border shrink-0 transition ${
              savedOk
                ? 'bg-green-50 text-green-600 border-green-300'
                : 'bg-[#0C1E4F] text-white border-[#0C1E4F] hover:bg-blue-800'
            }`}
          >
            {saving
              ? <><Loader2 size={10} className="animate-spin"/> Guardando…</>
              : savedOk
              ? <>✓ Guardado</>
              : <>💾 Guardar</>}
          </button>
        )}
      </div>

      {/* ── Transport Bar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 py-1.5 border-b flex items-center gap-2 bg-gradient-to-r from-[#0C1E4F]/5 to-transparent">

        {/* Stop */}
        <button onClick={handleStop} title="Detener y volver al inicio"
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 transition shrink-0">
          <Square size={10} fill="currentColor" />
        </button>

        {/* Step back */}
        <button onClick={handleStepBack} disabled={isPlaying} title="Retroceder 1 día"
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0">
          <Rewind size={11} />
        </button>

        {/* Play / Pause */}
        <button onClick={handlePlay} title={isPlaying ? 'Pausar' : 'Reproducir'}
          className={`w-9 h-7 flex items-center justify-center rounded-lg font-black text-white transition shadow shrink-0 ${isPlaying ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#0C1E4F] hover:bg-blue-700'}`}>
          {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        </button>

        {/* Step forward */}
        <button onClick={handleStepForward} disabled={isPlaying} title="Avanzar 1 día"
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0">
          <FastForward size={11} />
        </button>

        {/* Indicador día */}
        <div className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-lg shrink-0">
          <span className="text-[8px] font-black text-slate-400 uppercase">Día</span>
          <span className="text-[11px] font-black text-[#0C1E4F] tabular-nums w-10 text-right">{Math.round(currentDay)}</span>
          <span className="text-[8px] text-slate-300 font-bold">/ {totalDays}</span>
        </div>

        {/* Scrubber slider */}
        <div
          className="flex-1 mx-1 relative h-6 flex items-center cursor-pointer group/slider"
          onClick={e => {
            if (isPlaying) return;
            const rect   = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const newDay = Math.max(0, Math.min(totalDays, (e.clientX - rect.left) / rect.width * totalDays));
            setCurrentDay(newDay); currentDayRef.current = newDay;
            applyDay(newDay);
          }}
        >
          <div className="w-full h-1.5 bg-slate-200 rounded-full group-hover/slider:h-2 transition-all overflow-visible relative">
            <div className="h-full bg-[#0C1E4F] rounded-full"
              style={{ width: `${totalDays > 0 ? Math.min(100, (currentDay / totalDays) * 100) : 0}%` }} />
          </div>
          {/* Thumb */}
          <div className="absolute w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white shadow-md pointer-events-none"
            style={{ left: `calc(${totalDays > 0 ? Math.min(100, (currentDay / totalDays) * 100) : 0}% - 7px)` }} />
        </div>

        {/* Agrupar (Horizonte) */}
        <select
          value={horizon}
          onChange={(e) => setHorizon(e.target.value as any)}
          disabled={isPlaying}
          className="bg-white text-[10px] font-black text-slate-600 border border-slate-200 rounded px-1.5 py-1 outline-none cursor-pointer hover:bg-slate-50 shrink-0"
        >
          <option value="daily">Diario</option>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensual</option>
        </select>

        {/* Tiempo (Step Seconds) */}
        <select
          value={stepSeconds}
          onChange={(e) => setStepSeconds(Number(e.target.value))}
          disabled={isPlaying}
          className="bg-white text-[10px] font-black text-slate-600 border border-slate-200 rounded px-1.5 py-1 outline-none cursor-pointer hover:bg-slate-50 shrink-0"
        >
          <option value={0.5}>0.5s / paso</option>
          <option value={1}>1s / paso</option>
          <option value={2}>2s / paso</option>
          <option value={3}>3s / paso</option>
          <option value={5}>5s / paso</option>
        </select>

        {/* Play mode — 3 botones sincronizados con el visor */}
        <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5 shrink-0">
          {([['isolate','Aislar'],['ghost','Fantasma'],['all','Todo']] as const).map(([m, label]) => (
            <button key={m} onClick={() => {
              setPlayMode(m);
              playModeRef.current = m;
              if (!playRef.current) applyDay(currentDayRef.current);
            }}
              className={`px-2 py-1 rounded-md text-[9px] font-black transition ${playMode === m ? 'bg-white shadow text-[#0C1E4F]' : 'text-slate-400 hover:text-slate-600'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Indexing indicator */}
        {indexing && (
          <span className="text-[8px] text-blue-500 font-black animate-pulse shrink-0 flex items-center gap-1">
            <Loader2 size={9} className="animate-spin" /> Indexando…
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {viewMode === 'gantt' ? (
          <GanttView
            groups={scheduled}
            totalDays={totalDays}
            pxPerDay={pxPerDay}
            currentDay={currentDay}
            activeTagId={activeTagId}
            projectStart={new Date(projectStart)}
            collapsedSections={collapsedSections}
            sectionOrder={effectiveSectionOrder}
            levelNames={levelNames}
            onGroupResize={handleGroupResize}
            onSectionResize={handleSectionResize}
            onSectionToggle={toggleSection}
            onSectionMove={moveSection}
            onGroupMove={(id, d) => save(groups.map(g => g.id === id ? { ...g, startOffset: (g.startOffset || 0) + d } : g))}
            onGroupToggle={handleGroupToggle}
            onTagResize={handleTagResize}
            onTagMove={handleTagMove}
            onScrub={day => { setCurrentDay(day); currentDayRef.current = day; }}
            onScrubEnd={day => { setCurrentDay(day); currentDayRef.current = day; applyDay(day); }}
            onSplitGroup={handleSplitGroup}
            onRemoveSubGroups={handleRemoveSubGroups} />
        ) : (
          <div className="h-full overflow-y-auto">
            <DndContext sensors={groupSensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
              <SortableContext items={groups.map(g => g.id)} strategy={verticalListSortingStrategy}>
                {scheduled.map(g => (
                  <SortableGroupRow key={g.id} group={g} scheduled={g} activeGroupId={activeGroupId} activeTagId={activeTagId} tagSensors={tagSensors} onTagDragEnd={handleTagDragEnd} onTagDuration={handleTagDuration} onTagVisibility={handleTagVisibility} onTagDelete={handleTagDelete} onGroupDelete={handleGroupDelete} onGroupToggle={handleGroupToggle} onSplitGroup={handleSplitGroup} onRemoveSubGroups={handleRemoveSubGroups} />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>
    </div>
  );
}
