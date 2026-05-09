'use client';

import React, { useState, useRef } from 'react';
import {
  Upload, FileText, Save, Loader2, X, CheckCircle2,
  AlertCircle, Table2, Eye, EyeOff,
  Layers, SquareCheck, Square, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { detectAllTables, type DetectedTable } from '@/lib/excel/detectTables';

interface DataNodeImporterProps {
  projectId: string;
  onSuccess?: (nodeId: string) => void;
}

// ─── Table entry (one per detected table across all sheets) ──────────────────

interface TableEntry extends DetectedTable {
  id: string;
  selected: boolean;
  nodeName: string;
  status: 'idle' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
  previewOpen: boolean;
}

// ─── Table card ───────────────────────────────────────────────────────────────

function TableCard({
  entry,
  onToggleSelect,
  onNodeNameChange,
  onTogglePreview,
}: {
  entry: TableEntry;
  onToggleSelect: () => void;
  onNodeNameChange: (v: string) => void;
  onTogglePreview: () => void;
}) {
  const isEmpty = entry.rows.length === 0 && entry.headers.length === 0;
  const multiTable = entry.tableName !== entry.sheetName;

  return (
    <div className={`rounded-2xl border transition-all overflow-hidden ${
      isEmpty
        ? 'bg-slate-50 border-slate-100 opacity-50'
        : entry.selected
          ? 'bg-white border-blue-200 ring-2 ring-blue-100 shadow-sm'
          : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'
    }`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={onToggleSelect}
          disabled={isEmpty}
          className="shrink-0 text-slate-300 hover:text-blue-500 transition-colors disabled:pointer-events-none"
        >
          {entry.selected
            ? <SquareCheck size={18} className="text-blue-500" />
            : <Square size={18} />}
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            entry.selected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'
          }`}>
            <Table2 size={13} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {multiTable && (
                <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-md shrink-0">
                  {entry.sheetName}
                </span>
              )}
              <p className="text-xs font-black text-slate-800 truncate">{entry.tableName}</p>
            </div>
            <p className="text-[9px] text-slate-400 font-medium">
              {isEmpty
                ? 'Sin datos'
                : `${entry.rows.length} filas · ${entry.headers.length} columnas`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {entry.status === 'done'      && <CheckCircle2 size={15} className="text-emerald-500" />}
          {entry.status === 'error'     && <AlertCircle  size={15} className="text-rose-500" />}
          {entry.status === 'uploading' && <Loader2      size={15} className="text-blue-500 animate-spin" />}

          {!isEmpty && (
            <button
              onClick={onTogglePreview}
              title={entry.previewOpen ? 'Cerrar vista' : 'Vista previa'}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {entry.previewOpen ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
        </div>
      </div>

      {entry.selected && !isEmpty && (
        <div className="px-4 pb-3">
          <input
            type="text"
            value={entry.nodeName}
            onChange={e => onNodeNameChange(e.target.value)}
            placeholder="Nombre del nodo de datos…"
            className="w-full px-3 py-2 bg-slate-50 rounded-xl text-[11px] font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-200 focus:bg-white transition-all placeholder:text-slate-300"
          />
        </div>
      )}

      {entry.status === 'error' && entry.errorMsg && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-rose-600 font-bold">{entry.errorMsg}</p>
        </div>
      )}

      {entry.previewOpen && !isEmpty && (
        <div className="border-t border-slate-50 bg-slate-50/60 px-4 py-3 space-y-3">
          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
              Columnas ({entry.headers.length})
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {entry.headers.map(col => (
                <span key={col} className="px-2 py-0.5 bg-white border border-slate-200 text-[9px] font-bold text-slate-600 rounded-lg truncate max-w-[140px]">
                  {col}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
              Primeras filas
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="text-[9px] font-medium text-slate-700 w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {entry.headers.slice(0, 8).map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-black text-slate-500 uppercase tracking-tight truncate max-w-[100px] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    {entry.headers.length > 8 && (
                      <th className="px-2 py-1.5 text-slate-300 whitespace-nowrap">+{entry.headers.length - 8} más</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entry.rows.slice(0, 5).map((row, ri) => (
                    <tr key={ri} className="hover:bg-slate-50/50">
                      {entry.headers.slice(0, 8).map(h => (
                        <td key={h} className="px-2 py-1.5 whitespace-nowrap truncate max-w-[100px]">
                          {String(row[h] ?? '')}
                        </td>
                      ))}
                      {entry.headers.length > 8 && <td />}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DataNodeImporter({ projectId, onSuccess }: DataNodeImporterProps) {
  const [tables, setTables]         = useState<TableEntry[]>([]);
  const [fileName, setFileName]     = useState('');
  const [sheetCount, setSheetCount] = useState(0);
  const [importing, setImporting]   = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGlobalError(null);
    setImportDone(false);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result as ArrayBuffer, { type: 'array', cellDates: true });
        const baseName = file.name.replace(/\.[^/.]+$/, '').toUpperCase();
        const detected: DetectedTable[] = detectAllTables(wb);

        const entries: TableEntry[] = detected.map((t, i) => ({
          ...t,
          id: `${i}`,
          selected: true,
          nodeName: `${baseName} — ${t.tableName.toUpperCase()}`,
          status: 'idle',
          previewOpen: false,
        }));

        setTables(entries);
        setFileName(file.name);
        setSheetCount(wb.SheetNames.length);

        if (!entries.length) {
          setGlobalError('No se encontraron tablas con datos en el archivo.');
        }
      } catch {
        setGlobalError('No se pudo leer el archivo. Verifica que sea un Excel (.xlsx/.xls) o CSV válido.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const update = (id: string, patch: Partial<TableEntry>) =>
    setTables(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));

  const handleImport = async () => {
    const toImport = tables.filter(t => t.selected && t.rows.length > 0 && t.nodeName.trim());
    if (!toImport.length) {
      setGlobalError('Selecciona al menos una tabla con datos y nombre asignado.');
      return;
    }

    setImporting(true);
    setGlobalError(null);

    const { data: { session } } = await supabase.auth.getSession();

    for (const entry of toImport) {
      update(entry.id, { status: 'uploading' });
      try {
        const res = await fetch('/api/ingest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            projectId,
            entityName: entry.nodeName.trim(),
            rows: entry.rows,
            fileType: 'excel',
            strategy: 'replace',
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Error en la carga');
        update(entry.id, { status: 'done' });
        if (onSuccess) onSuccess(result.nodeId);
      } catch (err: any) {
        update(entry.id, { status: 'error', errorMsg: err.message });
      }
    }

    setImporting(false);
    setImportDone(true);
  };

  const reset = () => {
    setTables([]);
    setFileName('');
    setSheetCount(0);
    setImportDone(false);
    setGlobalError(null);
  };

  const selectedCount = tables.filter(t => t.selected && t.rows.length > 0).length;
  const doneCount     = tables.filter(t => t.status === 'done').length;
  const errorCount    = tables.filter(t => t.status === 'error').length;
  const allNamed      = tables.filter(t => t.selected && t.rows.length > 0).every(t => t.nodeName.trim());

  return (
    <div className="flex flex-col h-full bg-slate-50/50 p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full space-y-6">

        <div className="text-center space-y-1.5">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-slate-200/60 text-blue-500 mb-3 border border-slate-100">
            <Upload size={26} />
          </div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Importador de Fuentes de Datos</h2>
          <p className="text-xs font-semibold text-slate-400">
            Detecta todas las tablas del Excel — incluso múltiples por pestaña — e importa las que necesites.
          </p>
        </div>

        {tables.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) {
                const dt = new DataTransfer();
                dt.items.add(file);
                if (fileInputRef.current) {
                  fileInputRef.current.files = dt.files;
                  fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            }}
            className="group relative border-2 border-dashed border-slate-200 bg-white rounded-3xl p-14 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/20 transition-all duration-300"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="space-y-3">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto text-slate-300 group-hover:scale-110 group-hover:text-blue-500 transition-all duration-300">
                <FileText size={22} />
              </div>
              <div>
                <p className="font-black text-slate-400 uppercase tracking-widest text-[11px]">
                  Arrastra o haz click para seleccionar
                </p>
                <p className="text-[10px] text-slate-300 font-semibold mt-1">XLSX · XLS · CSV</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-400">

            <div className="flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                  <Layers size={14} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800">{fileName}</p>
                  <p className="text-[9px] text-slate-400 font-medium">
                    {sheetCount} pestaña{sheetCount !== 1 ? 's' : ''}
                    {' · '}
                    <span className="text-emerald-600 font-bold">{tables.length} tabla{tables.length !== 1 ? 's' : ''} detectada{tables.length !== 1 ? 's' : ''}</span>
                    {' · '}
                    <span className="text-blue-600 font-bold">{selectedCount} seleccionada{selectedCount !== 1 ? 's' : ''}</span>
                  </p>
                </div>
              </div>
              <button onClick={reset} className="p-1.5 hover:bg-rose-50 rounded-xl text-slate-300 hover:text-rose-500 transition-all">
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setTables(prev => prev.map(t => t.rows.length > 0 ? { ...t, selected: true } : t))}
                className="text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-wide"
              >
                Seleccionar todas
              </button>
              <span className="text-slate-300 text-xs">·</span>
              <button
                onClick={() => setTables(prev => prev.map(t => ({ ...t, selected: false })))}
                className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-wide"
              >
                Ninguna
              </button>
            </div>

            <div className="space-y-2">
              {tables.map(entry => (
                <TableCard
                  key={entry.id}
                  entry={entry}
                  onToggleSelect={() => update(entry.id, { selected: !entry.selected })}
                  onNodeNameChange={v => update(entry.id, { nodeName: v })}
                  onTogglePreview={() => update(entry.id, { previewOpen: !entry.previewOpen })}
                />
              ))}
            </div>

            {!importDone ? (
              <button
                onClick={handleImport}
                disabled={importing || selectedCount === 0 || !allNamed}
                className="w-full py-4 bg-[#0C1E4F] text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-[#0C1E4F]/20 flex items-center justify-center gap-3 hover:bg-blue-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing
                  ? <><Loader2 size={15} className="animate-spin" /> Importando…</>
                  : <><Save size={15} /> Importar {selectedCount} tabla{selectedCount !== 1 ? 's' : ''}</>}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                  <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs font-black text-emerald-800">
                      {doneCount} tabla{doneCount !== 1 ? 's' : ''} importada{doneCount !== 1 ? 's' : ''} correctamente
                    </p>
                    {errorCount > 0 && (
                      <p className="text-[10px] text-rose-600 font-bold">{errorCount} con error — revisa los nombres e intenta de nuevo.</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={reset}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                >
                  <RefreshCw size={13} /> Importar otro archivo
                </button>
              </div>
            )}

          </div>
        )}

        {globalError && (
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 text-rose-700">
            <AlertCircle size={16} className="shrink-0" />
            <p className="text-[11px] font-black">{globalError}</p>
          </div>
        )}

        {tables.length === 0 && !globalError && (
          <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-2xl flex items-start gap-3">
            <AlertCircle size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[11px] font-semibold text-blue-700/80 leading-relaxed">
              Detecta automáticamente <strong>todas las tablas</strong> del archivo — pestañas múltiples y varias tablas por pestaña.
              Cada tabla se importa como un <strong>nodo de datos independiente</strong>.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
