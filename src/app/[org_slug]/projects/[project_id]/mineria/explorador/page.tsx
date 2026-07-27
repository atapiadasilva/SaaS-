'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ArrowLeft, Table2, Download, AlertTriangle } from 'lucide-react';
import { FUENTES_EXPLORABLES, FUENTE_EXPLORABLE_BY_KEY, SIN_VALOR } from '@/lib/explorador-dimensiones';

// Explorador de datos: elige una fuente, una categoría para agrupar y una métrica.
// Con una segunda categoría se arma una tabla cruzada.

interface Resultado {
  fuente: { key: string; label: string };
  dimension: { key: string; label: string };
  dimension2: { key: string; label: string } | null;
  metrica: { key: string; label: string; formato: 'entero' | 'clp' | 'decimal' };
  filas: { valor: string; total: number }[];
  columnas: { valor: string; total: number }[] | null;
  celdas: { d1: string; d2: string; total: number; filas: number }[] | null;
  total: number;
  nFilas: number;
  sinAsignar: number;
}

const fmt = (v: number, formato: string) =>
  formato === 'clp' ? '$' + Math.round(v).toLocaleString('es-CL')
  : formato === 'decimal' ? v.toLocaleString('es-CL', { maximumFractionDigits: 1 })
  : Math.round(v).toLocaleString('es-CL');

const Selector = ({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { key: string; label: string }[];
}) => (
  <label className="flex flex-col gap-1">
    <span className="text-[9px] font-black uppercase tracking-wider text-[#757575]">{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)}
      className="rounded-lg border-2 border-[#EEEEEE] bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#1A1A1A] outline-none focus:border-[#FF0000] min-w-[150px]">
      {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  </label>
);

