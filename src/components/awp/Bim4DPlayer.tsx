import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, Clock } from 'lucide-react';
import type { ForgeViewerHandle } from './ForgeViewer';

export interface SequenceActivity {
  id: string;
  name: string;
  startDay: number;
  duration: number;
  guids: string[];
  colorHex?: string;
}

interface Bim4DPlayerProps {
  activities: SequenceActivity[];
  viewerRef: React.RefObject<ForgeViewerHandle | null>;
  onClose: () => void;
}

function toRgba(hex: string) {
  if (!hex) return { r: 1, g: 1, b: 1, a: 0.8 };
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
    a: 0.8,
  };
}

export default function Bim4DPlayer({ activities, viewerRef, onClose }: Bim4DPlayerProps) {
  const [currentDay, setCurrentDay]       = useState(1);
  const [isPlaying, setIsPlaying]         = useState(false);
  const [cacheReady, setCacheReady]       = useState(false);
  const [cacheProgress, setCacheProgress] = useState(0);

  // Nuevos estados para agrupación y velocidad
  const [horizon, setHorizon]             = useState<'daily'|'weekly'|'monthly'>('daily');
  const [stepSeconds, setStepSeconds]     = useState(2);

  const timerRef    = useRef<NodeJS.Timeout | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef      = useRef<number | null>(null);

  // ── 4D state (all refs, no re-renders) ──────────────────────────────────
  const dbIdCache     = useRef<Map<string, number[]>>(new Map()); // actId → dbIds
  const allKnownIds   = useRef<number[]>([]);                     // every dbId that belongs to any activity
  const coloredActIds = useRef<Set<string>>(new Set());           // activities already highlighted (no re-color needed)
  const prevDayRef    = useRef<number>(0);

  const totalDays = activities.length > 0
    ? Math.max(...activities.map(a => a.startDay + a.duration - 1))
    : 1;

  const stepDays = horizon === 'daily' ? 1 : horizon === 'weekly' ? 7 : 30;
  const speedMs = stepSeconds * 1000;

  const activeActivities = activities.filter(a =>
    currentDay >= a.startDay && currentDay <= (a.startDay + a.duration - 1)
  );

  // ── Build cache once ─────────────────────────────────────────────────────
  useEffect(() => {
    if (activities.length === 0) return;
    let cancelled = false;

    const build = async () => {
      const vr = viewerRef.current;
      if (!vr) return;
      if (!vr.isUniversalIndexReady()) await vr.buildUniversalIndex();
      if (cancelled) return;

      dbIdCache.current.clear();
      allKnownIds.current = [];

      // Lote único síncrono para inicialización ultra rápida
      const uniqueIds = new Set<number>();
      for (let i = 0; i < activities.length; i++) {
        if (cancelled) return;
        const act = activities[i];
        const ids = vr.resolveByUniversalSync(act.guids);
        dbIdCache.current.set(act.id, ids);
        for (const id of ids) uniqueIds.add(id);
        
        // Actualizamos UI cada 500 actividades para no bloquear la pantalla en modelos inmensos
        if (i % 500 === 0) setCacheProgress(Math.round(((i + 1) / activities.length) * 100));
      }
      allKnownIds.current = Array.from(uniqueIds);
      setCacheProgress(100);

      // ── Clean initial state: clear colors then hide ALL activity elements ──
      // Never call isolate() — hide/show only from here on
      prevDayRef.current = 0;
      coloredActIds.current.clear();
      vr.clearHighlights();
      if (allKnownIds.current.length > 0) vr.hide(allKnownIds.current);

      setCacheReady(true);
    };

    setCacheReady(false);
    setCacheProgress(0);
    build();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities]);

  // ── Core apply — zero isolate() calls, zero clearHighlights() calls ──────
  const applyDayFromCache = useCallback((day: number) => {
    const vr = viewerRef.current;
    if (!vr || !cacheReady) return;

    const prevDay = prevDayRef.current;
    prevDayRef.current = day; // update immediately so timer doesn't re-enter stale state

    if (day === prevDay) return;

    // Cancel any RAF that hasn't fired yet (fast scrub → only render last position)
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (day > prevDay) {
      // Pre-compute outside RAF (pure JS, no Forge calls)
      const toShow: Array<{ ids: number[]; colorHex?: string; actId: string }> = [];
      for (const act of activities) {
        if (act.startDay <= prevDay || act.startDay > day) continue;
        const ids = dbIdCache.current.get(act.id) ?? [];
        if (ids.length > 0) toShow.push({ ids, colorHex: act.colorHex, actId: act.id });
      }
      if (toShow.length === 0) return;

      // Defer Forge API calls to next animation frame — viewer finishes current rotation frame first
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        for (const { ids, colorHex, actId } of toShow) {
          vr.show(ids);
          if (colorHex && !coloredActIds.current.has(actId)) {
            vr.highlight(ids, toRgba(colorHex));
            coloredActIds.current.add(actId);
          }
        }
      });

    } else {
      // ── BACKWARD: hide activities that started after target day ───────────
      const idsToHide: number[] = [];
      for (const act of activities) {
        if (act.startDay <= day || act.startDay > prevDay) continue;
        const ids = dbIdCache.current.get(act.id) ?? [];
        idsToHide.push(...ids);
        coloredActIds.current.delete(act.id);
      }
      if (idsToHide.length === 0) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        vr.hide(idsToHide);
      });
    }
  }, [activities, cacheReady, viewerRef]);

  // ── React to day change ───────────────────────────────────────────────────
  useEffect(() => {
    if (!cacheReady) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (isPlaying) {
      applyDayFromCache(currentDay);
    } else {
      debounceRef.current = setTimeout(() => applyDayFromCache(currentDay), 60);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [currentDay, cacheReady, isPlaying, applyDayFromCache]);

  // ── Playback timer ────────────────────────────────────────────────────────
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

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentDay(1);
  };

  // Restore full model visibility when player closes
  const handleClose = () => {
    const vr = viewerRef.current;
    if (vr) {
      vr.showAll();
      vr.clearHighlights();
    }
    onClose();
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[800px] max-w-[90vw] bg-[#0a1628]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col pointer-events-auto overflow-hidden z-50">

      {/* ── Header ── */}
      <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <Clock size={12} className="text-orange-400" />
          </div>
          <p className="text-[11px] font-black tracking-widest text-white uppercase">
            Simulador 4D Automático
          </p>
          <span className="ml-2 px-1.5 py-0.5 bg-white/10 rounded text-[9px] text-white/50 font-bold border border-white/5">
            {activities.length} Actividades
          </span>
        </div>
        <button onClick={handleClose} className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-rose-500/50 transition">
          Cerrar
        </button>
      </div>

      {/* ── Cache progress bar ── */}
      {!cacheReady && (
        <div className="px-4 py-2 bg-blue-900/30 border-b border-blue-500/20 flex items-center gap-3">
          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-300"
              style={{ width: `${cacheProgress}%` }}
            />
          </div>
          <span className="text-[9px] text-blue-300/70 font-bold shrink-0">
            Preparando 4D… {cacheProgress}%
          </span>
        </div>
      )}

      {/* ── Controls & Scrubber ── */}
      <div className="p-4 flex items-center gap-6 border-b border-white/5 bg-gradient-to-r from-transparent via-white/5 to-transparent">

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleStop}
            disabled={!cacheReady}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition border border-white/10 disabled:opacity-30"
          >
            <Square size={10} />
          </button>

          <button
            onClick={togglePlay}
            disabled={!cacheReady}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all bg-gradient-to-br border shadow-xl ${
              isPlaying
                ? 'from-orange-500 to-rose-600 border-rose-400 text-white shadow-rose-900/50'
                : 'from-blue-500 to-blue-600 border-blue-400 text-white hover:scale-105 shadow-blue-900/50'
            } disabled:opacity-30`}
          >
            {isPlaying
              ? <Pause size={18} fill="currentColor" />
              : <Play  size={18} fill="currentColor" className="ml-1" />}
          </button>

          <div className="flex flex-col ml-2 gap-1 border-l border-white/10 pl-4">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-white/50 uppercase tracking-wider font-bold w-14">Agrupar:</span>
              <select
                value={horizon}
                onChange={(e) => setHorizon(e.target.value as 'daily'|'weekly'|'monthly')}
                disabled={!cacheReady || isPlaying}
                className="bg-white/5 text-[10px] text-white border border-white/10 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:bg-white/10"
              >
                <option value="daily" className="bg-slate-900 text-white">Día por día</option>
                <option value="weekly" className="bg-slate-900 text-white">Semanal</option>
                <option value="monthly" className="bg-slate-900 text-white">Mensual</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-white/50 uppercase tracking-wider font-bold w-14">Tiempo:</span>
              <select
                value={stepSeconds}
                onChange={(e) => setStepSeconds(Number(e.target.value))}
                disabled={!cacheReady}
                className="bg-white/5 text-[10px] text-white border border-white/10 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:bg-white/10"
              >
                <option value={0.5} className="bg-slate-900 text-white">0.5 seg / paso</option>
                <option value={1} className="bg-slate-900 text-white">1 seg / paso</option>
                <option value={2} className="bg-slate-900 text-white">2 seg / paso</option>
                <option value={3} className="bg-slate-900 text-white">3 seg / paso</option>
                <option value={5} className="bg-slate-900 text-white">5 seg / paso</option>
              </select>
            </div>
          </div>
        </div>

        {/* Day scrubber */}
        <div className="flex-1 flex flex-col gap-1.5 relative top-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
              Día <span className="text-[14px] text-white tabular-nums">{currentDay}</span>
              <span className="text-white/40 text-[9px] -mr-1">/{totalDays}</span>
            </span>
          </div>
          <div className="relative h-4 group cursor-pointer flex items-center">
            <input
              type="range"
              min={1}
              max={totalDays}
              value={currentDay}
              disabled={!cacheReady}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentDay(parseInt(e.target.value, 10));
              }}
              className="w-full h-1 bg-white/10 rounded-full appearance-none accent-orange-500 cursor-pointer outline-none hover:h-2 transition-all relative z-10 disabled:opacity-30"
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-orange-500 to-rose-500 rounded-full pointer-events-none group-hover:h-2 transition-all"
              style={{ width: `${((currentDay - 1) / Math.max(1, totalDays - 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Active tasks footer ── */}
      <div className="px-4 py-2 bg-black/20 flex flex-nowrap items-center gap-3 overflow-x-auto">
        <p className="text-[8px] font-black text-white/40 uppercase tracking-widest shrink-0">
          En construcción (Día {currentDay}):
        </p>
        {activeActivities.length === 0 ? (
          <p className="text-[9px] text-white/30 italic py-1">Sin actividades</p>
        ) : (
          activeActivities.slice(0, 4).map(act => (
            <div key={act.id} className="shrink-0 flex items-center gap-1.5 px-2 py-1 bg-white/[0.03] border border-white/10 rounded-lg max-w-[200px]">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: act.colorHex || '#4b5563' }} />
              <p className="text-[9px] text-white/80 font-bold truncate">{act.name}</p>
            </div>
          ))
        )}
        {activeActivities.length > 4 && (
          <p className="text-[8px] text-white/30 shrink-0">+ {activeActivities.length - 4} más</p>
        )}
      </div>

    </div>
  );
}
