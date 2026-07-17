'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, BarChart3, Clock, Users, Layers, TrendingUp, Info } from 'lucide-react';

interface Disc {
  disciplina_cod: string; disciplina: string; grupo: string;
  hh: number; actividades: number; cwps: number; desde: string | null; hasta: string | null;
  dotacion_pico: number; dotacion_prom: number;
}
interface Mes { mes: string; hh: number; dotacion_total: number; dotacion: Record<string, number>; }
interface Data {
  total: { hh: number; actividades: number; disciplinas: number; cwps: number; dotacion_pico: number; meses: number; regla: string };
  disciplinas: Disc[]; meses: Mes[];
}

const fn = (v: any) => v == null ? '—' : Math.round(Number(v)).toLocaleString('es-CL');
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const mesLbl = (m: string) => { const [y, mo] = m.split('-'); return MESES[+mo - 1] + " '" + y.slice(2); };

// Paleta por disciplina (estable)
const COLOR: Record<string, string> = {
  D: '#1565C0', S: '#6A1B9A', M: '#E65100', C: '#2E7D32', EW: '#00838F', P: '#AD1457',
  A: '#5E35B1', T: '#0891B2', MB: '#C9A100', E: '#00695C', F: '#8D6E63', J: '#546E7A',
  X: '#B71C1C', ER: '#3949AB', 'N/A': '#9E9E9E',
};
const col = (c: string) => COLOR[c] ?? '#9E9E9E';