export default function ExploradorPage() {
  const { org_slug, project_id } = useParams<{ org_slug: string; project_id: string }>();
  const [fuenteKey, setFuenteKey] = useState('cwp');
  const [dim, setDim] = useState('cwa_id');
  const [dim2, setDim2] = useState('');
  const [metrica, setMetrica] = useState('count');
  const [datos, setDatos] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fuente = FUENTE_EXPLORABLE_BY_KEY[fuenteKey];

  // Al cambiar de fuente, las dimensiones y métricas anteriores puede que no existan.
  useEffect(() => {
    if (!fuente.dimensiones.some(d => d.key === dim)) setDim(fuente.dimensiones[0].key);
    if (dim2 && !fuente.dimensiones.some(d => d.key === dim2)) setDim2('');
    if (!fuente.metricas.some(m => m.key === metrica)) setMetrica('count');
  }, [fuenteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fuente.dimensiones.some(d => d.key === dim)) return;
    setCargando(true); setError(null);
    const q = new URLSearchParams({ project_id, fuente: fuenteKey, dim, metrica });
    if (dim2) q.set('dim2', dim2);
    fetch(`/api/explorador?${q}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j?.error); return j; })
      .then(setDatos)
      .catch(e => { setError(e.message); setDatos(null); })
      .finally(() => setCargando(false));
  }, [project_id, fuenteKey, dim, dim2, metrica]);

  const celdaPorClave = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of datos?.celdas ?? []) m.set(`${c.d1}||${c.d2}`, c.total);
    return m;
  }, [datos]);

  const exportarCsv = () => {
    if (!datos) return;
    const sep = ';';
    let csv: string;
    if (datos.dimension2 && datos.columnas) {
      csv = [[datos.dimension.label, ...datos.columnas.map(c => c.valor), 'Total'].join(sep)]
        .concat(datos.filas.map(f => [f.valor,
          ...datos.columnas!.map(c => celdaPorClave.get(`${f.valor}||${c.valor}`) ?? 0), f.total].join(sep)))
        .join('\n');
    } else {
      csv = [[datos.dimension.label, datos.metrica.label].join(sep)]
        .concat(datos.filas.map(f => [f.valor, f.total].join(sep))).join('\n');
    }
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${datos.fuente.key}_por_${datos.dimension.key}${datos.dimension2 ? '_x_' + datos.dimension2.key : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxFila = Math.max(1, ...(datos?.filas ?? []).map(f => f.total));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href={`/${org_slug}/projects/${project_id}/mineria`}
            className="text-[10px] font-black uppercase tracking-wide text-[#757575] hover:text-[#A00000] flex items-center gap-1 mb-1">
            <ArrowLeft className="w-3 h-3" /> Volver al explorador CWP
          </Link>
          <h1 className="text-[20px] font-black text-[#1A1A1A] flex items-center gap-2">
            <Table2 className="w-5 h-5 text-[#FF0000]" /> Explorador <span className="text-[#FF0000]">de datos</span>
          </h1>
          <p className="text-[11.5px] text-slate-500">
            Elige una fuente, la categoría por la que agrupar y qué medir. Agrega una segunda categoría para cruzarlas.
          </p>
        </div>
        {datos && (
          <button onClick={exportarCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#EEEEEE] px-3 py-1.5 text-[11px] font-black text-[#757575] hover:border-[#FF0000] hover:text-[#A00000]">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border-2 border-[#EEEEEE] bg-white p-4">
        <Selector label="Fuente" value={fuenteKey} onChange={setFuenteKey}
          options={FUENTES_EXPLORABLES.map(f => ({ key: f.key, label: f.label }))} />
        <Selector label="Agrupar por" value={dim} onChange={setDim} options={fuente.dimensiones} />
        <Selector label="Cruzar con" value={dim2} onChange={setDim2}
          options={[{ key: '', label: '— ninguna —' }, ...fuente.dimensiones.filter(d => d.key !== dim)]} />
        <Selector label="Medir" value={metrica} onChange={setMetrica} options={fuente.metricas} />
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-[#A00000]">{error}</div>}
      {cargando && <div className="flex items-center gap-2 py-8 text-[12px] text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Agrupando…</div>}

      {datos && !cargando && (
        <>
          <div className="flex flex-wrap gap-5 rounded-2xl border-2 border-[#EEEEEE] bg-white px-5 py-3">
            <div>
              <div className="text-[9px] font-black uppercase tracking-wider text-[#757575]">{datos.metrica.label}</div>
              <div className="text-[19px] font-black text-[#1A1A1A]">{fmt(datos.total, datos.metrica.formato)}</div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-wider text-[#757575]">Registros</div>
              <div className="text-[19px] font-black text-[#1A1A1A]">{datos.nFilas.toLocaleString('es-CL')}</div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-wider text-[#757575]">Categorías</div>
              <div className="text-[19px] font-black text-[#1A1A1A]">{datos.filas.length}</div>
            </div>
            {datos.sinAsignar > 0 && (
              <div className="flex items-center gap-1.5 text-[#B45309]">
                <AlertTriangle className="w-4 h-4" />
                <div>
                  <div className="text-[9px] font-black uppercase tracking-wider">Sin asignar</div>
                  <div className="text-[15px] font-black">{fmt(datos.sinAsignar, datos.metrica.formato)}</div>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border-2 border-[#EEEEEE] bg-white">
            {datos.dimension2 && datos.columnas ? (
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left border-b border-r border-[#EEEEEE] font-black text-[10px] uppercase text-[#757575]">
                      {datos.dimension.label}
                    </th>
                    {datos.columnas.map(c => (
                      <th key={c.valor} className="px-2 py-2 border-b border-r border-[#EEEEEE] font-bold text-[10px] text-[#616161] whitespace-nowrap">{c.valor}</th>
                    ))}
                    <th className="px-2 py-2 border-b border-[#EEEEEE] font-black text-[10px] uppercase text-[#A00000]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.filas.map(f => (
                    <tr key={f.valor} className="hover:bg-red-50/40">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-r border-[#EEEEEE] font-bold text-[#1A1A1A] whitespace-nowrap">
                        {f.valor === SIN_VALOR ? <span className="text-[#B45309]">{f.valor}</span> : f.valor}
                      </td>
                      {datos.columnas!.map(c => {
                        const v = celdaPorClave.get(`${f.valor}||${c.valor}`) ?? 0;
                        return (
                          <td key={c.valor} className="px-2 py-1.5 border-b border-r border-[#EEEEEE] text-right tabular-nums"
                            style={{ backgroundColor: v ? `rgba(255,0,0,${Math.min(0.18, v / maxFila * 0.18)})` : undefined }}>
                            {v ? fmt(v, datos.metrica.formato) : <span className="text-slate-300">·</span>}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 border-b border-[#EEEEEE] text-right font-black tabular-nums">{fmt(f.total, datos.metrica.formato)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left border-b border-[#EEEEEE] font-black text-[10px] uppercase text-[#757575]">{datos.dimension.label}</th>
                    <th className="px-4 py-2 text-right border-b border-[#EEEEEE] font-black text-[10px] uppercase text-[#757575] w-40">{datos.metrica.label}</th>
                    <th className="px-4 py-2 border-b border-[#EEEEEE] w-1/3"></th>
                  </tr>
                </thead>
                <tbody>
                  {datos.filas.map(f => (
                    <tr key={f.valor} className="hover:bg-red-50/40">
                      <td className="px-4 py-1.5 border-b border-[#F5F5F5] font-bold text-[#1A1A1A]">
                        {f.valor === SIN_VALOR ? <span className="text-[#B45309]">{f.valor}</span> : f.valor}
                      </td>
                      <td className="px-4 py-1.5 border-b border-[#F5F5F5] text-right tabular-nums font-black">{fmt(f.total, datos.metrica.formato)}</td>
                      <td className="px-4 py-1.5 border-b border-[#F5F5F5]">
                        <div className="h-2.5 rounded-full bg-[#FF0000]" style={{ width: `${(f.total / maxFila) * 100}%`, minWidth: f.total ? 2 : 0 }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
