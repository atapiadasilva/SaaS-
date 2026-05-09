'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { detectAllTables } from '@/lib/excel/detectTables';
import type { DetectedTable } from '@/lib/excel/detectTables';
import {
  Database, Upload, Plus, Search, X, Check, Layers, BarChart3, Tag,
  Eye, EyeOff, Loader2, AlertCircle, RefreshCw, Trash2, GitMerge,
  CheckSquare, Square, Pencil, Filter,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Version {
  id: string;
  name: string;
  file_name: string;
  match_key: string;
  columns_imported: string[];
  row_count: number;
  matched_count: number;
  is_active: boolean;
  created_at: string;
}

interface ElementRaw {
  element_id: string;
  raw_versions: Record<string, Record<string, string>>;
  updated_at: string;
}

interface PropEntry {
  value: string;
  source: string;
  vname: string;
}

interface MergedElement {
  element_id: string;
  props: Record<string, PropEntry>;
  version_count: number;
}

// ─── Version Color Palette ────────────────────────────────────────────────────

const VERSION_COLORS = [
  { bg: '#EEF2FF', text: '#4338CA', bar: '#6366F1' },
  { bg: '#FFF7ED', text: '#C2410C', bar: '#F97316' },
  { bg: '#F0FDF4', text: '#15803D', bar: '#22C55E' },
  { bg: '#FFF1F2', text: '#BE123C', bar: '#F43F5E' },
  { bg: '#F0F9FF', text: '#0369A1', bar: '#38BDF8' },
  { bg: '#FDF4FF', text: '#7E22CE', bar: '#A855F7' },
];

// ─── mergeElement helper ──────────────────────────────────────────────────────

function mergeElement(el: ElementRaw, versions: Version[]): MergedElement {
  const activeVersions = versions
    .filter(v => v.is_active)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const props: Record<string, PropEntry> = {};
  let version_count = 0;

  for (const v of activeVersions) {
    const vData = el.raw_versions[v.id];
    if (!vData) continue;
    version_count++;
    for (const [k, val] of Object.entries(vData)) {
      props[k] = { value: val, source: v.id, vname: v.name };
    }
  }

  const manual = el.raw_versions.manual;
  if (manual) {
    for (const [k, val] of Object.entries(manual)) {
      props[k] = { value: val, source: 'manual', vname: 'Manual' };
    }
  }

  return { element_id: el.element_id, props, version_count };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// PropertiesTab
interface PropertiesTabProps {
  selected: string[];
  merged: MergedElement[];
  propFilter: string;
  setPropFilter: (v: string) => void;
  allKeys: string[];
  onOpenAddProp: () => void;
  versions: Version[];
}

function PropertiesTab({ selected, merged, propFilter, setPropFilter, allKeys, onOpenAddProp, versions }: PropertiesTabProps) {
  if (selected.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-8">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <CheckSquare className="w-7 h-7 text-slate-400" />
        </div>
        <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Selecciona elementos</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          Usa los checkboxes del panel izquierdo para seleccionar uno o varios elementos y ver sus propiedades.
        </p>
      </div>
    );
  }

  const selectedMerged = merged.filter(m => selected.includes(m.element_id));

  if (selected.length === 1) {
    const el = selectedMerged[0];
    if (!el) return null;
    const filteredKeys = Object.keys(el.props).filter(k =>
      !propFilter || k.toLowerCase().includes(propFilter.toLowerCase()) || el.props[k].value.toLowerCase().includes(propFilter.toLowerCase())
    );
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={propFilter}
              onChange={e => setPropFilter(e.target.value)}
              placeholder="Filtrar propiedades..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0C1E4F]/20"
            />
          </div>
          <button
            onClick={onOpenAddProp}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1E4F] text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#162d6e] transition"
          >
            <Plus className="w-3 h-3" />
            Propiedad
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-slate-500 w-1/3">Propiedad</th>
                <th className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-slate-500">Valor</th>
                <th className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-slate-500 w-28">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-slate-400 text-xs">Sin propiedades</td>
                </tr>
              ) : (
                filteredKeys.map(k => {
                  const entry = el.props[k];
                  const isManual = entry.source === 'manual';
                  const vIdx = versions.findIndex(v => v.id === entry.source);
                  const color = isManual ? { bg: '#F1F5F9', text: '#475569' } : VERSION_COLORS[vIdx % VERSION_COLORS.length] ?? VERSION_COLORS[0];
                  return (
                    <tr key={k} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2 px-3 font-semibold text-slate-700">{k}</td>
                      <td className="py-2 px-3 text-slate-600 break-all">{entry.value}</td>
                      <td className="py-2 px-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider"
                          style={{ background: color.bg, color: color.text }}
                        >
                          {isManual ? 'Manual' : entry.vname}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Multiple selected — common properties
  const allPropsPerEl = selectedMerged.map(m => Object.keys(m.props));
  const commonKeys = allPropsPerEl.length > 0
    ? allPropsPerEl[0].filter(k => allPropsPerEl.every(ks => ks.includes(k)))
    : [];
  const filteredCommon = commonKeys.filter(k =>
    !propFilter || k.toLowerCase().includes(propFilter.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={propFilter}
            onChange={e => setPropFilter(e.target.value)}
            placeholder="Filtrar propiedades comunes..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0C1E4F]/20"
          />
        </div>
        <button
          onClick={onOpenAddProp}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0C1E4F] text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#162d6e] transition"
        >
          <Plus className="w-3 h-3" />
          Añadir a {selected.length}
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mb-3 font-semibold">
        {selected.length} elementos seleccionados — mostrando {filteredCommon.length} propiedades comunes
      </p>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-slate-500 w-1/3">Propiedad</th>
              <th className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-slate-500">Valor (primer elemento)</th>
            </tr>
          </thead>
          <tbody>
            {filteredCommon.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-8 text-center text-slate-400 text-xs">
                  {commonKeys.length === 0 ? 'Sin propiedades comunes entre los elementos seleccionados' : 'Sin resultados'}
                </td>
              </tr>
            ) : (
              filteredCommon.map(k => {
                const first = selectedMerged[0]?.props[k];
                return (
                  <tr key={k} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2 px-3 font-semibold text-slate-700">{k}</td>
                    <td className="py-2 px-3 text-slate-600">{first?.value ?? '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// VersionsTab
interface VersionsTabProps {
  versions: Version[];
  onToggle: (id: string, val: boolean) => void;
  onDelete: (id: string) => void;
  onUpload: () => void;
  deletingId: string | null;
  togglingId: string | null;
}

function VersionsTab({ versions, onToggle, onDelete, onUpload, deletingId, togglingId }: VersionsTabProps) {
  if (versions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-20 px-8">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Layers className="w-7 h-7 text-slate-400" />
        </div>
        <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Sin versiones</p>
        <p className="text-xs text-slate-400 mt-1 mb-4 max-w-xs">
          Importa un archivo Excel o CSV para crear la primera versión de datos.
        </p>
        <button
          onClick={onUpload}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#0C1E4F] text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#162d6e] transition"
        >
          <Upload className="w-3.5 h-3.5" />
          Importar archivo
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-3">
        {versions.map((v, i) => {
          const color = VERSION_COLORS[i % VERSION_COLORS.length];
          const matchRate = v.row_count > 0 ? Math.round((v.matched_count / v.row_count) * 100) : 0;
          const rateColor = matchRate >= 80 ? '#15803D' : matchRate >= 40 ? '#B45309' : '#BE123C';
          const rateBg = matchRate >= 80 ? '#F0FDF4' : matchRate >= 40 ? '#FFFBEB' : '#FFF1F2';
          const isDeleting = deletingId === v.id;
          const isToggling = togglingId === v.id;

          return (
            <div
              key={v.id}
              className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"
              style={{ opacity: v.is_active ? 1 : 0.6 }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                  style={{ background: color.bar }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm text-slate-800">{v.name}</span>
                    {v.file_name && (
                      <span className="text-[10px] text-slate-400 truncate max-w-[180px]">{v.file_name}</span>
                    )}
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ml-auto"
                      style={{ background: rateBg, color: rateColor }}
                    >
                      {matchRate}% match
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-[10px] text-slate-400">
                      {new Date(v.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-black"
                      style={{ background: color.bg, color: color.text }}
                    >
                      <Tag className="inline w-2.5 h-2.5 mr-0.5" />
                      {v.match_key}
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">{v.row_count} filas</span>
                    <span className="text-[10px] text-slate-500 font-semibold">{v.columns_imported.length} columnas</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {v.columns_imported.slice(0, 10).map(col => (
                      <span
                        key={col}
                        className="px-2 py-0.5 rounded-md text-[9px] font-semibold"
                        style={{ background: color.bg, color: color.text }}
                      >
                        {col}
                      </span>
                    ))}
                    {v.columns_imported.length > 10 && (
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-slate-100 text-slate-500">
                        +{v.columns_imported.length - 10} más
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => onToggle(v.id, !v.is_active)}
                  disabled={isToggling}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition text-slate-600 disabled:opacity-50"
                >
                  {isToggling ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : v.is_active ? (
                    <EyeOff className="w-3 h-3" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                  {v.is_active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  onClick={() => onDelete(v.id)}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-red-100 hover:bg-red-50 transition text-red-500 disabled:opacity-50 ml-auto"
                >
                  {isDeleting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  Eliminar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// AnalyticsTab
interface AnalyticsTabProps {
  versions: Version[];
  elements: ElementRaw[];
  merged: MergedElement[];
}

function AnalyticsTab({ versions, elements, merged }: AnalyticsTabProps) {
  const totalElements = elements.length;
  const totalVersions = versions.length;
  const allProps = merged.flatMap(m => Object.keys(m.props));
  const uniqueProps = new Set(allProps).size;
  const elementsWithData = merged.filter(m => Object.keys(m.props).length > 0).length;

  // Property coverage
  const propCoverage: { key: string; count: number; pct: number }[] = [];
  const propCounts: Record<string, number> = {};
  for (const m of merged) {
    for (const k of Object.keys(m.props)) {
      propCounts[k] = (propCounts[k] ?? 0) + 1;
    }
  }
  for (const [k, count] of Object.entries(propCounts)) {
    propCoverage.push({ key: k, count, pct: totalElements > 0 ? Math.round((count / totalElements) * 100) : 0 });
  }
  propCoverage.sort((a, b) => b.pct - a.pct);

  const summaryCards = [
    { label: 'Elementos', value: totalElements, icon: Database },
    { label: 'Versiones', value: totalVersions, icon: Layers },
    { label: 'Propiedades únicas', value: uniqueProps, icon: Tag },
    { label: 'Con datos', value: elementsWithData, icon: GitMerge },
  ];

  return (
    <div className="flex-1 overflow-auto space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryCards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[#0C1E4F]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{c.label}</span>
              </div>
              <span className="text-2xl font-black text-slate-800">{c.value.toLocaleString()}</span>
            </div>
          );
        })}
      </div>

      {/* Property coverage */}
      {propCoverage.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-[#0C1E4F]" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">Cobertura de propiedades</span>
          </div>
          <div className="space-y-2 max-h-80 overflow-auto">
            {propCoverage.slice(0, 30).map(p => {
              const barColor = p.pct >= 80 ? '#22C55E' : p.pct >= 40 ? '#F97316' : '#F43F5E';
              return (
                <div key={p.key} className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-600 font-semibold w-40 truncate shrink-0">{p.key}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${p.pct}%`, background: barColor }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 font-semibold w-10 text-right shrink-0">{p.pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Connection table */}
      {versions.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <GitMerge className="w-4 h-4 text-[#0C1E4F]" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">Tabla de conexión</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-slate-500">Versión</th>
                  <th className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-slate-500">Clave</th>
                  <th className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-slate-500">Columnas</th>
                  <th className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-slate-500">Filas</th>
                  <th className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-slate-500">Match rate</th>
                  <th className="text-left py-2 px-3 font-black uppercase tracking-widest text-[10px] text-slate-500">Estado</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v, i) => {
                  const color = VERSION_COLORS[i % VERSION_COLORS.length];
                  const matchRate = v.row_count > 0 ? Math.round((v.matched_count / v.row_count) * 100) : 0;
                  const rateColor = matchRate >= 80 ? '#15803D' : matchRate >= 40 ? '#B45309' : '#BE123C';
                  const rateBg = matchRate >= 80 ? '#F0FDF4' : matchRate >= 40 ? '#FFFBEB' : '#FFF1F2';
                  return (
                    <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2 px-3 font-semibold text-slate-700">{v.name}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ background: color.bg, color: color.text }}>
                          {v.match_key}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-600">{v.columns_imported.length}</td>
                      <td className="py-2 px-3 text-slate-600">{v.row_count}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ background: rateBg, color: rateColor }}>
                          {matchRate}%
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${v.is_active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {v.is_active ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// UploadModal
interface UploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
}

function UploadModal({ onClose, onSuccess, projectId }: UploadModalProps) {
  const [step, setStep] = useState<'file' | 'map' | 'upload'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [matchKey, setMatchKey] = useState('');
  const [selCols, setSelCols] = useState<Set<string>>(new Set());
  const [vName, setVName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pendingTables,   setPendingTables]   = useState<DetectedTable[]>([]);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const fileRef            = useRef<HTMLInputElement>(null);
  const pendingFileNameRef = useRef('');

  const applyParsed = useCallback((json: Record<string, string>[], hdrs: string[], fname: string) => {
    setHeaders(hdrs);
    setRows(json);
    setSelCols(new Set(hdrs));
    setMatchKey(hdrs[0]);
    setVName(fname.replace(/\.[^.]+$/, ''));
    setStep('map');
    setError(null);
  }, []);

  const parseFile = useCallback((f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const tables = detectAllTables(wb);
        if (!tables.length) { setError('Archivo vacío'); return; }
        if (tables.length === 1) {
          const t = tables[0];
          applyParsed(t.rows as Record<string, string>[], t.headers, t.tableName);
        } else {
          pendingFileNameRef.current = f.name;
          setPendingTables(tables);
          setShowTablePicker(true);
        }
      } catch {
        setError('Error al parsear el archivo');
      }
    };
    reader.readAsArrayBuffer(f);
  }, [applyParsed]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
  };

  const toggleCol = (col: string) => {
    if (col === matchKey) return;
    setSelCols(prev => {
      const next = new Set(prev);
      next.has(col) ? next.delete(col) : next.add(col);
      return next;
    });
  };

  const handleUpload = async () => {
    if (!matchKey || !vName.trim()) { setError('Completa el nombre y la clave de match'); return; }
    setStep('upload');
    setUploading(true);
    setError(null);
    try {
      const columns = Array.from(selCols);
      const trimmedRows = rows.map(r => {
        const out: Record<string, string> = {};
        for (const col of columns) out[col] = String(r[col] ?? '').trim();
        out[matchKey] = String(r[matchKey] ?? '').trim();
        return out;
      });
      const res = await fetch('/api/model-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          version_name: vName.trim(),
          file_name: file?.name ?? '',
          match_key: matchKey,
          columns,
          rows: trimmedRows,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al subir');
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido');
      setStep('map');
    } finally {
      setUploading(false);
    }
  };

  const previewRows = rows.slice(0, 4);
  const previewCols = Array.from(selCols).slice(0, 8);

  return (
    <>
    {showTablePicker && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Seleccionar Tabla</p>
              <p className="text-[9px] text-slate-400 mt-0.5">
                {pendingTables.length} tablas en{' '}
                <span className="font-bold text-slate-600">{pendingFileNameRef.current}</span>
              </p>
            </div>
            <button onClick={() => setShowTablePicker(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {pendingTables.map((t, i) => (
              <button key={i}
                onClick={() => {
                  applyParsed(t.rows as Record<string, string>[], t.headers, t.tableName);
                  setShowTablePicker(false);
                  setPendingTables([]);
                }}
                className="w-full text-left border border-slate-200 rounded-xl p-3 hover:border-[#0C1E4F]/40 hover:bg-[#0C1E4F]/5 transition group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-slate-800 truncate group-hover:text-[#0C1E4F]">{t.tableName}</p>
                    {t.tableName !== t.sheetName && (
                      <span className="inline-block mt-0.5 text-[7px] bg-slate-100 text-slate-500 rounded-md px-1.5 py-0.5 font-bold">{t.sheetName}</span>
                    )}
                  </div>
                  <span className="text-[8px] text-slate-400 shrink-0 tabular-nums whitespace-nowrap">{t.rows.length} filas</span>
                </div>
                <p className="text-[8px] text-slate-400 mt-1 truncate">
                  {t.headers.slice(0, 4).join(' · ')}{t.headers.length > 4 ? ` +${t.headers.length - 4}` : ''}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    )}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#0C1E4F]" />
            <span className="font-black text-sm text-[#0C1E4F] uppercase tracking-widest">Importar versión</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          {step === 'file' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition cursor-pointer ${dragging ? 'border-[#0C1E4F] bg-[#0C1E4F]/5' : 'border-slate-200 hover:border-slate-300'}`}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
              <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="font-black text-slate-700 text-sm uppercase tracking-widest">Arrastra o haz clic</p>
              <p className="text-xs text-slate-400 mt-1">Excel (.xlsx, .xls) o CSV</p>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Nombre de la versión</label>
                <input
                  value={vName}
                  onChange={e => setVName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0C1E4F]/20"
                  placeholder="Ej: Datos BIM v1"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Columna de match (clave)</label>
                <select
                  value={matchKey}
                  onChange={e => { setMatchKey(e.target.value); setSelCols(prev => { const next = new Set(prev); next.add(e.target.value); return next; }); }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0C1E4F]/20"
                >
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  Columnas a importar ({selCols.size} seleccionadas)
                </label>
                <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-auto">
                  {headers.map(h => {
                    const isMatch = h === matchKey;
                    const checked = selCols.has(h);
                    return (
                      <button
                        key={h}
                        onClick={() => toggleCol(h)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-semibold text-left transition ${
                          isMatch
                            ? 'bg-[#0C1E4F] text-white cursor-default'
                            : checked
                            ? 'bg-[#0C1E4F]/10 text-[#0C1E4F] border border-[#0C1E4F]/20'
                            : 'bg-slate-50 text-slate-400 border border-slate-100'
                        }`}
                      >
                        {isMatch ? <Tag className="w-2.5 h-2.5 shrink-0" /> : checked ? <Check className="w-2.5 h-2.5 shrink-0" /> : <Square className="w-2.5 h-2.5 shrink-0" />}
                        <span className="truncate">{h}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                  Vista previa ({rows.length} filas)
                </label>
                <div className="overflow-x-auto border border-slate-100 rounded-lg">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {previewCols.map(c => (
                          <th key={c} className="text-left px-2 py-1.5 font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">{c}</th>
                        ))}
                        {selCols.size > 8 && <th className="px-2 py-1.5 text-slate-400">+{selCols.size - 8}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => (
                        <tr key={i} className="border-b border-slate-50">
                          {previewCols.map(c => (
                            <td key={c} className="px-2 py-1.5 text-slate-600 whitespace-nowrap max-w-[120px] truncate">{String(r[c] ?? '')}</td>
                          ))}
                          {selCols.size > 8 && <td className="px-2 py-1.5 text-slate-300">...</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-10 h-10 text-[#0C1E4F] animate-spin mb-4" />
              <p className="font-black text-sm text-slate-700 uppercase tracking-widest">Importando datos...</p>
              <p className="text-xs text-slate-400 mt-1">{rows.length} filas · {selCols.size} columnas</p>
            </div>
          )}
        </div>

        {step === 'map' && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              onClick={() => setStep('file')}
              className="px-4 py-2 text-xs font-black uppercase tracking-widest border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition"
            >
              Volver
            </button>
            <button
              onClick={handleUpload}
              disabled={!vName.trim() || !matchKey || selCols.size < 1}
              className="flex items-center gap-1.5 px-5 py-2 bg-[#0C1E4F] text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#162d6e] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" />
              Importar {rows.length} filas
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// AddPropModal
interface AddPropModalProps {
  onClose: () => void;
  onSave: (key: string, value: string) => Promise<void>;
  allKeys: string[];
  selectedCount: number;
}

function AddPropModal({ onClose, onSave, allKeys, selectedCount }: AddPropModalProps) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = allKeys
    .filter(k => k.toLowerCase().includes(key.toLowerCase()) && k !== key)
    .slice(0, 8);

  const handleSave = async () => {
    if (!key.trim()) { setError('La clave es requerida'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(key.trim(), value.trim());
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-[#0C1E4F]" />
            <span className="font-black text-sm text-[#0C1E4F] uppercase tracking-widest">Añadir propiedad</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
          <div className="relative">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Clave de propiedad</label>
            <input
              value={key}
              onChange={e => { setKey(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0C1E4F]/20"
              placeholder="Ej: Discipline, Status..."
              autoFocus
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-lg overflow-hidden">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onMouseDown={() => { setKey(s); setShowSuggestions(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Valor</label>
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0C1E4F]/20"
              placeholder="Valor de la propiedad"
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-black uppercase tracking-widest border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !key.trim()}
            className="flex items-center gap-1.5 px-5 py-2 bg-[#0C1E4F] text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#162d6e] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Guardar en {selectedCount}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ModelDataPage({ params }: { params: Promise<{ org_slug: string; project_id: string }> }) {
  const { project_id } = use(params);

  const [versions, setVersions] = useState<Version[]>([]);
  const [elements, setElements] = useState<ElementRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'props' | 'versions' | 'analytics'>('props');
  const [propFilter, setPropFilter] = useState('');
  const [versionFilter, setVersionFilter] = useState<string | null>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [showAddProp, setShowAddProp] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/model-data?project_id=${project_id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar');
      setVersions(json.versions ?? []);
      setElements(json.elements ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [project_id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Compute merged elements
  const merged: MergedElement[] = elements.map(el => mergeElement(el, versions));

  // All unique property keys
  const allKeys = Array.from(new Set(merged.flatMap(m => Object.keys(m.props)))).sort();

  // Filtered element list
  const filteredElements = merged.filter(m => {
    const matchesSearch = !search || m.element_id.toLowerCase().includes(search.toLowerCase());
    const matchesVersion = !versionFilter || (
      elements.find(e => e.element_id === m.element_id)?.raw_versions[versionFilter] !== undefined
    );
    return matchesSearch && matchesVersion;
  });

  const selectedList = Array.from(selectedIds);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredElements.length && filteredElements.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredElements.map(e => e.element_id)));
    }
  };

  const handleToggleVersion = async (id: string, val: boolean) => {
    setTogglingId(id);
    try {
      await fetch(`/api/model-versions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: val }),
      });
      setVersions(prev => prev.map(v => v.id === id ? { ...v, is_active: val } : v));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteVersion = async (id: string) => {
    if (!confirm('¿Eliminar esta versión? Los datos asociados se perderán.')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/model-versions/${id}`, { method: 'DELETE' });
      await fetchData();
      setSelectedIds(new Set());
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddProp = async (key: string, value: string) => {
    const res = await fetch('/api/model-data', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id,
        element_ids: selectedList,
        property_key: key,
        property_value: value,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Error al guardar');
    await fetchData();
  };

  const TABS: { key: 'props' | 'versions' | 'analytics'; label: string; icon: React.ElementType }[] = [
    { key: 'props', label: 'Propiedades', icon: Database },
    { key: 'versions', label: 'Versiones', icon: Layers },
    { key: 'analytics', label: 'Análisis', icon: BarChart3 },
  ];

  const allSelected = filteredElements.length > 0 && selectedIds.size === filteredElements.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredElements.length;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#0C1E4F] flex items-center justify-center">
            <Database className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black text-[#0C1E4F] uppercase tracking-widest leading-none">Datos Modelo</h1>
            <p className="text-[10px] text-slate-400 font-semibold leading-none mt-0.5">
              {elements.length} elementos · {versions.length} versiones
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition text-slate-500 disabled:opacity-50"
            title="Recargar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#0C1E4F] text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#162d6e] transition"
          >
            <Upload className="w-3.5 h-3.5" />
            Importar
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={fetchData} className="ml-auto text-xs font-black uppercase tracking-widest hover:underline">Reintentar</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-[#0C1E4F] animate-spin" />
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Cargando datos...</span>
          </div>
        </div>
      )}

      {/* Main 2-panel layout */}
      {!loading && (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* Left Panel — Element Browser */}
          <div className="w-80 shrink-0 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col min-h-0">
            <div className="px-4 pt-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Elementos</span>
                <span className="ml-auto text-[10px] text-slate-400">{filteredElements.length} / {elements.length}</span>
              </div>
              {/* Search */}
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por ID..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0C1E4F]/20"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="w-3 h-3 text-slate-400" />
                  </button>
                )}
              </div>
              {/* Version filter pills */}
              {versions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {versions.map((v, i) => {
                    const color = VERSION_COLORS[i % VERSION_COLORS.length];
                    const active = versionFilter === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setVersionFilter(active ? null : v.id)}
                        className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider transition"
                        style={active
                          ? { background: color.bar, color: '#fff' }
                          : { background: color.bg, color: color.text }
                        }
                      >
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Select all */}
            {filteredElements.length > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-50">
                <button onClick={toggleSelectAll} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 transition">
                  {allSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-[#0C1E4F]" />
                  ) : someSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-300" />
                  )}
                  {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
                {selectedIds.size > 0 && (
                  <span className="ml-auto text-[10px] font-black text-[#0C1E4F]">{selectedIds.size} sel.</span>
                )}
              </div>
            )}

            {/* Element list */}
            <div className="flex-1 overflow-auto">
              {filteredElements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <Database className="w-8 h-8 text-slate-200 mb-2" />
                  <p className="text-xs text-slate-400 font-semibold">
                    {elements.length === 0 ? 'Sin elementos. Importa datos para comenzar.' : 'Sin resultados para tu búsqueda.'}
                  </p>
                </div>
              ) : (
                filteredElements.map(el => {
                  const isSelected = selectedIds.has(el.element_id);
                  const propCount = Object.keys(el.props).length;
                  return (
                    <div
                      key={el.element_id}
                      onClick={() => toggleSelect(el.element_id)}
                      className={`flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-50 cursor-pointer transition ${
                        isSelected ? 'bg-[#0C1E4F]/5 border-l-2 border-l-[#0C1E4F]' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-[#0C1E4F] shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{el.element_id}</p>
                        <p className="text-[9px] text-slate-400">{propCount} propiedad{propCount !== 1 ? 'es' : ''}</p>
                      </div>
                      {el.version_count > 1 && (
                        <span className="text-[8px] bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5 font-black shrink-0">
                          {el.version_count}v
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Selection action bar */}
            {selectedIds.size > 0 && (
              <div className="px-4 py-3 border-t border-slate-100 bg-[#0C1E4F]/5 rounded-b-2xl">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-[#0C1E4F] uppercase tracking-widest">
                    {selectedIds.size} elemento{selectedIds.size !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => { setShowAddProp(true); setTab('props'); }}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1.5 bg-[#0C1E4F] text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition hover:bg-[#162d6e]"
                  >
                    <Plus className="w-3 h-3" />
                    Propiedad
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="p-1.5 rounded-lg hover:bg-slate-200 transition"
                  >
                    <X className="w-3 h-3 text-slate-500" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel — Tabs */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col min-h-0">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-4 pb-0 border-b border-slate-100">
              {TABS.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-[11px] font-black uppercase tracking-widest transition -mb-px border-b-2 ${
                      tab === t.key
                        ? 'border-b-[#0C1E4F] text-[#0C1E4F] bg-[#0C1E4F]/5'
                        : 'border-b-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto p-4 flex flex-col min-h-0">
              {tab === 'props' && (
                <PropertiesTab
                  selected={selectedList}
                  merged={merged}
                  propFilter={propFilter}
                  setPropFilter={setPropFilter}
                  allKeys={allKeys}
                  onOpenAddProp={() => setShowAddProp(true)}
                  versions={versions}
                />
              )}
              {tab === 'versions' && (
                <VersionsTab
                  versions={versions}
                  onToggle={handleToggleVersion}
                  onDelete={handleDeleteVersion}
                  onUpload={() => setShowUpload(true)}
                  deletingId={deletingId}
                  togglingId={togglingId}
                />
              )}
              {tab === 'analytics' && (
                <AnalyticsTab
                  versions={versions}
                  elements={elements}
                  merged={merged}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showUpload && (
        <UploadModal
          projectId={project_id}
          onClose={() => setShowUpload(false)}
          onSuccess={() => { setShowUpload(false); fetchData(); }}
        />
      )}

      {showAddProp && (
        <AddPropModal
          onClose={() => setShowAddProp(false)}
          onSave={handleAddProp}
          allKeys={allKeys}
          selectedCount={selectedIds.size}
        />
      )}
    </div>
  );
}
