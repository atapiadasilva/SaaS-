'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, CalendarClock, ChevronRight, ChevronDown, AlertTriangle, Clock, Layers, CheckCircle2, Search } from 'lucide-react';

interface Act {
  id: string; id_p6: string; id_3wla: string | null; actividad: string; especialidad: string | null;
  commodity: string | null; unidad: string | null; cantidad: number | null; hh_total: number | null;
  fecha_ini: string | null; fecha_fin: string | null; hh_sem1: number | null; hh_sem2: number | null; hh_sem3: number | null;
}
interface Restr {
  id: string; id_p6: string; tipo: string | null; descripcion: string; responsable: string | null;
  entidad: string | null; status: string | null; fecha_compromiso: string | null; fecha_cierre: string | null; observacion: string | null;
}
interface CwpGroup {
  cwp_id: string | null; nombre: string; disciplina_cod: string | null; hh: number;
  actividades: Act[]; restricciones: Restr[];
}
interface Data {
  fechas: string[]; fecha: string | null;
  total: { actividades: number; hh: number; restr_abiertas: number; cwps: number };
  cwps: CwpGroup[];
}

const fn = (v: any) => v == null ? '—' : Math.round(Number(v)).toLocaleString('es-CL');
const fd = (s: string | null) => s ? s.slice(8, 10) + '-' + s.slice(5, 7) : '—';

const TIPO_COLOR: Record<string, string> = {
  'Ingeniería': '#1D4ED8', 'Seguridad': '#B45309', 'Suministro': '#7C3AED',
  'Maquinaria/Equipo': '#0891B2', 'Liberación de área': '#166534', 'Otro': '#64748B',
};

