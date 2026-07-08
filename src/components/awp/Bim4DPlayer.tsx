'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, Clock, Eye, Palette, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ForgeViewerHandle } from './ForgeViewer';

export interface SequenceActivity {
  id: string;
  name: string;
  startDay: number;
  duration: number;
  guids: string[];
  dbIds?: number[];  // resolved dbIds from property index (skip resolveByUniversalSync when present)
  colorHex?: string;
}

type VisMode   = 'normal' | 'ghost' | 'isolate';
type ColorMode = 'cwp' | 'normal' | 'navisworks';
type ActState  = 'future' | 'active' | 'completed';

interface Bim4DPlayerProps {
  activities: SequenceActivity[];
  viewerRef: React.RefObject<ForgeViewerHandle | null>;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = (hex || '#ffffff').replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

function actState(act: SequenceActivity, day: number, winStart: number): ActState {
  if (act.startDay > day) return 'future';
  if (act.startDay + act.duration - 1 >= winStart) return 'active';
  return 'completed';
}

function completedHex(act: SequenceActivity, cm: ColorMode): string | null {
  if (cm === 'cwp')        return act.colorHex || '#94A3B8';
  if (cm === 'navisworks') return '#22c55e';
  return null; // normal mode → native color
}

// ─── Small toggle group ───────────────────────────────────────────────────────
function ToggleGroup<T extends string>({
  label, icon: Icon, options, value, onChange, disabled,
}: {
  label: string;
  icon: React.ElementType;
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1 text-white/30">
        <Icon size={10} />
        <span className="text-[9px] uppercase tracking-wider font-bold">{label}</span>
      </div>
      <div className="flex rounded-lg overflow-hidden border border-white/10 bg-white/5">
        {options.map(opt => (
          <button
            key={opt.value}
            title={opt.title}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-2.5 py-1 text-[9px] font-bold transition border-r border-white/10 last:border-0',
              value === opt.value
                ? 'bg-indigo-500 text-white'
                : 'text-white/40 hover:text-white/80 hover:bg-white/10',
              disabled && 'opacity-30 cursor-not-allowed',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Bim4DPlayer({ activities, viewerRef, onClose }: Bim4DPlayerProps) {
  const [currentDay, setCurrentDay]       = useState(1);
  const [isPlaying, setIsPlaying]         = useState(false);
  const [cacheReady, setCacheReady]       = useState(false);
  const [cacheProgress, setCacheProgress] = useState(0);
  const [zeroMatchIds, setZeroMatchIds]   = useState<string[]>([]); // activities with 0 model elements

  const [horizon, setHorizon]         = useState<'daily'|'weekly'|'monthly'>('daily');
  const [stepSeconds, setStepSeconds] = useState(2);
  const [visMode, setVisMode]         = useState<VisMode>('normal');
  const [colorMode, setColorMode]     = useState<ColorMode>('navisworks');

  const timerRef    = useRef<NodeJS.Timeout | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef      = useRef<number | null>(null);

  // ── Caches ───────────────────────────────────────────────────────────────
  const dbIdCache   = useRef<Map<string, number[]>>(new Map());
  const allKnownIds = useRef<number[]>([]);

  // Per-activity display state — the key to flicker-free rendering.
  // Only update elements whose state ACTUALLY CHANGES on each tick.
  const actStateRef = useRef<Map<string, ActState>>(new Map());

  // Refs for RAFs (avoid stale closures without effect re-registration)
  const visModeRef   = useRef<VisMode>('normal');
  const colorModeRef = useRef<ColorMode>('navisworks');
  const horizonRef   = useRef(horizon);
  const currentDayRef = useRef(1);
  visModeRef.current   = visMode;
  colorModeRef.current = colorMode;
  horizonRef.current   = horizon;
  currentDayRef.current = currentDay;

  const totalDays = activities.length > 0
    ? Math.max(...activities.map(a => a.startDay + a.duration - 1))
    : 1;

  const stepDays = horizon === 'daily' ? 1 : horizon === 'weekly' ? 7 : 30;
  const speedMs  = stepSeconds * 1000;

  const activeActivities = activities.filter(a =>
    currentDay >= a.startDay && currentDay <= (a.startDay + a.duration - 1)
  );

  // ── Build dbId cache: dual resolution strategy ──────────────────────────
  // Real SP3D_MONIKER guids → resolveByUniversalSync (universal index, already built by BIM scan)
  // Synthetic "SIN-MONIKER::guid" guids → getExternalIdMapping (these are actual Forge externalIds
  //   stored with the SIN-MONIKER prefix; strip prefix, look up in extId map directly)
  // Building the property index (buildPropIndexChunked) under memory pressure causes crashes
  // in large models (600k+ fragments) — the universal index is always available after the BIM scan.
  useEffect(() => {
    if (!activities.length) return;
    let cancelled = false;

    const build = async () => {
      const vr = viewerRef.current;
      if (!vr) return;

      // Pre-build both resolution indices used below:
      // 1. externalId map → resolves SIN-MONIKER::guid synthetic entries
      // 2. Universal index → resolves real SP3D_MONIKER strings via resolveByUniversalSync
      let extIdMap: Record<string, number> = {};
      const hasSynthetic = activities.some(a =>
        !a.dbIds?.length && a.guids.some(g => g.startsWith('SIN-MONIKER::'))
      );
      const hasReal = activities.some(a =>
        !a.dbIds?.length && a.guids.some(g => !g.startsWith('SIN-MONIKER::'))
      );
      if (hasSynthetic) {
        extIdMap = await vr.getExternalIdMapping().catch(() => ({}));
      }
      if (hasReal && !vr.isUniversalIndexReady()) {
        await vr.buildUniversalIndex(p => setCacheProgress(Math.round(p * 0.5)));
      }
      if (cancelled) return;

      dbIdCache.current.clear();
      allKnownIds.current = [];
      actStateRef.current.clear();

      const unique = new Set<number>();
      for (let i = 0; i < activities.length; i++) {
        if (cancelled) return;
        const act = activities[i];
        let ids: number[];

        if (act.dbIds?.length) {
          ids = act.dbIds;
        } else {
          const syntheticGuids = act.guids
            .filter(g => g.startsWith('SIN-MONIKER::'))
            .map(g => g.slice('SIN-MONIKER::'.length));
          const realGuids = act.guids.filter(g => !g.startsWith('SIN-MONIKER::'));

          const fromSynthetic = syntheticGuids
            .map(g => extIdMap[g])
            .filter((id): id is number => id !== undefined);

          const fromReal = realGuids.length > 0 ? vr.resolveByUniversalSync(realGuids) : [];

          ids = [...new Set([...fromSynthetic, ...fromReal])];
        }

        dbIdCache.current.set(act.id, ids);
        actStateRef.current.set(act.id, 'future');
        ids.forEach(id => unique.add(id));
        setCacheProgress(50 + Math.round(((i + 1) / activities.length) * 50));
      }
      allKnownIds.current = Array.from(unique);
      setCacheProgress(100);

      // Report activities that resolved 0 model elements
      const zeros = activities.filter(a => (dbIdCache.current.get(a.id) ?? []).length === 0).map(a => a.id);
      setZeroMatchIds(zeros);

      // Initial visual state: clear all colors, hide sequence elements
      vr.clearHighlights();
      vr.showAll();
      if (allKnownIds.current.length) vr.hide(allKnownIds.current);

      setCacheReady(true);
    };

    setCacheReady(false);
    setCacheProgress(0);
    build();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities]);

  // ── Full rebuild — called when modes change ──────────────────────────────
  // Uses clearHighlights once, then rebuilds state for every activity.
  // Only called on user interaction (mode change), not during playback.
  const rebuildAll = useCallback((day: number) => {
    const vr = viewerRef.current;
    if (!vr || !cacheReady) return;

    const vm = visModeRef.current;
    const cm = colorModeRef.current;
    const hz = horizonRef.current;
    const winDays  = Math.max(7, hz === 'monthly' ? 30 : hz === 'weekly' ? 7 : 1);
    const winStart = Math.max(0, day - winDays);

    // One clear — then we never clear again until next rebuildAll or reset
    vr.clearHighlights();

    const colorBatch  = new Map<string, number[]>(); // hex → ids
    const shownIds:   number[] = [];
    const futureIds:  number[] = [];

    for (const act of activities) {
      const ids = dbIdCache.current.get(act.id) ?? [];
      if (!ids.length) continue;
      const state = actState(act, day, winStart);
      actStateRef.current.set(act.id, state);

      if (state === 'future') { futureIds.push(...ids); continue; }
      shownIds.push(...ids);

      const hex = state === 'active' ? '#00d94d' : completedHex(act, cm);
      if (hex) {
        if (!colorBatch.has(hex)) colorBatch.set(hex, []);
        colorBatch.get(hex)!.push(...ids);
      }
      // null hex (normal/completed) → already cleared, native color shows
    }

    // Visibility
    if (vm === 'ghost') {
      vr.showOnly(shownIds, true);
    } else if (vm === 'isolate') {
      vr.showOnly(shownIds.length ? shownIds : [-1], false);
    } else {
      if (shownIds.length) vr.show(shownIds);
      if (futureIds.length) vr.hide(futureIds);
    }

    // Color — batch per unique hex to minimize API calls
    for (const [hex, ids] of colorBatch) {
      const { r, g, b } = hexToRgb(hex);
      vr.colorDbIds(ids, r, g, b, 0.85);
    }
  }, [activities, cacheReady, viewerRef]);

  // ── Incremental apply — the NO-FLICKER core ──────────────────────────────
  // Never calls clearHighlights(). Only touches elements that CHANGE state.
  // Elements staying in the same state are not touched → zero flicker.
  const applyDay = useCallback((day: number) => {
    const vr = viewerRef.current;
    if (!vr || !cacheReady) return;

    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    const vm = visModeRef.current;
    const cm = colorModeRef.current;
    const hz = horizonRef.current;
    const winDays  = Math.max(7, hz === 'monthly' ? 30 : hz === 'weekly' ? 7 : 1);
    const winStart = Math.max(0, day - winDays);

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;

      const toShow:       number[] = [];
      const toHide:       number[] = [];
      const toClearColor: number[] = [];
      const colorOps      = new Map<string, number[]>(); // hex → ids
      let   visChanged    = false;

      for (const act of activities) {
        const ids = dbIdCache.current.get(act.id) ?? [];
        if (!ids.length) continue;

        const prev = actStateRef.current.get(act.id) ?? 'future';
        const next = actState(act, day, winStart);
        if (prev === next) continue; // ← KEY: same state → don't touch it

        actStateRef.current.set(act.id, next);

        // Visibility transitions
        if (prev === 'future' && next !== 'future') { toShow.push(...ids); visChanged = true; }
        if (prev !== 'future' && next === 'future') { toHide.push(...ids); visChanged = true; }

        // Color transitions
        if (next === 'active') {
          const a = colorOps.get('#00d94d') ?? [];
          a.push(...ids);
          colorOps.set('#00d94d', a);
        } else if (next === 'completed') {
          const hex = completedHex(act, cm);
          if (hex) {
            const a = colorOps.get(hex) ?? [];
            a.push(...ids);
            colorOps.set(hex, a);
          } else {
            toClearColor.push(...ids); // normal mode → revert to native
          }
        } else {
          // back to future: clear color
          toClearColor.push(...ids);
        }
      }

      // ── Apply visibility ────────────────────────────────────────────────
      if (vm === 'normal') {
        if (toShow.length) vr.show(toShow);
        if (toHide.length) vr.hide(toHide);
      } else if (visChanged) {
        // Ghost/isolate: rebuild shown set and call showOnly once
        const shownIds: number[] = [];
        for (const [id, st] of actStateRef.current) {
          if (st !== 'future') shownIds.push(...(dbIdCache.current.get(id) ?? []));
        }
        vr.showOnly(shownIds.length ? shownIds : [-1], vm === 'ghost');
      }

      // ── Apply colors (incremental — never clears existing) ─────────────
      if (toClearColor.length) vr.clearThemingForDbIds(toClearColor);
      for (const [hex, ids] of colorOps) {
        const { r, g, b } = hexToRgb(hex);
        vr.colorDbIds(ids, r, g, b, 0.85);
      }
    });
  }, [activities, cacheReady, viewerRef]);

  // ── Day changes → incremental ─────────────────────────────────────────
  useEffect(() => {
    if (!cacheReady) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (isPlaying) {
      applyDay(currentDay);
    } else {
      debounceRef.current = setTimeout(() => applyDay(currentDay), 60);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [currentDay, cacheReady, isPlaying, applyDay]);

  // ── Mode changes → full rebuild (one-time clear + reapply) ───────────
  useEffect(() => {
    if (!cacheReady) return;
    rebuildAll(currentDayRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visMode, colorMode, horizon, cacheReady]);

  // ── Playback timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      if (currentDay >= totalDays) { setIsPlaying(false); return; }
      timerRef.current = setTimeout(() => {
        setCurrentDay(d => Math.min(d + stepDays, totalDays));
      }, speedMs);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, currentDay, speedMs, stepDays, totalDays]);

  const togglePlay = () => {
    if (currentDay >= totalDays) setCurrentDay(1);
    setIsPlaying(p => !p);
  };

  const handleStop = () => { setIsPlaying(false); setCurrentDay(1); };

  const handleClose = () => {
    const vr = viewerRef.current;
    if (vr) { vr.showAll(); vr.clearHighlights(); }
    onClose();
  };

  // ── Draggable floating window ──────────────────────────────────────────────
  const [pos, setPos] = useState(() => ({
    x: typeof window !== 'undefined' ? Math.max(0, window.innerWidth  / 2 - 430) : 300,
    y: typeof window !== 'undefined' ? Math.max(60, window.innerHeight * 0.22)    : 200,
  }));
  const dragPanelRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [draggingPanel, setDraggingPanel] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragPanelRef.current) return;
      const dx = e.clientX - dragPanelRef.current.startX;
      const dy = e.clientY - dragPanelRef.current.startY;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - 100, dragPanelRef.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40,  dragPanelRef.current.origY + dy)),
      });
    };
    const onUp = () => { dragPanelRef.current = null; setDraggingPanel(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't start drag on buttons/selects inside header
    if ((e.target as HTMLElement).closest('button, select')) return;
    e.preventDefault();
    dragPanelRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    setDraggingPanel(true);
  }, [pos]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed w-[860px] max-w-[92vw] bg-[#0a1628]/96 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col pointer-events-auto overflow-hidden z-[9999]"
      style={{ left: pos.x, top: pos.y, boxShadow: draggingPanel ? '0 30px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.3)' : '0 25px 60px rgba(0,0,0,0.5)' }}
    >

      {/* Header — drag handle */}
      <div
        className={cn(
          'px-4 py-2 border-b border-white/10 flex items-center justify-between select-none',
          draggingPanel ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onMouseDown={onHeaderMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal size={14} className="text-white/20 shrink-0" />
          <div className="w-6 h-6 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <Clock size={12} className="text-orange-400" />
          </div>
          <p className="text-[11px] font-black tracking-widest text-white uppercase">Simulador 4D</p>
          <span className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] text-white/50 font-bold border border-white/5">
            {activities.length} Actividades
          </span>
        </div>
        <button onClick={handleClose} className="px-2 py-1 rounded-lg text-white/30 hover:text-white hover:bg-rose-500/50 transition text-[10px]">
          Cerrar
        </button>
      </div>

      {/* Cache progress */}
      {!cacheReady && (
        <div className="px-4 py-2 bg-blue-900/30 border-b border-blue-500/20 flex items-center gap-3">
          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all" style={{ width: `${cacheProgress}%` }} />
          </div>
          <span className="text-[9px] text-blue-300/70 font-bold shrink-0">Preparando… {cacheProgress}%</span>
        </div>
      )}

      {/* Controls + scrubber */}
      <div className="p-4 flex items-center gap-6 border-b border-white/5">
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleStop} disabled={!cacheReady} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 transition border border-white/10 disabled:opacity-30">
            <Square size={10} />
          </button>
          <button
            onClick={togglePlay}
            disabled={!cacheReady}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center transition-all border shadow-xl',
              isPlaying
                ? 'bg-gradient-to-br from-orange-500 to-rose-600 border-rose-400 text-white shadow-rose-900/50'
                : 'bg-gradient-to-br from-blue-500 to-blue-600 border-blue-400 text-white hover:scale-105 shadow-blue-900/50',
              !cacheReady && 'opacity-30',
            )}
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
          </button>

          <div className="flex flex-col ml-2 gap-1 border-l border-white/10 pl-4">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-white/50 uppercase tracking-wider font-bold w-14">Agrupar:</span>
              <select value={horizon} onChange={e => setHorizon(e.target.value as typeof horizon)} disabled={!cacheReady || isPlaying}
                className="bg-white/5 text-[10px] text-white border border-white/10 rounded px-1.5 py-0.5 outline-none cursor-pointer">
                <option value="daily"   className="bg-slate-900">Día por día</option>
                <option value="weekly"  className="bg-slate-900">Semanal</option>
                <option value="monthly" className="bg-slate-900">Mensual</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-white/50 uppercase tracking-wider font-bold w-14">Tiempo:</span>
              <select value={stepSeconds} onChange={e => setStepSeconds(Number(e.target.value))} disabled={!cacheReady}
                className="bg-white/5 text-[10px] text-white border border-white/10 rounded px-1.5 py-0.5 outline-none cursor-pointer">
                <option value={0.5} className="bg-slate-900">0.5 seg / paso</option>
                <option value={1}   className="bg-slate-900">1 seg / paso</option>
                <option value={2}   className="bg-slate-900">2 seg / paso</option>
                <option value={3}   className="bg-slate-900">3 seg / paso</option>
                <option value={5}   className="bg-slate-900">5 seg / paso</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scrubber */}
        <div className="flex-1 flex flex-col gap-1.5 relative top-1">
          <div className="flex items-center px-1">
            <span className="text-[10px] font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
              Día <span className="text-[14px] text-white tabular-nums">{currentDay}</span>
              <span className="text-white/40 text-[9px]">/{totalDays}</span>
            </span>
          </div>
          <div className="relative h-4 group flex items-center">
            <input type="range" min={1} max={totalDays} value={currentDay} disabled={!cacheReady}
              onChange={e => { setIsPlaying(false); setCurrentDay(parseInt(e.target.value, 10)); }}
              className="w-full h-1 bg-white/10 rounded-full appearance-none accent-orange-500 cursor-pointer outline-none hover:h-2 transition-all relative z-10 disabled:opacity-30"
            />
            <div className="absolute top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-orange-500 to-rose-500 rounded-full pointer-events-none group-hover:h-2 transition-all"
              style={{ width: `${((currentDay - 1) / Math.max(1, totalDays - 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Visualization toggles */}
      <div className="px-4 py-2 border-b border-white/5 flex items-center gap-5 bg-black/20">
        <ToggleGroup<VisMode>
          label="Visibilidad" icon={Eye} value={visMode} onChange={setVisMode} disabled={!cacheReady}
          options={[
            { value: 'normal',  label: 'Normal',  title: 'Modelo completo visible al fondo' },
            { value: 'ghost',   label: 'Fantasma', title: 'Fondo semi-transparente' },
            { value: 'isolate', label: 'Aislar',   title: 'Solo elementos de la secuencia' },
          ]}
        />
        <div className="w-px h-5 bg-white/10" />
        <ToggleGroup<ColorMode>
          label="Color" icon={Palette} value={colorMode} onChange={setColorMode} disabled={!cacheReady}
          options={[
            { value: 'navisworks', label: 'Verde',   title: 'Construido: verde | En obra: verde brillante' },
            { value: 'cwp',        label: 'Por CWP', title: 'Construido: color del CWP | En obra: verde' },
            { value: 'normal',     label: 'Normal',  title: 'Construido: color nativo | En obra: verde' },
          ]}
        />
        <div className="ml-auto flex items-center gap-3 text-[9px] text-white/30">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#00d94d]" />En construcción</span>
          {colorMode === 'navisworks' && <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#22c55e]" />Completado</span>}
        </div>
      </div>

      {/* Active tasks */}
      <div className="px-4 py-2 bg-black/20 flex flex-nowrap items-center gap-3 overflow-x-auto">
        <p className="text-[8px] font-black text-white/40 uppercase tracking-widest shrink-0">En construcción (Día {currentDay}):</p>
        {activeActivities.length === 0
          ? <p className="text-[9px] text-white/30 italic py-1">Sin actividades</p>
          : activeActivities.slice(0, 5).map(act => (
            <div key={act.id} className="shrink-0 flex items-center gap-1.5 px-2 py-1 bg-white/[0.03] border border-white/10 rounded-lg max-w-[200px]">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: act.colorHex || '#4b5563' }} />
              <p className="text-[9px] text-white/80 font-bold truncate">{act.name}</p>
            </div>
          ))
        }
        {activeActivities.length > 5 && <p className="text-[8px] text-white/30 shrink-0">+{activeActivities.length - 5} más</p>}
      </div>

      {/* Warning: activities with 0 resolved elements in the model */}
      {cacheReady && zeroMatchIds.length > 0 && (
        <div className="px-4 py-1.5 bg-amber-900/20 border-t border-amber-500/15 flex items-center gap-2 flex-wrap">
          <span className="text-[8px] font-black text-amber-400/80 uppercase tracking-wider shrink-0">Sin elementos en modelo:</span>
          {zeroMatchIds.slice(0, 6).map(id => (
            <span key={id} className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[8px] text-amber-300/70 font-mono">
              {id}
            </span>
          ))}
          {zeroMatchIds.length > 6 && <span className="text-[8px] text-amber-400/40">+{zeroMatchIds.length - 6} más</span>}
          <span className="text-[8px] text-amber-400/40 ml-auto">
            Usa el Vinculador BIM en AWP Minería para vincular estos elementos
          </span>
        </div>
      )}
    </div>
  );
}
