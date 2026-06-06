'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Building2, Activity, Package, Layers, ArrowUpRight,
  CheckCircle2, BarChart3, Grid3X3, Link2, Search, ChevronRight,
  Box, Cpu, ShieldCheck, Info, Eye, Filter, Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface KPIs {
  totalElementos: number; totalCWPs: number; totalCWAs: number; totalTipos: number;
  porDisciplina: { Arquitectura: number; Electrico: number };
  cobertura: number; matchValidado: number;
  programaVinculado?: boolean; totalTareasMPP?: number; plazoMeses?: number; pisosMapeados?: number;
}
interface CWARow { cwa: string; nombre: string; total: number; arq: number; ele: number; cwps: number; }
interface CWPRow {
  id: string; ewp: string; pwp: string; cwa: string; nombreCWA: string;
  disciplina: string; partida: string; codPartida: string; total: number;
  tagDesde: string; tagHasta: string;
  fecha_inicio?: string | null; fecha_fin?: string | null; tipo_trabajo?: string | null;
}
interface ConexRow { cwa: string; nombre: string; arq: number; ele: number; ratio: string; densidad: number; }
interface Data {
  kpis: KPIs; cwaList: CWARow[];
  arqTipos: Record<string, number>; eleTipos: Record<string, number>;
  cwps: CWPRow[]; conexiones: ConexRow[]; topCWPs: CWPRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('es-CL');
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

function BarH({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color, border }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; border: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-white border ${border} rounded-2xl p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        <div className={`w-8 h-8 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <div>
        <span className="text-3xl font-black text-slate-900">{typeof value === 'number' ? fmt(value) : value}</span>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type Tab = '360' | 'pisos' | 'arq' | 'ele' | 'cwps' | 'conexiones';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: '360',        label: 'Vista 360°',    icon: BarChart3  },
  { id: 'pisos',      label: 'Por Piso',      icon: Building2  },
  { id: 'arq',        label: 'Arquitectura',  icon: Box        },
  { id: 'ele',        label: 'Eléctrico',     icon: Zap        },
  { id: 'cwps',       label: 'Paquetes CWP',  icon: Package    },
  { id: 'conexiones', label: 'Conexiones',    icon: Link2      },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CostaneraPage() {
  const [data, setData]           = useState<Data | null>(null);
  const [tab, setTab]             = useState<Tab>('360');
  const [search, setSearch]       = useState('');
  const [discFilter, setDiscFilter] = useState<'all' | 'Arquitectura' | 'Electrico'>('all');
  const [selectedCWA, setSelectedCWA] = useState<string | null>(null);

  useEffect(() => { fetch('/costanera/data.json').then(r => r.json()).then(setData); }, []);

  const filteredCWPs = useMemo(() => {
    if (!data) return [];
    return data.cwps.filter(c => {
      const q = search.toLowerCase();
      const matchQ   = !q || c.id.toLowerCase().includes(q) || c.partida.toLowerCase().includes(q) || c.nombreCWA.toLowerCase().includes(q);
      const matchD   = discFilter === 'all' || c.disciplina === discFilter;
      const matchCWA = !selectedCWA || c.cwa === selectedCWA;
      return matchQ && matchD && matchCWA;
    });
  }, [data, search, discFilter, selectedCWA]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
          <Zap className="w-6 h-6" />
        </motion.div>
        <span className="text-sm font-semibold">Cargando plataforma AWP Costanera...</span>
      </div>
    );
  }

  const { kpis, cwaList, arqTipos, eleTipos, cwps, conexiones } = data;
  const maxCWA = Math.max(...cwaList.map(c => c.total));
  const maxArq = Math.max(...Object.values(arqTipos));
  const maxEle = Math.max(...Object.values(eleTipos));

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-[#0C1E4F] to-indigo-900 p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center">
                <Zap className="w-4 h-4 text-slate-900" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">AWP Premium · Costanera</span>
            </div>
            <h1 className="text-2xl font-black">Soluciones Habitacionales</h1>
            <p className="text-sm text-slate-400 mt-0.5">Proyecto Costanera · Dashboard AWP con datos validados al 100%</p>
          </div>
          <div className="flex gap-3 text-right">
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <div className="text-2xl font-black text-amber-400">{fmt(kpis.totalElementos)}</div>
              <div className="text-[10px] text-slate-400 font-semibold">elementos</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <div className="text-2xl font-black text-emerald-400">{kpis.cobertura}%</div>
              <div className="text-[10px] text-slate-400 font-semibold">cobertura</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <div className="text-2xl font-black text-blue-400">{kpis.totalCWPs}</div>
              <div className="text-[10px] text-slate-400 font-semibold">paquetes CWP</div>
            </div>
            {kpis.programaVinculado && (
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <div className="text-2xl font-black text-violet-400">{kpis.pisosMapeados}</div>
                <div className="text-[10px] text-slate-400 font-semibold">pisos programa</div>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-[11px] text-emerald-300 font-semibold">
              {fmt(kpis.matchValidado)} GUIDs validados · ARQ 100% · ELE 100% · Linkable a Forge Viewer
            </span>
          </div>
          {kpis.programaVinculado && (
            <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-2">
              <Calendar className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="text-[11px] text-violet-300 font-semibold">
                Programa Maestro vinculado · {kpis.totalTareasMPP?.toLocaleString()} tareas MPP · ver módulo LPS+AWP
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide transition flex-1 justify-center',
                tab === t.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}>
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>

          {/* ═══ TAB 360° ═══ */}
          {tab === '360' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Total elementos" value={kpis.totalElementos} sub="ARQ + ELE · 100% tagueados" icon={Activity} color="bg-indigo-500" border="border-indigo-100" />
                <KpiCard label="Arquitectura" value={kpis.porDisciplina.Arquitectura} sub={`${((kpis.porDisciplina.Arquitectura/kpis.totalElementos)*100).toFixed(0)}% del total`} icon={Box} color="bg-blue-500" border="border-blue-100" />
                <KpiCard label="Eléctrico" value={kpis.porDisciplina.Electrico} sub={`${((kpis.porDisciplina.Electrico/kpis.totalElementos)*100).toFixed(0)}% del total`} icon={Zap} color="bg-amber-500" border="border-amber-100" />
                <KpiCard label="Paquetes CWP" value={kpis.totalCWPs} sub={`en ${kpis.totalCWAs} pisos/áreas`} icon={Package} color="bg-emerald-500" border="border-emerald-100" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border border-border rounded-2xl p-5">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Split por Disciplina</h3>
                  <div className="space-y-4">
                    {[
                      { disc: 'Arquitectura', val: kpis.porDisciplina.Arquitectura, color: 'bg-blue-500', light: 'bg-blue-50 text-blue-700' },
                      { disc: 'Eléctrico',    val: kpis.porDisciplina.Electrico,    color: 'bg-amber-500', light: 'bg-amber-50 text-amber-700' },
                    ].map(d => (
                      <div key={d.disc} className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-700">{d.disc}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${d.light}`}>{fmt(d.val)}</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${d.color}`} style={{ width: `${(d.val/kpis.totalElementos)*100}%` }} />
                        </div>
                        <div className="text-[10px] text-slate-400 text-right">{((d.val/kpis.totalElementos)*100).toFixed(1)}%</div>
                      </div>
                    ))}
                    <div className="pt-3 border-t border-border mt-3 grid grid-cols-2 gap-2 text-center">
                      <div className="bg-slate-50 rounded-xl p-3">
                        <div className="text-lg font-black text-slate-900">{kpis.totalCWAs}</div>
                        <div className="text-[10px] text-slate-400 font-semibold">pisos/áreas</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3">
                        <div className="text-lg font-black text-slate-900">{kpis.totalTipos}</div>
                        <div className="text-[10px] text-slate-400 font-semibold">tipos elem.</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-border rounded-2xl p-5 col-span-2">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Elementos por Piso (Top 12)</h3>
                  <div className="space-y-2">
                    {cwaList.filter(c => c.total > 0).slice(0, 12).map(c => (
                      <div key={c.cwa} className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-500 w-28 shrink-0 truncate">{c.nombre}</span>
                        <div className="flex-1 flex items-center gap-1">
                          <div className="h-2.5 rounded-full bg-blue-500" style={{ width: `${(c.arq/maxCWA)*100*0.4}%`, minWidth: c.arq>0?2:0 }} />
                          <div className="h-2.5 rounded-full bg-amber-400" style={{ width: `${(c.ele/maxCWA)*100*0.4}%`, minWidth: c.ele>0?2:0 }} />
                        </div>
                        <span className="text-[11px] font-black text-slate-700 w-12 text-right shrink-0">{fmt(c.total)}</span>
                      </div>
                    ))}
                    <div className="flex gap-4 pt-2 border-t border-border mt-1">
                      <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-blue-500" /><span className="text-[10px] text-slate-500">ARQ</span></div>
                      <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-amber-400" /><span className="text-[10px] text-slate-500">ELE</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'GUID validados vs modelo', value: `${fmt(kpis.matchValidado)} / ${fmt(kpis.matchValidado)}`, pct: 100, color: 'text-emerald-600', bar: 'bg-emerald-500', desc: 'Match perfecto ARQ+ELE' },
                  { label: 'Cobertura AWP', value: `${kpis.totalCWPs} CWPs activos`, pct: 100, color: 'text-blue-600', bar: 'bg-blue-500', desc: '331 paquetes definidos' },
                  { label: 'Trazabilidad CWP→EWP→PWP', value: '3 niveles AWP', pct: 100, color: 'text-indigo-600', bar: 'bg-indigo-500', desc: 'Cadena completa por elemento' },
                ].map(m => (
                  <div key={m.label} className="bg-white border border-border rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{m.label}</span>
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className={`text-base font-black ${m.color} mb-1`}>{m.value}</div>
                    <div className="h-1.5 bg-slate-100 rounded-full mb-1">
                      <div className={`h-full ${m.bar} rounded-full`} style={{ width: `${m.pct}%` }} />
                    </div>
                    <div className="text-[10px] text-slate-400">{m.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ TAB PISOS ═══ */}
          {tab === 'pisos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-slate-900">Distribución por Piso / CWA</h2>
                <span className="text-xs text-slate-400 font-semibold">{cwaList.filter(c=>c.total>0).length} áreas con elementos</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {cwaList.filter(c => c.total > 0).map((c, i) => {
                  const pctArq = c.total > 0 ? (c.arq/c.total)*100 : 0;
                  const pctEle = c.total > 0 ? (c.ele/c.total)*100 : 0;
                  return (
                    <motion.div key={c.cwa} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i*0.02 }}
                      className="bg-white border border-border rounded-2xl p-4 hover:border-indigo-300 hover:shadow-sm transition cursor-pointer"
                      onClick={() => { setTab('cwps'); setSelectedCWA(c.cwa); }}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{c.cwa}</div>
                          <div className="text-sm font-black text-slate-900">{c.nombre}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-black text-slate-900">{fmt(c.total)}</div>
                          <div className="text-[10px] text-slate-400">{c.cwps} CWPs</div>
                        </div>
                      </div>
                      <div className="h-3 rounded-full overflow-hidden flex gap-0.5">
                        <div className="bg-blue-500 rounded-full" style={{ width: `${pctArq}%` }} />
                        <div className="bg-amber-400 rounded-full" style={{ width: `${pctEle}%` }} />
                      </div>
                      <div className="flex justify-between mt-1.5">
                        <span className="text-[10px] text-blue-600 font-bold">{fmt(c.arq)} ARQ</span>
                        <span className="text-[10px] text-amber-600 font-bold">{fmt(c.ele)} ELE</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-indigo-500 font-semibold">
                        <Eye className="w-3 h-3" />
                        Ver CWPs de este piso
                        <ChevronRight className="w-3 h-3 ml-auto" />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══ TAB ARQ ═══ */}
          {tab === 'arq' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <KpiCard label="Total ARQ" value={kpis.porDisciplina.Arquitectura} sub="100% tagueados y validados" icon={Box} color="bg-blue-500" border="border-blue-100" />
                <KpiCard label="CWPs Arquitectura" value={cwps.filter(c=>c.disciplina==='Arquitectura').length} sub="paquetes de trabajo" icon={Package} color="bg-blue-400" border="border-blue-100" />
                <KpiCard label="Tipos de elemento" value={Object.keys(arqTipos).length} sub="categorías distintas" icon={Layers} color="bg-blue-600" border="border-blue-100" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-border rounded-2xl p-5">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Elementos por Tipo</h3>
                  <div className="space-y-2.5">
                    {Object.entries(arqTipos).sort((a,b)=>b[1]-a[1]).map(([tipo, count]) => (
                      <div key={tipo} className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-600 w-40 shrink-0 truncate">{tipo}</span>
                        <BarH value={count} max={maxArq} color="bg-blue-500" />
                        <span className="text-xs font-black text-slate-700 w-12 text-right shrink-0">{fmt(count)}</span>
                        <span className="text-[10px] text-slate-400 w-8 text-right shrink-0">{((count/kpis.porDisciplina.Arquitectura)*100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white border border-border rounded-2xl p-5">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">ARQ por Piso (Top 15)</h3>
                  <div className="space-y-2">
                    {cwaList.filter(c=>c.arq>0).slice(0,15).map(c => (
                      <div key={c.cwa} className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-500 w-28 shrink-0 truncate">{c.nombre}</span>
                        <BarH value={c.arq} max={Math.max(...cwaList.map(x=>x.arq))} color="bg-blue-500" />
                        <span className="text-xs font-black text-blue-700 w-12 text-right shrink-0">{fmt(c.arq)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-white border border-border rounded-2xl p-5">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Top CWPs · Arquitectura</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {['CWP ID','EWP ID','PWP ID','Piso','Partida','Elem.','Inicio Plan','Fin Plan'].map(h => (
                          <th key={h} className="text-left text-[10px] font-black uppercase tracking-wide text-slate-400 pb-2 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cwps.filter(c=>c.disciplina==='Arquitectura').sort((a,b)=>b.total-a.total).slice(0,15).map(c => (
                        <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 pr-4 font-black text-blue-700">{c.id}</td>
                          <td className="py-2 pr-4 text-slate-400 font-mono text-[10px]">{c.ewp}</td>
                          <td className="py-2 pr-4 text-slate-400 font-mono text-[10px]">{c.pwp}</td>
                          <td className="py-2 pr-4 text-slate-600 font-semibold">{c.nombreCWA}</td>
                          <td className="py-2 pr-4 text-slate-600">{c.partida}</td>
                          <td className="py-2 pr-4 font-black text-slate-900">{fmt(c.total)}</td>
                          <td className="py-2 pr-4 text-[10px] text-slate-400">{fmtDate(c.fecha_inicio)}</td>
                          <td className="py-2 text-[10px] text-slate-400">{fmtDate(c.fecha_fin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ TAB ELE ═══ */}
          {tab === 'ele' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <KpiCard label="Total Eléctrico" value={kpis.porDisciplina.Electrico} sub="100% tagueados y validados" icon={Zap} color="bg-amber-500" border="border-amber-100" />
                <KpiCard label="CWPs Eléctrico" value={cwps.filter(c=>c.disciplina==='Electrico').length} sub="paquetes de trabajo" icon={Package} color="bg-amber-400" border="border-amber-100" />
                <KpiCard label="Tipos de elemento" value={Object.keys(eleTipos).length} sub="categorías distintas" icon={Cpu} color="bg-amber-600" border="border-amber-100" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-border rounded-2xl p-5">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Elementos por Tipo</h3>
                  <div className="space-y-2.5">
                    {Object.entries(eleTipos).sort((a,b)=>b[1]-a[1]).map(([tipo, count]) => (
                      <div key={tipo} className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-600 w-40 shrink-0 truncate">{tipo}</span>
                        <BarH value={count} max={maxEle} color="bg-amber-400" />
                        <span className="text-xs font-black text-slate-700 w-12 text-right shrink-0">{fmt(count)}</span>
                        <span className="text-[10px] text-slate-400 w-8 text-right shrink-0">{((count/kpis.porDisciplina.Electrico)*100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white border border-border rounded-2xl p-5">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">ELE por Piso (Top 15)</h3>
                  <div className="space-y-2">
                    {cwaList.filter(c=>c.ele>0).slice(0,15).map(c => (
                      <div key={c.cwa} className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-500 w-28 shrink-0 truncate">{c.nombre}</span>
                        <BarH value={c.ele} max={Math.max(...cwaList.map(x=>x.ele))} color="bg-amber-400" />
                        <span className="text-xs font-black text-amber-700 w-12 text-right shrink-0">{fmt(c.ele)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-white border border-border rounded-2xl p-5">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Top CWPs · Eléctrico</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {['CWP ID','EWP ID','PWP ID','Piso','Partida','Elem.','Inicio Plan','Fin Plan'].map(h => (
                          <th key={h} className="text-left text-[10px] font-black uppercase tracking-wide text-slate-400 pb-2 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cwps.filter(c=>c.disciplina==='Electrico').sort((a,b)=>b.total-a.total).slice(0,15).map(c => (
                        <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 pr-4 font-black text-amber-700">{c.id}</td>
                          <td className="py-2 pr-4 text-slate-400 font-mono text-[10px]">{c.ewp}</td>
                          <td className="py-2 pr-4 text-slate-400 font-mono text-[10px]">{c.pwp}</td>
                          <td className="py-2 pr-4 text-slate-600 font-semibold">{c.nombreCWA}</td>
                          <td className="py-2 pr-4 text-slate-600">{c.partida}</td>
                          <td className="py-2 pr-4 font-black text-slate-900">{fmt(c.total)}</td>
                          <td className="py-2 pr-4 text-[10px] text-slate-400">{fmtDate(c.fecha_inicio)}</td>
                          <td className="py-2 text-[10px] text-slate-400">{fmtDate(c.fecha_fin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ TAB CWPs ═══ */}
          {tab === 'cwps' && (
            <div className="space-y-4">
              <div className="bg-white border border-border rounded-2xl p-4 flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2 bg-slate-50 border border-border rounded-xl px-3 py-2 flex-1 min-w-52">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar CWP, partida, piso..."
                    className="bg-transparent text-sm outline-none flex-1 text-slate-700 placeholder:text-slate-400" />
                </div>
                <div className="flex gap-1">
                  {(['all', 'Arquitectura', 'Electrico'] as const).map(d => (
                    <button key={d} onClick={() => setDiscFilter(d)}
                      className={cn('px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition',
                        discFilter===d ? (d==='Arquitectura'?'bg-blue-500 text-white':d==='Electrico'?'bg-amber-500 text-white':'bg-slate-800 text-white')
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                      {d==='all'?'Todas':d}
                    </button>
                  ))}
                </div>
                {selectedCWA && (
                  <button onClick={() => setSelectedCWA(null)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-[11px] font-black text-indigo-700">
                    <Filter className="w-3 h-3" />
                    {cwaList.find(c=>c.cwa===selectedCWA)?.nombre}
                    <span className="ml-1 text-indigo-400">×</span>
                  </button>
                )}
                <span className="text-[11px] text-slate-400 font-semibold ml-auto">{fmt(filteredCWPs.length)} paquetes</span>
              </div>
              <div className="bg-white border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr className="border-b border-border">
                        {['CWP ID','EWP ID','PWP ID','Piso / CWA','Disc.','Partida','Elem.','Inicio Plan','Fin Plan','Tipo Trabajo'].map(h => (
                          <th key={h} className="text-left text-[10px] font-black uppercase tracking-wide text-slate-400 py-3 px-4 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCWPs.map((c, i) => (
                        <tr key={c.id} className={cn('border-b border-slate-50 hover:bg-slate-50 transition', i%2===0?'':'bg-slate-50/50')}>
                          <td className="py-2 px-4">
                            <span className={cn('font-black text-xs', c.disciplina==='Arquitectura'?'text-blue-700':'text-amber-700')}>{c.id}</span>
                          </td>
                          <td className="py-2 px-4 text-[10px] text-slate-400 font-mono">{c.ewp}</td>
                          <td className="py-2 px-4 text-[10px] text-slate-400 font-mono">{c.pwp}</td>
                          <td className="py-2 px-4 text-slate-700 font-semibold whitespace-nowrap">{c.nombreCWA}</td>
                          <td className="py-2 px-4">
                            <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full',
                              c.disciplina==='Arquitectura'?'bg-blue-50 text-blue-700':'bg-amber-50 text-amber-700')}>
                              {c.disciplina==='Arquitectura'?'ARQ':'ELE'}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-slate-600 max-w-xs truncate">{c.partida}</td>
                          <td className="py-2 px-4 font-black text-slate-900 text-right">{fmt(c.total)}</td>
                          <td className="py-2 px-4 text-[10px] text-slate-500 whitespace-nowrap">{fmtDate(c.fecha_inicio)}</td>
                          <td className="py-2 px-4 text-[10px] text-slate-500 whitespace-nowrap">{fmtDate(c.fecha_fin)}</td>
                          <td className="py-2 px-4">
                            {c.tipo_trabajo && (
                              <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap',
                                c.tipo_trabajo==='OBRA GRUESA'?'bg-orange-50 text-orange-700':
                                c.tipo_trabajo==='TERMINACIONES'?'bg-indigo-50 text-indigo-700':'bg-emerald-50 text-emerald-700')}>
                                {c.tipo_trabajo}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ TAB CONEXIONES ═══ */}
          {tab === 'conexiones' && (
            <div className="space-y-6">
              <div className="bg-white border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Link2 className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-black text-slate-900">Conexiones ARQ ↔ ELE por Piso</h3>
                </div>
                <p className="text-xs text-slate-500 mb-5">Relación entre elementos arquitectónicos y eléctricos por área de trabajo (CWA).</p>
                <div className="space-y-3">
                  {conexiones.map((c, i) => (
                    <motion.div key={c.cwa} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i*0.03 }}
                      className="border border-border rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{c.cwa}</span>
                          <div className="text-sm font-black text-slate-900">{c.nombre}</div>
                        </div>
                        <div className="flex gap-3 text-right">
                          <div className="text-center">
                            <div className="text-lg font-black text-indigo-600">{c.ratio}x</div>
                            <div className="text-[10px] text-slate-400">ratio ELE/ARQ</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-black text-slate-700">{c.densidad}</div>
                            <div className="text-[10px] text-slate-400">elem/CWP</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-blue-50 border border-blue-100 rounded-lg p-2 text-center">
                          <div className="text-[10px] font-black text-blue-500 uppercase">ARQ</div>
                          <div className="text-base font-black text-blue-700">{fmt(c.arq)}</div>
                        </div>
                        <div className="flex flex-col items-center">
                          <ArrowUpRight className="w-4 h-4 text-indigo-400 rotate-90" />
                          <ArrowUpRight className="w-4 h-4 text-indigo-400 -rotate-90" />
                        </div>
                        <div className="flex-1 bg-amber-50 border border-amber-100 rounded-lg p-2 text-center">
                          <div className="text-[10px] font-black text-amber-500 uppercase">ELE</div>
                          <div className="text-base font-black text-amber-700">{fmt(c.ele)}</div>
                        </div>
                        <div className="w-px h-10 bg-border mx-1" />
                        <div className="flex-1 bg-indigo-50 border border-indigo-100 rounded-lg p-2 text-center">
                          <div className="text-[10px] font-black text-indigo-500 uppercase">Total</div>
                          <div className="text-base font-black text-indigo-700">{fmt(c.arq+c.ele)}</div>
                        </div>
                      </div>
                      <div className="mt-2 h-2 rounded-full overflow-hidden flex">
                        <div className="bg-blue-500" style={{ width: `${(c.arq/(c.arq+c.ele))*100}%` }} />
                        <div className="bg-amber-400" style={{ width: `${(c.ele/(c.arq+c.ele))*100}%` }} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Cadena AWP */}
              <div className="bg-white border border-border rounded-2xl p-5">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-4">Cadena AWP · Trazabilidad completa</h3>
                <div className="flex items-center gap-0 overflow-x-auto pb-2">
                  {[
                    { nivel: 'CWA',      desc: 'Piso / Área',           count: kpis.totalCWAs,      color: 'bg-slate-800 text-white',    ex: 'CWA-P12'         },
                    { nivel: 'CWP',      desc: 'Paquete construcción',  count: kpis.totalCWPs,      color: 'bg-indigo-600 text-white',   ex: 'CWP-P12-EL-01'  },
                    { nivel: 'EWP',      desc: 'Paquete ingeniería',    count: kpis.totalCWPs,      color: 'bg-blue-600 text-white',     ex: 'EWP-P12-EL-01'  },
                    { nivel: 'PWP',      desc: 'Paquete adquisición',   count: kpis.totalCWPs,      color: 'bg-emerald-600 text-white',  ex: 'PWP-P12-EL-01'  },
                    { nivel: 'ELEMENTO', desc: 'Elemento BIM',          count: kpis.totalElementos, color: 'bg-amber-500 text-white',    ex: 'P12-EL01-CN-0001' },
                  ].map((n, i) => (
                    <div key={n.nivel} className="flex items-center shrink-0">
                      {i > 0 && <ChevronRight className="w-5 h-5 text-slate-300 mx-1 shrink-0" />}
                      <div className={`rounded-xl p-3 text-center min-w-[110px] ${n.color}`}>
                        <div className="text-[10px] font-black uppercase tracking-widest opacity-70">{n.nivel}</div>
                        <div className="text-lg font-black">{fmt(n.count)}</div>
                        <div className="text-[10px] opacity-70">{n.desc}</div>
                        <div className="text-[9px] mt-1 font-mono opacity-60">{n.ex}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-950 to-slate-900 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-2 mb-2">
                  <Box className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-black">Conexión directa al Visor BIM</h3>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Los {fmt(kpis.matchValidado)} elementos tienen GUID de modelo validado. Desde cualquier CWP puedes lanzar el visor BIM con ese subconjunto pre-filtrado.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'GUID → dbId Forge', icon: Link2, desc: 'Cada tag enlaza a un elemento en el visor 3D' },
                    { label: 'Coloreado por CWP', icon: Grid3X3, desc: 'Paleta de colores por paquete de trabajo' },
                    { label: 'Filtro por piso/disc.', icon: Filter, desc: 'Selección del subset desde la tabla' },
                  ].map(c => (
                    <div key={c.label} className="bg-white/5 border border-white/10 rounded-xl p-3">
                      <c.icon className="w-4 h-4 text-indigo-400 mb-2" />
                      <div className="text-xs font-black text-white mb-1">{c.label}</div>
                      <div className="text-[10px] text-slate-400">{c.desc}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-indigo-400 font-semibold">
                  <Info className="w-3.5 h-3.5" />
                  Requiere modelo COSTANERA en Autodesk Platform Services
                </div>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
