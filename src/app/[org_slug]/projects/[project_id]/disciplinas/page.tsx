'use client';

import { use, useState, useEffect, useCallback, useMemo, useId, useRef } from 'react';
import dynamic from 'next/dynamic';
import * as XLSX from 'xlsx';
import { detectAllTables } from '@/lib/excel/detectTables';
import type { DetectedTable } from '@/lib/excel/detectTables';
import { createClient } from '@/lib/supabase/client';
import { setModuleConfigKey } from '@/lib/supabase/projectConfig';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import {
  Construction, Upload, Plus, Loader2, FileSpreadsheet, X, ChevronRight,
  CheckCircle2, Clock, AlertCircle, TrendingUp, Hammer, Save, Trash2,
  Search, Settings2, ChevronDown, GripVertical, Box, Maximize2, Minimize2,
  History, Replace, ArrowUp, ArrowDown, ArrowUpDown, Pencil, FolderOpen,
  DatabaseZap, RotateCcw, Eye, EyeOff, Link2,
} from 'lucide-react';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

interface HormigonItem {
  id: string;
  codigo: string;
  descripcion: string;
  zona: string;
  tipo: string;          // viga, losa, muro, pilar, fundacion, etc.
  vol_prog: number;      // m³ programado
  avance: number;        // 0–100
  estado: 'pendiente' | 'en_proceso' | 'ejecutado' | 'rechazado';
  bim_id: string;
  ot: string;
  calidad: string;
  fecha_prog: string;
  fecha_real: string;
  extras: Record<string, string>;
}

interface ColMapping {
  id: string; codigo: string; descripcion: string; zona: string; tipo: string;
  vol_prog: string; avance: string; estado: string; bim_id: string;
  ot: string; calidad: string; fecha_prog: string; fecha_real: string;
}

interface HormigonesConfig {
  items: HormigonItem[];
  extraCols: string[];
  colMapping: ColMapping;
  wbsLevels?: string[];
  wbsOrder?: Record<string, string[]>;
}

interface ImportRecord {
  id: string;
  filename: string;
  tableName: string;
  uploadedAt: string;
  rowCount: number;
  extraColCount: number;
  items: HormigonItem[];
  extraCols: string[];
}

interface WbsNode {
  path: string;
  parentPath: string;
  label: string;
  depth: number;
  allItems: HormigonItem[];
  children: WbsNode[];
  start: Date | null;
  end: Date | null;
  vol: number;
  avance: number;
}

type WbsRow =
  | { kind: 'node'; node: WbsNode }
  | { kind: 'item'; item: HormigonItem; depth: number };

type WizardStep = 'idle' | 'sheet' | 'mapping' | 'preview';
type ViewMode = 'table' | 'wbs';

const FIXED_FIELDS: { key: keyof ColMapping; label: string; required?: boolean }[] = [
  { key: 'id',          label: 'ID / Código único',   required: true },
  { key: 'codigo',      label: 'Código legible' },
  { key: 'descripcion', label: 'Descripción',          required: true },
  { key: 'zona',        label: 'Zona / Sector' },
  { key: 'tipo',        label: 'Tipo de elemento' },
  { key: 'vol_prog',    label: 'Volumen m³ (prog.)' },
  { key: 'avance',      label: 'Avance %' },
  { key: 'estado',      label: 'Estado' },
  { key: 'bim_id',      label: 'BIM ID / GUID' },
  { key: 'ot',          label: 'OT / Orden de trabajo' },
  { key: 'calidad',     label: 'Estado calidad' },
  { key: 'fecha_prog',  label: 'Fecha inicio (baseline)' },
  { key: 'fecha_real',  label: 'Fecha fin (baseline)' },
];

const ESTADO_COLORS: Record<string, string> = {
  ejecutado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  en_proceso: 'bg-blue-100 text-blue-700 border-blue-200',
  pendiente: 'bg-slate-100 text-slate-500 border-slate-200',
  rechazado: 'bg-red-100 text-red-700 border-red-200',
};

const TIPO_OPTIONS = ['Viga', 'Losa', 'Muro', 'Pilar', 'Fundación', 'Radier', 'Zapata', 'Dado', 'Pavimento', 'Otro'];

function emptyMapping(): ColMapping {
  return { id: '', codigo: '', descripcion: '', zona: '', tipo: '', vol_prog: '', avance: '', estado: '', bim_id: '', ot: '', calidad: '', fecha_prog: '', fecha_real: '' };
}

function parseNum(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

function autoDetect(headers: string[]): ColMapping {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const find = (...keywords: string[]) => headers.find(h => keywords.some(k => norm(h).includes(k))) ?? '';
  return {
    id:          find('id', 'codigo', 'code', 'item'),
    codigo:      find('codigo', 'cod', 'code', 'item'),
    descripcion: find('descripcion', 'desc', 'nombre', 'actividad', 'name'),
    zona:        find('zona', 'sector', 'area', 'lugar'),
    tipo:        find('tipo', 'type', 'elemento', 'element', 'partida'),
    vol_prog:    find('volumen', 'vol', 'm3', 'volprog', 'programado'),
    avance:      find('avance', 'progress', 'porcentaje', '%'),
    estado:      find('estado', 'status', 'estado'),
    bim_id:      find('bim', 'guid', 'revit', 'ifc', 'externalid'),
    ot:          find('ot', 'orden', 'ordentrabajo', 'workorder'),
    calidad:     find('calidad', 'quality', 'inspeccion', 'qc'),
    fecha_prog:  find('fechaprog', 'fechaplan', 'fechainicio', 'startdate'),
    fecha_real:  find('fechareal', 'fechaejec', 'fechafin', 'enddate'),
  };
}

function mapRows(raw: Record<string, unknown>[], m: ColMapping, extraCols: string[]): HormigonItem[] {
  const mapped = raw.map((r, i) => {
    const get = (k: string) => String(r[k] ?? '').trim();
    const extras: Record<string, string> = {};
    for (const ec of extraCols) extras[ec] = get(ec);
    return {
      id:          get(m.id) || `row-${i + 1}`,
      codigo:      get(m.codigo),
      descripcion: get(m.descripcion),
      zona:        get(m.zona),
      tipo:        get(m.tipo),
      vol_prog:    parseNum(r[m.vol_prog]),
      avance:      Math.min(100, Math.max(0, parseNum(r[m.avance]))),
      estado:      (['pendiente', 'en_proceso', 'ejecutado', 'rechazado'].includes(get(m.estado).toLowerCase())
        ? get(m.estado).toLowerCase() : 'pendiente') as HormigonItem['estado'],
      bim_id:      get(m.bim_id),
      ot:          get(m.ot),
      calidad:     get(m.calidad),
      fecha_prog:  get(m.fecha_prog),
      fecha_real:  get(m.fecha_real),
      extras,
    };
  }).filter(r => r.descripcion || r.codigo);

  // Deduplicate by id — keeps last occurrence so re-imports overwrite cleanly
  const seen = new Map<string, HormigonItem>();
  for (const item of mapped) seen.set(item.id, item);
  return Array.from(seen.values());
}

// ─── WBS helpers (module-level) ──────────────────────────────────────────────

const parseD = (s: string): Date | null => {
  if (!s?.trim()) return null;
  const iso = new Date(s.trim());
  if (!isNaN(iso.getTime())) return iso;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const yr = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    const d2 = new Date(yr, parseInt(m[2]) - 1, parseInt(m[1]));
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
};

function getItemVal(item: HormigonItem, key: string): string {
  if (key === 'zona') return item.zona;
  if (key === 'tipo') return item.tipo;
  if (key === 'estado') return item.estado;
  if (key === 'ot') return item.ot;
  if (key === 'calidad') return item.calidad;
  if (key.startsWith('extras.')) return item.extras[key.slice(7)] ?? '';
  return '';
}

function buildWbsTree(
  items: HormigonItem[],
  levels: string[],
  depth: number,
  parentPath: string,
  order: Record<string, string[]>
): WbsNode[] {
  if (depth >= levels.length || items.length === 0) return [];
  const key = levels[depth];
  const groups = new Map<string, HormigonItem[]>();
  for (const it of items) {
    const val = getItemVal(it, key) || '(sin clasificar)';
    if (!groups.has(val)) groups.set(val, []);
    groups.get(val)!.push(it);
  }
  const allLabels = Array.from(groups.keys());
  const customOrder = order[parentPath];
  const orderedLabels = customOrder?.length
    ? [...customOrder.filter(l => allLabels.includes(l)), ...allLabels.filter(l => !customOrder.includes(l)).sort((a, b) => a.localeCompare(b))]
    : allLabels.sort((a, b) => a.localeCompare(b));

  return orderedLabels.map(label => {
    const groupItems = groups.get(label)!;
    const path = parentPath ? `${parentPath}>${key}:${label}` : `${key}:${label}`;
    const starts = groupItems.map(i => parseD(i.fecha_prog)).filter(Boolean) as Date[];
    const ends   = groupItems.map(i => parseD(i.fecha_real)).filter(Boolean) as Date[];
    const start  = starts.length ? new Date(Math.min(...starts.map(d => d.getTime()))) : null;
    const end    = ends.length   ? new Date(Math.max(...ends.map(d => d.getTime())))   : null;
    const vol    = groupItems.reduce((s, i) => s + i.vol_prog, 0);
    const ejec   = groupItems.reduce((s, i) => s + i.vol_prog * (i.avance / 100), 0);
    const avance = vol > 0 ? (ejec / vol) * 100 : 0;
    const children = buildWbsTree(groupItems, levels, depth + 1, path, order);
    return { path, parentPath, label, depth, allItems: groupItems, children, start, end, vol, avance };
  });
}

function flattenForRender(nodes: WbsNode[], expanded: Set<string>): WbsRow[] {
  const result: WbsRow[] = [];
  for (const node of nodes) {
    result.push({ kind: 'node', node });
    if (expanded.has(node.path)) {
      if (node.children.length > 0) {
        result.push(...flattenForRender(node.children, expanded));
      } else {
        for (const item of node.allItems) {
          result.push({ kind: 'item', item, depth: node.depth + 1 });
        }
      }
    }
  }
  return result;
}

function findNodeInTree(nodes: WbsNode[], path: string): WbsNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    const f = findNodeInTree(n.children, path);
    if (f) return f;
  }
  return null;
}

