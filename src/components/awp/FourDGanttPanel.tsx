'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, ZoomIn, ZoomOut, Maximize2,
  Save, Play, Zap, AlignLeft, Loader2, Search, X, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SequenceActivity } from './Bim4DPlayer';
import type { ForgeViewerHandle } from './ForgeViewer';
import type { BimConfig } from '@/components/modules/BimConfigModal';

// ─── Types ────────────────────────────────────────────────────────────────────
type Nivel = 'cwa' | 'cv' | 'cwp' | 'swp';
interface DateEntry { start: string; end: string; }
interface GItem {
  code: string;
  name: string;
  color: string;
  nElem: number;
  defStart?: string | null;
  defEnd?:   string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DAY_MS  = 86_400_000;
const ROW_H   = 38;
const HDR_H   = 52;
const PALETTE = ['#1565C0','#E65100','#2E7D32','#6A1B9A','#00695C','#AD1457','#F9A825','#4527A0','#558B2F','#0277BD','#C62828','#00838F'];
const MESES   = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function msToStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
function strToMs(s: string): number {
  return s ? new Date(s + 'T00:00:00Z').getTime() : NaN;
}
function fmtD(ms: number): string {
  if (isNaN(ms)) return '—';
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function snapDay(ms: number): number {
  return Math.round(ms / DAY_MS) * DAY_MS;
}
function colorIdx(i: number): string { return PALETTE[i % PALETTE.length]; }
function daysBetween(a: number, b: number): number { return Math.round((b - a) / DAY_MS); }

// ─── Month/week header ────────────────────────────────────────────────────────
function TimelineHeader({ vsMs, veMs }: { vsMs: number; veMs: number }) {
  const totalMs = veMs - vsMs;
  const months: { label: string; lPct: number; wPct: number }[] = [];
  let c = new Date(vsMs); c.setUTCDate(1);
  while (+c < veMs) {
    const ms = Math.max(+c, vsMs);
    const nc = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1));
    const me = Math.min(+nc, veMs);
    const l  = ((ms - vsMs) / totalMs) * 100;
    const w  = ((me - ms) / totalMs) * 100;
    if (w > 0.3) months.push({ label: `${MESES[c.getUTCMonth()]} ${c.getUTCFullYear()}`, lPct: l, wPct: w });
    c = nc;
  }

  // Week separators
  const weeks: number[] = [];
  let wk = new Date(vsMs);
  const dow = wk.getUTCDay();
  if (dow !== 1) wk.setUTCDate(wk.getUTCDate() + ((8 - dow) % 7 || 7));
  while (+wk < veMs) {
    weeks.push(((+wk - vsMs) / totalMs) * 100);
    wk = new Date(+wk + 7 * DAY_MS);
  }

  return (
    <div className="relative shrink-0 bg-[#0a1628] border-b border-white/10" style={{ height: HDR_H }}>
      {months.map((m, i) => (
        <div key={i} className="absolute top-0 bottom-0 border-l border-white/10 first:border-0 flex items-center px-2"
          style={{ left: `${m.lPct}%`, width: `${m.wPct}%` }}>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate select-none">
            {m.wPct > 4 ? m.label : m.label.slice(0, 3)}
          </span>
        </div>
      ))}
      {weeks.map((pct, i) => (
        <div key={i} className="absolute top-7 bottom-0 w-px bg-white/[0.06]" style={{ left: `${pct}%` }} />
      ))}
    </div>
  );
}

