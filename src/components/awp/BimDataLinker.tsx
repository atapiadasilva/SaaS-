'use client';

/**
 * BimDataLinker — v8 (Light theme · Red accents)
 * ─────────────────────────────────────────────────
 * [1] Vistas Guardadas   — lista, activa y elimina vistas
 * [2] Datos / Versiones  — carga y gestiona archivos
 * [3] Estructura 4D      — columna clave + jerarquía CWP → IWP → TAG
 * [4] Árbol de Color     — grupos, colores, modos
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { get, set } from 'idb-keyval';
import { detectAllTables } from '@/lib/excel/detectTables';
import type { DetectedTable } from '@/lib/excel/detectTables';
import {
  X, Loader2, Check, AlertCircle,
  ChevronDown, Link2,
  Calendar, Plus, Trash2, Layers,
  Palette, RotateCcw,
  Eye, EyeOff, Sparkles,
  Play, BookmarkPlus, Bookmark, FileText, Settings2, BoxSelect,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { setModuleConfigKey } from '@/lib/supabase/projectConfig';
import type { ForgeViewerHandle } from './ForgeViewer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DataRow { [col: string]: string }

interface FileVersion {
  id: string; fileName: string; date: string; rows: DataRow[]; columns: string[];
}

export interface ColorNode {
  value: string; color: string; guids: string[]; visible: boolean;
  parent?: string;
  tagNames?: string[];
}

export interface ViewVersion {
  id: string;
  name: string; // ej. "Semana 1", "Avance Mayo"
  createdAt: string;
  colorNodes: Array<{
    value: string; color: string; visible: boolean;
    guids?: string[];
    dbIds?: number[];
  }>;
}

export interface SavedColorView {
  id: string; name: string; keyCol: string; treeCol: string;
  viewMode: ViewMode;
  viewType?: 'standard' | 'cwa' | 'cwp';
  globalDisciplines?: Array<{ name: string; color: string }>;
  colorNodes: Array<{
    value: string; color: string; visible: boolean;
    guids?: string[];
    dbIds?: number[];
    parent?: string;
  }>;
  createdAt: string;
  versions?: ViewVersion[];
}

type ConfigNode = { value: string; color: string; visible: boolean; guids: string[]; parent?: string; tagNames?: string[] };

interface SavedLinkerConfig {
  connCol?: string;
  keyCol: string;
  treeCol: string;
  parentCol?: string;
  colorCol?: string;
  colorNodes: ConfigNode[];
  hierarchyNodes?: ConfigNode[];
  savedViews: SavedColorView[];
  savedAt: string;
}

type ViewMode = 'all' | 'isolate' | 'ghost';

// ─── Palette ──────────────────────────────────────────────────────────────────

const PALETTE_HEX = [
  '#DC2626','#EA580C','#D97706','#65A30D','#16A34A',
  '#0891B2','#2563EB','#7C3AED','#DB2777','#E11D48',
  '#B91C1C','#C2410C','#B45309','#4D7C0F','#15803D',
];

const hexToRgba = (hex: string, a = 0.9) => ({
  r: parseInt(hex.slice(1,3),16)/255,
  g: parseInt(hex.slice(3,5),16)/255,
  b: parseInt(hex.slice(5,7),16)/255, a,
});

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): DataRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g,'').trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g,'').trim());
    const row: DataRow = {};
    headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });
    return row;
  });
}

// ─── Accordion Module ─────────────────────────────────────────────────────────

function Module({
  icon: Icon, title, badge, accent = 'red', defaultOpen = false,
  children, rightSlot,
}: {
  icon: React.ElementType; title: string; badge?: string | number;
  accent?: 'red' | 'amber' | 'emerald' | 'purple'; defaultOpen?: boolean;
  children: React.ReactNode; rightSlot?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const accentMap: Record<string, { bg: string; icon: string; text: string; border: string }> = {
    red:     { bg: 'bg-red-50',     icon: 'bg-red-100 text-red-600',     text: 'text-red-700',     border: 'border-red-100'     },
    amber:   { bg: 'bg-amber-50',   icon: 'bg-amber-100 text-amber-600', text: 'text-amber-700',   border: 'border-amber-100'   },
    emerald: { bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-700', border: 'border-emerald-100' },
    purple:  { bg: 'bg-purple-50',  icon: 'bg-purple-100 text-purple-600', text: 'text-purple-700', border: 'border-purple-100'  },
  };
  const a = accentMap[accent];

  return (
    <div className={`border-b border-slate-100 transition-colors ${open ? a.bg : ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition group"
      >
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${open ? a.icon : 'bg-slate-100 text-slate-400'}`}>
          <Icon size={11} />
        </div>
        <span className={`flex-1 text-left text-[10px] font-black uppercase tracking-widest ${open ? a.text : 'text-slate-400'}`}>
          {title}
        </span>
        {badge != null && (
          <span className="text-[8px] font-black text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 shrink-0">
            {badge}
          </span>
        )}
        {rightSlot}
        <ChevronDown size={10} className={`text-slate-300 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// ─── Column Picker ────────────────────────────────────────────────────────────

function ColumnPicker({ label, columns, value, onChange, placeholder = '— Seleccionar —' }: {
  label?: string; columns: string[]; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      {label && <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>}
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold outline-none transition shadow-sm">
        <span className={value ? 'text-slate-800' : 'text-slate-400'}>{value || placeholder}</span>
        <ChevronDown size={10} className={`text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="max-h-48 overflow-y-auto overscroll-contain">
              <button type="button" onClick={() => { onChange(''); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-[10px] text-slate-400 hover:bg-slate-50 transition">{placeholder}</button>
              {columns.map(c => (
                <button key={c} type="button" onClick={() => { onChange(c); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-[10px] font-bold transition ${c === value ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50'}`}>{c}</button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── View Mode Slider ─────────────────────────────────────────────────────────

const VIEW_MODES: { id: ViewMode; label: string; icon: React.ElementType }[] = [
  { id: 'isolate', label: 'Aislar',   icon: EyeOff   },
  { id: 'all',     label: 'Todo',     icon: Eye      },
  { id: 'ghost',   label: 'Fantasma', icon: Sparkles },
];

function ViewModeSlider({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const idx = VIEW_MODES.findIndex(m => m.id === mode);
  return (
    <div className="relative bg-slate-100 rounded-xl p-1 border border-slate-200">
      <div className="absolute top-1 bottom-1 rounded-lg bg-red-500/15 border border-red-300/40 transition-all duration-300 pointer-events-none"
        style={{ left: `calc(${(idx/3)*100}% + 4px)`, width: `calc(${100/3}% - 8px)` }} />
      <div className="relative flex">
        {VIEW_MODES.map(m => { const Icon = m.icon; const active = m.id === mode;
          return (
            <button key={m.id} onClick={() => onChange(m.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[8px] font-black uppercase tracking-wide transition-all ${active ? 'text-red-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <Icon size={11} />{m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface BimDataLinkerProps {
  supabaseProjectId: string;
  viewerRef:         React.RefObject<ForgeViewerHandle | null>;
  onClose:           () => void;
  onDataLinked?:     (rows: DataRow[], columns: string[], keyCol: string) => void;
}

export default function BimDataLinker({ supabaseProjectId, viewerRef, onClose, onDataLinked }: BimDataLinkerProps) {

  // ── File versions ─────────────────────────────────────────────────────────
  const [versions,     setVersions]     = useState<FileVersion[]>([]);
  const [activeId,     setActiveId]     = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);

  // ── Column mapping ─────────────────────────────────────────────────────────
  const [connCol,   setConnCol]   = useState('');
  const [keyCol,    setKeyCol]    = useState('');
  const [treeCol,   setTreeCol]   = useState('');
  const [parentCol, setParentCol] = useState('');
  const [colorCol,  setColorCol]  = useState('');

  // ── Color tree ─────────────────────────────────────────────────────────────
  const [colorNodes, setColorNodes] = useState<ColorNode[]>([]);
  const [treeBuilt,  setTreeBuilt]  = useState(false);

  // ── View mode ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  // ── Saved views ────────────────────────────────────────────────────────────
  const [savedViews,   setSavedViews]   = useState<SavedColorView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [namingView,   setNamingView]   = useState(false);
  const [viewName,     setViewName]     = useState('');

  // ── Status ─────────────────────────────────────────────────────────────────
  const [applying,   setApplying]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [result,     setResult]     = useState<{ matched: number; total: number } | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [savedOk,    setSavedOk]    = useState(false);
  const [saveError,  setSaveError]  = useState<string | null>(null);
  const [indexReady, setIndexReady] = useState(false);
  const [indexProgress, setIndexProgress] = useState<number | null>(null);
  const [deepSelection, setDeepSelection] = useState(false);

  const [pendingTables,   setPendingTables]   = useState<DetectedTable[]>([]);
  const [showTablePicker, setShowTablePicker] = useState(false);

  const resolvedDbIdsRef   = useRef<number[]>([]);
  const fileRef            = useRef<HTMLInputElement>(null);
  const pendingFileNameRef = useRef('');
  const hierarchyNodesRef  = useRef<ConfigNode[]>([]);

  const activeVersion = versions.find(v => v.id === activeId) ?? null;
  const rows    = activeVersion?.rows    ?? [];
  const columns = activeVersion?.columns ?? [];

  useEffect(() => {
    const vr = viewerRef.current;
    if (vr?.isUniversalIndexReady()) setIndexReady(true);
  }, [viewerRef]);

  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.setDeepSelection(deepSelection);
    }
  }, [viewerRef, deepSelection]);

  useEffect(() => {
    if (!supabaseProjectId) return;
    get(`bim-linker-versions-${supabaseProjectId}`).then((cached: FileVersion[] | undefined) => {
      if (cached && cached.length > 0) {
        setVersions(cached);
        if (!activeId) setActiveId(cached[0].id);
      }
    }).catch(() => {});
  }, [supabaseProjectId]); // eslint-disable-line

  useEffect(() => {
    if (!supabaseProjectId) return;
    (async () => {
      try {
        const { data } = await (createClient() as any)
          .from('projects').select('module_config').eq('id', supabaseProjectId).single();
        const saved = (data?.module_config as any)?.bim_linker as SavedLinkerConfig | undefined;
        if (saved) {
          setConnCol(saved.connCol ?? '');
          setKeyCol(saved.keyCol ?? '');
          setTreeCol(saved.treeCol ?? '');
          setParentCol(saved.parentCol ?? '');
          setColorCol(saved.colorCol ?? '');
          if (saved.colorNodes?.length) { setColorNodes(saved.colorNodes.map(n => ({ ...n, guids: n.guids ?? [] }))); setTreeBuilt(true); }
          if (saved.savedViews?.length) setSavedViews(saved.savedViews);
          // Restaurar hierarchyNodes al ref para que persist no los sobreescriba con vacío
          if (saved.hierarchyNodes?.length) {
            hierarchyNodesRef.current = saved.hierarchyNodes.map(n => ({ ...n, guids: n.guids ?? [] }));
          }
        }
      } catch {}
    })();
  }, [supabaseProjectId]);

  const persist = useCallback(async (views: SavedColorView[], nodes: ColorNode[], cc = connCol, kc = keyCol, tc = treeCol, pc = parentCol, clc = colorCol) => {
    if (!supabaseProjectId) return;
    setSaving(true); setSaveError(null);
    try {
      // Strip guids from working colorNodes — re-derived from the file on load.
      // Use atomic RPC to avoid overwriting concurrent writes from other components.
      const hn = hierarchyNodesRef.current;
      await setModuleConfigKey(supabaseProjectId, 'bim_linker', {
        connCol: cc || undefined, keyCol: kc, treeCol: tc, parentCol: pc || undefined,
        colorCol: clc || undefined,
        colorNodes: nodes.map(({ value, color, visible, parent, tagNames }) => ({ value, color, visible, guids: [], parent, tagNames })),
        // hierarchyNodes conserva los GUIDs — el secuenciador 4D los necesita para animar el modelo
        hierarchyNodes: hn.length
          ? hn.map(({ value, color, visible, parent, tagNames, guids }) => ({ value, color, visible, guids, parent, tagNames }))
          : undefined,
        savedViews: views,
        savedAt: new Date().toISOString(),
      } as SavedLinkerConfig);
      setSavedOk(true); setTimeout(() => setSavedOk(false), 2500);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Error al guardar');
      setTimeout(() => setSaveError(null), 4000);
    } finally { setSaving(false); }
  }, [supabaseProjectId, connCol, keyCol, treeCol, parentCol, colorCol]);

  const applyTable = useCallback((tableRows: DataRow[], cols: string[], label: string) => {
    if (!tableRows.length) { setError('Tabla vacía.'); return; }
    const autoKey = cols.find(c => keyCol && c.toLowerCase() === keyCol.toLowerCase()) ??
      cols.find(c => /^(guid|globalid|element.?id|id)$/i.test(c.trim())) ?? '';
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const defaultName = `${label} - ${now.toLocaleDateString()} ${timeStr}`;
    const newVer: FileVersion = { id: `${Date.now()}`, fileName: defaultName, date: now.toISOString().slice(0,10), rows: tableRows, columns: cols };
    setVersions(prev => {
      const next = [newVer, ...prev].slice(0, 5);
      if (supabaseProjectId) set(`bim-linker-versions-${supabaseProjectId}`, next).catch(()=>{});
      return next;
    });
    setActiveId(newVer.id);
    if (autoKey) setKeyCol(autoKey);
    setColorNodes([]); setTreeBuilt(false); setResult(null);
  }, [keyCol, supabaseProjectId]);

  const loadFile = useCallback(async (file: File) => {
    setError(null);
    try {
      if (file.name.endsWith('.csv')) {
        const parsed = parseCSV(await file.text());
        if (!parsed.length) { setError('Archivo vacío.'); return; }
        applyTable(parsed, Object.keys(parsed[0]), file.name.replace(/\.[^/.]+$/, ''));
      } else {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const tables = detectAllTables(wb);
        if (!tables.length) { setError('No se encontraron datos en el archivo.'); return; }
        if (tables.length === 1) {
          const t = tables[0];
          applyTable(t.rows as DataRow[], t.headers, t.tableName);
        } else {
          pendingFileNameRef.current = file.name;
          setPendingTables(tables);
          setShowTablePicker(true);
        }
      }
    } catch (e: any) { setError(`Error: ${e.message}`); }
  }, [applyTable]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); };

  const buildColorTree = useCallback(() => {
    const groupBy = colorCol || treeCol;
    if (!groupBy || !rows.length) return;

    function buildNodes(by: string) {
      const groupGuids:    Record<string, string[]> = {};
      const groupTagNames: Record<string, string[]> = {};
      const groupParent:   Record<string, string>   = {};
      for (const row of rows) {
        const guid    = connCol   ? String(row[connCol]    ?? '').trim() : '';
        const tagName = keyCol    ? String(row[keyCol]     ?? '').trim() : guid;
        const grpVal  = String(row[by]         ?? '').trim() || '(vacío)';
        const cwp     = parentCol ? String(row[parentCol]  ?? '').trim() : '';
        if (!grpVal) continue;
        if (!groupGuids[grpVal]) { groupGuids[grpVal] = []; groupTagNames[grpVal] = []; if (cwp) groupParent[grpVal] = cwp; }
        if (guid) { groupGuids[grpVal].push(guid); groupTagNames[grpVal].push(tagName || guid); }
      }
      return Object.entries(groupGuids).sort((a, b) => b[1].length - a[1].length)
        .map(([value, guids], i) => ({
          value, guids,
          tagNames: groupTagNames[value],
          color:   PALETTE_HEX[i % PALETTE_HEX.length],
          visible: true,
          parent:  groupParent[value] || undefined,
        }));
    }

    const nodes = buildNodes(groupBy);

    // Build hierarchy using compound (parentCol + treeCol) key so every (Nivel, Nombre)
    // pair becomes its own IWP node — this ensures all 16 floors appear as separate sections.
    if (parentCol && treeCol) {
      const map: Record<string, { guids: string[]; tagNames: string[]; cwp: string; iwp: string }> = {};
      for (const row of rows) {
        const guid    = connCol ? String(row[connCol] ?? '').trim() : '';
        const tagName = keyCol  ? String(row[keyCol]  ?? '').trim() : guid;
        const cwp = String(row[parentCol] ?? '').trim();
        const iwp = String(row[treeCol]   ?? '').trim();
        if (!cwp || !iwp) continue;
        const key = `${cwp}\x00${iwp}`;
        if (!map[key]) map[key] = { guids: [], tagNames: [], cwp, iwp };
        if (guid) { map[key].guids.push(guid); map[key].tagNames.push(tagName || guid); }
      }
      hierarchyNodesRef.current = Object.values(map).map((v, i) => ({
        value:     v.iwp,
        guids:     v.guids,
        tagNames:  v.tagNames,
        color:     PALETTE_HEX[i % PALETTE_HEX.length],
        visible:   true,
        parent:    v.cwp,
      }));
    } else {
      hierarchyNodesRef.current = [];
    }

    setColorNodes(nodes);
    setTreeBuilt(true); setResult(null);
    persist(savedViews, nodes);
  }, [connCol, keyCol, treeCol, parentCol, colorCol, rows, savedViews, persist]);

  useEffect(() => { if (connCol && treeCol && rows.length && treeBuilt) buildColorTree(); }, [activeId]); // eslint-disable-line

  function applyMode(vr: ForgeViewerHandle, mode: ViewMode, dbIds: number[]) {
    vr.showAll(); vr.setGhosting(false);
    if (mode === 'isolate' && dbIds.length) vr.isolateDbIds(dbIds);
    else if (mode === 'ghost' && dbIds.length) { vr.isolateDbIds(dbIds); vr.setGhosting(true); }
  }

  const applyColors = useCallback(async (nodes: ColorNode[], mode: ViewMode) => {
    const vr = viewerRef.current; if (!vr) return;
    setApplying(true); setError(null);
    try {
      if (!vr.isUniversalIndexReady()) {
        await vr.buildUniversalIndex(setIndexProgress);
      }
      setIndexReady(true);
      setIndexProgress(null);

      const visible = nodes.filter(n => n.visible);
      const colorMap = new Map<string, number[]>();
      const allDbIds: number[] = [];

      for (const node of visible) {
        if (!node.guids.length) continue;
        const rawDbIds = vr.resolveByUniversalSync(node.guids);
        if (rawDbIds.length > 0) {
          // Expand to leaf nodes so applyThemingBatch (recursive=false) colors geometry
          const leafIds = vr.getLeafDbIds(rawDbIds);
          const existing = colorMap.get(node.color) ?? [];
          colorMap.set(node.color, [...existing, ...leafIds]);
          allDbIds.push(...rawDbIds);
        }
      }

      // Single GPU invalidation for all colors combined
      vr.applyThemingBatch(colorMap);

      const total = visible.reduce((s, n) => s + n.guids.length, 0);
      setResult({ matched: allDbIds.length, total });
      resolvedDbIdsRef.current = allDbIds;
      applyMode(vr, mode, allDbIds);
      onDataLinked?.(rows, columns, keyCol);
    } catch (e: any) { setError(`Error: ${e.message}`); }
    finally { setApplying(false); }
  }, [viewerRef, rows, columns, keyCol]);

  const apply = () => applyColors(colorNodes, viewMode);

  const handleModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    const vr = viewerRef.current;
    if (vr && resolvedDbIdsRef.current.length) applyMode(vr, mode, resolvedDbIdsRef.current);
  };

  const saveCurrentView = () => {
    if (!viewName.trim() || !colorNodes.length) return;
    const vr = viewerRef.current;
    const view: SavedColorView = {
      id: `${Date.now()}`, name: viewName.trim(), keyCol, treeCol, viewMode,
      colorNodes: colorNodes.map(({ value, color, visible, guids }) => {
        // Resolve and cache dbIds so Vistas3D can apply colors without re-building the CSV index
        let dbIds: number[] | undefined;
        if (guids?.length && vr) {
          const raw = vr.resolveByUniversalSync(guids);
          const leaves = raw.length ? vr.getLeafDbIds(raw) : [];
          if (leaves.length) dbIds = leaves;
        }
        return { value, color, visible, guids: guids || [], ...(dbIds ? { dbIds } : {}) };
      }),
      createdAt: new Date().toISOString(),
    };
    const next = [...savedViews.filter(v => v.name !== view.name), view];
    setSavedViews(next); setViewName(''); setNamingView(false);
    persist(next, colorNodes);
  };

  const activateView = useCallback(async (view: SavedColorView, overrideMode?: ViewMode) => {
    const mode = overrideMode ?? view.viewMode;
    setActiveViewId(view.id); setKeyCol(view.keyCol); setTreeCol(view.treeCol); setViewMode(mode);
    const nodes: ColorNode[] = view.colorNodes.map(saved => {
      // Re-derive guids from live rows when available; fall back to saved guids
      const derived = rows.length
        ? rows.filter(r => String(r[view.treeCol] ?? '').trim() === saved.value)
              .map(r => String(r[view.keyCol] ?? '').trim()).filter(Boolean)
        : [];
      return { ...saved, guids: derived.length > 0 ? derived : (saved.guids ?? []) };
    });
    setColorNodes(nodes); setTreeBuilt(true);
    await applyColors(nodes, mode);
  }, [rows, applyColors]);

  const deleteView = (id: string) => {
    const next = savedViews.filter(v => v.id !== id);
    setSavedViews(next);
    if (activeViewId === id) { setActiveViewId(null); viewerRef.current?.restoreAll(); viewerRef.current?.setGhosting(false); }
    persist(next, colorNodes);
  };

  const clearColors = () => {
    const vr = viewerRef.current;
    if (vr) { vr.restoreAll(); vr.setGhosting(false); }
    setResult(null); resolvedDbIdsRef.current = []; setViewMode('all'); setActiveViewId(null);
  };

  const hasFile           = !!activeVersion;
  const effectiveColorCol = colorCol || treeCol;
  const canBuild  = hasFile && !!connCol && !!effectiveColorCol && !!parentCol;
  const canApply  = treeBuilt && colorNodes.some(n => n.visible);
  const canSave   = treeBuilt && colorNodes.length > 0;
  const setColor  = (value: string, color: string) => setColorNodes(ns => ns.map(n => n.value === value ? { ...n, color } : n));
  const toggleVis = (value: string) => setColorNodes(ns => ns.map(n => n.value === value ? { ...n, visible: !n.visible } : n));

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-[320px] shrink-0 bg-white border-l border-slate-200 flex flex-col shadow-[-4px_0_20px_rgba(0,0,0,0.04)]">

      {/* ── Panel header ── */}
      <div className="shrink-0 flex flex-col">
        {/* Red accent bar */}
        <div className="h-[3px] bg-gradient-to-r from-red-600 via-rose-500 to-red-400" />
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-red-50 flex items-center justify-center">
              <Link2 size={13} className="text-red-600" />
            </div>
            <div>
              <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest leading-none">Vincular Datos</p>
              <p className="text-[9px] text-slate-400 mt-0.5">
                {indexReady
                  ? <span className="text-emerald-600 font-bold">● Índice listo</span>
                  : indexProgress != null
                    ? <span className="text-red-500 font-bold">Escaneando {indexProgress}%...</span>
                    : 'Esperando índice…'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {savedOk    && <Check size={12} className="text-emerald-500" />}
            {saveError  && <span className="text-[9px] font-bold text-red-500 max-w-[120px] truncate" title={saveError}>⚠ {saveError}</span>}
            {saving     && <Loader2 size={12} className="animate-spin text-slate-300" />}
          </div>
        </div>
      </div>

      {/* ── Index progress banner ── */}
      {!indexReady && indexProgress != null && (
        <div className="shrink-0 px-3 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2">
          <Loader2 size={11} className="animate-spin text-red-500 shrink-0" />
          <p className="text-[9px] text-red-600 font-bold">
            Indexando propiedades… {indexProgress}%
          </p>
        </div>
      )}

      {/* ── Accordion modules ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ═══════════════════════════════════════════════════════════════════
            MÓDULO 1 — VISTAS GUARDADAS
        ═════════════════════════════════════════════════════════════════════ */}
        <Module icon={Bookmark} title="Vistas Guardadas" accent="amber" badge={savedViews.length || undefined} defaultOpen>

          {savedViews.length > 0 ? (
            <div className="space-y-2 mb-3">
              {savedViews.map(view => {
                const isActive = view.id === activeViewId;
                return (
                  <div key={view.id} className={`group rounded-xl border overflow-hidden transition-all ${isActive ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    {/* Color strip */}
                    <div className="flex h-1.5">
                      {view.colorNodes.slice(0, 8).map((n, i) => <div key={i} className="flex-1" style={{ background: n.color }} />)}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-[10px] font-black truncate ${isActive ? 'text-amber-700' : 'text-slate-700'}`}>{view.name}</p>
                        <p className="text-[7px] text-slate-400 truncate mt-0.5">{view.treeCol} · {view.colorNodes.length} grupos</p>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        {VIEW_MODES.map(m => { const Icon = m.icon;
                          return (
                            <button key={m.id} onClick={() => activateView(view, m.id as ViewMode)} title={m.label}
                              className={`p-1.5 rounded-lg transition ${isActive && view.viewMode === m.id ? 'bg-amber-100 text-amber-700' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-600'}`}>
                              <Icon size={10} />
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={() => activateView(view)} title="Aplicar"
                        className={`p-1.5 rounded-lg transition ${isActive ? 'bg-amber-100 text-amber-700' : 'text-slate-300 hover:bg-emerald-50 hover:text-emerald-600'}`}>
                        <Play size={11} fill="currentColor" />
                      </button>
                      <button onClick={() => deleteView(view.id)}
                        className="p-1 text-slate-200 hover:text-red-500 transition opacity-0 group-hover:opacity-100">
                        <Trash2 size={9} />
                      </button>
                    </div>
                    {isActive && (
                      <div className="px-3 pb-2 space-y-2">
                        <ViewModeSlider mode={viewMode} onChange={mode => { setViewMode(mode); const vr = viewerRef.current; if (vr && resolvedDbIdsRef.current.length) applyMode(vr, mode, resolvedDbIdsRef.current); }} />
                        
                        {/* Deep Selection Toggle */}
                        <button 
                          onClick={() => setDeepSelection(!deepSelection)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl border transition-all ${deepSelection ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Layers size={11} className={deepSelection ? 'text-indigo-500' : 'text-slate-300'} />
                            <span className="text-[9px] font-black uppercase tracking-tight">Selección Profunda</span>
                          </div>
                          <div className={`w-6 h-3.5 rounded-full relative transition-colors ${deepSelection ? 'bg-indigo-500' : 'bg-slate-200'}`}>
                            <div className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform ${deepSelection ? 'translate-x-2.5' : 'translate-x-0'}`} />
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[9px] text-slate-400 text-center py-3 italic">Sin vistas guardadas aún</p>
          )}

          {namingView ? (
            <div className="flex gap-1.5">
              <input autoFocus value={viewName} onChange={e => setViewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveCurrentView(); if (e.key === 'Escape') { setNamingView(false); setViewName(''); } }}
                placeholder="Nombre de la vista…"
                className="flex-1 bg-white border border-slate-200 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-800 outline-none placeholder:text-slate-400 transition shadow-sm" />
              <button onClick={saveCurrentView} disabled={!viewName.trim()}
                className="p-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition disabled:opacity-30"><Check size={11} /></button>
              <button onClick={() => { setNamingView(false); setViewName(''); }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition"><X size={11} /></button>
            </div>
          ) : (
            <button onClick={() => setNamingView(true)} disabled={!canSave}
              className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed text-[9px] font-black uppercase tracking-wide transition ${canSave ? 'border-amber-300 text-amber-600 hover:bg-amber-50 hover:border-amber-400' : 'border-slate-200 text-slate-300 cursor-not-allowed'}`}>
              <BookmarkPlus size={11} /> Guardar vista actual
            </button>
          )}
        </Module>

        {/* ═══════════════════════════════════════════════════════════════════
            MÓDULO 2 — DATOS / VERSIONES
        ═════════════════════════════════════════════════════════════════════ */}
        <Module icon={FileText} title="Datos" accent="emerald" badge={versions.length || undefined} defaultOpen={!hasFile}>

          {hasFile && (
            <div className="flex items-center gap-2 mb-2 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-2">
              <Check size={11} className="text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-emerald-700 truncate">{activeVersion!.fileName}</p>
                <p className="text-[8px] text-emerald-500">{activeVersion!.rows.length} filas · {activeVersion!.columns.length} cols</p>
              </div>
              {versions.length > 1 && (
                <button onClick={() => setShowVersions(v => !v)}
                  className={`p-1.5 rounded-lg border transition ${showVersions ? 'bg-slate-100 border-slate-300 text-slate-700' : 'border-slate-200 text-slate-400 hover:text-slate-700'}`}>
                  <Layers size={11} />
                </button>
              )}
            </div>
          )}

          {showVersions && versions.length > 1 && (
            <div className="mb-2 space-y-1 max-h-36 overflow-y-auto">
              {versions.map(v => (
                <div key={v.id} onClick={() => { setActiveId(v.id); setColorNodes([]); setTreeBuilt(false); setResult(null); setShowVersions(false); }}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border cursor-pointer transition ${v.id === activeId ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                  <Calendar size={9} className="text-slate-400 shrink-0" />
                  <p className="text-[9px] font-bold text-slate-700 flex-1 truncate">{v.fileName}</p>
                  <input type="date" value={v.date} onClick={e => e.stopPropagation()}
                    onChange={e => setVersions(prev => prev.map(p => p.id === v.id ? { ...p, date: e.target.value } : p))}
                    className="bg-transparent text-[8px] text-slate-400 outline-none border-none w-20 cursor-pointer" />
                  <button onClick={e => { e.stopPropagation(); setVersions(p => p.filter(x => x.id !== v.id)); if (activeId === v.id) setActiveId(versions.filter(x => x.id !== v.id)[0]?.id ?? null); }}
                    className="p-0.5 text-slate-300 hover:text-red-500 transition"><Trash2 size={9} /></button>
                </div>
              ))}
            </div>
          )}

          <div onDrop={onDrop} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
            className="border border-dashed border-slate-200 rounded-xl p-3 text-center cursor-pointer hover:border-red-300 hover:bg-red-50/40 transition group">
            <div className="flex items-center justify-center gap-2 text-slate-400 group-hover:text-red-500 transition">
              <Plus size={12} />
              <p className="text-[9px] font-black uppercase tracking-wide">{hasFile ? 'Agregar versión' : 'Cargar archivo'}</p>
            </div>
            <p className="text-[7px] text-slate-300 mt-0.5">CSV · Excel (.xlsx)</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFileChange} />
        </Module>

        {/* ═══════════════════════════════════════════════════════════════════
            MÓDULO 3 — ESTRUCTURA 4D: CWP → IWP → TAG
        ═════════════════════════════════════════════════════════════════════ */}
        {hasFile && (
          <Module icon={Settings2} title="Estructura 4D: CWP → IWP → TAG" accent="red" defaultOpen>
            <div className="space-y-3">

              {/* Conexión al modelo 3D */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2.5">
                <p className="text-[7px] text-red-500 uppercase tracking-widest font-black">Conexión al modelo 3D</p>
                <ColumnPicker
                  label="GUID / ID de elemento"
                  columns={columns}
                  value={connCol}
                  onChange={v => { setConnCol(v); setColorNodes([]); setTreeBuilt(false); setResult(null); }}
                  placeholder="— Columna de conexión —"
                />
              </div>

              {/* Jerarquía */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2.5">
                <p className="text-[7px] text-red-500 uppercase tracking-widest font-black">Jerarquía 4D</p>

                {/* Nivel 1 - CWP (arriba = mayor) */}
                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-center pt-2 shrink-0">
                    <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[8px] font-black flex items-center justify-center">1</span>
                    <div className="w-px h-4 bg-slate-200 my-0.5" />
                  </div>
                  <div className="flex-1">
                    <ColumnPicker
                      label="CWP — Nivel superior"
                      columns={columns}
                      value={parentCol}
                      onChange={v => { setParentCol(v); setColorNodes([]); setTreeBuilt(false); }}
                      placeholder="— Columna CWP —"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-center pt-2 shrink-0">
                    <span className="w-5 h-5 rounded-full bg-rose-400 text-white text-[8px] font-black flex items-center justify-center">2</span>
                    <div className="w-px h-4 bg-slate-200 my-0.5" />
                  </div>
                  <div className="flex-1">
                    <ColumnPicker
                      label="IWP — Nivel intermedio"
                      columns={columns}
                      value={treeCol}
                      onChange={v => { setTreeCol(v); setColorNodes([]); setTreeBuilt(false); }}
                      placeholder="— Columna IWP —"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-center pt-2 shrink-0">
                    <span className="w-5 h-5 rounded-full bg-red-200 text-red-700 text-[8px] font-black flex items-center justify-center">3</span>
                  </div>
                  <div className="flex-1">
                    <ColumnPicker
                      label="TAG — Nombre del elemento"
                      columns={columns}
                      value={keyCol}
                      onChange={v => { setKeyCol(v); setColorNodes([]); setTreeBuilt(false); }}
                      placeholder="— Columna TAG —"
                    />
                  </div>
                </div>
              </div>

              {/* Columna de color */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2.5">
                <p className="text-[7px] text-purple-500 uppercase tracking-widest font-black">Colorear por</p>
                <ColumnPicker
                  label="COLUMNA DE COLOR (opcional)"
                  columns={columns}
                  value={colorCol}
                  onChange={v => { setColorCol(v); setColorNodes([]); setTreeBuilt(false); setResult(null); }}
                  placeholder={`— Por defecto: ${treeCol || 'IWP'} —`}
                />
                {colorCol && colorCol !== treeCol && (
                  <p className="text-[8px] text-purple-500 leading-relaxed">
                    Coloreará por <span className="text-purple-700 font-black">{colorCol}</span>. La jerarquía 4D sigue usando IWP + CWP.
                  </p>
                )}
              </div>

              {/* Build button */}
              <div className="pt-1">
                {(!connCol || !(colorCol || treeCol) || !parentCol) ? (
                  <p className="text-[8px] text-amber-600 uppercase tracking-widest font-black text-center mb-2">
                    {3 - [connCol, colorCol || treeCol, parentCol].filter(Boolean).length} campo(s) requeridos
                  </p>
                ) : (
                  <p className="text-[8px] text-emerald-600 uppercase tracking-widest font-black text-center mb-2">
                    CWP → {colorCol && colorCol !== treeCol ? colorCol : 'IWP'} → TAG · listo
                  </p>
                )}

                <button onClick={buildColorTree} disabled={!canBuild}
                  className={`w-full px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition flex items-center justify-center gap-2 shadow-sm ${canBuild ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-200' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
                  <Layers size={12} /> Generar Árbol de Vínculos
                </button>

                {canBuild && (
                  <p className="text-[8px] text-slate-400 text-center mt-2 leading-relaxed px-1">
                    Esta estructura alimenta el secuenciador 4D jerárquico.
                  </p>
                )}
              </div>
            </div>
          </Module>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            MÓDULO 4 — ÁRBOL DE COLOR
        ═════════════════════════════════════════════════════════════════════ */}
        {treeBuilt && colorNodes.length > 0 && (
          <Module icon={Palette} title="Árbol de Color" accent="purple"
            badge={`${colorNodes.length} · ${effectiveColorCol || '?'}`} defaultOpen>
            <div className="space-y-3">

              <div className="flex items-center justify-between">
                <span className="text-[7px] text-slate-400">Click en color para cambiar · checkbox para mostrar/ocultar</span>
                <button onClick={() => setColorNodes(ns => ns.map(n => ({ ...n, visible: !ns.every(x => x.visible) })))}
                  className="text-[8px] font-bold text-slate-400 hover:text-slate-700 transition whitespace-nowrap">
                  {colorNodes.every(n => n.visible) ? 'Ocultar todos' : 'Activar todos'}
                </button>
              </div>

              <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5">
                {colorNodes.map(node => (
                  <div key={node.value} className={`flex items-center gap-2 px-2.5 py-2 rounded-xl transition-all border ${node.visible ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-40'}`}>
                    <button onClick={() => { const i = PALETTE_HEX.indexOf(node.color); setColor(node.value, PALETTE_HEX[(i+1)%PALETTE_HEX.length]); }}
                      className="w-4 h-4 rounded-full shrink-0 ring-1 ring-slate-200 hover:scale-125 transition-transform shadow-sm" style={{ background: node.color }} />
                    <span className="text-[10px] font-semibold text-slate-700 flex-1 truncate">{node.value || '(vacío)'}</span>
                    <span className="text-[8px] text-slate-400 shrink-0 tabular-nums">{node.guids.length}</span>
                    <button onClick={() => toggleVis(node.value)}
                      className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition ${node.visible ? 'bg-red-500 border-red-600' : 'bg-transparent border-slate-300 hover:border-slate-400'}`}>
                      {node.visible && <Check size={9} className="text-white" />}
                    </button>
                  </div>
                ))}
              </div>

              {result && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-bold border ${result.matched > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {result.matched > 0 ? <Check size={10} /> : <AlertCircle size={10} />}
                  {result.matched} de {result.total} elementos vinculados
                </div>
              )}

              <button onClick={apply} disabled={!canApply || applying}
                className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition shadow-sm ${canApply && !applying ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-200' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
                {applying ? <><Loader2 size={11} className="animate-spin" />Aplicando…</> : <><Palette size={11} />Aplicar colores</>}
              </button>

              {result && (
                <>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Modo de visualización</p>
                  <ViewModeSlider mode={viewMode} onChange={handleModeChange} />
                  <button onClick={clearColors} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[8px] font-black text-slate-400 hover:text-red-500 transition">
                    <RotateCcw size={9} /> Limpiar colores
                  </button>
                </>
              )}
            </div>
          </Module>
        )}

        {/* Error */}
        {error && (
          <div className="mx-3 my-2 flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-[9px] font-bold text-red-600">{error}</p>
          </div>
        )}
      </div>

      {/* ── Table picker modal ── */}
      {showTablePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Seleccionar Tabla</p>
                <p className="text-[9px] text-slate-400 mt-0.5">
                  {pendingTables.length} tablas detectadas en{' '}
                  <span className="font-bold text-slate-600">{pendingFileNameRef.current}</span>
                </p>
              </div>
              <button onClick={() => setShowTablePicker(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
                <X size={13} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {pendingTables.map((t, i) => (
                <button key={i}
                  onClick={() => {
                    applyTable(t.rows as DataRow[], t.headers, t.tableName);
                    setShowTablePicker(false);
                    setPendingTables([]);
                  }}
                  className="w-full text-left border border-slate-200 rounded-xl p-3 hover:border-red-300 hover:bg-red-50/50 transition group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-slate-800 truncate group-hover:text-red-700">{t.tableName}</p>
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
    </div>
  );
}
