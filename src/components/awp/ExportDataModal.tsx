'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { X, Download, Search, CheckSquare, Square, Loader2 } from 'lucide-react';

export interface ExportColumnDef {
  key: string;
  label: string;
  get: (row: any) => string | number | boolean | null | undefined;
}

interface ExportDataModalProps {
  open: boolean;
  onClose: () => void;
  columns: ExportColumnDef[];
  lockedKeys?: string[];
  rows: any[] | null;
  loadingProgress?: { loaded: number; total: number } | null;
  defaultSelectedKeys?: string[];
  filename: string;
}

const PREVIEW_ROWS = 15;

export default function ExportDataModal({
  open, onClose, columns, lockedKeys = [], rows, loadingProgress, defaultSelectedKeys, filename,
}: ExportDataModalProps) {
  const lockedSet = useMemo(() => new Set(lockedKeys), [lockedKeys]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelectedKeys ?? columns.map(c => c.key)));
  const [colSearch, setColSearch] = useState('');
  const orderedColumns = useMemo(
    () => [...columns.filter(c => lockedSet.has(c.key)), ...columns.filter(c => !lockedSet.has(c.key))],
    [columns, lockedSet]
  );

  if (!open) return null;

  const toggleCol = (key: string) => {
    if (lockedSet.has(key)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(columns.map(c => c.key)));
  const selectNone = () => setSelected(new Set(lockedKeys));

  const activeColumns = orderedColumns.filter(c => selected.has(c.key));
  const filteredColumnDefs = colSearch.trim()
    ? columns.filter(c => c.label.toLowerCase().includes(colSearch.trim().toLowerCase()))
    : columns;

  const loading = rows === null;
  const previewRows = rows?.slice(0, PREVIEW_ROWS) ?? [];

  const onExport = () => {
    if (!rows || activeColumns.length === 0) return;
    const data = rows.map(r => {
      const obj: Record<string, any> = {};
      for (const c of activeColumns) obj[c.label] = c.get(r) ?? '';
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, filename);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(12,30,79,0.4)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="px-7 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100 shadow-sm shrink-0">
              <Download size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold text-slate-800">Exportar datos</h2>
              <p className="text-[11.5px] text-slate-400">Elige las columnas, revisa la vista previa y exporta a Excel.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Selector de columnas */}
          <div className="w-[260px] border-r border-slate-100 flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-100 space-y-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                <input
                  value={colSearch} onChange={e => setColSearch(e.target.value)}
                  placeholder="Buscar columna…"
                  className="w-full pl-7 pr-2 py-1.5 text-[11.5px] border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-3 text-[10.5px] font-bold text-blue-600">
                <button onClick={selectAll} className="hover:underline">Seleccionar todo</button>
                <button onClick={selectNone} className="hover:underline">Ninguno</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredColumnDefs.map(c => {
                const locked = lockedSet.has(c.key);
                const checked = selected.has(c.key);
                return (
                  <label
                    key={c.key}
                    className={`flex items-center gap-2 px-1.5 py-1 rounded text-[11.5px] ${locked ? 'opacity-60' : 'hover:bg-slate-50 cursor-pointer'}`}
                  >
                    <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggleCol(c.key)} className="accent-blue-600" />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Vista previa */}
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-[12px] font-semibold">
                  {loadingProgress
                    ? `Cargando ${loadingProgress.loaded.toLocaleString('es-CL')} de ${loadingProgress.total.toLocaleString('es-CL')}…`
                    : 'Cargando datos…'}
                </p>
              </div>
            ) : activeColumns.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[12px] text-slate-400">Elige al menos una columna para previsualizar.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    {activeColumns.map(c => (
                      <th key={c.key} className="px-2.5 py-1.5 text-[9.5px] font-extrabold uppercase tracking-wide text-slate-400 border-b border-slate-200 whitespace-nowrap">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      {activeColumns.map(c => (
                        <td key={c.key} className="px-2.5 py-1.5 text-[11px] text-slate-600 whitespace-nowrap">{String(c.get(r) ?? '—')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="px-7 py-4 border-t border-slate-100 flex items-center gap-3 shrink-0">
          <span className="text-[11.5px] text-slate-400">
            {loading ? 'Cargando…' : `${rows!.length.toLocaleString('es-CL')} filas · ${activeColumns.length} columnas seleccionadas`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="px-3.5 py-2 text-[12px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button
              onClick={onExport}
              disabled={loading || activeColumns.length === 0}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-[12px] font-bold"
            >
              <Download className="w-3.5 h-3.5" /> Exportar XLSX
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
