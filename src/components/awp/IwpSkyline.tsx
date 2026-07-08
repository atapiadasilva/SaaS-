'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Lock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SkyIwp {
  iwp_id: string; cwp_id: string; descripcion: string | null; status: string;
  hh_estimadas: number; avance_fisico_pct: number; semana_ejecucion: string | null;
  fecha_inicio_plan: string | null; crew_size: number | null;
  constraints: { total: number; despejados: number };
}

const fn = (v: number) => Math.round(v).toLocaleString('es-CL');

// Color del bloque según el estándar Skyline (WorkPacks/O3):
// verde=completado · ámbar=en ejecución · azul=constraint-free (listo) ·
// gris=planificado sin restricciones pendientes · rojo=con constraints pendientes · morado=hold
function blockStyle(i: SkyIwp) {
  const pendientes = i.constraints.total - i.constraints.despejados;
  if (i.status === 'COMPLETADO') return 'bg-green-500 text-white';
  if (i.status === 'EN_EJECUCION') return 'bg-amber-400 text-amber-950';
  if (i.status === 'HOLD') return 'bg-purple-500 text-white';
  if (i.status === 'LISTO_PARA_TRABAJO') return 'bg-[#FF0000] text-white';
  return pendientes > 0 ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-slate-200 text-slate-700';
}

export default function IwpSkyline({ projectId, onClose, onOpenIwp }: {
  projectId: string; onClose: () => void; onOpenIwp?: (cwpId: string, iwpId: string) => void;
}) {
  const [rows, setRows] = useState<SkyIwp[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/mining-iwp?project_id=${projectId}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`); return d; })
      .then(d => setRows(d.rows ?? []))
      .catch(e => setError(e.message));
  }, [projectId]);

  const semanas = useMemo(() => {
    const map = new Map<string, SkyIwp[]>();
    for (const r of rows ?? []) {
      const k = r.semana_ejecucion ?? 'Sin semana';
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    return [...map.entries()].sort(([a], [b]) => (a === 'Sin semana' ? 1 : b === 'Sin semana' ? -1 : a.localeCompare(b)));
  }, [rows]);

  const kpi = useMemo(() => {
    const all = rows ?? [];
    const libres = all.filter(i => i.constraints.total - i.constraints.despejados === 0 && i.status !== 'COMPLETADO');
    const bloqueados = all.filter(i => i.constraints.total - i.constraints.despejados > 0);
    const backlogHH = all.filter(i => i.status === 'LISTO_PARA_TRABAJO').reduce((s, i) => s + (i.hh_estimadas ?? 0), 0);
    return { total: all.length, libres: libres.length, bloqueados: bloqueados.length, backlogHH };
  }, [rows]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="relative px-6 py-4 flex items-center gap-6 border-b-2 border-[#FF0000] shrink-0 overflow-hidden">
        <div className="absolute inset-0 hilo-texture" />
        <div className="relative">
          <h2 className="font-display text-[18px] font-bold text-[#1A1A1A]">Skyline <span className="text-[#FF0000]">IWP</span></h2>
          <p className="text-[11px] text-[#757575]">Cada bloque es un IWP en su semana de ejecución — el backlog ejecutable de un vistazo</p>
        </div>
        <div className="flex gap-7 ml-auto relative">
          <div className="text-center"><div className="text-[17px] font-black text-[#1A1A1A]">{kpi.total}</div><div className="text-[9px] uppercase tracking-wider text-[#BDBDBD]">IWP</div></div>
          <div className="text-center"><div className="text-[17px] font-black text-[#FF0000]">{kpi.libres}</div><div className="text-[9px] uppercase tracking-wider text-[#BDBDBD]">Constraint-free</div></div>
          <div className="text-center"><div className="text-[17px] font-black text-[#FF0000]">{kpi.bloqueados}</div><div className="text-[9px] uppercase tracking-wider text-[#BDBDBD]">Bloqueados</div></div>
          <div className="text-center"><div className="text-[17px] font-black text-green-600">{fn(kpi.backlogHH)}</div><div className="text-[9px] uppercase tracking-wider text-[#BDBDBD]">HH backlog listo</div></div>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-red-50 text-[#757575] hover:text-[#A00000] relative"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex items-center gap-4 px-6 py-2 text-[10px] text-[#757575] border-b border-[#EEEEEE] shrink-0">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-200 inline-block" /> Planificado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" /> Con constraints pendientes</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#FF0000] inline-block" /> Listo para trabajo</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> En ejecución</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Completado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-purple-500 inline-block" /> Hold</span>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-white">
        {error && <div className="text-[#A00000] text-[12px]">{error}</div>}
        {rows === null ? (
          <div className="flex items-center gap-2 text-[#757575] text-[12px] justify-center py-16"><Loader2 className="w-4 h-4 animate-spin text-[#FF0000]" /> Cargando IWP…</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-[#757575] italic py-16 text-[13px]">Aún no hay IWP creados en el proyecto — crea el primero desde la pestaña IWP de un CWP.</div>
        ) : (
          <div className="flex gap-3 items-end min-h-full">
            {semanas.map(([semana, iwps]) => (
              <div key={semana} className="flex flex-col-reverse gap-1.5 min-w-[130px]">
                {iwps.map(i => {
                  const pend = i.constraints.total - i.constraints.despejados;
                  return (
                    <button
                      key={i.iwp_id}
                      onClick={() => onOpenIwp?.(i.cwp_id, i.iwp_id)}
                      title={`${i.iwp_id}\n${i.descripcion ?? ''}\n${fn(i.hh_estimadas)} HH · ${i.avance_fisico_pct?.toFixed(0) ?? 0}% avance${pend ? `\n⚠ ${pend} constraint(s) pendiente(s)` : ''}`}
                      className={cn('rounded-md px-2 py-1.5 text-left transition hover:scale-[1.03] hover:z-10', blockStyle(i))}
                    >
                      <div className="text-[9.5px] font-black truncate flex items-center gap-1">
                        {pend > 0 && <Lock className="w-2.5 h-2.5 shrink-0" />}
                        {i.iwp_id.split('-IWP-').pop() ? `${i.cwp_id} · ${i.iwp_id.split('-IWP-').pop()}` : i.iwp_id}
                      </div>
                      <div className="text-[8.5px] opacity-80 flex items-center justify-between gap-2">
                        <span>{fn(i.hh_estimadas)} HH</span>
                        <span>{Math.round(i.avance_fisico_pct ?? 0)}%</span>
                      </div>
                    </button>
                  );
                })}
                <div className="text-center text-[10px] font-bold text-[#1A1A1A] pt-1.5 mt-1 order-first relative">
                  <div className="absolute -top-0.5 left-0 right-0 flex items-center">
                    <div className="flex-1 border-t-[1.5px] border-[#FF0000]/40" />
                    <span className="hilo-dot hilo-dot--open mx-1" style={{ width: 6, height: 6 }} />
                    <div className="flex-1 border-t-[1.5px] border-[#FF0000]/40" />
                  </div>
                  {semana}
                  <div className="text-[8.5px] text-[#BDBDBD] font-normal">{iwps.length} IWP · {fn(iwps.reduce((s, x) => s + (x.hh_estimadas ?? 0), 0))} HH</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