function getSortValue(item: HormigonItem, key: string): string | number {
  switch (key) {
    case 'vol_prog': return item.vol_prog;
    case 'avance':   return item.avance;
    case 'zona':        return item.zona;
    case 'tipo':        return item.tipo;
    case 'estado':      return item.estado;
    case 'ot':          return item.ot;
    case 'calidad':     return item.calidad;
    case 'codigo':      return item.codigo;
    case 'descripcion': return item.descripcion;
    case 'fecha_prog':  return item.fecha_prog;
    case 'fecha_real':  return item.fecha_real;
    case 'bim_id':      return item.bim_id;
    default:
      if (key.startsWith('extras.')) return item.extras[key.slice(7)] ?? '';
      return (item as any)[key] ?? '';
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ColSelect({ label, value, onChange, headers, required }: {
  label: string; value: string; onChange: (v: string) => void;
  headers: string[]; required?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-40 text-[10px] font-bold text-slate-600 truncate shrink-0">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 text-[10px] border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 bg-white"
      >
        <option value="">— No mapear —</option>
        {headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      {value && <span className="text-[9px] text-slate-400 shrink-0 truncate max-w-[80px]">= {value}</span>}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate">{label}</p>
        <p className="text-xl font-black text-slate-800 leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

// ─── BIM Viewer colors ───────────────────────────────────────────────────────

// Values in 0–1 range — applyUniversalColorMap passes directly to THREE.Vector4
const ESTADO_RGBS: Record<string, { r: number; g: number; b: number }> = {
  ejecutado:  { r: 16/255,  g: 185/255, b: 129/255 },  // emerald-500
  en_proceso: { r: 59/255,  g: 130/255, b: 246/255 },  // blue-500
  rechazado:  { r: 239/255, g: 68/255,  b: 68/255  },  // red-500
};

// ─── Floating BIM Viewer panel ────────────────────────────────────────────────

const FIXED_MATCH_COLS = [
  { key: 'bim_id',  label: 'BIM ID / GUID' },
  { key: 'id',       label: 'ID' },
  { key: 'codigo',   label: 'Código' },
  { key: 'ot',       label: 'OT' },
  { key: 'calidad',  label: 'Calidad' },
];

function getMatchValue(item: HormigonItem, col: string): string {
  if (col.startsWith('extras.')) return item.extras[col.slice(7)] ?? '';
  return (item as any)[col] ?? '';
}

interface FloatingViewerProps {
  urn: string;
  items: HormigonItem[];
  extraCols: string[];
  onClose: () => void;
  highlightedItem?: HormigonItem | null;
  onBimSelect?: (matched: HormigonItem | null, externalId: string) => void;
  width: number;
  matchCol: string;
  onMatchColChange: (col: string) => void;
  isFiltered: boolean;
}

function SideBimViewer({ urn, items, extraCols, onClose, highlightedItem, onBimSelect, width, matchCol, onMatchColChange, isFiltered }: FloatingViewerProps) {
  const viewerRef = useRef<ForgeViewerHandle>(null);
  const [ready,          setReady]          = useState(false);
  const [universalReady, setUniversalReady] = useState(false);
  const [indexPct,       setIndexPct]       = useState(0);
  const [coloredCount,   setColoredCount]   = useState(0);
  const [colorsEnabled,  setColorsEnabled]  = useState(true);

  const allMatchCols = useMemo(() => [
    ...FIXED_MATCH_COLS,
    ...extraCols.map(c => ({ key: `extras.${c}`, label: c })),
  ], [extraCols]);

  // Build universal index automatically after viewer is ready
  useEffect(() => {
    if (!ready || !viewerRef.current || universalReady) return;
    setIndexPct(1);
    viewerRef.current.buildUniversalIndex(pct => setIndexPct(Math.round(pct))).then(() => {
      setUniversalReady(true);
      setIndexPct(100);
    }).catch(console.error);
  }, [ready, universalReady]);

  // Color all registered elements by estado using universal map
  useEffect(() => {
    if (!universalReady || !viewerRef.current) return;
    if (!colorsEnabled) {
      viewerRef.current.applyUniversalColorMap([]).then(() => setColoredCount(0));
      viewerRef.current.restoreAll();
      return;
    }
    const map = items
      .map(it => {
        const val = getMatchValue(it, matchCol)?.trim();
        if (!val || it.estado === 'pendiente') return null;
        const c = ESTADO_RGBS[it.estado];
        if (!c) return null;
        return { value: val, ...c, a: 0.95 };
      })
      .filter(Boolean) as { value: string; r: number; g: number; b: number; a: number }[];
    if (map.length > 0) {
      viewerRef.current.applyUniversalColorMap(map).then(n => setColoredCount(n));
    } else {
      setColoredCount(0);
    }
  }, [items, universalReady, matchCol, colorsEnabled]);

  // Isolate filtered elements — when a filter is active, only show those elements
  useEffect(() => {
    if (!universalReady || !viewerRef.current) return;
    if (!isFiltered) {
      viewerRef.current.showAll();
      return;
    }
    const values = items.map(it => getMatchValue(it, matchCol)?.trim()).filter(Boolean) as string[];
    if (!values.length) {
      viewerRef.current.showAll();
      return;
    }
    viewerRef.current.resolveByUniversal(values).then(dbIds => {
      if (!viewerRef.current) return;
      if (dbIds.length) {
        viewerRef.current.isolate(dbIds);
        viewerRef.current.fitToView(dbIds);
      } else {
        viewerRef.current.showAll();
      }
    });
  }, [items, universalReady, matchCol, isFiltered]);

  // Table → Viewer
  useEffect(() => {
    if (!highlightedItem || !universalReady || !viewerRef.current) return;
    const value = getMatchValue(highlightedItem, matchCol)?.trim();
    if (!value) return;
    viewerRef.current.resolveByUniversal([value]).then(dbIds => {
      if (!dbIds.length || !viewerRef.current) return;
      viewerRef.current.select(dbIds);
      viewerRef.current.fitToView(dbIds);
    });
  }, [highlightedItem, universalReady, matchCol]);

  // Viewer → Table: gather ALL property values from clicked element + its ancestors
  const handleViewerSelect = useCallback(async (dbIds: number[]) => {
    if (!dbIds.length) { onBimSelect?.(null, ''); return; }
    if (!viewerRef.current) return;
    const vr = viewerRef.current;
    const allValues = new Set<string>();
    const exIds = await vr.getExternalIds(dbIds).catch(() => [] as string[]);
    exIds.forEach(id => { if (id?.trim()) allValues.add(id.trim()); });
    const nodeInfo = vr.getNodeInfo(dbIds[0]);
    const dbIdsToScan = [dbIds[0], ...(nodeInfo?.ancestors?.map(a => a.dbId) ?? [])];
    await Promise.all(dbIdsToScan.map(async dbId => {
      try {
        const props = await vr.getProperties(dbId);
        if (props.externalId?.trim()) allValues.add(props.externalId.trim());
        for (const p of props.properties) {
          const v = String(p.displayValue ?? '').trim();
          if (v) allValues.add(v);
        }
      } catch {}
    }));
    const matched = items.find(it => {
      const val = getMatchValue(it, matchCol)?.trim();
      return val && allValues.has(val);
    });
    onBimSelect?.(matched ?? null, exIds[0] ?? '');
  }, [items, matchCol, onBimSelect]);

  const estadoCounts = useMemo(
    () => Object.fromEntries(Object.keys(ESTADO_RGBS).map(e => [e, items.filter(it => it.estado === e && getMatchValue(it, matchCol)?.trim()).length])),
    [items, matchCol]
  );

  const matchedCount = useMemo(
    () => items.filter(it => Boolean(getMatchValue(it, matchCol)?.trim())).length,
    [items, matchCol]
  );

  const indexing = ready && !universalReady;

  return (
    <div
      style={{ width }}
      className="flex flex-col bg-white border-l border-slate-200 shrink-0 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0C1E4F] shrink-0 select-none">
        <Box size={11} className="text-white/60 shrink-0" />
        <span className="text-[10px] font-black text-white/90 flex-1 truncate">Avance Obras Civiles</span>
        {(!ready || indexing) && <Loader2 size={10} className="text-white/50 animate-spin shrink-0" />}
        {/* Color toggle */}
        <button
          title={colorsEnabled ? 'Desactivar colores de avance (ver modelo normal)' : 'Activar colores de avance por estado'}
          onClick={() => setColorsEnabled(v => !v)}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black transition shrink-0 ${
            colorsEnabled
              ? 'bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/50'
              : 'bg-white/10 text-white/40 hover:bg-white/20 hover:text-white/70'
          }`}
        >
          {colorsEnabled ? <Eye size={10} /> : <EyeOff size={10} />}
          <span>{colorsEnabled ? 'Avance' : 'Normal'}</span>
        </button>
        <button title="Cerrar visor" onClick={onClose}
          className="text-white/50 hover:text-white transition p-0.5 shrink-0">
          <X size={11} />
        </button>
      </div>

      {/* Viewer area — flex-1 fills all remaining height */}
      <div className="flex-1 relative bg-slate-900 overflow-hidden">
        <ForgeViewer
          ref={viewerRef}
          urn={urn}
          onReady={() => { setReady(true); viewerRef.current?.setGhosting(false); }}
          onSelectionChange={handleViewerSelect}
        />
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90 z-10">
            <Loader2 size={20} className="text-white/40 animate-spin" />
            <span className="text-[10px] text-white/40 font-semibold">Cargando modelo…</span>
          </div>
        )}
        {indexing && (
          <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center gap-2 px-2 py-1.5 bg-black/60 rounded-lg">
            <Loader2 size={10} className="text-white/60 animate-spin shrink-0" />
            <div className="flex-1 bg-white/20 rounded-full h-1 overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${indexPct}%` }} />
            </div>
            <span className="text-[8px] text-white/60 font-bold shrink-0">Indexando {indexPct}%</span>
          </div>
        )}
      </div>

      {/* Footer: match column picker + estado legend */}
      <div className="flex flex-col gap-1.5 px-3 py-2 bg-[#0C1E4F]/5 border-t border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide shrink-0">Vincular por:</span>
          <select
            value={matchCol}
            onChange={e => onMatchColChange(e.target.value)}
            className="flex-1 text-[9px] border border-slate-200 rounded-lg px-2 py-0.5 focus:outline-none focus:border-blue-400 bg-white"
          >
            {allMatchCols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          {universalReady && (
            <span className="text-[8px] text-emerald-600 font-black shrink-0 whitespace-nowrap">
              {coloredCount} col. / {matchedCount} vinc.
            </span>
          )}
        </div>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5">
          {([ ['ejecutado','Ejecutado'], ['en_proceso','En proceso'], ['rechazado','Rechazado'] ] as [string,string][]).map(([estado, label]) => {
            const { r, g, b } = ESTADO_RGBS[estado];
            return (
              <div key={estado} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})` }} />
                <span className="text-[9px] text-slate-500 font-semibold">
                  {label} <span className="font-black text-slate-700">{estadoCounts[estado] ?? 0}</span>
                </span>
              </div>
            );
          })}
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0 border border-slate-300 bg-white" />
            <span className="text-[9px] text-slate-500 font-semibold">
              Pendiente <span className="font-black text-slate-700">{estadoCounts['pendiente'] ?? 0}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DisciplinasPage({ params }: { params: Promise<{ org_slug: string; project_id: string }> }) {
  const { project_id } = use(params);
  const uid = useId();

  // ── State ─────────────────────────────────────────────────────────────────
  const [discipline, setDiscipline] = useState<'hormigones'>('hormigones');
  const [items, setItems]         = useState<HormigonItem[]>([]);
  const [extraCols, setExtraCols] = useState<string[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [dirty, setDirty]         = useState(false);
  const [bimUrn, setBimUrn]               = useState<string | null>(null);
  const [showViewer, setShowViewer]       = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [pendingAddExtId, setPendingAddExtId]      = useState<string | null>(null);

  // Import history
  const [importHistory, setImportHistory] = useState<ImportRecord[]>([]);
  const [showHistory, setShowHistory]     = useState(false);
  const [importFilename, setImportFilename] = useState('');

  // Sort
  const [sortCol, setSortCol] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  // Find & Replace
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [frCol,     setFrCol]     = useState('zona');
  const [frFind,    setFrFind]    = useState('');
  const [frReplace, setFrReplace] = useState('');

  // Column rename
  const [editingColKey, setEditingColKey]   = useState<string | null>(null);
  const [editingColName, setEditingColName] = useState('');

  // Import wizard
  const [wizStep,    setWizStep]   = useState<WizardStep>('idle');
  const [workbook,   setWorkbook]  = useState<XLSX.WorkBook | null>(null);
  const [tables,     setTables]    = useState<DetectedTable[]>([]);
  const [headers,    setHeaders]   = useState<string[]>([]);
  const [rawRows,    setRawRows]   = useState<Record<string, unknown>[]>([]);
  const [mapping,    setMapping]   = useState<ColMapping>(emptyMapping());
  const [previewRows, setPreviewRows] = useState<HormigonItem[]>([]);
  const [extraImport, setExtraImport] = useState<string[]>([]);

  // Filters / view
  const [viewMode,    setViewMode]    = useState<ViewMode>('table');
  const [searchQ,     setSearchQ]     = useState('');
  const [filterZona,  setFilterZona]  = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterTipo,  setFilterTipo]  = useState('');
  const [wbsLevels,   setWbsLevels]   = useState<string[]>(['zona']);
  const [wbsOrder,    setWbsOrder]    = useState<Record<string, string[]>>({});
  const [ganttExpanded, setGanttExpanded] = useState<Set<string>>(new Set());
  const [dragNodePath, setDragNodePath] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const wbsConfigLoaded = useRef(false);
  const [panelWidth, setPanelWidth]   = useState(440);
  const [matchCol, setMatchCol]       = useState('bim_id');
  const resizingRef    = useRef(false);
  const resizeStartRef = useRef({ x: 0, w: 0 });

  // ── Panel resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = resizeStartRef.current.x - e.clientX;
      setPanelWidth(Math.max(280, Math.min(900, resizeStartRef.current.w + delta)));
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // ── Load from Supabase ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const sb = createClient() as any;
        const { data } = await sb.from('projects').select('module_config').eq('id', project_id).single();
        const mc = data?.module_config as Record<string, unknown> | null;
        const cfg = (mc?.disciplinas as any)?.hormigones as HormigonesConfig | undefined;
        if (cfg) {
          const deduped = new Map<string, HormigonItem>();
          for (const it of (cfg.items ?? [])) deduped.set(it.id, it);
          setItems(Array.from(deduped.values()));
          setExtraCols(cfg.extraCols ?? []);
          if (cfg.wbsLevels?.length) setWbsLevels(cfg.wbsLevels);
          if (cfg.wbsOrder) setWbsOrder(cfg.wbsOrder);
        }
        const bim = mc?.bim as { urn?: string } | undefined;
        if (bim?.urn) setBimUrn(bim.urn);
        const hist = (mc?.disciplinas as any)?.importHistory as ImportRecord[] | undefined;
        if (hist?.length) setImportHistory(hist);
      } catch {}
      setLoading(false);
      wbsConfigLoaded.current = true;
    })();
  }, [project_id]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = useCallback(async (
    newItems: HormigonItem[],
    newExtraCols: string[],
    lvls?: string[],
    ord?: Record<string, string[]>,
  ) => {
    setSaving(true);
    try {
      const sb = createClient() as any;
      const { data } = await sb.from('projects').select('module_config').eq('id', project_id).single();
      const current = data?.module_config?.disciplinas ?? {};
      await setModuleConfigKey(project_id, 'disciplinas', {
        ...current,
        hormigones: {
          items: newItems,
          extraCols: newExtraCols,
          wbsLevels: lvls,
          wbsOrder: ord,
        },
      });
      setDirty(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  }, [project_id]);

  // Auto-save wbs config when levels or order change (debounced)
  useEffect(() => {
    if (!wbsConfigLoaded.current) return;
    const t = setTimeout(() => save(items, extraCols, wbsLevels, wbsOrder), 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wbsLevels, wbsOrder]);

  const updateItems = useCallback((next: HormigonItem[]) => {
    setItems(next); setDirty(true);
  }, []);

  const saveHistory = useCallback(async (newHistory: ImportRecord[]) => {
    try {
      const sb = createClient() as any;
      const { data } = await sb.from('projects').select('module_config').eq('id', project_id).single();
      const current = data?.module_config?.disciplinas ?? {};
      await setModuleConfigKey(project_id, 'disciplinas', { ...current, importHistory: newHistory });
    } catch (e) { console.error(e); }
  }, [project_id]);

  // ── Excel import ─────────────────────────────────────────────────────────
  const handleFile = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    setImportFilename(files[0].name);
    const reader = new FileReader();
    reader.onload = e => {
      const wb = XLSX.read(e.target?.result, { type: 'array', cellDates: true });
      const detected = detectAllTables(wb);
      setWorkbook(wb);
      setTables(detected);
      if (detected.length === 1) {
        const t = detected[0];
        const raw = t.rows as Record<string, unknown>[];
        setRawRows(raw);
        setHeaders(t.headers);
        setMapping(autoDetect(t.headers));
        setExtraImport([]);
        setWizStep('mapping');
      } else {
        setWizStep('sheet');
      }
    };
    reader.readAsArrayBuffer(files[0]);
  }, []);

  const handleTableSelect = useCallback((t: DetectedTable) => {
    const raw = t.rows as Record<string, unknown>[];
    setRawRows(raw);
    setHeaders(t.headers);
    setMapping(autoDetect(t.headers));
    setExtraImport([]);
    setWizStep('mapping');
  }, []);

  const handleMappingConfirm = useCallback(() => {
    const mapped = mapRows(rawRows, mapping, extraImport);
    setPreviewRows(mapped);
    setWizStep('preview');
  }, [rawRows, mapping, extraImport]);

  const handleImportConfirm = useCallback(async (mode: 'replace' | 'merge') => {
    const newExtraCols = Array.from(new Set([
      ...(mode === 'replace' ? [] : extraCols),
      ...extraImport,
    ]));
    let finalItems: HormigonItem[];
    if (mode === 'replace') {
      finalItems = previewRows;
    } else {
      const merged = [...items];
      for (const row of previewRows) {
        const idx = merged.findIndex(r => r.id === row.id);
        if (idx >= 0) merged[idx] = { ...merged[idx], ...row };
        else merged.push(row);
      }
      finalItems = merged;
    }
    const record: ImportRecord = {
      id: `imp-${Date.now()}`,
      filename: importFilename || 'archivo.xlsx',
      tableName: tables[0]?.tableName ?? '',
      uploadedAt: new Date().toISOString(),
      rowCount: previewRows.length,
      extraColCount: extraImport.length,
      items: previewRows,
      extraCols: extraImport,
    };
    const newHistory = [...importHistory, record];
    setImportHistory(newHistory);
    setItems(finalItems);
    setExtraCols(newExtraCols);
    setWizStep('idle');
    setWorkbook(null);
    await save(finalItems, newExtraCols, wbsLevels, wbsOrder);
    await saveHistory(newHistory);
  }, [items, previewRows, extraCols, extraImport, importHistory, importFilename, tables, save, saveHistory, wbsLevels, wbsOrder]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const zonas  = useMemo(() => Array.from(new Set(items.map(i => i.zona).filter(Boolean))).sort(), [items]);
  const tipos  = useMemo(() => Array.from(new Set(items.map(i => i.tipo).filter(Boolean))).sort(), [items]);

  const filtered = useMemo(() => {
    const q = searchQ.toLowerCase();
    return items.filter(it =>
      (!filterZona   || it.zona   === filterZona)  &&
      (!filterEstado || it.estado === filterEstado) &&
      (!filterTipo   || it.tipo   === filterTipo)   &&
      (!q || it.descripcion.toLowerCase().includes(q) || it.codigo.toLowerCase().includes(q) || it.id.toLowerCase().includes(q))
    );
  }, [items, searchQ, filterZona, filterEstado, filterTipo]);

  const kpis = useMemo(() => {
    const total  = items.reduce((s, i) => s + i.vol_prog, 0);
    const ejec   = items.reduce((s, i) => {
      if (i.estado === 'ejecutado')  return s + i.vol_prog;
      if (i.estado === 'en_proceso') return s + i.vol_prog * (i.avance / 100);
      return s;
    }, 0);
    const avance = total > 0 ? (ejec / total) * 100 : 0;
    const counts = { ejecutado: 0, en_proceso: 0, pendiente: 0, rechazado: 0 };
    for (const it of items) counts[it.estado] = (counts[it.estado] ?? 0) + 1;
    return { total, ejec, avance, counts, n: items.length };
  }, [items]);

  const levelCols = useMemo(() => [
    { key: 'zona',    label: 'Zona' },
    { key: 'tipo',    label: 'Tipo' },
    { key: 'estado',  label: 'Estado' },
    { key: 'ot',      label: 'OT' },
    { key: 'calidad', label: 'Calidad' },
    ...extraCols.map(c => ({ key: `extras.${c}`, label: c })),
  ], [extraCols]);

  const wbsTree = useMemo(
    () => buildWbsTree(filtered, wbsLevels, 0, '', wbsOrder),
    [filtered, wbsLevels, wbsOrder]
  );

  const flatRows = useMemo(
    () => flattenForRender(wbsTree, ganttExpanded),
    [wbsTree, ganttExpanded]
  );

  const displayRows = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortCol.key);
      const bv = getSortValue(b, sortCol.key);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortCol.dir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), 'es', { numeric: true });
      return sortCol.dir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol]);

  const frMatchCount = useMemo(() => {
    if (!frFind.trim() || !frCol) return 0;
    return items.filter(it => String(getSortValue(it, frCol)).toLowerCase() === frFind.trim().toLowerCase()).length;
  }, [items, frFind, frCol]);

  // ── Gantt timeline data ───────────────────────────────────────────────────
  const gantt = useMemo(() => {
    const allDates: Date[] = [];
    for (const it of filtered) {
      const s = parseD(it.fecha_prog); if (s) allDates.push(s);
      const e = parseD(it.fecha_real); if (e) allDates.push(e);
    }
    if (!allDates.length) return null;

    let minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    let maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    minDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
    const totalMs = maxDate.getTime() - minDate.getTime() || 1;

    const pct = (d: Date) => ((d.getTime() - minDate.getTime()) / totalMs) * 100;
    const bar = (s: Date | null, e: Date | null) => {
      if (!s) return null;
      const end   = e ?? s;
      const left  = Math.max(0, Math.min(100, pct(s)));
      const right = Math.max(0, Math.min(100, pct(new Date(end.getTime() + 86400000))));
      return { left, width: Math.max(0.5, right - left) };
    };

    const months: { label: string; left: number; width: number }[] = [];
    let cur = new Date(minDate);
    while (cur <= maxDate) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const end  = next > maxDate ? maxDate : new Date(next.getTime() - 1);
      months.push({
        label: cur.toLocaleDateString('es', { month: 'short', year: '2-digit' }),
        left:  pct(cur),
        width: pct(end) - pct(cur) + (pct(new Date(end.getTime() + 86400000)) - pct(end)),
      });
      cur = next;
    }

    return { minDate, maxDate, months, bar };
  }, [filtered]);

  // ── WBS drag-to-reorder ───────────────────────────────────────────────────
  const handleDrop = useCallback((targetNode: WbsNode) => {
    if (!dragNodePath || dragNodePath === targetNode.path) {
      setDragNodePath(null); setDragOverPath(null); return;
    }
    const draggedNode = findNodeInTree(wbsTree, dragNodePath);
    if (!draggedNode || draggedNode.parentPath !== targetNode.parentPath) {
      setDragNodePath(null); setDragOverPath(null); return;
    }
    const siblings = targetNode.parentPath === ''
      ? wbsTree
      : (findNodeInTree(wbsTree, targetNode.parentPath)?.children ?? []);
    const labels = siblings.map(s => s.label);
    const fromIdx = labels.indexOf(draggedNode.label);
    const toIdx   = labels.indexOf(targetNode.label);
    if (fromIdx === toIdx || fromIdx === -1 || toIdx === -1) {
      setDragNodePath(null); setDragOverPath(null); return;
    }
    const newOrder = [...labels];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedNode.label);
    setWbsOrder(prev => ({ ...prev, [targetNode.parentPath]: newOrder }));
    setDragNodePath(null);
    setDragOverPath(null);
  }, [dragNodePath, wbsTree]);

  // ── Sort ─────────────────────────────────────────────────────────────────
  const handleSort = useCallback((key: string) => {
    setSortCol(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }, []);

  // ── Find & Replace ────────────────────────────────────────────────────────
  const handleFindReplace = useCallback(() => {
    if (!frFind.trim() || !frCol) return;
    const findLower = frFind.trim().toLowerCase();
    const newItems = items.map(it => {
      if (String(getSortValue(it, frCol)).toLowerCase() !== findLower) return it;
      if (frCol === 'zona')        return { ...it, zona: frReplace };
      if (frCol === 'tipo')        return { ...it, tipo: frReplace };
      if (frCol === 'ot')          return { ...it, ot: frReplace };
      if (frCol === 'calidad')     return { ...it, calidad: frReplace };
      if (frCol === 'codigo')      return { ...it, codigo: frReplace };
      if (frCol === 'descripcion') return { ...it, descripcion: frReplace };
      if (frCol === 'bim_id')      return { ...it, bim_id: frReplace };
      if (frCol === 'fecha_prog')  return { ...it, fecha_prog: frReplace };
      if (frCol === 'fecha_real')  return { ...it, fecha_real: frReplace };
      if (frCol === 'vol_prog')    return { ...it, vol_prog: parseNum(frReplace) };
      if (frCol === 'avance')      return { ...it, avance: Math.min(100, Math.max(0, parseNum(frReplace))) };
      if (frCol === 'estado' && ['pendiente','en_proceso','ejecutado','rechazado'].includes(frReplace))
        return { ...it, estado: frReplace as HormigonItem['estado'] };
      if (frCol.startsWith('extras.')) {
        const ec = frCol.slice(7);
        return { ...it, extras: { ...it.extras, [ec]: frReplace } };
      }
      return it;
    });
    updateItems(newItems);
    setShowFindReplace(false);
    setFrFind(''); setFrReplace('');
  }, [items, frCol, frFind, frReplace, updateItems]);

  // ── Column rename ─────────────────────────────────────────────────────────
  const handleRenameCol = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) { setEditingColKey(null); return; }
    const newExtraCols = extraCols.map(c => c === oldName ? trimmed : c);
    const newItems = items.map(it => {
      const { [oldName]: val, ...rest } = it.extras;
      return { ...it, extras: { ...rest, [trimmed]: val ?? '' } };
    });
    setExtraCols(newExtraCols);
    setItems(newItems);
    setDirty(true);
    setEditingColKey(null);
  }, [extraCols, items]);

  // ── Column delete ─────────────────────────────────────────────────────────
  const handleDeleteCol = useCallback((colName: string) => {
    const newExtraCols = extraCols.filter(c => c !== colName);
    const newItems = items.map(it => {
      const { [colName]: _removed, ...rest } = it.extras;
      return { ...it, extras: rest };
    });
    setExtraCols(newExtraCols);
    setItems(newItems);
    setDirty(true);
  }, [extraCols, items]);

  // ── Column add ────────────────────────────────────────────────────────────
  const handleAddCol = useCallback(() => {
    let name = 'Nueva columna';
    let n = 1;
    while (extraCols.includes(name)) { name = `Nueva columna ${++n}`; }
    const newExtraCols = [...extraCols, name];
    const newItems = items.map(it => ({ ...it, extras: { ...it.extras, [name]: '' } }));
    setExtraCols(newExtraCols);
    setItems(newItems);
    setDirty(true);
    setEditingColKey(name);
    setEditingColName(name);
  }, [extraCols, items]);

  // ── Import history actions ─────────────────────────────────────────────────
  const deleteImport = useCallback(async (id: string) => {
    const newHistory = importHistory.filter(r => r.id !== id);
    setImportHistory(newHistory);
    await saveHistory(newHistory);
  }, [importHistory, saveHistory]);

  const loadFromImport = useCallback(async (record: ImportRecord) => {
    setItems(record.items);
    setExtraCols(record.extraCols);
    setDirty(true);
    setShowHistory(false);
    await save(record.items, record.extraCols, wbsLevels, wbsOrder);
  }, [save, wbsLevels, wbsOrder]);

  // ── BIM ↔ Table bidirectional sync ───────────────────────────────────────
  const handleBimSelect = useCallback((matched: HormigonItem | null, externalId: string) => {
    if (matched) {
      setHighlightedItemId(matched.id);
      setViewMode('table');
      setPendingAddExtId(null);
    } else if (externalId) {
      setPendingAddExtId(externalId);
    } else {
      // Empty selection (viewer deselect) — clear table highlight
      setHighlightedItemId(null);
    }
  }, []);

  // Scroll the highlighted row into view when set
  useEffect(() => {
    if (!highlightedItemId) return;
    const el = document.querySelector(`[data-item-id="${highlightedItemId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedItemId]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const addRow = () => {
    const blank: HormigonItem = {
      id: `H-${Date.now()}`, codigo: '', descripcion: 'Nueva partida', zona: '',
      tipo: '', vol_prog: 0, avance: 0, estado: 'pendiente',
      bim_id: '', ot: '', calidad: '', fecha_prog: '', fecha_real: '',
      extras: Object.fromEntries(extraCols.map(c => [c, ''])),
    };
    updateItems([...items, blank]);
  };

  const updateItem = (id: string, field: keyof HormigonItem | string, value: string | number) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      if (field in it && field !== 'extras') return { ...it, [field]: value };
      return { ...it, extras: { ...it.extras, [field]: String(value) } };
    }));
    setDirty(true);
  };

  const removeItem = (id: string) => updateItems(items.filter(it => it.id !== id));

  if (loading) return (
    <div className="flex items-center justify-center h-48 gap-3">
      <Loader2 size={20} className="animate-spin text-slate-300" />
      <span className="text-sm text-slate-400">Cargando datos…</span>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-0 -mx-8 -my-8 h-[calc(100vh-65px)] overflow-hidden bg-slate-50">

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#0C1E4F] flex items-center justify-center">
            <Construction size={15} className="text-white" />
          </div>
          <div>
            <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest leading-none">Por Disciplina</p>
            <p className="text-[9px] text-slate-400 font-bold">Control técnico por especialidad</p>
          </div>
        </div>

        {/* Discipline tabs */}
        <div className="flex bg-slate-100 rounded-xl p-0.5 mx-4">
          <button
            onClick={() => setDiscipline('hormigones')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition ${discipline === 'hormigones' ? 'bg-white shadow-sm text-[#0C1E4F]' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Hammer size={11} /> Hormigones
          </button>
          {['Estructuras', 'Mecánico', 'Eléctrico', 'Instrumentación'].map(d => (
            <button key={d}
              className="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide text-slate-300 cursor-not-allowed"
              title="Próximamente"
            >{d}</button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              if (!bimUrn) { alert('No hay modelo BIM configurado para este proyecto. Configúralo en el módulo Visor BIM.'); return; }
              setShowViewer(v => !v);
            }}
            title={bimUrn ? 'Abrir visor BIM flotante' : 'Sin modelo BIM configurado'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition ${showViewer ? 'bg-[#0C1E4F] text-white shadow-sm' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'} ${!bimUrn ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <Box size={11} /> Visor BIM
          </button>
          <button onClick={() => setShowFindReplace(true)} title="Buscar y reemplazar valores en columnas"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black hover:bg-slate-50 transition">
            <Replace size={11} /> Reemplazar
          </button>
          <button onClick={() => setShowHistory(true)} title="Historial de Excel importados"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition border ${importHistory.length ? 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <History size={11} /> Historial
            {importHistory.length > 0 && <span className="ml-0.5 bg-amber-500 text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center shrink-0">{importHistory.length}</span>}
          </button>
          {dirty && (
            <button onClick={() => save(items, extraCols, wbsLevels, wbsOrder)} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black transition disabled:opacity-50">
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Guardar
            </button>
          )}
          <label htmlFor={`import-${uid}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black transition cursor-pointer">
            <Upload size={11} /> Importar Excel
          </label>
          <input id={`import-${uid}`} type="file" accept=".xlsx,.xls,.csv" className="sr-only"
            onChange={e => { handleFile(e.target.files); (e.target as HTMLInputElement).value = ''; }} />
          <button onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black hover:bg-slate-50 transition">
            <Plus size={11} /> Nueva partida
          </button>
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-3 grid grid-cols-5 gap-3">
        <KpiCard icon={Hammer}       label="Volumen total"   value={`${kpis.total.toFixed(1)} m³`}  sub={`${kpis.n} partidas`}              color="bg-slate-600" />
        <KpiCard icon={TrendingUp}   label="Vol. ejecutado"  value={`${kpis.ejec.toFixed(1)} m³`}   sub={`${kpis.avance.toFixed(1)}% avance`} color="bg-blue-600" />
        <KpiCard icon={CheckCircle2} label="Ejecutados"      value={String(kpis.counts.ejecutado)}   sub="partidas completas"                color="bg-emerald-600" />
        <KpiCard icon={Clock}        label="En proceso"      value={String(kpis.counts.en_proceso)}  sub="en ejecución"                      color="bg-amber-500" />
        <KpiCard icon={AlertCircle}  label="Pendientes"      value={String(kpis.counts.pendiente)}   sub="sin iniciar"                       color="bg-slate-400" />
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-2 bg-white border-y border-slate-100 flex items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Buscar partida…"
            className="pl-7 pr-3 py-1.5 text-[10px] border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 w-48" />
        </div>
        {/* Filters */}
        <select value={filterZona} onChange={e => setFilterZona(e.target.value)}
          className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400">
          <option value="">Todas las zonas</option>
          {zonas.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
          className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400">
          <option value="">Todos los tipos</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
          className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_proceso">En proceso</option>
          <option value="ejecutado">Ejecutado</option>
          <option value="rechazado">Rechazado</option>
        </select>
        {(searchQ || filterZona || filterEstado || filterTipo) && (
          <button onClick={() => { setSearchQ(''); setFilterZona(''); setFilterEstado(''); setFilterTipo(''); }}
            className="text-[10px] text-red-400 hover:text-red-600 flex items-center gap-1">
            <X size={10} /> Limpiar
          </button>
        )}
        <span className="text-[10px] text-slate-400 ml-1">{filtered.length} / {items.length}</span>

        <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          <button onClick={() => setViewMode('table')}
            className={`px-3 py-1 rounded text-[10px] font-black transition ${viewMode === 'table' ? 'bg-white shadow-sm text-[#0C1E4F]' : 'text-slate-400'}`}>
            Tabla
          </button>
          <button onClick={() => setViewMode('wbs')}
            className={`px-3 py-1 rounded text-[10px] font-black transition ${viewMode === 'wbs' ? 'bg-white shadow-sm text-[#0C1E4F]' : 'text-slate-400'}`}>
            WBS
          </button>
        </div>

        {viewMode === 'wbs' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide shrink-0">Niveles:</span>
            {wbsLevels.map((lk, i) => {
              const col = levelCols.find(c => c.key === lk);
              return (
                <span key={`${lk}-${i}`}
                  className="flex items-center gap-0.5 pl-2 pr-0.5 py-0.5 bg-[#0C1E4F]/10 border border-[#0C1E4F]/20 rounded-full text-[9px] font-black text-[#0C1E4F]">
                  <span className="text-[#0C1E4F]/40 mr-0.5">{i + 1}.</span>
                  {col?.label ?? lk}
                  <button
                    onClick={() => setWbsLevels(prev => prev.filter((_, idx) => idx !== i))}
                    className="ml-0.5 w-3.5 h-3.5 rounded-full hover:bg-red-100 flex items-center justify-center text-[#0C1E4F]/40 hover:text-red-500 transition"
                  ><X size={8} /></button>
                </span>
              );
            })}
            <select
              value=""
              onChange={e => {
                const v = e.target.value;
                if (!v || wbsLevels.includes(v)) return;
                setWbsLevels(prev => [...prev, v]);
                (e.target as HTMLSelectElement).value = '';
              }}
              className="text-[9px] border border-dashed border-slate-300 rounded-full px-2 py-0.5 bg-white focus:outline-none text-slate-400 hover:border-slate-400 transition cursor-pointer"
            >
              <option value="">+ Nivel…</option>
              {levelCols.filter(c => !wbsLevels.includes(c.key)).map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-auto min-w-0">

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-5 h-full text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              <Hammer size={28} className="text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Sin partidas de hormigón</p>
              <p className="text-[11px] text-slate-400 mt-1">Importa un Excel o agrega partidas manualmente para comenzar</p>
            </div>
            <div className="flex gap-3">
              <label htmlFor={`import-${uid}`}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[11px] font-black hover:bg-emerald-700 transition cursor-pointer">
                <Upload size={13} /> Importar Excel
              </label>
              <button onClick={addRow}
                className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-black hover:bg-slate-50 transition">
                <Plus size={13} /> Nueva partida
              </button>
            </div>
          </div>
        )}

        {/* ── WBS / Gantt View ─────────────────────────────────────────── */}
        {items.length > 0 && viewMode === 'wbs' && (
          <div className="h-full overflow-auto"
            onDragOver={e => e.preventDefault()}
            onDrop={() => { setDragNodePath(null); setDragOverPath(null); }}
          >
            <div style={{ minWidth: `${Math.max(1000, (gantt?.months.length ?? 6) * 120 + 300)}px` }}>

              {/* Sticky header */}
              <div className="sticky top-0 z-20 flex border-b border-slate-200">
                <div className="sticky left-0 w-[300px] shrink-0 bg-slate-50 border-r border-slate-200 h-9 flex items-center px-3 z-30">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">WBS / Partida</span>
                </div>
                <div className="flex-1 relative h-9 bg-slate-50">
                  {gantt?.months.map((m, i) => (
                    <div key={i}
                      className="absolute top-0 bottom-0 flex items-center justify-center border-r border-slate-200"
                      style={{ left: `${m.left}%`, width: `${m.width}%` }}>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wide">{m.label}</span>
                    </div>
                  ))}
                  {!gantt && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[9px] text-slate-300 italic">Importa fechas para ver el Gantt</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tree rows */}
              {flatRows.map((row) => {
                if (row.kind === 'node') {
                  const { node } = row;
                  const rowH   = node.depth === 0 ? 36 : 32;
                  const gBar   = gantt ? gantt.bar(node.start, node.end) : null;
                  const isExp  = ganttExpanded.has(node.path);
                  const isDrag = dragNodePath === node.path;
                  const isOver = dragOverPath === node.path;
                  const indent = node.depth * 16 + 8;
                  const barBg  = node.depth === 0 ? '#0C1E4F' : node.depth === 1 ? '#1e40af' : '#3b82f6';

                  return (
                    <div key={node.path}
                      className={`flex group/row transition-opacity ${isDrag ? 'opacity-40' : ''}`}
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragNodePath(node.path); }}
                      onDragEnd={() => { setDragNodePath(null); setDragOverPath(null); }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverPath(node.path); }}
                      onDrop={e => { e.stopPropagation(); handleDrop(node); }}
                    >
                      {/* Left label cell */}
                      <div
                        className={`sticky left-0 w-[300px] shrink-0 border-r border-b flex items-center gap-1 cursor-pointer z-10 transition-colors
                          ${node.depth === 0 ? 'bg-[#0C1E4F]/5 hover:bg-[#0C1E4F]/8 border-slate-100' : 'bg-white hover:bg-slate-50 border-slate-100/70'}
                          ${isOver ? 'border-t-2 border-t-blue-400' : ''}`}
                        style={{ height: rowH, paddingLeft: `${indent}px` }}
                        onClick={() => setGanttExpanded(prev => {
                          const s = new Set(prev);
                          s.has(node.path) ? s.delete(node.path) : s.add(node.path);
                          return s;
                        })}
                      >
                        <GripVertical size={10}
                          className="text-slate-200 group-hover/row:text-slate-400 shrink-0 cursor-grab transition-colors"
                          onMouseDown={e => e.stopPropagation()}
                        />
                        {isExp
                          ? <ChevronDown size={11} className="text-slate-400 shrink-0" />
                          : <ChevronRight size={11} className="text-slate-400 shrink-0" />}
                        <span className={`font-black text-[11px] flex-1 truncate ${node.depth === 0 ? 'text-[#0C1E4F]' : 'text-slate-700'}`}>
                          {node.label}
                        </span>
                        <span className="text-[9px] text-slate-400 shrink-0 mr-1 tabular-nums">{node.vol.toFixed(0)}m³</span>
                        <span className="text-[9px] font-black text-blue-600 w-7 text-right shrink-0 mr-2 tabular-nums">{node.avance.toFixed(0)}%</span>
                      </div>

                      {/* Right Gantt cell */}
                      <div
                        className={`flex-1 relative border-b border-slate-100 ${node.depth === 0 ? 'bg-[#0C1E4F]/[0.03]' : 'bg-transparent'}`}
                        style={{ height: rowH }}
                      >
                        {gantt?.months.map((m, i) => (
                          <div key={i} className="absolute top-0 bottom-0 border-r border-slate-100" style={{ left: `${m.left + m.width}%` }} />
                        ))}
                        {gBar && (
                          <div className="absolute rounded" style={{
                            left: `${gBar.left}%`, width: `${gBar.width}%`,
                            top: rowH === 36 ? 10 : 9,
                            height: rowH === 36 ? 16 : 14,
                            background: barBg, opacity: 0.85,
                          }}>
                            <div className="absolute inset-y-0 left-0 rounded bg-blue-300/40" style={{ width: `${node.avance}%` }} />
                            {gBar.width > 6 && (
                              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white whitespace-nowrap overflow-hidden px-1">
                                {node.avance.toFixed(0)}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Item row (leaf)
                const { item, depth } = row;
                const iBar   = gantt ? gantt.bar(parseD(item.fecha_prog), parseD(item.fecha_real)) : null;
                const dotClr = item.estado === 'ejecutado' ? '#10b981' : item.estado === 'en_proceso' ? '#3b82f6' : item.estado === 'rechazado' ? '#ef4444' : '#94a3b8';
                return (
                  <div key={item.id} className="flex">
                    <div
                      className="sticky left-0 w-[300px] shrink-0 border-r border-b border-slate-50 flex items-center gap-1.5 bg-white hover:bg-slate-50 z-10"
                      style={{ height: 28, paddingLeft: `${depth * 16 + 8}px` }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotClr }} />
                      <span className="text-[10px] text-slate-600 flex-1 truncate">{item.descripcion || item.codigo}</span>
                      <span className="text-[9px] text-slate-400 shrink-0 mr-2 tabular-nums">{item.vol_prog.toFixed(0)}m³</span>
                    </div>
                    <div className="flex-1 relative border-b border-slate-50 bg-white" style={{ height: 28 }}>
                      {gantt?.months.map((m, i) => (
                        <div key={i} className="absolute top-0 bottom-0 border-r border-slate-100/60" style={{ left: `${m.left + m.width}%` }} />
                      ))}
                      {iBar && (
                        <div className="absolute rounded-sm" style={{
                          left: `${iBar.left}%`, width: `${iBar.width}%`,
                          top: 7, height: 14,
                          background: dotClr, opacity: 0.8,
                        }} />
                      )}
                    </div>
                  </div>
                );
              })}

              {flatRows.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <span className="text-[11px] text-slate-400">Sin datos para los niveles seleccionados</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Table View ───────────────────────────────────────────────── */}
        {items.length > 0 && viewMode === 'table' && (
          <table className="w-full text-[10px] border-collapse">
            <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
              <tr>
                {([
                  { key: 'codigo',      label: 'Código',    align: 'left'  },
                  { key: 'descripcion', label: 'Descripción', align: 'left' },
                  { key: 'zona',        label: 'Zona',      align: 'left'  },
                  { key: 'tipo',        label: 'Tipo',      align: 'left'  },
                  { key: 'vol_prog',    label: 'Vol m³',    align: 'right' },
                  { key: 'avance',      label: 'Avance',    align: 'left'  },
                  { key: 'estado',      label: 'Estado',    align: 'left'  },
                  { key: 'ot',          label: 'OT',        align: 'left'  },
                  { key: 'calidad',     label: 'Calidad',   align: 'left'  },
                  { key: 'fecha_prog',  label: 'F. Prog.',  align: 'left'  },
                  { key: 'fecha_real',  label: 'F. Real',   align: 'left'  },
                ] as { key: string; label: string; align: 'left' | 'right' }[]).map(col => {
                  const isActive = sortCol?.key === col.key;
                  const isMatchCol = col.key === matchCol;
                  return (
                    <th key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-3 py-2.5 font-black whitespace-nowrap cursor-pointer select-none group hover:bg-slate-50 text-${col.align} ${isMatchCol ? 'bg-violet-50 text-violet-700' : 'text-slate-500'}`}>
                      <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                        {isMatchCol && <Link2 size={9} className="text-violet-500 shrink-0" />}
                        {col.label}
                        <span className={`transition ${isActive ? 'text-blue-500' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}>
                          {isActive && sortCol?.dir === 'asc'  ? <ArrowUp size={9} /> :
                           isActive && sortCol?.dir === 'desc' ? <ArrowDown size={9} /> :
                           <ArrowUpDown size={9} />}
                        </span>
                      </div>
                    </th>
                  );
                })}
                {extraCols.map(c => {
                  const colKey = `extras.${c}`;
                  const isActive = sortCol?.key === colKey;
                  const isEditing = editingColKey === c;
                  const isMatchCol = colKey === matchCol;
                  return (
                    <th key={c} onClick={() => !isEditing && handleSort(colKey)}
                      className={`px-3 py-2.5 font-black whitespace-nowrap cursor-pointer select-none group hover:bg-slate-50 text-left ${isMatchCol ? 'bg-violet-50 text-violet-700' : 'text-slate-500'}`}>
                      <div className="flex items-center gap-1">
                        {isMatchCol && !isEditing && <Link2 size={9} className="text-violet-500 shrink-0" />}
                        {isEditing ? (
                          <input
                            autoFocus
                            defaultValue={c}
                            className="text-[10px] font-black border border-blue-400 rounded px-1 w-24 outline-none"
                            onBlur={e => handleRenameCol(c, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenameCol(c, (e.target as HTMLInputElement).value);
                              if (e.key === 'Escape') setEditingColKey(null);
                            }}
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            {c}
                            <button title="Renombrar columna"
                              onClick={e => { e.stopPropagation(); setEditingColKey(c); setEditingColName(c); }}
                              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-slate-400 hover:text-blue-500 transition ml-0.5">
                              <Pencil size={9} />
                            </button>
                            <button title="Eliminar columna"
                              onClick={e => { e.stopPropagation(); handleDeleteCol(c); }}
                              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-slate-400 hover:text-red-500 transition">
                              <X size={9} />
                            </button>
                            <span className={`transition ${isActive ? 'text-blue-500' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}>
                              {isActive && sortCol?.dir === 'asc'  ? <ArrowUp size={9} /> :
                               isActive && sortCol?.dir === 'desc' ? <ArrowDown size={9} /> :
                               <ArrowUpDown size={9} />}
                            </span>
                          </>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="px-1 py-2.5 w-8">
                  <button
                    title="Agregar columna"
                    onClick={e => { e.stopPropagation(); handleAddCol(); }}
                    className="flex items-center justify-center w-5 h-5 rounded border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-400 hover:text-blue-500 transition">
                    <Plus size={9} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map(it => {
                const isHighlighted = highlightedItemId === it.id;
                const hasMatch = Boolean(getMatchValue(it, matchCol)?.trim());
                return (
                <tr key={it.id}
                  data-item-id={it.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 group transition-colors cursor-pointer ${isHighlighted ? 'bg-blue-50/80 outline outline-1 outline-blue-300' : ''}`}
                  style={hasMatch && !isHighlighted ? { borderLeft: '3px solid #8b5cf6' } : isHighlighted ? {} : { borderLeft: '3px solid transparent' }}
                  onClick={e => {
                    const tag = (e.target as HTMLElement).tagName;
                    if (['INPUT', 'SELECT', 'BUTTON'].includes(tag)) return;
                    setHighlightedItemId(prev => prev === it.id ? null : it.id);
                  }}
                >
                  <td className="px-3 py-1.5">
                    <input value={it.codigo || it.id} onChange={e => updateItem(it.id, 'codigo', e.target.value)}
                      className="w-full bg-transparent focus:bg-white focus:border border-transparent focus:border-slate-200 rounded px-1 focus:outline-none font-mono text-slate-500" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input value={it.descripcion} onChange={e => updateItem(it.id, 'descripcion', e.target.value)}
                      className="w-full min-w-[140px] bg-transparent focus:bg-white focus:border border-transparent focus:border-slate-200 rounded px-1 focus:outline-none font-semibold text-slate-700" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input value={it.zona} onChange={e => updateItem(it.id, 'zona', e.target.value)}
                      className="w-full bg-transparent focus:bg-white focus:border border-transparent focus:border-slate-200 rounded px-1 focus:outline-none text-slate-600" />
                  </td>
                  <td className="px-3 py-1.5">
                    <select value={it.tipo} onChange={e => updateItem(it.id, 'tipo', e.target.value)}
                      className="w-full bg-transparent focus:bg-white border-transparent focus:border-slate-200 rounded px-1 focus:outline-none text-slate-600">
                      <option value="">—</option>
                      {TIPO_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      {it.tipo && !TIPO_OPTIONS.includes(it.tipo) && <option value={it.tipo}>{it.tipo}</option>}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input type="number" value={it.vol_prog} onChange={e => updateItem(it.id, 'vol_prog', parseFloat(e.target.value) || 0)}
                      className="w-16 bg-transparent focus:bg-white focus:border border-transparent focus:border-slate-200 rounded px-1 focus:outline-none text-right text-slate-600 tabular-nums" />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${it.avance}%` }} />
                      </div>
                      <input type="number" min={0} max={100} value={it.avance}
                        onChange={e => updateItem(it.id, 'avance', Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                        className="w-10 bg-transparent focus:bg-white focus:border border-transparent focus:border-slate-200 rounded px-1 focus:outline-none text-right tabular-nums text-slate-600" />
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <select value={it.estado} onChange={e => updateItem(it.id, 'estado', e.target.value)}
                      className={`text-[9px] font-black border rounded-full px-2 py-0.5 focus:outline-none cursor-pointer ${ESTADO_COLORS[it.estado] ?? ''}`}>
                      <option value="pendiente">pendiente</option>
                      <option value="en_proceso">en proceso</option>
                      <option value="ejecutado">ejecutado</option>
                      <option value="rechazado">rechazado</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input value={it.ot} onChange={e => updateItem(it.id, 'ot', e.target.value)}
                      className="w-full bg-transparent focus:bg-white focus:border border-transparent focus:border-slate-200 rounded px-1 focus:outline-none text-slate-600" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input value={it.calidad} onChange={e => updateItem(it.id, 'calidad', e.target.value)}
                      className="w-full bg-transparent focus:bg-white focus:border border-transparent focus:border-slate-200 rounded px-1 focus:outline-none text-slate-600" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="date" value={it.fecha_prog} onChange={e => updateItem(it.id, 'fecha_prog', e.target.value)}
                      className="bg-transparent focus:bg-white focus:border border-transparent focus:border-slate-200 rounded px-1 focus:outline-none text-slate-600 text-[9px]" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="date" value={it.fecha_real} onChange={e => updateItem(it.id, 'fecha_real', e.target.value)}
                      className="bg-transparent focus:bg-white focus:border border-transparent focus:border-slate-200 rounded px-1 focus:outline-none text-slate-600 text-[9px]" />
                  </td>
                  {extraCols.map(c => (
                    <td key={c} className="px-3 py-1.5">
                      <input value={it.extras[c] ?? ''} onChange={e => updateItem(it.id, c, e.target.value)}
                        className="w-full bg-transparent focus:bg-white focus:border border-transparent focus:border-slate-200 rounded px-1 focus:outline-none text-slate-600" />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      {hasMatch && (
                        <span title="Vinculado al modelo BIM" className="text-violet-400 shrink-0">
                          <Link2 size={9} />
                        </span>
                      )}
                      <button onClick={() => removeItem(it.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </div>{/* end min-w-0 content */}

      {/* ── Right BIM Side Panel with drag-resize handle ─────────────────── */}
      {showViewer && bimUrn && (
        <>
          {/* Drag handle — thin strip, wider hit target via padding */}
          <div
            className="relative w-1.5 shrink-0 bg-slate-200 hover:bg-blue-400 cursor-col-resize transition-colors group z-10"
            onMouseDown={e => {
              e.preventDefault();
              resizingRef.current = true;
              resizeStartRef.current = { x: e.clientX, w: panelWidth };
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
          >
            {/* wider invisible hit area */}
            <div className="absolute inset-y-0 -left-2 -right-2" />
            {/* grip dots */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-60 transition-opacity">
              {[0,1,2].map(i => <div key={i} className="w-0.5 h-0.5 rounded-full bg-blue-600" />)}
            </div>
          </div>
          <SideBimViewer
            urn={bimUrn}
            items={filtered}
            extraCols={extraCols}
            onClose={() => setShowViewer(false)}
            highlightedItem={filtered.find(it => it.id === highlightedItemId) ?? null}
            onBimSelect={handleBimSelect}
            width={panelWidth}
            matchCol={matchCol}
            onMatchColChange={setMatchCol}
            isFiltered={filtered.length < items.length}
          />
        </>
      )}
      </div>{/* end flex row */}

      {/* ── Import Wizard Modal ───────────────────────────────────────────── */}
      {wizStep !== 'idle' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Sheet picker */}
            {wizStep === 'sheet' && (
              <>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <FileSpreadsheet size={18} className="text-emerald-600" />
                  <span className="font-black text-slate-800">Seleccionar tabla</span>
                  <span className="text-[11px] text-slate-400 ml-1">{tables.length} tabla(s) detectadas</span>
                  <button onClick={() => setWizStep('idle')} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
                </div>
                <div className="p-6 flex flex-col gap-3">
                  <p className="text-sm text-slate-500">Selecciona cuál tabla importar:</p>
                  <div className="flex flex-col gap-2">
                    {tables.map(t => (
                      <button key={`${t.sheetName}::${t.tableName}`} onClick={() => handleTableSelect(t)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-left transition">
                        <FileSpreadsheet size={16} className="text-emerald-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-700 truncate">{t.tableName}</p>
                          <p className="text-[11px] text-slate-400">{t.rows.length} filas · {t.headers.length} columnas · hoja: {t.sheetName}</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-300 ml-auto shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                  <button onClick={() => setWizStep('idle')} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
                </div>
              </>
            )}

            {/* Column mapping */}
            {wizStep === 'mapping' && (
              <>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <Settings2 size={18} className="text-blue-600" />
                  <span className="font-black text-slate-800">Mapear columnas</span>
                  <span className="text-[11px] text-slate-400 ml-1">({headers.length} columnas detectadas · {rawRows.length} filas)</span>
                  <button onClick={() => setWizStep('idle')} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
                </div>
                <div className="p-6 overflow-y-auto flex flex-col gap-2">
                  {FIXED_FIELDS.map(f => (
                    <ColSelect key={f.key} label={f.label} value={mapping[f.key]} required={f.required}
                      headers={headers} onChange={v => setMapping(m => ({ ...m, [f.key]: v }))} />
                  ))}
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-[11px] font-black text-slate-500 mb-2 uppercase tracking-wide">Columnas extra a importar (opcionales)</p>
                    <div className="flex flex-wrap gap-2">
                      {headers
                        .filter(h => !Object.values(mapping).includes(h))
                        .map(h => (
                          <button key={h} onClick={() => setExtraImport(prev => prev.includes(h) ? prev.filter(x => x !== h) : [...prev, h])}
                            className={`px-2 py-1 rounded-full border text-[10px] font-bold transition ${extraImport.includes(h) ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                            {extraImport.includes(h) ? '✓ ' : ''}{h}
                          </button>
                        ))
                      }
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center">
                  <button onClick={() => setWizStep('sheet')} className="text-sm font-bold text-slate-500 hover:text-slate-700">← Atrás</button>
                  <button onClick={handleMappingConfirm}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition">
                    Vista previa →
                  </button>
                </div>
              </>
            )}

            {/* Preview */}
            {wizStep === 'preview' && (
              <>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  <span className="font-black text-slate-800">Vista previa</span>
                  <span className="text-[11px] text-slate-400 ml-1">{previewRows.length} partidas a importar</span>
                  <button onClick={() => setWizStep('idle')} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        {['ID', 'Descripción', 'Zona', 'Tipo', 'Vol m³', 'Avance', 'Estado'].map(h => (
                          <th key={h} className="text-left px-2 py-2 font-black text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 20).map((r, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="px-2 py-1.5 font-mono text-slate-500">{r.id}</td>
                          <td className="px-2 py-1.5 text-slate-700">{r.descripcion}</td>
                          <td className="px-2 py-1.5 text-slate-500">{r.zona}</td>
                          <td className="px-2 py-1.5 text-slate-500">{r.tipo}</td>
                          <td className="px-2 py-1.5 text-right">{r.vol_prog.toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right">{r.avance}%</td>
                          <td className="px-2 py-1.5">
                            <span className={`inline-flex px-1.5 py-0.5 rounded-full border text-[9px] font-black ${ESTADO_COLORS[r.estado] ?? ''}`}>
                              {r.estado}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewRows.length > 20 && <p className="text-[10px] text-slate-400 text-center mt-2">… y {previewRows.length - 20} más</p>}
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center gap-3">
                  <button onClick={() => setWizStep('mapping')} className="text-sm font-bold text-slate-500 hover:text-slate-700 shrink-0">← Atrás</button>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <button onClick={() => handleImportConfirm('replace')}
                      className="w-full px-4 py-2 bg-[#0C1E4F] hover:bg-[#0C1E4F]/90 text-white rounded-xl text-[11px] font-black transition flex items-center justify-center gap-2">
                      <DatabaseZap size={13} /> Reemplazar base de datos ({previewRows.length} partidas)
                    </button>
                    <button onClick={() => handleImportConfirm('merge')}
                      className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black transition flex items-center justify-center gap-2">
                      <Plus size={13} /> Agregar / actualizar ({items.length} existentes + {previewRows.length} nuevas)
                    </button>
                    <p className="text-[9px] text-slate-400 text-center">Cada opción guarda este archivo en el historial del proyecto</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Find & Replace Modal ─────────────────────────────────────────────── */}
      {showFindReplace && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <Replace size={18} className="text-blue-600" />
              <span className="font-black text-slate-800">Buscar y Reemplazar</span>
              <button onClick={() => setShowFindReplace(false)} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Columna</label>
                <select value={frCol} onChange={e => setFrCol(e.target.value)}
                  className="text-[11px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400">
                  {[
                    { key: 'zona', label: 'Zona' }, { key: 'tipo', label: 'Tipo' },
                    { key: 'estado', label: 'Estado' }, { key: 'ot', label: 'OT' },
                    { key: 'calidad', label: 'Calidad' }, { key: 'codigo', label: 'Código' },
                    { key: 'descripcion', label: 'Descripción' }, { key: 'bim_id', label: 'BIM ID' },
                    { key: 'vol_prog', label: 'Volumen m³' }, { key: 'avance', label: 'Avance %' },
                    { key: 'fecha_prog', label: 'F. Inicio' }, { key: 'fecha_real', label: 'F. Fin' },
                    ...extraCols.map(c => ({ key: `extras.${c}`, label: c })),
                  ].map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Buscar valor exacto</label>
                <input value={frFind} onChange={e => setFrFind(e.target.value)}
                  placeholder="Valor a buscar…"
                  className="text-[11px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Reemplazar con</label>
                <input value={frReplace} onChange={e => setFrReplace(e.target.value)}
                  placeholder="Nuevo valor…"
                  className="text-[11px] border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400" />
              </div>
              {frFind.trim() && (
                <div className={`text-[11px] font-bold px-3 py-2 rounded-lg ${frMatchCount > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-400'}`}>
                  {frMatchCount > 0 ? `${frMatchCount} fila${frMatchCount > 1 ? 's' : ''} coinciden` : 'Sin coincidencias'}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowFindReplace(false)} className="text-sm font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
              <button onClick={handleFindReplace} disabled={!frFind.trim() || frMatchCount === 0}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition disabled:opacity-40 flex items-center gap-2">
                <Replace size={14} /> Reemplazar {frMatchCount || ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import History Modal ──────────────────────────────────────────────── */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <History size={18} className="text-amber-600" />
              <div>
                <span className="font-black text-slate-800">Historial de Importaciones</span>
                <p className="text-[10px] text-slate-400">Datos aislados por proyecto · {importHistory.length} archivos importados</p>
              </div>
              <button onClick={() => setShowHistory(false)} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {importHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <FolderOpen size={32} className="text-slate-200" />
                  <p className="text-[11px] text-slate-400">No hay importaciones registradas aún.</p>
                  <p className="text-[10px] text-slate-300">Los próximos Excel que importes aparecerán aquí con su historial completo.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {[...importHistory].reverse().map((rec, i) => (
                    <div key={rec.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-white hover:border-slate-200 transition group">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                        <FileSpreadsheet size={15} className="text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black text-slate-700 truncate">{rec.filename}</p>
                        <p className="text-[9px] text-slate-400">
                          {rec.rowCount} partidas · {rec.extraColCount} cols extra
                          {rec.tableName ? ` · tabla: ${rec.tableName}` : ''}
                          {' · '}{new Date(rec.uploadedAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => loadFromImport(rec)}
                          title="Cargar esta base de datos como activa"
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-[#0C1E4F] hover:bg-[#0C1E4F]/80 text-white rounded-lg text-[9px] font-black transition">
                          <RotateCcw size={9} /> Cargar
                        </button>
                        <button onClick={() => deleteImport(rec.id)}
                          title="Eliminar del historial"
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <p className="text-[9px] text-slate-400 text-center">
                Cada proyecto tiene su propia base de datos aislada · Los datos no se comparten entre proyectos
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── "Add from BIM" toast ──────────────────────────────────────────── */}
      {pendingAddExtId && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 px-4 py-3 bg-white rounded-2xl shadow-2xl border border-blue-200/80 max-w-lg">
          <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <Box size={14} className="text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black text-slate-700">Elemento BIM no registrado</p>
            <p className="text-[9px] text-slate-400 font-mono truncate">{pendingAddExtId}</p>
          </div>
          <button
            onClick={() => {
              const blank: HormigonItem = {
                id: `H-${Date.now()}`,
                codigo: '', descripcion: 'Elemento BIM',
                zona: '', tipo: '',
                vol_prog: 0, avance: 0, estado: 'pendiente',
                bim_id: pendingAddExtId,
                ot: '', calidad: '', fecha_prog: '', fecha_real: '',
                extras: Object.fromEntries(extraCols.map(c => [c, ''])),
              };
              updateItems([...items, blank]);
              setHighlightedItemId(blank.id);
              setPendingAddExtId(null);
              setViewMode('table');
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black transition shrink-0"
          >
            <Plus size={10} /> Agregar registro
          </button>
          <button onClick={() => setPendingAddExtId(null)}
            className="text-slate-300 hover:text-slate-500 transition shrink-0">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