// ─── Week-band background ──────────────────────────────────────────────────────
function WeekBands({ vsMs, veMs, h }: { vsMs: number; veMs: number; h: number }) {
  const total = veMs - vsMs;
  const bands: { l: number; w: number; even: boolean }[] = [];
  let wk = new Date(vsMs);
  const dow = wk.getUTCDay();
  if (dow !== 1) wk.setUTCDate(wk.getUTCDate() - ((dow + 6) % 7));
  let even = false;
  while (+wk < veMs) {
    const ws = Math.max(+wk, vsMs);
    const we = Math.min(+wk + 7 * DAY_MS, veMs);
    const l = ((ws - vsMs) / total) * 100;
    const w = ((we - ws) / total) * 100;
    if (w > 0) bands.push({ l, w, even });
    even = !even;
    wk = new Date(+wk + 7 * DAY_MS);
  }

  // Month separator lines
  const monthLines: number[] = [];
  let mc = new Date(vsMs); mc.setUTCDate(1);
  while (+mc < veMs) {
    monthLines.push(((+mc - vsMs) / total) * 100);
    mc = new Date(Date.UTC(mc.getUTCFullYear(), mc.getUTCMonth() + 1, 1));
  }

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ height: h }}>
      {bands.map((b, i) => b.even
        ? <div key={i} className="absolute top-0 bottom-0 bg-white/[0.018]" style={{ left: `${b.l}%`, width: `${b.w}%` }} />
        : null
      )}
      {monthLines.map((pct, i) => (
        <div key={i} className="absolute top-0 bottom-0 w-px bg-white/10" style={{ left: `${pct}%` }} />
      ))}
    </div>
  );
}

// ─── Gantt bar ────────────────────────────────────────────────────────────────
interface BarProps {
  item: GItem;
  entry: DateEntry;
  vsMs: number;
  veMs: number;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent, code: string, t: 'move'|'left'|'right') => void;
}

function GanttBar({ item, entry, vsMs, veMs, isDragging, onMouseDown }: BarProps) {
  const sMs = strToMs(entry.start);
  const eMs = strToMs(entry.end);
  if (isNaN(sMs) || isNaN(eMs)) return null;

  const total   = veMs - vsMs;
  const lPct    = ((sMs - vsMs) / total) * 100;
  const rPct    = ((eMs - vsMs) / total) * 100;
  const wPct    = rPct - lPct;
  const days    = daysBetween(sMs, eMs);

  // Clip to visible range
  const clL = Math.max(0, lPct);
  const clR = Math.min(100, rPct);
  if (clR <= 0 || clL >= 100) return null;

  return (
    <div
      className="absolute inset-y-1.5 rounded-lg group select-none"
      style={{
        left:  `${clL}%`,
        width: `${Math.max(0.3, clR - clL)}%`,
        background: `linear-gradient(180deg, ${item.color}ee 0%, ${item.color}bb 100%)`,
        boxShadow: isDragging
          ? `0 0 0 2px ${item.color}, 0 4px 20px ${item.color}60`
          : `0 0 0 1px ${item.color}60, inset 0 1px 0 rgba(255,255,255,0.18)`,
        cursor: isDragging ? 'grabbing' : 'grab',
        transition: isDragging ? 'none' : 'box-shadow 0.15s',
        zIndex: isDragging ? 10 : 1,
      }}
      onMouseDown={e => { e.preventDefault(); onMouseDown(e, item.code, 'move'); }}
      title={`${item.code}\n${fmtD(sMs)} → ${fmtD(eMs)} (${days} días)`}
    >
      {/* Left resize grip */}
      {lPct >= 0 && (
        <div
          className="absolute left-0 top-0 bottom-0 w-3 rounded-l-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-ew-resize z-10 hover:bg-black/20"
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onMouseDown(e, item.code, 'left'); }}
        >
          <div className="flex gap-[2px] pointer-events-none">
            <div className="w-[1.5px] h-3.5 bg-white/50 rounded-full" />
            <div className="w-[1.5px] h-3.5 bg-white/50 rounded-full" />
          </div>
        </div>
      )}

      {/* Label */}
      <div className="absolute inset-0 flex items-center gap-2 px-3 pointer-events-none overflow-hidden">
        <span className="text-[10px] font-black text-white truncate leading-none">{item.code}</span>
        {wPct > 9 && <span className="text-[9px] text-white/60 truncate hidden xl:block">{item.name}</span>}
        {wPct > 14 && <span className="ml-auto text-[9px] text-white/50 font-mono shrink-0">{days}d</span>}
      </div>

      {/* Dates tooltip on hover */}
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#0a1628] border border-white/15 rounded px-2 py-0.5 text-[8px] text-white/80 whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-20">
        {fmtD(sMs)} → {fmtD(eMs)}
      </div>

      {/* Right resize grip */}
      {rPct <= 100 && (
        <div
          className="absolute right-0 top-0 bottom-0 w-3 rounded-r-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-ew-resize z-10 hover:bg-black/20"
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onMouseDown(e, item.code, 'right'); }}
        >
          <div className="flex gap-[2px] pointer-events-none">
            <div className="w-[1.5px] h-3.5 bg-white/50 rounded-full" />
            <div className="w-[1.5px] h-3.5 bg-white/50 rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────
