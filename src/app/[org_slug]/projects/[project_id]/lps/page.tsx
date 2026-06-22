'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Calendar, Target, Clock, AlertTriangle, CheckCircle2,
  TrendingUp, PlayCircle, Info, ChevronDown, ChevronRight,
  Building2, Package, Zap, Box, ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CWPRow {
  id: string; cwa: string; nombreCWA: string; disciplina: string;
  partida: string; total: number;
  fecha_inicio?: string | null; fecha_fin?: string | null;
  tipo_trabajo?: string | null; pct_avance?: number;
}
interface PisoPrograma {
  piso: number; label: string; cwa: string;
  og_inicio?: string | null; og_fin?: string | null;
  term_inicio?: string | null; term_fin?: string | null;
}
interface Programa {
  proyecto: string; empresa: string; inicio: string; fin: string;
  pisos: PisoPrograma[];
  hitos: { nombre: string; fecha: string }[];
}
interface IWPSeed { nombre: string; inicio: string; fin: string; duracion: number; pct: number; }
interface Data { cwps: CWPRow[]; programa?: Programa; iwpSeeds?: IWPSeed[]; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('es-CL');
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

// Gantt
const PROJECT_START = new Date('2024-12-17');
const PROJECT_END   = new Date('2027-03-22');
const PROJECT_DAYS  = (PROJECT_END.getTime() - PROJECT_START.getTime()) / 86400000;
const toX    = (d: string) => Math.max(0, Math.min(100, ((new Date(d).getTime() - PROJECT_START.getTime()) / 86400000 / PROJECT_DAYS) * 100));
const durPct = (s: string, e: string) => Math.max(0.5, ((new Date(e).getTime() - new Date(s).getTime()) / 86400000 / PROJECT_DAYS) * 100);

type Screen = 'maestra' | 'lookahead' | 'semanal';

const SCREENS: { id: Screen; label: string; sub: string; icon: React.ElementType; color: string; bg: string }[] = [
  { id: 'maestra',   label: 'Planificación Maestra',   sub: 'Gantt por piso · Programa Maestro vinculado',      icon: Calendar,    color: 'text-violet-600', bg: 'bg-violet-600' },
  { id: 'lookahead', label: 'Plan Intermedio',          sub: 'Lookahead 6 semanas · Restricciones',             icon: Target,      color: 'text-emerald-600', bg: 'bg-emerald-600' },
  { id: 'semanal',   label: 'Plan Semanal',             sub: 'IWPs comprometidos · PPC · Causas NC',            icon: Clock,       color: 'text-blue-600', bg: 'bg-blue-600' },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LpsPage() {
  const params = useParams<{ project_id: string }>();
  const project_id = params?.project_id ?? '';

  const [data, setData]       = useState<Data | null>(null);
  const [screen, setScreen]   = useState<Screen>('maestra');
  const REF_DATE = '2026-01-26';

  useEffect(() => {
    fetch(`/costanera/data.json`).then(r => r.json()).then(setData).catch(() => console.warn('No data.json'));
  }, []);

  const lookaheadCWPs = useMemo(() => {
    if (!data) return [];
    const ref = new Date(REF_DATE), end6w = new Date(REF_DATE);
    end6w.setDate(end6w.getDate() + 42);
    return data.cwps
      .filter(c => c.fecha_inicio && c.fecha_fin && new Date(c.fecha_inicio) <= end6w && new Date(c.fecha_fin!) >= ref)
      .sort((a, b) => new Date(a.fecha_inicio!).getTime() - new Date(b.fecha_inicio!).getTime());
  }, [data]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-72 gap-3 text-slate-400">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
          <ClipboardList className="w-6 h-6" />
        </motion.div>
        <span className="text-sm font-semibold">Cargando módulo LPS + AWP...</span>
      </div>
    );
  }

  const { programa, iwpSeeds, cwps } = data;
  const cwpsWithDate = cwps.filter(c => c.fecha_inicio).length;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-900 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-violet-500 flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-white" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Last Planner System + AWP</span>
            </div>
            <h1 className="text-2xl font-black">Módulo LPS · Costanera</h1>
            <p className="text-sm text-slate-400 mt-1">
              Planificación Maestra → Intermedia → Semanal · Programa Maestro vinculado con {cwpsWithDate} CWPs con fechas
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            {[
              { val: programa?.pisos.length ?? 0, label: 'pisos', color: 'text-violet-400' },
              { val: cwpsWithDate, label: 'CWPs con fecha', color: 'text-emerald-400' },
              { val: lookaheadCWPs.length, label: 'lookahead 6s', color: 'text-blue-400' },
            ].map(s => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center">
                <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
                <div className="text-[10px] text-slate-500 font-semibold">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* LPS chain */}
        <div className="mt-5 flex items-center gap-1 overflow-x-auto pb-1">
          {[
            { label: 'Programa Maestro', sub: 'Meses / Trimestres', active: screen === 'maestra' },
            { label: '→', sub: '', active: false },
            { label: 'Planificación Fase', sub: '4–6 semanas', active: false },
            { label: '→', sub: '', active: false },
            { label: 'Lookahead', sub: '6 semanas', active: screen === 'lookahead' },
            { label: '→', sub: '', active: false },
            { label: 'Plan Semanal', sub: 'IWPs + PPC', active: screen === 'semanal' },
          ].map((s, i) => s.label === '→' ? (
            <ChevronRight key={i} className="w-4 h-4 text-slate-600 shrink-0" />
          ) : (
            <div key={i} className={cn('px-3 py-2 rounded-xl text-center shrink-0 transition', s.active ? 'bg-white/15 border border-white/20' : 'bg-white/5 border border-white/5')}>
              <div className="text-xs font-black text-white">{s.label}</div>
              {s.sub && <div className="text-[9px] text-slate-500">{s.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Screen selector ── */}
      <div className="grid grid-cols-3 gap-4">
        {SCREENS.map(s => {
          const Icon = s.icon;
          const active = screen === s.id;
          return (
            <button key={s.id} onClick={() => setScreen(s.id)}
              className={cn(
                'flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition',
                active ? `border-current ${s.color} bg-white shadow-md` : 'border-border bg-white hover:border-slate-300 text-slate-600'
              )}>
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', active ? s.bg : 'bg-slate-100')}>
                <Icon className={cn('w-5 h-5', active ? 'text-white' : 'text-slate-500')} />
              </div>
              <div>
                <div className={cn('text-sm font-black', active ? s.color : 'text-slate-800')}>{s.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{s.sub}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════
          PLANIFICACIÓN MAESTRA
      ══════════════════════════════════════════════════════ */}
      {screen === 'maestra' && programa && (
        <motion.div key="maestra" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

          {/* Hitos */}
          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
              <div className="w-1 h-4 bg-violet-500 rounded" /> Hitos Contractuales
            </h3>
            <div className="flex flex-wrap gap-3">
              {programa.hitos.map(h => (
                <div key={h.nombre} className="flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-100 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                  <span className="text-xs font-bold text-violet-800">{h.nombre}</span>
                  <span className="text-[10px] text-violet-500 font-mono">{fmtDate(h.fecha)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Gantt */}
          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
              <div className="w-1 h-4 bg-violet-500 rounded" /> Gantt por Piso · Obra Gruesa + Terminaciones
            </h3>
            <p className="text-[10px] text-slate-400 mb-4">Escala: dic 2024 → mar 2027 · Línea roja = referencia 26 ene 2026</p>

            {/* Eje de meses */}
            <div className="flex mb-3 ml-[130px] pr-2">
              {['Dic 24','Mar 25','Jun 25','Sep 25','Ene 26','Abr 26','Jul 26','Oct 26','Ene 27','Mar 27'].map((m, i) => (
                <div key={m} className="flex-1 text-[8px] text-slate-400 font-bold border-l border-slate-100 pl-1 truncate">{m}</div>
              ))}
            </div>

            {/* Filas de pisos */}
            <div className="space-y-2">
              {programa.pisos.map(p => (
                <div key={p.piso} className="flex items-center gap-2">
                  <div className="w-[122px] shrink-0 text-[11px] font-bold text-slate-700 text-right pr-3">{p.label}</div>
                  <div className="flex-1 relative h-7 bg-slate-50 rounded-lg border border-slate-100 overflow-hidden">
                    {p.og_inicio && p.og_fin && (
                      <motion.div
                        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.4, delay: p.piso * 0.03 }}
                        className="absolute top-1.5 h-4 bg-gradient-to-r from-orange-400 to-orange-500 rounded-md shadow-sm"
                        style={{ left: `${toX(p.og_inicio)}%`, width: `${durPct(p.og_inicio, p.og_fin)}%`, transformOrigin: 'left' }}
                        title={`Obra Gruesa: ${fmtDate(p.og_inicio)} → ${fmtDate(p.og_fin)}`}
                      />
                    )}
                    {p.term_inicio && p.term_fin && (
                      <motion.div
                        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.4, delay: p.piso * 0.03 + 0.1 }}
                        className="absolute top-1.5 h-4 bg-gradient-to-r from-violet-500 to-purple-500 rounded-md shadow-sm opacity-80"
                        style={{ left: `${toX(p.term_inicio)}%`, width: `${durPct(p.term_inicio, p.term_fin)}%`, transformOrigin: 'left' }}
                        title={`Terminaciones: ${fmtDate(p.term_inicio)} → ${fmtDate(p.term_fin)}`}
                      />
                    )}
                    {/* Línea de hoy (referencia) */}
                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 opacity-70" style={{ left: `${toX(REF_DATE)}%` }} />
                  </div>
                  {/* Mini labels */}
                  <div className="w-28 shrink-0 text-[9px] text-slate-400 leading-tight">
                    {p.og_fin && <div className="text-orange-500">OG: {fmtDate(p.og_fin)}</div>}
                    {p.term_fin && <div className="text-violet-500">T: {fmtDate(p.term_fin)}</div>}
                  </div>
                </div>
              ))}
            </div>

            {/* Leyenda */}
            <div className="mt-4 flex items-center gap-5 text-[10px] text-slate-500 border-t border-border pt-3">
              <div className="flex items-center gap-1.5"><div className="w-5 h-3 rounded bg-orange-400" /> Obra Gruesa</div>
              <div className="flex items-center gap-1.5"><div className="w-5 h-3 rounded bg-violet-500" /> Terminaciones</div>
              <div className="flex items-center gap-1.5"><div className="w-0.5 h-4 bg-red-400" /> Referencia (26 ene 2026)</div>
            </div>
          </div>

          {/* Tabla resumen */}
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-slate-50 flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Fechas por Piso · Duración</h3>
              <span className="text-[10px] text-slate-400">{programa.pisos.length} pisos mapeados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-slate-50/50">
                    {['Piso','OG Inicio','OG Fin','Dur. OG','Term. Inicio','Term. Fin','Dur. TERM','Gap OG→TERM'].map(h => (
                      <th key={h} className="text-left text-[10px] font-black uppercase tracking-wide text-slate-400 py-2.5 px-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {programa.pisos.map((p, i) => {
                    const ogDias  = p.og_inicio  && p.og_fin   ? Math.round((new Date(p.og_fin!).getTime()  - new Date(p.og_inicio!).getTime())  / 86400000) : null;
                    const tDias   = p.term_inicio && p.term_fin ? Math.round((new Date(p.term_fin!).getTime() - new Date(p.term_inicio!).getTime()) / 86400000) : null;
                    const gap     = p.og_fin && p.term_inicio  ? Math.round((new Date(p.term_inicio!).getTime() - new Date(p.og_fin!).getTime())   / 86400000) : null;
                    return (
                      <tr key={p.piso} className={cn('border-b border-slate-50 hover:bg-violet-50/20 transition', i%2===0?'':'bg-slate-50/30')}>
                        <td className="py-2.5 px-4 font-black text-violet-700">{p.label}</td>
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{fmtDate(p.og_inicio)}</td>
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{fmtDate(p.og_fin)}</td>
                        <td className="py-2.5 px-4">
                          {ogDias && <span className="px-2 py-0.5 bg-orange-50 text-orange-700 font-bold rounded-full text-[10px]">{ogDias}d</span>}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{fmtDate(p.term_inicio)}</td>
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{fmtDate(p.term_fin)}</td>
                        <td className="py-2.5 px-4">
                          {tDias && <span className="px-2 py-0.5 bg-violet-50 text-violet-700 font-bold rounded-full text-[10px]">{tDias}d</span>}
                        </td>
                        <td className="py-2.5 px-4">
                          {gap != null && (
                            <span className={cn('px-2 py-0.5 font-bold rounded-full text-[10px]',
                              gap >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                              {gap >= 0 ? `+${gap}d` : `${gap}d`}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════
          PLAN INTERMEDIO — LOOKAHEAD 6 SEMANAS
      ══════════════════════════════════════════════════════ */}
      {screen === 'lookahead' && (
        <motion.div key="lookahead" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'CWPs en ventana', val: lookaheadCWPs.length, color: 'bg-emerald-500', border: 'border-emerald-100', icon: Package },
              { label: 'ARQ en 6 semanas', val: lookaheadCWPs.filter(c=>c.disciplina==='Arquitectura').length, color: 'bg-blue-500', border: 'border-blue-100', icon: Box },
              { label: 'ELE en 6 semanas', val: lookaheadCWPs.filter(c=>c.disciplina==='Electrico').length, color: 'bg-amber-500', border: 'border-amber-100', icon: Zap },
            ].map(s => (
              <div key={s.label} className={`bg-white border ${s.border} rounded-2xl p-5 flex items-center gap-4`}>
                <div className={`w-12 h-12 rounded-xl ${s.color} flex items-center justify-center shrink-0`}>
                  <s.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="text-3xl font-black text-slate-900">{s.val}</div>
                  <div className="text-[11px] text-slate-400 font-semibold mt-0.5">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Restricciones */}
          <div className="bg-white border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Log de Restricciones</h3>
                <p className="text-[10px] text-slate-400">Restricciones que deben resolverse antes de iniciar los CWPs</p>
              </div>
              <div className="ml-auto flex gap-2">
                <span className="text-[10px] font-black px-3 py-1 bg-red-100 text-red-700 rounded-full">2 Alta</span>
                <span className="text-[10px] font-black px-3 py-1 bg-amber-100 text-amber-700 rounded-full">1 Media</span>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { tipo: 'Materiales', desc: 'Tabiques de yeso-cartón Piso 1 — despacho no confirmado', cwp: 'P01-AR01', limite: '2026-02-02', prioridad: 'Alta', owner: 'Jefe Bodega' },
                { tipo: 'Planos',     desc: 'Detalle terminación baños P1 Rev.3 — aprobación ITO pendiente', cwp: 'P01-AR03', limite: '2026-02-05', prioridad: 'Media', owner: 'Jefe Proyectos' },
                { tipo: 'Subcontrato', desc: 'Cuadrilla eléctrica Piso 1 — disponible semana 3', cwp: 'P01-EL01', limite: '2026-02-09', prioridad: 'Alta', owner: 'Adm. Contratos' },
              ].map((r, i) => (
                <div key={i} className={cn('flex items-start gap-3 p-4 rounded-xl border', r.prioridad==='Alta' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100')}>
                  <div className={cn('mt-1 w-2.5 h-2.5 rounded-full shrink-0', r.prioridad==='Alta' ? 'bg-red-500' : 'bg-amber-400')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] font-black uppercase px-2 py-0.5 rounded', r.prioridad==='Alta' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>{r.tipo}</span>
                      <span className="text-[10px] font-mono font-bold text-slate-500">{r.cwp}</span>
                      <span className="text-[10px] text-slate-500 ml-auto">Límite: {fmtDate(r.limite)} · {r.owner}</span>
                    </div>
                    <p className="text-xs text-slate-700 mt-1">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabla lookahead */}
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-emerald-50/50 flex items-center justify-between">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                <div className="w-1 h-4 bg-emerald-500 rounded" />
                CWPs Activos · Ventana {fmtDate(REF_DATE)} → {fmtDate(new Date(new Date(REF_DATE).getTime()+42*86400000).toISOString().substring(0,10))}
              </h3>
              <span className="text-[11px] text-slate-400 font-semibold">{lookaheadCWPs.length} paquetes</span>
            </div>
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white z-10 border-b border-border">
                  <tr>
                    {['CWP ID','Piso','Disciplina','Partida','Inicio Plan','Fin Plan','Tipo','Elem.','Estado'].map(h => (
                      <th key={h} className="text-left text-[10px] font-black uppercase tracking-wide text-slate-400 py-3 px-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lookaheadCWPs.map((c, i) => {
                    const started = c.fecha_inicio ? new Date(c.fecha_inicio) <= new Date(REF_DATE) : false;
                    return (
                      <tr key={c.id} className={cn('border-b border-slate-50 hover:bg-emerald-50/20 transition', i%2===0?'':'bg-slate-50/30')}>
                        <td className="py-2.5 px-4">
                          <span className={cn('font-black text-[11px]', c.disciplina==='Arquitectura'?'text-blue-700':'text-amber-700')}>{c.id}</span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-700 font-semibold whitespace-nowrap">{c.nombreCWA}</td>
                        <td className="py-2.5 px-4">
                          <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full',
                            c.disciplina==='Arquitectura'?'bg-blue-50 text-blue-700':'bg-amber-50 text-amber-700')}>
                            {c.disciplina==='Arquitectura'?'ARQ':'ELE'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 max-w-[150px] truncate">{c.partida}</td>
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{fmtDate(c.fecha_inicio)}</td>
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">{fmtDate(c.fecha_fin)}</td>
                        <td className="py-2.5 px-4">
                          {c.tipo_trabajo && (
                            <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap',
                              c.tipo_trabajo==='OBRA GRUESA'?'bg-orange-50 text-orange-700':
                              c.tipo_trabajo==='TERMINACIONES'?'bg-indigo-50 text-indigo-700':'bg-emerald-50 text-emerald-700')}>
                              {c.tipo_trabajo}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-black text-slate-700 text-right">{fmt(c.total)}</td>
                        <td className="py-2.5 px-4">
                          <span className={cn('text-[10px] font-black px-2.5 py-0.5 rounded-full whitespace-nowrap',
                            started?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-600')}>
                            {started ? '⬤ Iniciado' : '○ Por iniciar'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════
          PLAN SEMANAL + PPC
      ══════════════════════════════════════════════════════ */}
      {screen === 'semanal' && (
        <motion.div key="semanal" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

          {/* KPIs PPC */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'IWPs comprometidos', val: '12', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100' },
              { label: 'Completados', val: '—', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
              { label: 'PPC semana', val: '—', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-100' },
              { label: 'PPC acumulado', val: '—', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-100' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-5 text-center`}>
                <div className={`text-4xl font-black ${s.color}`}>{s.val}</div>
                <div className="text-[11px] text-slate-500 font-semibold mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* IWP list */}
          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-blue-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <div className="w-1 h-4 bg-blue-500 rounded" />
                  IWPs Comprometidos — Semana 1
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">26 ene → 01 feb 2026 · Piso 1 · Obra Gruesa</p>
              </div>
              <div className="text-[10px] text-slate-400 font-semibold">Marcar como completado para registrar PPC →</div>
            </div>
            <div className="divide-y divide-slate-50">
              {(iwpSeeds || []).slice(0, 12).map((iwp, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3 hover:bg-blue-50/30 transition">
                  {/* PPC checkbox */}
                  <div className="w-6 h-6 rounded-md border-2 border-slate-300 bg-white cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition shrink-0 flex items-center justify-center group" title="Marcar completada">
                    <CheckCircle2 className="w-4 h-4 text-transparent group-hover:text-emerald-400 transition" />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">{iwp.nombre}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{fmtDate(iwp.inicio)} → {fmtDate(iwp.fin)} · {iwp.duracion} día{iwp.duracion!==1?'s':''}</div>
                  </div>
                  {/* Indicador duracion */}
                  <div className="shrink-0 flex items-center gap-2">
                    <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(100, (iwp.duracion/5)*100)}%` }} />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 w-6 text-right">{iwp.duracion}d</span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full shrink-0">Planif.</span>
                </div>
              ))}
            </div>
          </div>

          {/* PPC info + benchmarks */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-900 to-indigo-900 rounded-2xl p-5 text-white">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-blue-300" />
                <h3 className="text-sm font-black">¿Qué es el PPC?</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                El <strong className="text-white">Porcentaje de Plan Cumplido</strong> mide qué fracción de las actividades comprometidas en la semana se completaron efectivamente. Es el indicador central de Last Planner.
              </p>
              <div className="space-y-2">
                {[
                  { label: 'Sin LPS (referencia industria)', pct: 60, color: 'bg-red-400', range: '55–65%' },
                  { label: 'Con LPS básico (3–6 meses)', pct: 75, color: 'bg-amber-400', range: '70–80%' },
                  { label: 'Con LPS maduro (+12 meses)', pct: 90, color: 'bg-emerald-400', range: '85–95%' },
                ].map(s => (
                  <div key={s.label} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">{s.label}</span>
                      <span className="text-white font-black">{s.range}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full ${s.color} rounded-full`} style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pareto causas NC */}
            <div className="bg-white border border-border rounded-2xl p-5">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                <div className="w-1 h-4 bg-red-400 rounded" /> Pareto · Causas de No Cumplimiento
              </h3>
              <div className="space-y-3">
                {[
                  { causa: 'Materiales no entregados', pct: 35, n: 0, color: 'bg-red-400' },
                  { causa: 'Planos sin aprobar / RFI pendiente', pct: 25, n: 0, color: 'bg-orange-400' },
                  { causa: 'Subcontrato sin cuadrilla disponible', pct: 20, n: 0, color: 'bg-amber-400' },
                  { causa: 'Trabajo previo incompleto', pct: 10, n: 0, color: 'bg-yellow-400' },
                  { causa: 'Condiciones clima / interferencias', pct: 7, n: 0, color: 'bg-blue-400' },
                  { causa: 'Otros', pct: 3, n: 0, color: 'bg-slate-300' },
                ].map(c => (
                  <div key={c.causa} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color.replace('bg-','') }} />
                    <span className="text-[10px] text-slate-600 flex-1 truncate">{c.causa}</span>
                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${c.pct}%` }} transition={{ duration: 0.6, delay: 0.1 }}
                        className={`h-full rounded-full ${c.color}`}
                      />
                    </div>
                    <span className="text-[10px] font-black text-slate-600 w-7 text-right">{c.pct}%</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[9px] text-slate-400 border-t border-border pt-3">
                Plantilla de referencia. Se pobla al registrar causas semanalmente.
              </p>
            </div>
          </div>

          {/* Curva PPC acumulada (placeholder) */}
          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
              <div className="w-1 h-4 bg-violet-500 rounded" /> Curva PPC Acumulada · Aprendizaje
            </h3>
            <div className="h-32 bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl flex items-center justify-center border border-dashed border-slate-200">
              <div className="text-center">
                <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-semibold">Curva se genera al registrar PPC semanal</p>
                <p className="text-[10px] text-slate-300 mt-1">Mínimo 4 semanas de datos para mostrar tendencia</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

    </div>
  );
}
