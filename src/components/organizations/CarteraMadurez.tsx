'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, AlertTriangle, KeyRound, ArrowRight } from 'lucide-react';
import { FUENTES, CAPA_LABEL, NIVELES, type CapaDato, type NivelMadurez, type ConteoFuente } from '@/lib/fuentes-datos';

// Matriz de madurez de la cartera: una fila por proyecto, una columna por fuente de datos.
// El color de cada celda no dice "cuántos datos hay" sino si esos datos traen la llave CWP,
// que es lo que determina si el proyecto está conectado o solamente cargado.

interface ProyectoCartera {
  id: string;
  name: string;
  stage: string;
  nivel: NivelMadurez;
  conteos: Record<string, ConteoFuente>;
  cobertura: { filas: number; conLlave: number; pct: number; fuentesConDatos: number; fuentesConectadas: number };
  faltantes: string[];
}

const NIVEL_COLOR: Record<NivelMadurez, { bg: string; fg: string }> = {
  vacio:        { bg: '#F5F5F5', fg: '#9E9E9E' },
  estructura:   { bg: '#EDE7F6', fg: '#5E35B1' },
  planificable: { bg: '#E3F2FD', fg: '#1565C0' },
  cobrable:     { bg: '#FFF8E1', fg: '#B45309' },
  visual:       { bg: '#E0F2F1', fg: '#00695C' },
  ejecutable:   { bg: '#FCE4EC', fg: '#AD1457' },
  midiendo:     { bg: '#DCFCE7', fg: '#166534' },
};

const fmt = (n: number) => n.toLocaleString('es-CL');

/** Color de la celda según si la fuente tiene datos y si esos datos traen la llave. */
function estadoCelda(c: ConteoFuente | undefined, transportaLlave: boolean) {
  if (!c || !c.total) return { bg: '#FAFAFA', fg: '#BDBDBD', borde: '#EEEEEE', titulo: 'Sin cargar' };
  if (!transportaLlave) return { bg: '#F5F5F5', fg: '#616161', borde: '#E0E0E0', titulo: 'Cargado (esta fuente no lleva CWP)' };
  const pct = c.total ? Math.round(((c.conLlave ?? 0) / c.total) * 100) : 0;
  if (pct >= 98) return { bg: '#DCFCE7', fg: '#166534', borde: '#86EFAC', titulo: `${pct}% con llave CWP` };
  if (pct >= 50) return { bg: '#FEF3C7', fg: '#B45309', borde: '#FCD34D', titulo: `${pct}% con llave CWP — quedan huérfanos` };
  return { bg: '#FEE2E2', fg: '#A00000', borde: '#FCA5A5', titulo: `${pct}% con llave CWP — desconectado` };
}