interface FourDGanttPanelProps {
  projectId: string;
  onGenerate: (activities: SequenceActivity[]) => void;
  viewerRef?: React.RefObject<ForgeViewerHandle | null>;
  bimConfig?: BimConfig | null;
}

export default function FourDGanttPanel({ projectId, onGenerate, viewerRef, bimConfig }: FourDGanttPanelProps) {
  // Layout
  const [collapsed, setCollapsed] = useState(false);
  const [panelH, setPanelH]       = useState(340);

  // Data
  const [nivel, setNivel]     = useState<Nivel>('cwp');
  const [items, setItems]     = useState<GItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState('');

  // Selection (which items appear in timeline)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Schedule
  const [schedule, setSchedule] = useState<Record<string, DateEntry>>({});
  const [saving, setSaving]     = useState(false);
  const [savedOk, setSavedOk]   = useState(false);

  // Generate
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg]         = useState('');

  // Session-linked elements: user selects elements in Forge viewer → links them permanently to a CWP
  // Stored as dbIds (Forge internal IDs) — highest-priority override in generate().
  // Also saved to mining_elementos DB so Minería view and future sessions use the same links.
  const [sessionLinks, setSessionLinks] = useState<Record<string, number[]>>({});
  const [viewerSelCount, setViewerSelCount] = useState(0);
  const [linking, setLinking]             = useState<string | null>(null); // code being linked

  // Poll viewer selection count so the "link" button pulses when there's a selection
  useEffect(() => {
    const interval = setInterval(() => {
      const count = viewerRef?.current?.getSelectedIds().length ?? 0;
      setViewerSelCount(count);
    }, 600);
    return () => clearInterval(interval);
  }, [viewerRef]);

  const linkSelectionToItem = useCallback(async (code: string) => {
    const vr = viewerRef?.current;
    if (!vr) return;
    const dbIds = vr.getSelectedIds();
    if (!dbIds.length) return;

    // 1. Store in session immediately for instant 4D effect
    setSessionLinks(prev => ({ ...prev, [code]: dbIds }));
    setLinking(code);

    // 2. Save permanently to DB so Minería view also sees the link
    try {
      const model = (vr as any).getModel?.();
      if (model?.getExternalIdMapping) {
        const mapping: Record<string, number> = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('timeout')), 20000);
          model.getExternalIdMapping(
            (m: Record<string, number>) => { clearTimeout(t); resolve(m); },
            (e: any)                    => { clearTimeout(t); reject(e); }
          );
        });
        // Invert: dbId → externalId (= sp3d_moniker)
        const inv: Record<number, string> = {};
        for (const [eid, id] of Object.entries(mapping)) inv[id] = eid;
        const monikers = dbIds.map(id => inv[id]).filter((m): m is string => !!m);
        if (monikers.length) {
          await fetch('/api/mining-elementos/vincular-al-cwp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, nivel, codigo: code, monikers }),
          });
        }
      }
    } catch { /* ignore DB error — session link still works */ }
    finally { setLinking(null); }
  }, [viewerRef, projectId, nivel]);

  // Timeline view range
  const todayMs = useMemo(() => {
    const d = new Date(); d.setUTCHours(0,0,0,0); return +d;
  }, []);

  const [vsMs, setVsMs] = useState(() => {
    const d = new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
    return +d;
  });
  const [veMs, setVeMs] = useState(() => {
    const d = new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 13);
    return +d;
  });

  // Drag state (all refs to avoid stale closures)
  const timelineRef    = useRef<HTMLDivElement>(null);
  const dragRef        = useRef<{
    code: string; type: 'move'|'left'|'right';
    startX: number; origS: number; origE: number;
  } | null>(null);
  const rafRef         = useRef<number | null>(null);
  const viewRef        = useRef({ vsMs, veMs });
  viewRef.current      = { vsMs, veMs };
  const [dragging, setDragging] = useState<string | null>(null);

  // Panel resize
  const panelResizeRef = useRef<{ startY: number; startH: number } | null>(null);

  // Synced scroll
  const listRef     = useRef<HTMLDivElement>(null);
  const rowsRef     = useRef<HTMLDivElement>(null);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setItems([]);
    setSelected(new Set());

    Promise.all([
      fetch(`/api/mining-data?project_id=${projectId}`).then(r => r.json()),
      fetch(`/api/4d-schedule?project_id=${projectId}&nivel=${nivel}`).then(r => r.json()),
    ]).then(([md, sd]) => {
      const saved: Record<string, DateEntry> = sd.schedule ?? {};
      setSchedule(saved);

      let newItems: GItem[] = [];

      if (nivel === 'cwp') {
        newItems = (md.cwp ?? []).map((c: any, i: number) => ({
          code: c.cwp, name: c.nombre, color: c.color ?? colorIdx(i),
          nElem: c.nElementos ?? 0,
          defStart: c.prog?.start, defEnd: c.prog?.end,
        }));
      } else if (nivel === 'cwa') {
        const seen = new Set<string>();
        (md.cwa ?? []).forEach((c: any, i: number) => {
          if (seen.has(c.cwa)) return; seen.add(c.cwa);
          newItems.push({ code: c.cwa, name: c.name, color: colorIdx(i), nElem: 0 });
        });
      } else if (nivel === 'cv') {
        const m = new Map<string, GItem>();
        for (const c of (md.cwp ?? [])) {
          if (!c.cv) continue;
          if (!m.has(c.cv)) m.set(c.cv, { code: c.cv, name: c.cvName || c.cv, color: colorIdx(m.size), nElem: 0 });
          m.get(c.cv)!.nElem += c.nElementos ?? 0;
        }
        newItems = [...m.values()];
      }

      // SWP handled separately
      if (nivel === 'swp') {
        fetch(`/api/mining-sistemas?project_id=${projectId}`).then(r => r.json()).then(d => {
          let idx = 0;
          const sw: GItem[] = [];
          for (const s of (d.sistemas ?? []))
            for (const sub of (s.subsistemas ?? []))
              sw.push({ code: sub.swp_id, name: sub.nombre_swp || sub.swp_id, color: colorIdx(idx++), nElem: sub.n_elementos_modelo ?? 0 });
          setItems(sw);
          const preSel = new Set(Object.keys(saved).filter(k => sw.some(it => it.code === k)));
          if (preSel.size) setSelected(preSel);
        });
        setLoading(false);
        return;
      }

      setItems(newItems);

      // Pre-select items with saved dates
      const preSel = new Set(Object.keys(saved).filter(k => newItems.some(it => it.code === k)));
      if (preSel.size) setSelected(preSel);

      // Fit view to saved schedule
      const allMs = Object.values(saved).flatMap(e => [strToMs(e.start), strToMs(e.end)]).filter(ms => !isNaN(ms));
      if (allMs.length >= 2) {
        const pad = 45 * DAY_MS;
        setVsMs(Math.min(...allMs) - pad);
        setVeMs(Math.max(...allMs) + pad);
      }
    }).finally(() => setLoading(false));
  }, [nivel, projectId]);

  // ── Drag global events ─────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !timelineRef.current) return;
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const drag = dragRef.current;
        if (!drag || !timelineRef.current) return;

        const { vsMs: vs, veMs: ve } = viewRef.current;
        const W        = timelineRef.current.getBoundingClientRect().width;
        const deltaMs  = snapDay(((e.clientX - drag.startX) / W) * (ve - vs));

        let s = drag.origS, en = drag.origE;
        if      (drag.type === 'move')  { s = s + deltaMs;                             en = en + deltaMs; }
        else if (drag.type === 'left')  { s = Math.min(s + deltaMs, en - DAY_MS); }
        else                            { en = Math.max(en + deltaMs, s + DAY_MS); }

        setSchedule(prev => ({ ...prev, [drag.code]: { start: msToStr(s), end: msToStr(en) } }));
      });
    };

    const onUp = () => {
      dragRef.current = null;
      setDragging(null);
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []); // empty deps — uses refs only

  const onBarMouseDown = useCallback((e: React.MouseEvent, code: string, type: 'move'|'left'|'right') => {
    const entry = schedule[code];
    if (!entry) return;
    dragRef.current = { code, type, startX: e.clientX, origS: strToMs(entry.start), origE: strToMs(entry.end) };
    setDragging(code);
  }, [schedule]);

  // ── Panel resize ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panelResizeRef.current) return;
      const delta = panelResizeRef.current.startY - e.clientY;
      setPanelH(Math.max(180, Math.min(580, panelResizeRef.current.startH + delta)));
    };
    const onUp = () => { panelResizeRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // ── Scroll sync ────────────────────────────────────────────────────────────
  const syncScroll = useCallback((src: 'list'|'rows', top: number) => {
    if (src === 'list' && rowsRef.current)  rowsRef.current.scrollTop  = top;
    if (src === 'rows' && listRef.current)  listRef.current.scrollTop  = top;
  }, []);

  // ── Zoom helpers ───────────────────────────────────────────────────────────
  const zoom = useCallback((factor: number) => {
    const mid  = (vsMs + veMs) / 2;
    const half = ((veMs - vsMs) / 2) * factor;
    setVsMs(mid - half);
    setVeMs(mid + half);
  }, [vsMs, veMs]);

  const fitView = useCallback(() => {
    const dated = items.filter(it => selected.has(it.code) && schedule[it.code]);
    if (!dated.length) return;
    const allMs = dated.flatMap(it => [strToMs(schedule[it.code].start), strToMs(schedule[it.code].end)]);
    const pad = Math.max(30 * DAY_MS, (Math.max(...allMs) - Math.min(...allMs)) * 0.08);
    setVsMs(Math.min(...allMs) - pad);
    setVeMs(Math.max(...allMs) + pad);
  }, [items, selected, schedule]);

  // ── Auto-fill from programa ─────────────────────────────────────────────────
  const autoFill = useCallback(() => {
    const filled = { ...schedule };
    let changed = false;
    for (const it of items) {
      if (selected.has(it.code) && !filled[it.code] && it.defStart && it.defEnd) {
        filled[it.code] = { start: it.defStart, end: it.defEnd };
        changed = true;
      }
    }
    if (changed) setSchedule(filled);
  }, [items, selected, schedule]);

  // ── Sequential arrange ──────────────────────────────────────────────────────
  const arrangeSeq = useCallback(() => {
    const ordered = items.filter(it => selected.has(it.code));
    if (!ordered.length) return;
    let cursor = todayMs;
    const filled = { ...schedule };
    for (const it of ordered) {
      const dur = filled[it.code]
        ? Math.max(1, daysBetween(strToMs(filled[it.code].start), strToMs(filled[it.code].end)))
        : 90;
      filled[it.code] = { start: msToStr(cursor), end: msToStr(cursor + dur * DAY_MS) };
      cursor += (dur + 1) * DAY_MS;
    }
    setSchedule(filled);
  }, [items, selected, schedule, todayMs]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    setSaving(true);
    await fetch('/api/4d-schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, nivel, schedule }),
    });
    setSaving(false); setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2000);
  }, [projectId, nivel, schedule]);

  // ── Generate 4D ────────────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    const dated = items.filter(it => selected.has(it.code) && schedule[it.code]?.start && schedule[it.code]?.end);
    if (!dated.length) return;
    setGenerating(true); setGenMsg('Cargando identificadores del modelo…');
    try {
      const resp = await fetch(
        `/api/mining-elementos/monikers-by-nivel?project_id=${projectId}&nivel=${nivel}&codigos=${dated.map(it => it.code).join(',')}`
      );
      const { groups } = await resp.json();

      // ── Fallback: property index para items sin monikers en DB ──────────────
      // Si BimConfig tiene cwpPropName (la propiedad del modelo donde está el código
      // CWP/CWA/CV), usamos buildPropertyMultiIndex para resolver directamente.
      // Ejemplo: en modelos SmartPlant el campo "Item/WP_CWP_ID" contiene "312101.C001"
      const propDbIds: Record<string, number[]> = {};
      const noMonikers = dated.filter(it => !(groups[it.code]?.length));

      if (noMonikers.length > 0 && viewerRef?.current && bimConfig?.cwpPropName) {
        const vr = viewerRef.current;
        const propKey = bimConfig.cwpCategory
          ? `${bimConfig.cwpCategory}/${bimConfig.cwpPropName}`
          : bimConfig.cwpPropName;
        setGenMsg(`Buscando en propiedad "${propKey}" del modelo…`);
        try {
          const propIndex = await vr.buildPropertyMultiIndex(propKey);
          for (const it of noMonikers) {
            const ids = propIndex[it.code] ?? propIndex[it.code.toLowerCase()] ?? [];
            if (ids.length) propDbIds[it.code] = ids;
          }
        } catch { /* viewer may not be ready */ }
      }

      setGenMsg('Construyendo secuencia…');
      const allDates = dated.flatMap(it => [schedule[it.code].start, schedule[it.code].end]);
      const t0 = allDates.reduce((a, b) => a < b ? a : b);

      const acts: SequenceActivity[] = dated.flatMap(it => {
        const s = schedule[it.code];
        const dbGuids: string[] = groups[it.code] ?? [];
        const directDbIds = propDbIds[it.code];

        // Priority: 1) session-linked from viewer selection, 2) direct dbIds from property index, 3) DB guids, 4) code as last resort
        const manualDbIds = sessionLinks[it.code];
        const activity: SequenceActivity = {
          id:       it.code,
          name:     it.name || it.code,
          startDay: Math.max(1, daysBetween(strToMs(t0), strToMs(s.start)) + 1),
          duration: Math.max(1, daysBetween(strToMs(s.start), strToMs(s.end)) + 1),
          guids:    dbGuids.length > 0 ? dbGuids : [it.code],
          colorHex: it.color,
        };
        if      (manualDbIds?.length)  activity.dbIds = manualDbIds;
        else if (directDbIds?.length)  activity.dbIds = directDbIds;
        return [activity];
      });
      onGenerate(acts);
    } catch { /* ignore */ }
    finally { setGenerating(false); setGenMsg(''); }
  }, [items, selected, schedule, nivel, projectId, onGenerate, viewerRef, bimConfig, sessionLinks]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(it => !q || it.code.toLowerCase().includes(q) || it.name.toLowerCase().includes(q));
  }, [items, search]);

  const inTimeline = items.filter(it => selected.has(it.code));
  const datedCount = inTimeline.filter(it => schedule[it.code]?.start && schedule[it.code]?.end).length;
  const todayPct   = ((todayMs - vsMs) / (veMs - vsMs)) * 100;
  const totalH     = Math.max(inTimeline.length * ROW_H, 120);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="shrink-0 border-t border-white/10 bg-[#060d1a] flex flex-col overflow-hidden transition-[height] duration-200"
      style={{ height: collapsed ? 40 : panelH }}
    >
      {/* Resize handle (drag up = taller) */}
      {!collapsed && (
        <div
          className="shrink-0 h-1.5 bg-white/5 hover:bg-indigo-500/30 cursor-row-resize flex items-center justify-center group transition"
          onMouseDown={e => { panelResizeRef.current = { startY: e.clientY, startH: panelH }; }}
        >
          <div className="flex gap-1.5">
            {[0,1,2].map(i => <div key={i} className="w-5 h-0.5 bg-white/20 group-hover:bg-indigo-400/60 rounded-full transition" />)}
          </div>
        </div>
      )}

      {/* ── Header bar ── */}
      <div className="shrink-0 h-10 px-3 flex items-center gap-2 border-b border-white/8 bg-[#0a1628] overflow-x-auto">

        {/* Collapse + title */}
        <button onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-1 text-white/60 hover:text-white transition shrink-0">
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Secuencia 4D</span>
        </button>

        {/* Nivel */}
        <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5 shrink-0">
          {(['cwp','cwa','cv','swp'] as Nivel[]).map(n => (
            <button key={n} onClick={() => setNivel(n)}
              className={cn(
                'px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition whitespace-nowrap',
                nivel === n ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white',
              )}>
              {n}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-white/10 shrink-0" />

        {/* Quick actions */}
        <button onClick={autoFill} title="Rellenar con fechas del programa"
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 text-[9px] text-slate-400 hover:text-white transition shrink-0">
          <Zap size={10} /> Auto-fill
        </button>
        <button onClick={arrangeSeq} title="Organizar secuencialmente"
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 text-[9px] text-slate-400 hover:text-white transition shrink-0">
          <AlignLeft size={10} /> Secuencial
        </button>

        <div className="w-px h-5 bg-white/10 shrink-0" />

        {/* Zoom */}
        <button onClick={() => zoom(0.55)} title="Zoom in"
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 text-slate-400 hover:text-white transition shrink-0">
          <ZoomIn size={12} />
        </button>
        <button onClick={() => zoom(1.8)} title="Zoom out"
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 text-slate-400 hover:text-white transition shrink-0">
          <ZoomOut size={12} />
        </button>
        <button onClick={fitView} title="Ajustar vista a la secuencia"
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 text-slate-400 hover:text-white transition shrink-0">
          <Maximize2 size={11} />
        </button>

        <div className="flex-1" />

        {/* Stats */}
        <span className="text-[9px] text-slate-500 shrink-0 whitespace-nowrap">
          {datedCount}/{inTimeline.length} con fecha · {items.length} {nivel.toUpperCase()}s
        </span>

        {/* Save */}
        <button onClick={save} disabled={saving}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[9px] font-bold transition shrink-0 whitespace-nowrap',
            savedOk ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10',
          )}>
          {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
          {savedOk ? '¡Guardado!' : 'Guardar'}
        </button>

        {/* Generate */}
        <button onClick={generate} disabled={generating || datedCount === 0}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wider transition shrink-0 whitespace-nowrap',
            datedCount > 0 && !generating
              ? 'bg-gradient-to-br from-indigo-600 to-purple-700 text-white hover:scale-105 shadow-lg shadow-indigo-900/30'
              : 'bg-white/5 border border-white/8 text-slate-600 cursor-not-allowed',
          )}>
          {generating
            ? <><Loader2 size={10} className="animate-spin" />{genMsg || 'Cargando…'}</>
            : <><Play size={10} />Generar 4D ({datedCount})</>
          }
        </button>
      </div>

      {/* ── Body ── */}
      {!collapsed && (
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── Left: item list ─── */}
          <div className="w-52 shrink-0 border-r border-white/8 flex flex-col overflow-hidden bg-[#070f1d]">

            {/* Search + select all */}
            <div className="px-2 py-1.5 border-b border-white/8 flex items-center gap-1.5" style={{ height: HDR_H }}>
              <Search size={11} className="text-slate-600 shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
                className="flex-1 bg-transparent text-[11px] text-white placeholder-slate-700 outline-none" />
              {search
                ? <button onClick={() => setSearch('')} className="text-slate-600 hover:text-white"><X size={10} /></button>
                : <button onClick={() => setSelected(new Set(filteredItems.map(it => it.code)))}
                    className="text-[8px] text-slate-600 hover:text-indigo-400 transition whitespace-nowrap" title="Seleccionar todos">
                    Todos
                  </button>
              }
            </div>

            {/* Rows */}
            <div ref={listRef} className="flex-1 overflow-y-auto"
              onScroll={e => syncScroll('list', (e.currentTarget).scrollTop)}>
              {loading
                ? <div className="flex items-center justify-center py-6 text-slate-600 gap-2 text-[11px]"><Loader2 size={14} className="animate-spin" />Cargando…</div>
                : filteredItems.map(it => {
                  const isSel    = selected.has(it.code);
                  const hasDates = !!(schedule[it.code]?.start && schedule[it.code]?.end);
                  const linked   = sessionLinks[it.code];
                  const toggleSel = () => setSelected(s => { const n = new Set(s); isSel ? n.delete(it.code) : n.add(it.code); return n; });
                  return (
                    <div key={it.code}
                      className={cn(
                        'flex items-center gap-1.5 px-2 transition border-b border-white/5',
                        isSel ? 'bg-white/[0.04] hover:bg-white/[0.06]' : 'hover:bg-white/[0.02]',
                      )}
                      style={{ height: ROW_H }}>

                      {/* Selectable area */}
                      <div onClick={toggleSel} className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: it.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-black text-white/90 font-mono leading-none truncate">{it.code}</div>
                          <div className="text-[8px] text-slate-600 truncate leading-none mt-0.5">{it.name || '—'}</div>
                        </div>
                      </div>

                      {/* "Vincular desde visor": click elements in the Forge viewer, then click this to bind them to this CWP */}
                      {isSel && viewerRef && (
                        <button
                          title={
                            linked?.length
                              ? `${linked.length} elementos vinculados desde el visor. Clic para actualizar.`
                              : viewerSelCount > 0
                                ? `Vincular ${viewerSelCount} elementos seleccionados del modelo a "${it.code}"`
                                : 'Selecciona elementos en el visor 3D, luego clic aquí para vincularlos a este CWP'
                          }
                          onClick={e => { e.stopPropagation(); linkSelectionToItem(it.code); }}
                          disabled={linking === it.code}
                          className={cn(
                            'shrink-0 flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-black border transition',
                            linking === it.code
                              ? 'bg-indigo-500/10 border-indigo-400/20 text-indigo-400'
                              : linked?.length
                                ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                                : viewerSelCount > 0
                                  ? 'bg-indigo-500/25 border-indigo-400/50 text-indigo-200 animate-pulse'
                                  : 'bg-white/5 border-white/10 text-slate-700 hover:text-slate-400',
                          )}>
                          {linking === it.code
                            ? <Loader2 size={8} className="animate-spin" />
                            : linked?.length
                              ? <><CheckCircle2 size={8} /><span className="ml-0.5">{linked.length}</span></>
                              : viewerSelCount > 0
                                ? <span>+{viewerSelCount}</span>
                                : <span>↗</span>
                          }
                        </button>
                      )}

                      {isSel && hasDates && !linked?.length && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}

                      <div onClick={toggleSel}
                        className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition cursor-pointer',
                        isSel ? 'bg-indigo-600 border-indigo-500' : 'border-white/15')}>
                        {isSel && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>

          {/* ── Right: timeline ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">

            {/* Month/week header */}
            <TimelineHeader vsMs={vsMs} veMs={veMs} />

            {/* Scrollable rows */}
            <div ref={rowsRef} className="flex-1 overflow-y-auto overflow-x-hidden"
              onScroll={e => syncScroll('rows', e.currentTarget.scrollTop)}>

              {/* Timeline canvas */}
              <div ref={timelineRef} className="relative" style={{ height: totalH }}>
                <WeekBands vsMs={vsMs} veMs={veMs} h={totalH} />

                {/* Today marker */}
                {todayPct >= 0 && todayPct <= 100 && (
                  <div className="absolute top-0 bottom-0 w-px bg-red-500/80 z-20 pointer-events-none"
                    style={{ left: `${todayPct}%` }}>
                    <div className="absolute -top-0 -translate-x-1/2 px-1 py-0.5 bg-red-600 rounded-b text-[7px] text-white font-bold">
                      Hoy
                    </div>
                  </div>
                )}

                {/* Rows */}
                {inTimeline.map(it => {
                  const entry = schedule[it.code];
                  return (
                    <div key={it.code} className="relative border-b border-white/[0.04]" style={{ height: ROW_H }}>
                      {entry?.start && entry?.end
                        ? <GanttBar item={it} entry={entry} vsMs={vsMs} veMs={veMs}
                            isDragging={dragging === it.code} onMouseDown={onBarMouseDown} />
                        : (
                          <div
                            className="absolute inset-y-1.5 inset-x-2 rounded-lg border border-dashed border-white/10 flex items-center px-3 gap-2 cursor-pointer hover:border-indigo-500/40 hover:bg-indigo-500/5 transition group"
                            onClick={() => {
                              const defS = it.defStart ?? msToStr(todayMs);
                              const defE = it.defEnd   ?? msToStr(todayMs + 90 * DAY_MS);
                              setSchedule(s => ({ ...s, [it.code]: { start: defS, end: defE } }));
                            }}>
                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                            <span className="text-[9px] text-slate-700 group-hover:text-indigo-400 transition truncate">
                              {it.code} — click para asignar fechas
                            </span>
                          </div>
                        )
                      }
                    </div>
                  );
                })}

                {/* Empty state */}
                {inTimeline.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-700 pointer-events-none">
                    <div className="text-[12px] font-bold">Selecciona {nivel.toUpperCase()}s en el panel izquierdo</div>
                    <div className="text-[10px] opacity-60">Luego arrastra los extremos de las barras para definir fechas</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