export default function RecursosPage() {
  const params = useParams();
  const projectId = params.project_id as string;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set()); // disciplinas resaltadas (vacío = todas)

  useEffect(() => {
    fetch(`/api/mining-recursos?project_id=${projectId}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(setData).catch(e => setError(String(e.message ?? e)));
  }, [projectId]);

  const maxDot = useMemo(() => data ? Math.max(1, ...data.meses.map(m => m.dotacion_total)) : 1, [data]);

  if (error) return <div className="p-8 text-red-700">Error: {error}</div>;
  if (!data) return <div className="p-10 text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Calculando recursos…</div>;

  const activa = (cod: string) => sel.size === 0 || sel.has(cod);

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-4">
        <h1 className="text-[22px] font-black text-[#1A1A1A] flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-[#FF0000]" /> Recursos y <span className="text-[#FF0000]">Dotación</span>
        </h1>
        <p className="text-[11.5px] text-slate-500">HH del programa P333 por disciplina y curva de dotación estimada ({data.total.regla}).</p>
      </div>

      {/* KPIs */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        {[
          { label: 'HH programa', v: fn(data.total.hh), icon: Clock, c: '#C2630A' },
          { label: 'Dotación pico', v: fn(data.total.dotacion_pico) + ' pers.', icon: Users, c: '#A00000' },
          { label: 'Disciplinas', v: data.total.disciplinas, icon: Layers, c: '#1A1A1A' },
          { label: 'Actividades', v: data.total.actividades, icon: TrendingUp, c: '#1A1A1A' },
          { label: 'Meses de ejecución', v: data.total.meses, icon: BarChart3, c: '#1A1A1A' },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 min-w-[140px]">
              <div className="flex items-center gap-1.5 text-[8.5px] font-black uppercase tracking-wide text-slate-400"><Icon className="w-3 h-3" style={{ color: k.c }} /> {k.label}</div>
              <div className="text-[20px] font-black" style={{ color: k.c }}>{k.v}</div>
            </div>
          );
        })}
      </div>

      {/* Curva de dotación mensual (barras apiladas por disciplina) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[12px] font-black text-[#1A1A1A]">Curva de dotación mensual (personas)</div>
          <div className="text-[10px] text-slate-400">pico: <b className="text-[#A00000]">{fn(data.total.dotacion_pico)}</b> personas</div>
        </div>
        <div className="flex items-end gap-1.5 h-56 border-b border-l border-slate-200 pl-1">
          {data.meses.map(m => {
            const activos = data.disciplinas.filter(d => activa(d.disciplina_cod) && (m.dotacion[d.disciplina_cod] ?? 0) > 0);
            return (
              <div key={m.mes} className="flex-1 flex flex-col items-center gap-1 group relative min-w-0">
                <div className="w-full flex flex-col-reverse justify-start" style={{ height: 200 }}>
                  {activos.map(d => {
                    const dot = m.dotacion[d.disciplina_cod] ?? 0;
                    const h = (dot / maxDot) * 200;
                    return <div key={d.disciplina_cod} style={{ height: Math.max(0.5, h), background: col(d.disciplina_cod) }} title={`${d.disciplina}: ${dot} pers.`} />;
                  })}
                </div>
                <div className="text-[7.5px] text-slate-400 -rotate-45 origin-top-left whitespace-nowrap h-4 mt-1">{mesLbl(m.mes)}</div>
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-600 opacity-0 group-hover:opacity-100 whitespace-nowrap">{m.dotacion_total}</div>
              </div>
            );
          })}
        </div>
        {/* Leyenda / filtro por disciplina */}
        <div className="flex flex-wrap gap-2 mt-4">
          {data.disciplinas.map(d => (
            <button key={d.disciplina_cod} onClick={() => setSel(s => { const n = new Set(s); n.has(d.disciplina_cod) ? n.delete(d.disciplina_cod) : n.add(d.disciplina_cod); return n; })}
              className="flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full border transition"
              style={{ borderColor: activa(d.disciplina_cod) ? col(d.disciplina_cod) : '#E2E8F0', color: activa(d.disciplina_cod) ? '#334155' : '#94A3B8', opacity: sel.size && !sel.has(d.disciplina_cod) ? 0.5 : 1 }}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: col(d.disciplina_cod) }} /> {d.disciplina_cod} · {d.disciplina}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla por disciplina */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="bg-slate-50 border-b-2 border-[#FF0000] text-slate-500 text-[9px] uppercase">
              <th className="text-left font-black py-2.5 px-3">Disciplina</th>
              <th className="text-left font-black">Grupo</th>
              <th className="text-right font-black">HH</th>
              <th className="text-right font-black">% del total</th>
              <th className="text-right font-black">Dotación pico</th>
              <th className="text-right font-black">Dotación prom.</th>
              <th className="text-right font-black">Actividades</th>
              <th className="text-right font-black">CWP</th>
              <th className="text-left font-black pl-3">Ventana</th>
            </tr>
          </thead>
          <tbody>
            {data.disciplinas.map(d => (
              <tr key={d.disciplina_cod} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="py-2 px-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="min-w-[26px] text-center rounded px-1.5 py-0.5 text-white text-[10px] font-extrabold" style={{ background: col(d.disciplina_cod) }}>{d.disciplina_cod}</span>
                    <b className="text-[#1A1A1A]">{d.disciplina}</b>
                  </span>
                </td>
                <td className="text-slate-500">{d.grupo}</td>
                <td className="text-right font-mono font-bold text-[#C2630A]">{fn(d.hh)}</td>
                <td className="text-right font-mono text-slate-500">{data.total.hh ? ((d.hh / data.total.hh) * 100).toFixed(1) : '0'}%</td>
                <td className="text-right font-mono font-bold text-[#A00000]">{fn(d.dotacion_pico)}</td>
                <td className="text-right font-mono text-slate-600">{fn(d.dotacion_prom)}</td>
                <td className="text-right font-mono text-slate-500">{d.actividades}</td>
                <td className="text-right font-mono text-slate-500">{d.cwps}</td>
                <td className="pl-3 text-[10px] text-slate-500 whitespace-nowrap">{d.desde?.slice(0,7) ?? '—'} → {d.hasta?.slice(0,7) ?? '—'}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
              <td className="py-2 px-3" colSpan={2}>TOTAL</td>
              <td className="text-right font-mono text-[#C2630A]">{fn(data.total.hh)}</td>
              <td className="text-right font-mono">100%</td>
              <td className="text-right font-mono text-[#A00000]">{fn(data.total.dotacion_pico)}</td>
              <td colSpan={4}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Nota sobre personal */}
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-[11px] text-blue-800">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <b>Dotación estimada</b>, calculada desde las HH del programa ({data.total.regla}). Los <b>nombres, cargos y cuadrillas</b> del personal se cargarán aquí cuando existan las nóminas (hoy las carpetas de Control de Asistencia y Remuneraciones están vacías — proyecto en arranque). Cuando tengas ese Excel, se importa y esta vista mostrará la dotación real vs. la estimada.
        </div>
      </div>
    </div>
  );
}
