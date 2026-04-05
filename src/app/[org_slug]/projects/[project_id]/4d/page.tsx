'use client';

import { use, useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  ChevronLeft, ChevronRight, Settings2, X, Link2,
  Loader2, Monitor, CalendarDays, AlertCircle, CheckCircle2,
  Clock, Pause, BarChart3, Filter, Maximize2, UploadCloud,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Activity } from '@/components/awp/GanttChart';
import AccModelBrowser from '@/components/awp/AccModelBrowser';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

// ─── Discipline colors (mismo sistema que GanttChart) ─────────────────────────

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
  QF: { bar: '#0D9488', bg: '#CCFBF1', text: '#0F766E', label: 'Instr. F' },
  QI: { bar: '#059669', bg: '#D1FAE5', text: '#047857', label: 'Instr. I' },
  QJ: { bar: '#65A30D', bg: '#ECFCCB', text: '#4D7C0F', label: 'Instr. J' },
  RB: { bar: '#DC2626', bg: '#FEE2E2', text: '#B91C1C', label: 'Revestimiento B' },
  RD: { bar: '#E11D48', bg: '#FFE4E6', text: '#BE123C', label: 'Revestimiento D' },
  RE: { bar: '#C026D3', bg: '#FAE8FF', text: '#A21CAF', label: 'Revestimiento E' },
  SA: { bar: '#475569', bg: '#F1F5F9', text: '#334155', label: 'Soldadura A' },
  SE: { bar: '#374151', bg: '#F9FAFB', text: '#1F2937', label: 'Soldadura E' },
};

function getDiscColor(discipline?: string) {
  if (!discipline) return { bar: '#94A3B8', bg: '#F1F5F9', text: '#64748B', label: '—' };
  const code = discipline.toUpperCase().substring(0, 2);
  return DISC_COLORS[code] ?? { bar: '#94A3B8', bg: '#F1F5F9', text: '#64748B', label: discipline };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function startOfWeek(d: Date): Date {
  const clone = new Date(d);
  const day = clone.getDay(); // 0=Dom
  const diff = day === 0 ? -6 : 1 - day; // Lunes
  clone.setDate(clone.getDate() + diff);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function fmtDateFull(d: Date): string {
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

// How many days of an activity overlap with [weekStart, weekStart+6]
function weekOverlap(act: Activity, weekStart: Date): number {
  const s = parseDate(act.start_date);
  const e = parseDate(act.end_date);
  if (!s || !e) return 0;
  const wEnd = addDays(weekStart, 6);
  const overlapStart = s > weekStart ? s : weekStart;
  const overlapEnd   = e < wEnd     ? e : wEnd;
  const days = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000) + 1;
  return Math.max(0, days);
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ progress, start, end }: { progress: number; start?: string; end?: string }) {
  const today = new Date();
  const s = parseDate(start);
  const e = parseDate(end);
  if (progress >= 100) return (
    <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
      <CheckCircle2 size={8} /> TERM.
    </span>
  );
  if (s && today >= s && (!e || today <= e)) return (
    <span className="flex items-center gap-1 text-[9px] font-black text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
      <Clock size={8} /> ACTIVO
    </span>
  );
  if (s && today < s) return (
    <span className="flex items-center gap-1 text-[9px] font-black text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-1.5 py-0.5">
      <Pause size={8} /> PEND.
    </span>
  );
  if (e && today > e && progress < 100) return (
    <span className="flex items-center gap-1 text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5">
      <AlertCircle size={8} /> ATRASO
    </span>
  );
  return null;
}

// ─── Week Bar cell ────────────────────────────────────────────────────────────

function WeekBar({ act, weekStart }: { act: Activity; weekStart: Date }) {
  const overlap = weekOverlap(act, weekStart);
  if (!overlap) return <td className="px-2 py-1 border-b border-slate-50 text-center text-[9px] text-slate-200">—</td>;

  const s = parseDate(act.start_date)!;
  const e = parseDate(act.end_date)!;
  const totalDays = Math.max(1, Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1);
  const pct = Math.round((overlap / totalDays) * 100);
  const col = getDiscColor(act.discipline);

  return (
    <td className="px-2 py-1 border-b border-slate-50">
      <div className="relative h-5 rounded-lg overflow-hidden" style={{ background: col.bg }}>
        <div
          className="absolute left-0 top-0 h-full rounded-lg opacity-80 transition-all"
          style={{ width: `${act.progress}%`, background: col.bar }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black" style={{ color: col.text }}>
          {pct}% · {overlap}d
        </span>
      </div>
    </td>
  );
}

// ─── Model Panel ─────────────────────────────────────────────────────────────

function ModelPanel({ urn, name, onConfig }: { urn: string | null; name: string | null; onConfig: () => void }) {
  if (!urn) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 bg-slate-50 border-l border-slate-100">
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow flex items-center justify-center">
          <Monitor size={28} className="text-slate-300" />
        </div>
        <div className="text-center">
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Sin modelo</p>
          <p className="text-[10px] text-slate-400 mt-1">Pega la URL del archivo en ACC</p>
        </div>
        <button onClick={onConfig} className="flex items-center gap-2 px-5 py-2.5 bg-[#0C1E4F] text-white rounded-xl text-[11px] font-black uppercase tracking-wide hover:bg-blue-700 transition">
          <Link2 size={13} /> Cargar Modelo ACC
        </button>
      </div>
    );
  }
  return (
    <div className="h-full border-l border-slate-100 flex flex-col">
      <div className="shrink-0 px-4 py-2 bg-[#0C1E4F] flex items-center gap-3">
        <Monitor size={12} className="text-blue-300" />
        <span className="text-[10px] font-black text-white truncate flex-1">{name ?? 'Modelo 3D'}</span>
        <button onClick={onConfig} className="shrink-0 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition text-[9px] font-black text-white/70 uppercase">Cambiar</button>
      </div>
      <div className="flex-1 overflow-hidden">
        <ForgeViewer urn={urn} />
      </div>
    </div>
  );
}