export default function CarteraMadurez({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const [proyectos, setProyectos] = useState<ProyectoCartera[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portafolio?org_id=${orgId}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? 'Error'); return j; })
      .then(j => setProyectos(j.proyectos))
      .catch(e => setError(e.message));
  }, [orgId]);

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-[#A00000]">{error}</div>;
  if (!proyectos) return (
    <div className="flex items-center gap-2 py-8 text-[12px] text-slate-400">
      <Loader2 className="w-4 h-4 animate-spin" /> Midiendo la cartera…
    </div>
  );

  const capas = [...new Set(FUENTES.map(f => f.capa))] as CapaDato[];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-black text-[#1A1A1A] flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#FF0000]" /> Madurez de datos de la cartera
          </h2>
          <p className="text-[11.5px] text-slate-500 max-w-3xl">
            El <b>CWP es la llave del proyecto completo</b>, no solo del módulo AWP. Una fuente cargada sin
            esa llave no conecta con las demás. El color mide eso: verde = trae la llave, rojo = está cargada pero suelta.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          {[['#DCFCE7', '#86EFAC', 'Conectado'], ['#FEF3C7', '#FCD34D', 'Parcial'], ['#FEE2E2', '#FCA5A5', 'Sin llave'], ['#FAFAFA', '#EEEEEE', 'Sin cargar']].map(([bg, bd, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: bg, border: `1.5px solid ${bd}` }} />{label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#EEEEEE] bg-white">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky left-0 z-10 bg-white text-left px-3 py-2 border-b border-r border-[#EEEEEE] font-black text-[10px] uppercase tracking-wide text-[#757575] min-w-[210px]">Proyecto</th>
              <th rowSpan={2} className="px-2 py-2 border-b border-r border-[#EEEEEE] font-black text-[10px] uppercase tracking-wide text-[#757575]">Nivel</th>
              <th rowSpan={2} className="px-2 py-2 border-b border-r border-[#EEEEEE] font-black text-[10px] uppercase tracking-wide text-[#757575] whitespace-nowrap">Llave CWP</th>
              {capas.map(capa => (
                <th key={capa} colSpan={FUENTES.filter(f => f.capa === capa).length}
                  className="px-2 py-1.5 border-b border-r border-[#EEEEEE] bg-[#FAFAFA] font-black text-[9.5px] uppercase tracking-wider text-[#A00000]">
                  {CAPA_LABEL[capa]}
                </th>
              ))}
            </tr>
            <tr>
              {FUENTES.map(f => (
                <th key={f.key} title={f.campoCwp ? `Llave en ${f.tabla}.${f.campoCwp}` : `${f.tabla} — no transporta CWP`}
                  className="px-1.5 py-2 border-b border-r border-[#EEEEEE] font-bold text-[9.5px] text-[#616161] whitespace-nowrap">
                  {f.label}
                  {!f.campoCwp && <span className="text-[#BDBDBD]"> ·</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proyectos.map(p => {
              const nc = NIVEL_COLOR[p.nivel];
              const nivelLabel = NIVELES.find(n => n.key === p.nivel)?.label ?? p.nivel;
              return (
                <tr key={p.id} className="hover:bg-red-50/40">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 border-b border-r border-[#EEEEEE]">
                    <Link href={`/${orgSlug}/projects/${p.id}/setup`} className="font-bold text-[#1A1A1A] hover:text-[#A00000] flex items-center gap-1">
                      {p.name} <ArrowRight className="w-3 h-3 opacity-40" />
                    </Link>
                    <div className="text-[9.5px] uppercase tracking-wide text-slate-400">{p.stage}</div>
                    {p.faltantes.length > 0 && (
                      <div className="mt-0.5 flex items-center gap-1 text-[9.5px] text-[#B45309]" title="Fuentes esenciales sin cargar">
                        <AlertTriangle className="w-3 h-3" /> falta {p.faltantes.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 border-b border-r border-[#EEEEEE] text-center">
                    <span style={{ backgroundColor: nc.bg, color: nc.fg }} className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wide whitespace-nowrap">
                      {nivelLabel}
                    </span>
                  </td>
                  <td className="px-2 py-2 border-b border-r border-[#EEEEEE] text-center">
                    {p.cobertura.fuentesConDatos ? (
                      <div title={`${fmt(p.cobertura.conLlave)} de ${fmt(p.cobertura.filas)} filas traen la llave. Promedio por fuente, no por fila.`}>
                        <div className={`font-black text-[12px] ${p.cobertura.pct >= 90 ? 'text-emerald-700' : p.cobertura.pct >= 60 ? 'text-amber-600' : 'text-[#A00000]'}`}>
                          {p.cobertura.pct}%
                        </div>
                        <div className="text-[9px] text-slate-400">
                          {p.cobertura.fuentesConectadas}/{p.cobertura.fuentesConDatos} fuentes
                        </div>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  {FUENTES.map(f => {
                    const c = p.conteos[f.key];
                    const e = estadoCelda(c, !!f.campoCwp);
                    return (
                      <td key={f.key} title={`${f.label}: ${e.titulo}`}
                        style={{ backgroundColor: e.bg, color: e.fg, borderColor: e.borde }}
                        className="px-1.5 py-2 border-b border-r text-center font-bold tabular-nums">
                        {c?.total ? fmt(c.total) : '·'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-slate-500">
        {NIVELES.map(n => (
          <span key={n.key} title={n.descripcion} className="flex items-center gap-1.5">
            <span style={{ backgroundColor: NIVEL_COLOR[n.key].bg, color: NIVEL_COLOR[n.key].fg }} className="px-1.5 py-0.5 rounded font-black uppercase text-[9px]">{n.label}</span>
            <span className="text-slate-400">{n.descripcion}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