export default function TrisemanalPage() {
  const params = useParams();
  const projectId = params.project_id as string;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const load = useCallback((f?: string | null) => {
    const q = f ? `&fecha_control=${f}` : '';
    fetch(`/api/mining-3wla?project_id=${projectId}${q}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then((d: Data) => { setData(d); setFecha(d.fecha); })
      .catch(e => setError(String(e.message ?? e)));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const patchRestr = async (id: string, patch: any) => {
    await fetch('/api/mining-3wla', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, restriccion_id: id, ...patch }),
    });
    load(fecha);
  };

  const cwps = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toUpperCase();
    if (!q) return data.cwps;
    return data.cwps.filter(g =>
      [g.cwp_id, g.nombre].some(v => v && v.toUpperCase().includes(q)) ||
      g.actividades.some(a => a.actividad.toUpperCase().includes(q) || a.id_p6.toUpperCase().includes(q)));
  }, [data, search]);

  if (error) return <div className="p-8 text-red-700">Error: {error}</div>;
  if (!data) return <div className="p-10 text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando trisemanal…</div>;

  if (!data.fechas.length) return (
    <div className="max-w-3xl mx-auto p-10 text-center">
      <CalendarClock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
      <div className="text-slate-600 font-bold">Aún no hay trisemanales importados</div>
      <div className="text-slate-400 text-sm mt-1">Corre <code>scripts/import-3wla.mjs</code> con el Excel del programa trisemanal.</div>
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="mb-4">
        <h1 className="text-[22px] font-black text-[#1A1A1A] flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-[#FF0000]" /> Control <span className="text-[#FF0000]">Trisemanal</span>
        </h1>
        <p className="text-[11.5px] text-slate-500">Planificación intermedia (3WLA) por CWP — actividades, HH y restricciones. Trazabilidad ID P6 → CWP.</p>
      </div>

      {/* KPIs + selector de fecha */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        {[
          { label: 'CWP con actividad', v: data.total.cwps, icon: Layers, c: '#1A1A1A' },
          { label: 'Actividades', v: data.total.actividades, icon: CalendarClock, c: '#1A1A1A' },
          { label: 'HH del período', v: fn(data.total.hh), icon: Clock, c: '#C2630A' },
          { label: 'Restricciones abiertas', v: data.total.restr_abiertas, icon: AlertTriangle, c: data.total.restr_abiertas ? '#A00000' : '#166534' },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 min-w-[150px]">
              <div className="flex items-center gap-1.5 text-[8.5px] font-black uppercase tracking-wide text-slate-400"><Icon className="w-3 h-3" style={{ color: k.c }} /> {k.label}</div>
              <div className="text-[20px] font-black" style={{ color: k.c }}>{k.v}</div>
            </div>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar CWP o actividad…" className="pl-8 pr-3 py-1.5 rounded-full border border-slate-200 text-[11px] outline-none w-56" />
          </div>
          <label className="text-[10px] text-slate-400 font-bold uppercase">Semana</label>
          <select value={fecha ?? ''} onChange={e => { setFecha(e.target.value); load(e.target.value); }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11.5px] font-mono outline-none">
            {data.fechas.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      {/* CWPs */}
      <div className="space-y-2.5">
        {cwps.map(g => {
          const k = g.cwp_id ?? '__sin__';
          const abierto = open.has(k);
          const restrAbiertas = g.restricciones.filter(r => r.status === 'Abierta').length;
          return (
            <div key={k} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <button onClick={() => setOpen(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left">
                {abierto ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                {g.disciplina_cod && <span className="min-w-[30px] text-center rounded-md px-2 py-0.5 text-white text-[11px] font-extrabold bg-[#FF0000]">{g.disciplina_cod}</span>}
                <span className="font-mono text-[14px] font-extrabold text-[#1A1A1A]">{g.cwp_id ?? 'Sin CWP'}</span>
                <span className="text-[12px] text-slate-500 truncate">{g.nombre}</span>
                <div className="ml-auto flex items-center gap-4 text-[11px] shrink-0">
                  <span className="text-slate-500">{g.actividades.length} act.</span>
                  <span className="font-mono font-bold text-[#C2630A]">{fn(g.hh)} HH</span>
                  {restrAbiertas > 0
                    ? <span className="inline-flex items-center gap-1 text-[#A00000] font-bold"><AlertTriangle className="w-3.5 h-3.5" /> {restrAbiertas} restr.</span>
                    : <span className="inline-flex items-center gap-1 text-emerald-600 font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> libre</span>}
                </div>
              </button>

              {abierto && (
                <div className="px-4 pb-4 pt-1 border-t border-slate-100">
                  {/* Actividades */}
                  <div className="text-[9.5px] font-black uppercase tracking-wide text-slate-400 mt-2 mb-1">Actividades del período</div>
                  <table className="w-full text-[11px]">
                    <thead><tr className="text-slate-400 text-[9px] uppercase">
                      <th className="text-left font-bold py-1">ID P6</th><th className="text-left font-bold">Actividad</th>
                      <th className="text-left font-bold">Especialidad</th><th className="text-right font-bold">HH</th>
                      <th className="text-right font-bold">S1</th><th className="text-right font-bold">S2</th><th className="text-right font-bold">S3</th>
                      <th className="text-left font-bold pl-3">Fechas</th>
                    </tr></thead>
                    <tbody>
                      {g.actividades.map(a => (
                        <tr key={a.id} className="border-t border-slate-50">
                          <td className="py-1 font-mono text-[9.5px] text-slate-500 whitespace-nowrap">{a.id_p6}</td>
                          <td className="text-[#33475B]">{a.actividad}</td>
                          <td className="text-slate-500 text-[10px]">{a.especialidad ?? ''}</td>
                          <td className="text-right font-mono font-semibold">{fn(a.hh_total)}</td>
                          <td className="text-right font-mono text-slate-400">{a.hh_sem1 ? fn(a.hh_sem1) : ''}</td>
                          <td className="text-right font-mono text-slate-400">{a.hh_sem2 ? fn(a.hh_sem2) : ''}</td>
                          <td className="text-right font-mono text-slate-400">{a.hh_sem3 ? fn(a.hh_sem3) : ''}</td>
                          <td className="pl-3 text-[10px] text-slate-500 whitespace-nowrap">{fd(a.fecha_ini)} → {fd(a.fecha_fin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Restricciones */}
                  {g.restricciones.length > 0 && (
                    <>
                      <div className="text-[9.5px] font-black uppercase tracking-wide text-slate-400 mt-4 mb-1.5">Restricciones / requisitos</div>
                      <div className="space-y-1.5">
                        {g.restricciones.map(r => {
                          const cerrada = r.status === 'Cerrada';
                          return (
                            <div key={r.id} className="flex items-start gap-2.5 rounded-lg border px-3 py-2" style={{ borderColor: cerrada ? '#E2E8F0' : '#FDE68A', background: cerrada ? '#FAFAFA' : '#FFFEF7', opacity: cerrada ? 0.7 : 1 }}>
                              <button onClick={() => patchRestr(r.id, { status: cerrada ? 'Abierta' : 'Cerrada' })} title={cerrada ? 'Reabrir' : 'Marcar despejada'} className="mt-0.5 shrink-0">
                                {cerrada ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[8.5px] font-black uppercase px-2 py-0.5 rounded-full text-white" style={{ background: TIPO_COLOR[r.tipo ?? 'Otro'] ?? '#64748B' }}>{r.tipo}</span>
                                  {r.entidad && <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{r.entidad}</span>}
                                  <span className="text-[9px] font-mono text-slate-400">{r.id_p6}</span>
                                  {r.fecha_compromiso && !cerrada && <span className="text-[9px] text-amber-700 font-bold ml-auto">compromiso {fd(r.fecha_compromiso)}</span>}
                                  {cerrada && <span className="text-[9px] text-emerald-600 font-bold ml-auto">✓ cerrada {fd(r.fecha_cierre)}</span>}
                                </div>
                                <div className="text-[11px] text-[#1A1A1A] mt-1">{r.descripcion}</div>
                                {(r.responsable || r.observacion) && (
                                  <div className="text-[9.5px] text-slate-500 mt-0.5">
                                    {r.responsable && <span>👤 {r.responsable}</span>}
                                    {r.observacion && <span className="ml-2">· {r.observacion}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