// ─── URL Modal con resolución automática ─────────────────────────────────────

function ModelUrlModal({ currentUrn, currentName, onSave, onClose }: {
  currentUrn: string | null;
  currentName: string | null;
  onSave: (urn: string, name: string) => void;
  onClose: () => void;
}) {
  const [val, setVal]         = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleLoad = async () => {
    if (!val.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/autodesk/resolve-urn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accUrl: val.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onSave(data.urn, data.name);
    } catch (e: any) {
      setError(e.message ?? 'Error resolviendo el modelo');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#0C1E4F] flex items-center justify-center">
              <Monitor size={15} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800">Cargar Modelo desde ACC</p>
              <p className="text-[10px] text-slate-400">Pega la URL del archivo en ACC Docs</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-[11px] text-blue-700 space-y-1 leading-relaxed">
            <p className="font-black uppercase tracking-wide">Cómo obtener la URL</p>
            <p>1. En <strong>ACC Docs</strong>, navega hasta el modelo (RVT, DWG, IFC...)</p>
            <p>2. Haz clic derecho sobre el archivo → <strong>Copiar enlace</strong></p>
            <p>3. O simplemente copia la URL de la barra del navegador mientras tienes el archivo seleccionado</p>
          </div>
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">URL del archivo en ACC</label>
            <textarea
              value={val}
              onChange={e => setVal(e.target.value)}
              rows={4}
              placeholder="https://acc.autodesk.com/docs/files/projects/..."
              className="w-full px-4 py-3 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 resize-none"
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-700">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-black">Error</p>
                <p>{error}</p>
                {error.includes('not_authenticated') && (
                  <button
                    onClick={() => { window.location.href = `/api/autodesk/auth?returnTo=${window.location.pathname}`; }}
                    className="mt-1 underline font-black"
                  >
                    Conectar con ACC primero →
                  </button>
                )}
              </div>
            </div>
          )}
          {currentUrn && (
            <p className="text-[10px] text-slate-400">Modelo activo: <span className="font-black text-slate-600">{currentName}</span></p>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button onClick={onClose} className="px-4 py-2 text-[11px] font-black text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
            <button
              onClick={handleLoad}
              disabled={!val.trim() || loading}
              className="flex items-center gap-2 px-5 py-2 bg-[#0C1E4F] text-white text-[11px] font-black rounded-xl hover:bg-blue-700 transition disabled:opacity-40"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
              {loading ? 'Cargando...' : 'Cargar Modelo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FourDPage({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { org_slug, project_id } = use(params);

  const [activities, setActivities]   = useState<Activity[]>([]);
  const [loading, setLoading]         = useState(true);
  const [baseWeek, setBaseWeek]       = useState<Date>(() => startOfWeek(new Date()));
  const [modelUrn, setModelUrn]       = useState<string | null>(null);
  const [modelName, setModelName]     = useState<string | null>(null);
  const [showConfig, setShowConfig]   = useState(false);
  const [filterDisc, setFilterDisc]   = useState<string>('');
  const [splitMode, setSplitMode]     = useState<'split' | 'gantt' | 'model'>('split');

  useEffect(() => {
    const urn  = localStorage.getItem(`model_urn_${project_id}`);
    const name = localStorage.getItem(`model_name_${project_id}`);
    if (urn) { setModelUrn(urn); setModelName(name); }
  }, [project_id]);

  const handleSaveModel = (urn: string, name: string) => {
    setModelUrn(urn);
    setModelName(name);
    localStorage.setItem(`model_urn_${project_id}`, urn);
    localStorage.setItem(`model_name_${project_id}`, name);
    setShowConfig(false);
    setSplitMode('split');
  };

  // Load activities
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('program_activities')
        .select('*')
        .eq('project_id', project_id)
        .order('sort_order');
      setActivities((data ?? []) as Activity[]);
      setLoading(false);
    }
    load();
  }, [project_id]);

  // 3 weeks from baseWeek
  const weeks = useMemo(() => [0, 1, 2].map(i => addDays(baseWeek, i * 7)), [baseWeek]);

  // Filter: activities that touch at least one of the 3 weeks
  const weekEnd3 = useMemo(() => addDays(weeks[2], 6), [weeks]);

  const filtered = useMemo(() => {
    let list = activities.filter(a => {
      if (a.is_summary) return false;
      const s = parseDate(a.start_date);
      const e = parseDate(a.end_date);
      if (!s || !e) return false;
      // overlaps the 3-week window
      return s <= weekEnd3 && e >= weeks[0];
    });
    if (filterDisc) list = list.filter(a => (a.discipline ?? '').toUpperCase().startsWith(filterDisc.toUpperCase()));
    return list;
  }, [activities, weeks, weekEnd3, filterDisc]);

  // Unique disciplines
  const disciplines = useMemo(() => {
    const set = new Set(activities.map(a => (a.discipline ?? '').toUpperCase().substring(0, 2)).filter(Boolean));
    return [...set].sort();
  }, [activities]);

  const totalHH = useMemo(() => filtered.reduce((s, a) => s + (a.hh ?? 0), 0), [filtered]);
  const avgProg  = useMemo(() => filtered.length ? Math.round(filtered.reduce((s, a) => s + a.progress, 0) / filtered.length) : 0, [filtered]);

  const prevWeek = () => setBaseWeek(d => addDays(d, -7));
  const nextWeek = () => setBaseWeek(d => addDays(d, 7));
  const goToday  = () => setBaseWeek(startOfWeek(new Date()));

  const showGantt = splitMode !== 'model';
  const showModel = splitMode !== 'gantt';

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">

      {/* ── Top Toolbar ─────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4 flex-wrap">

        {/* Title */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[#0C1E4F] flex items-center justify-center">
            <CalendarDays size={15} className="text-white" />
          </div>
          <div>
            <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest leading-none">Planeación 4D</p>
            <p className="text-[9px] text-slate-400 font-bold">Vista Trisemanal</p>
          </div>
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-1 bg-slate-50 rounded-xl border border-slate-200 p-1 ml-2">
          <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-white transition text-slate-500">
            <ChevronLeft size={14} />
          </button>
          <div className="flex items-center gap-2 px-3">
            {weeks.map((w, i) => (
              <span key={i} className={`text-[10px] font-black px-2 py-1 rounded-lg transition ${i === 1 ? 'bg-[#0C1E4F] text-white' : 'text-slate-600'}`}>
                {fmtDate(w)} – {fmtDate(addDays(w, 6))}
              </span>
            ))}
          </div>
          <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-white transition text-slate-500">
            <ChevronRight size={14} />
          </button>
        </div>

        <button
          onClick={goToday}
          className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
        >
          Hoy
        </button>

        {/* Discipline filter */}
        <div className="flex items-center gap-2 ml-2">
          <Filter size={11} className="text-slate-400" />
          <select
            value={filterDisc}
            onChange={e => setFilterDisc(e.target.value)}
            className="text-[10px] font-bold bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 outline-none"
          >
            <option value="">Todas las disciplinas</option>
            {disciplines.map(d => (
              <option key={d} value={d}>{d} — {DISC_COLORS[d]?.label ?? d}</option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[10px] font-black text-slate-500">
            <span className="text-[#0C1E4F]">{filtered.length}</span> actividades
          </span>
          <span className="text-[10px] font-black text-slate-500">
            <span className="text-amber-600">{totalHH.toLocaleString('es-CL')}</span> HH
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${avgProg}%` }} />
            </div>
            <span className="text-[10px] font-black text-emerald-600">{avgProg}%</span>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden shrink-0">
          {[
            { id: 'gantt', icon: BarChart3, label: 'Tabla' },
            { id: 'split', icon: Maximize2, label: 'Split' },
            { id: 'model', icon: Monitor,  label: 'Modelo' },
          ].map(v => (
            <button
              key={v.id}
              onClick={() => setSplitMode(v.id as any)}
              className={`flex items-center gap-1 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide transition ${
                splitMode === v.id ? 'bg-[#0C1E4F] text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <v.icon size={11} /> {v.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowConfig(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-500 hover:bg-slate-50 transition shrink-0"
        >
          <Settings2 size={11} /> {modelUrn ? 'Cambiar Modelo' : 'Modelo ACC'}
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Trisemanal Table */}
        {showGantt && (
          <div className={`flex flex-col overflow-hidden ${showModel ? 'w-[55%]' : 'w-full'}`}>
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-[#0C1E4F]" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-12">
                <CalendarDays size={36} className="text-slate-200" />
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Sin actividades en estas 3 semanas</p>
                <p className="text-[10px] text-slate-300">
                  Importa datos en <strong>Programa Maestro</strong> para verlos aquí, o navega a otras semanas.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-[10px]">
                  <thead className="sticky top-0 z-10 bg-[#0C1E4F] text-white">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-black tracking-widest uppercase whitespace-nowrap border-r border-white/10">WBS</th>
                      <th className="px-3 py-2.5 text-left font-black tracking-widest uppercase border-r border-white/10 min-w-[220px]">Descripción</th>
                      <th className="px-3 py-2.5 text-left font-black tracking-widest uppercase whitespace-nowrap border-r border-white/10">Disc.</th>
                      <th className="px-3 py-2.5 text-right font-black tracking-widest uppercase whitespace-nowrap border-r border-white/10">HH</th>
                      <th className="px-3 py-2.5 text-center font-black tracking-widest uppercase whitespace-nowrap border-r border-white/10">Estado</th>
                      <th className="px-3 py-2.5 text-center font-black tracking-widest uppercase whitespace-nowrap border-r border-white/10">Avance</th>
                      {weeks.map((w, i) => (
                        <th key={i} className={`px-3 py-2.5 text-center font-black tracking-widest uppercase whitespace-nowrap border-r border-white/10 min-w-[100px] ${i === 1 ? 'bg-white/10' : ''}`}>
                          Sem {i + 1}<br />
                          <span className="text-[8px] font-bold opacity-70">{fmtDate(w)}–{fmtDate(addDays(w, 6))}</span>
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-left font-black tracking-widest uppercase whitespace-nowrap border-r border-white/10">CWP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((act, i) => {
                      const col = getDiscColor(act.discipline);
                      return (
                        <tr
                          key={act.id}
                          className={`border-b border-slate-50 hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                        >
                          {/* WBS */}
                          <td className="px-3 py-1.5 border-r border-slate-100">
                            <span className="font-mono font-black text-[9px] text-slate-500">{act.wbs_code}</span>
                          </td>

                          {/* Descripción */}
                          <td className="px-3 py-1.5 border-r border-slate-100 max-w-[220px]">
                            <p className="font-semibold text-slate-700 truncate leading-tight" title={act.description}>
                              {act.description ?? '—'}
                            </p>
                          </td>

                          {/* Disciplina */}
                          <td className="px-2 py-1.5 border-r border-slate-100">
                            <span
                              className="px-2 py-0.5 rounded-lg text-[9px] font-black whitespace-nowrap"
                              style={{ background: col.bg, color: col.text }}
                            >
                              {act.discipline ?? '—'}
                            </span>
                          </td>

                          {/* HH */}
                          <td className="px-3 py-1.5 border-r border-slate-100 text-right font-mono font-bold text-slate-600">
                            {(act.hh ?? 0).toLocaleString('es-CL')}
                          </td>

                          {/* Estado */}
                          <td className="px-2 py-1.5 border-r border-slate-100 text-center">
                            <StatusChip progress={act.progress} start={act.start_date} end={act.end_date} />
                          </td>

                          {/* Avance */}
                          <td className="px-3 py-1.5 border-r border-slate-100">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-100">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${act.progress}%`, background: col.bar }}
                                />
                              </div>
                              <span className="text-[9px] font-black shrink-0" style={{ color: col.text }}>
                                {act.progress}%
                              </span>
                            </div>
                          </td>

                          {/* Week bars */}
                          {weeks.map((w, wi) => <WeekBar key={wi} act={act} weekStart={w} />)}

                          {/* CWP */}
                          <td className="px-3 py-1.5 border-r border-slate-100">
                            <span className="font-mono text-[9px] text-slate-400">{act.cwp_code ?? '—'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Footer totals */}
                <div className="sticky bottom-0 bg-[#0C1E4F]/95 text-white px-4 py-2 flex items-center gap-6 text-[10px] font-black">
                  <span>TOTAL: {filtered.length} actividades</span>
                  <span>{totalHH.toLocaleString('es-CL')} HH</span>
                  <div className="flex items-center gap-2 ml-auto">
                    <span>AVANCE PROM:</span>
                    <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${avgProg}%` }} />
                    </div>
                    <span className="text-emerald-300">{avgProg}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Model Panel */}
        {showModel && (
          <div className={showGantt ? 'flex-1' : 'w-full'}>
            <ModelPanel urn={modelUrn} name={modelName} onConfig={() => setShowConfig(true)} />
          </div>
        )}
      </div>

      {showConfig && (
        <AccModelBrowser
          currentUrn={modelUrn ?? undefined}
          currentName={modelName ?? undefined}
          onSelect={handleSaveModel}
          onClose={() => setShowConfig(false)}
          returnPath={`/${org_slug}/projects/${project_id}/4d`}
        />
      )}
    </div>
  );
}
