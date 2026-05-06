'use client';

/**
 * CWPAvance
 * Panel de avance por agrupación (CWP, área, disciplina, etc.)
 * Lee los datos de un nodo (Excel importado) y los agrega.
 */

import { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  TrendingUp, Download, ChevronDown, Filter, X,
  AlertCircle, Loader2, RefreshCw, BarChart2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataRow { [col: string]: string }

interface NodeMeta {
  id:           string;
  name:         string | null;
  data_headers: string[];
  data:         DataRow[];
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function semaphoreColor(pct: number) {
  if (pct >= 80) return { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400', bar: 'bg-emerald-500' };
  if (pct >= 40) return { bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   text: 'text-amber-400',   dot: 'bg-amber-400',   bar: 'bg-amber-500'   };
  return             { bg: 'bg-rose-500/15',    border: 'border-rose-500/30',    text: 'text-rose-400',    dot: 'bg-rose-400',    bar: 'bg-rose-500'    };
}

// ─── Aggregate rows ───────────────────────────────────────────────────────────

interface GroupStat {
  value:       string;
  total:       number;
  progress:    number;       // 0–100
  statusCounts: Record<string, number>;
}

function aggregate(
  rows:       DataRow[],
  groupCol:   string,
  valueCol:   string,
  valueType:  'numeric' | 'categorical',
  doneValues: string[],       // for categorical mode
  filters:    Record<string, string>,
): GroupStat[] {
  // Apply active filters
  const filtered = rows.filter(row =>
    Object.entries(filters).every(([col, val]) =>
      !val || (row[col] ?? '').trim().toLowerCase().includes(val.toLowerCase())
    )
  );

  const groups: Record<string, DataRow[]> = {};
  for (const row of filtered) {
    const key = (row[groupCol] ?? '').trim() || '(sin valor)';
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
    .map(([value, gRows]) => {
      const total = gRows.length;

      // Progress calc
      let progress = 0;
      if (valueType === 'numeric') {
        const nums = gRows
          .map(r => parseFloat((r[valueCol] ?? '').replace('%', '')))
          .filter(n => !isNaN(n));
        progress = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
        progress = Math.min(100, Math.max(0, progress));
      } else {
        const doneSet = new Set(doneValues.map(v => v.toLowerCase().trim()));
        const done = gRows.filter(r => doneSet.has((r[valueCol] ?? '').toLowerCase().trim())).length;
        progress = total ? (done / total) * 100 : 0;
      }

      // Status distribution
      const statusCounts: Record<string, number> = {};
      for (const row of gRows) {
        const v = (row[valueCol] ?? '').trim() || '(vacío)';
        statusCounts[v] = (statusCounts[v] ?? 0) + 1;
      }

      return { value, total, progress, statusCounts };
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CWPAvanceProps {
  nodes: NodeMeta[];
}

export default function CWPAvance({ nodes }: CWPAvanceProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>(nodes[0]?.id ?? '');
  const [groupCol,       setGroupCol]       = useState('');
  const [valueCol,       setValueCol]       = useState('');
  const [valueType,      setValueType]      = useState<'numeric' | 'categorical'>('categorical');
  const [doneInput,      setDoneInput]      = useState('');        // comma-separated done values
  const [filters,        setFilters]        = useState<Record<string, string>>({});
  const [filterCol,      setFilterCol]      = useState('');
  const [showFilters,    setShowFilters]    = useState(false);
  const [exporting,      setExporting]      = useState(false);

  const node = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);
  const headers = node?.data_headers ?? [];
  const rows    = node?.data ?? [];

  const doneValues = doneInput.split(',').map(s => s.trim()).filter(Boolean);

  const stats = useMemo(() => {
    if (!groupCol || !valueCol || rows.length === 0) return [];
    return aggregate(rows, groupCol, valueCol, valueType, doneValues, filters);
  }, [rows, groupCol, valueCol, valueType, doneValues, filters]);

  // ── Auto-detect value type when column changes ────────────────────────────

  const onValueColChange = (col: string) => {
    setValueCol(col);
    if (!col || rows.length === 0) return;
    const sample = rows.slice(0, 20).map(r => r[col] ?? '').filter(Boolean);
    const numericCount = sample.filter(v => !isNaN(parseFloat(v.replace('%', '')))).length;
    setValueType(numericCount >= sample.length * 0.7 ? 'numeric' : 'categorical');
  };

  // ── Unique values for filter ──────────────────────────────────────────────

  const uniqueValsForFilter = useMemo(() => {
    if (!filterCol) return [];
    return [...new Set(rows.map(r => (r[filterCol] ?? '').trim()).filter(Boolean))].sort();
  }, [rows, filterCol]);

  // ── Export ────────────────────────────────────────────────────────────────

  const exportXLSX = useCallback(async () => {
    if (!node || stats.length === 0) return;
    setExporting(true);
    try {
      const summaryData = stats.map(s => ({
        [groupCol]:     s.value,
        'Total':        s.total,
        'Avance (%)':   Math.round(s.progress),
        'Estado':       s.progress >= 80 ? 'Verde' : s.progress >= 40 ? 'Amarillo' : 'Rojo',
        ...Object.fromEntries(Object.entries(s.statusCounts).map(([k, v]) => [`# ${k}`, v])),
      }));

      const wb = XLSX.utils.book_new();
      // Summary sheet
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Resumen');
      // Raw data sheet
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Datos');
      XLSX.writeFile(wb, `avance-${node.name ?? 'reporte'}.xlsx`);
    } finally {
      setExporting(false);
    }
  }, [node, stats, groupCol, rows]);

  // ── KPI totals ────────────────────────────────────────────────────────────

  const totalElements  = stats.reduce((s, g) => s + g.total, 0);
  const avgProgress    = stats.length ? stats.reduce((s, g) => s + g.progress, 0) / stats.length : 0;
  const verde          = stats.filter(g => g.progress >= 80).length;
  const amarillo       = stats.filter(g => g.progress >= 40 && g.progress < 80).length;
  const rojo           = stats.filter(g => g.progress < 40).length;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">

      {/* ── Config bar ────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-6 py-3 flex flex-wrap items-end gap-4">

        {/* Node selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Fuente de datos</label>
          <div className="relative">
            <select
              value={selectedNodeId}
              onChange={e => { setSelectedNodeId(e.target.value); setGroupCol(''); setValueCol(''); setFilters({}); }}
              className="appearance-none pl-3 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400"
            >
              {nodes.map(n => <option key={n.id} value={n.id}>{n.name ?? n.id} ({n.data.length} filas)</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Group by */}
        <div className="flex flex-col gap-1">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Agrupar por (CWP / Área)</label>
          <div className="relative">
            <select
              value={groupCol}
              onChange={e => setGroupCol(e.target.value)}
              className="appearance-none pl-3 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400"
            >
              <option value="">— Seleccionar —</option>
              {headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Value column */}
        <div className="flex flex-col gap-1">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Columna de Estado / Avance</label>
          <div className="relative">
            <select
              value={valueCol}
              onChange={e => onValueColChange(e.target.value)}
              className="appearance-none pl-3 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400"
            >
              <option value="">— Seleccionar —</option>
              {headers.filter(h => h !== groupCol).map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Value type toggle */}
        {valueCol && (
          <div className="flex flex-col gap-1">
            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tipo de valor</label>
            <div className="flex rounded-xl overflow-hidden border border-slate-200">
              {(['categorical', 'numeric'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setValueType(t)}
                  className={`px-3 py-1.5 text-[10px] font-black transition ${
                    valueType === t ? 'bg-[#0C1E4F] text-white' : 'text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  {t === 'numeric' ? '% Numérico' : 'Categorías'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Done values (categorical only) */}
        {valueCol && valueType === 'categorical' && (
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Valores = "Terminado" (sep. por comas)</label>
            <input
              value={doneInput}
              onChange={e => setDoneInput(e.target.value)}
              placeholder="Terminado, Done, Instalado…"
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-700 outline-none focus:border-blue-400"
            />
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Filter button */}
        <button
          onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition border ${
            Object.values(filters).some(Boolean)
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-600'
              : showFilters
              ? 'bg-slate-100 border-slate-200 text-slate-600'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Filter size={11} /> Filtros
          {Object.values(filters).filter(Boolean).length > 0 && (
            <span className="bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px]">
              {Object.values(filters).filter(Boolean).length}
            </span>
          )}
        </button>

        {/* Export */}
        <button
          onClick={exportXLSX}
          disabled={stats.length === 0 || exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1E4F] text-white rounded-xl text-[10px] font-black hover:bg-[#0C1E4F]/80 transition disabled:opacity-40"
        >
          {exporting ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
          Exportar Excel
        </button>
      </div>

      {/* ── Filter panel ──────────────────────────────────────────────────── */}
      {showFilters && headers.length > 0 && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-100 px-6 py-3 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[8px] font-black text-amber-600 uppercase tracking-widest">Columna a filtrar</label>
            <div className="relative">
              <select
                value={filterCol}
                onChange={e => setFilterCol(e.target.value)}
                className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-amber-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:border-amber-400"
              >
                <option value="">— Seleccionar —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none" />
            </div>
          </div>
          {filterCol && (
            <div className="flex flex-col gap-1">
              <label className="text-[8px] font-black text-amber-600 uppercase tracking-widest">Valor</label>
              <div className="relative">
                <select
                  value={filters[filterCol] ?? ''}
                  onChange={e => setFilters(f => ({ ...f, [filterCol]: e.target.value }))}
                  className="appearance-none pl-3 pr-7 py-1.5 bg-white border border-amber-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:border-amber-400"
                >
                  <option value="">— Todos —</option>
                  {uniqueValsForFilter.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none" />
              </div>
            </div>
          )}
          {Object.entries(filters).filter(([, v]) => v).map(([col, val]) => (
            <span key={col} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-amber-200 rounded-xl text-[10px] font-bold text-slate-600">
              <span className="text-amber-500">{col}:</span> {val}
              <button onClick={() => setFilters(f => { const n = { ...f }; delete n[col]; return n; })} className="text-slate-300 hover:text-rose-400 transition">
                <X size={9} />
              </button>
            </span>
          ))}
          {Object.values(filters).some(Boolean) && (
            <button onClick={() => setFilters({})} className="text-[10px] font-black text-amber-600 hover:text-amber-700 transition">
              Limpiar todo
            </button>
          )}
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">

        {!groupCol || !valueCol ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <BarChart2 size={28} className="text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Configura el panel</p>
              <p className="text-[11px] text-slate-300 mt-1">Selecciona la columna de agrupación y la columna de estado / avance</p>
            </div>
          </div>
        ) : stats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <AlertCircle size={24} className="text-amber-400" />
            <p className="text-sm font-black text-slate-400">Sin datos para mostrar</p>
          </div>
        ) : (
          <>
            {/* ── KPI strip ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total elementos', value: totalElements.toLocaleString('es'), color: 'text-[#0C1E4F]', bg: 'bg-slate-50' },
                { label: 'Avance promedio', value: `${Math.round(avgProgress)}%`, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: `Grupos (${stats.length})`, value: `${verde} ● ${amarillo} ● ${rojo}`, color: 'text-slate-600', bg: 'bg-slate-50', small: true },
                { label: 'En verde (≥80%)', value: verde, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              ].map((kpi, i) => (
                <div key={i} className={`${kpi.bg} rounded-2xl px-4 py-3 border border-slate-100`}>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{kpi.label}</p>
                  {kpi.small ? (
                    <div className="flex items-center gap-1.5 text-[13px] font-black">
                      <span className="text-emerald-500">{verde}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-amber-500">{amarillo}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-rose-500">{rojo}</span>
                    </div>
                  ) : (
                    <p className={`text-xl font-black ${kpi.color}`}>{kpi.value}</p>
                  )}
                </div>
              ))}
            </div>

            {/* ── Global progress bar ── */}
            <div className="mb-6 bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Avance global del proyecto</p>
                <p className="text-sm font-black text-[#0C1E4F]">{Math.round(avgProgress)}%</p>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${semaphoreColor(avgProgress).bar}`}
                  style={{ width: `${avgProgress}%` }}
                />
              </div>
            </div>

            {/* ── Table ── */}
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest w-6"></th>
                    <th className="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">{groupCol}</th>
                    <th className="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">Elementos</th>
                    <th className="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Avance</th>
                    <th className="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">%</th>
                    <th className="px-4 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest">Distribución de estados</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((stat, i) => {
                    const c = semaphoreColor(stat.progress);
                    const topStatuses = Object.entries(stat.statusCounts)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 4);
                    return (
                      <tr key={stat.value} className={`border-b border-slate-50 hover:bg-slate-50/60 transition ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                        {/* Semaphore dot */}
                        <td className="px-4 py-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                        </td>
                        {/* Group name */}
                        <td className="px-4 py-3">
                          <span className="text-[11px] font-bold text-slate-700">{stat.value}</span>
                        </td>
                        {/* Total */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-[11px] font-black text-slate-500">{stat.total.toLocaleString('es')}</span>
                        </td>
                        {/* Progress bar */}
                        <td className="px-4 py-3 min-w-[140px]">
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${c.bar} transition-all duration-300`}
                              style={{ width: `${stat.progress}%` }}
                            />
                          </div>
                        </td>
                        {/* Pct */}
                        <td className="px-4 py-3 text-right">
                          <span className={`text-[12px] font-black ${c.text}`}>{Math.round(stat.progress)}%</span>
                        </td>
                        {/* Status distribution pills */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {topStatuses.map(([val, cnt]) => (
                              <span
                                key={val}
                                className="px-2 py-0.5 bg-slate-100 rounded-full text-[8px] font-bold text-slate-500"
                                title={`${val}: ${cnt}`}
                              >
                                {cnt} {val.length > 12 ? val.slice(0, 12) + '…' : val}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
