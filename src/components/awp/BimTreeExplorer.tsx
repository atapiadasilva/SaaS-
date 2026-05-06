'use client';

/**
 * BimTreeExplorer
 * Árbol de selección configurable construido desde columnas de datos vinculados.
 * - Inline edit: doble clic en un nodo para renombrar su valor.
 * - Mover: reasignar nodos a otro grupo dentro de la misma columna.
 * - Las configuraciones se pueden guardar como "vistas".
 * - Permite exportar los datos editados como CSV.
 */

import { useState, useEffect, useCallback, useRef, useMemo, KeyboardEvent } from 'react';
import {
  ChevronRight, ChevronDown, Eye, EyeOff, Maximize2,
  GripVertical, Plus, X, Save, FolderOpen, Loader2,
  ArrowUp, ArrowDown, Layers, Check, Trash2, Pencil,
  MoveRight, Download, Palette, PlayCircle,
} from 'lucide-react';
import type { ForgeViewerHandle } from './ForgeViewer';
import type { SequenceActivity } from './Bim4DPlayer';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataRow { [col: string]: unknown }

interface TreeNode {
  id:       string;
  column:   string;
  value:    string;
  guids:    string[];     // GUIDs en este nodo y descendientes
  children: TreeNode[];
}

interface SavedView {
  name:      string;
  columns:   string[];
  createdAt: string;
}

interface BimTreeConfig {
  treeColumns: string[];
  savedViews:  SavedView[];
  savedAt:     string;
}

// ─── Color palette ────────────────────────────────────────────────────────────

const PALETTE = [
  '#3B82F6','#10B981','#F97316','#A855F7','#EAB308',
  '#06B6D4','#EF4444','#84CC16','#EC4899','#F59E0B',
  '#6366F1','#14B8A6','#FB923C','#8B5CF6','#22D3EE',
];

const toRgba = (hex: string, a = 0.88) => {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  return { r, g, b, a };
};

// ─── Build tree from rows ─────────────────────────────────────────────────────

function buildTree(rows: DataRow[], guidCol: string, colOrder: string[]): TreeNode[] {
  function group(subset: DataRow[], depth: number, pathPrefix: string): TreeNode[] {
    if (depth >= colOrder.length) return [];
    const col    = colOrder[depth];
    const groups: Record<string, DataRow[]> = {};
    for (const row of subset) {
      const val = String(row[col] ?? '').trim() || '(sin valor)';
      if (!groups[val]) groups[val] = [];
      groups[val].push(row);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
      .map(([value, groupRows]) => {
        const id = `${pathPrefix}|${col}:${value}`;
        return {
          id,
          column: col,
          value,
          guids:    groupRows.map(r => String(r[guidCol] ?? '')).filter(Boolean),
          children: group(groupRows, depth + 1, id),
        };
      });
  }
  return group(rows, 0, '');
}

// ─── MovePanel ────────────────────────────────────────────────────────────────

function MovePanel({
  node,
  getColumnValues,
  onMove,
  onClose,
}: {
  node: TreeNode;
  getColumnValues: (col: string) => string[];
  onMove: (guids: string[], column: string, target: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const existing = getColumnValues(node.column).filter(v =>
    v !== node.value && (!query || v.toLowerCase().includes(query.toLowerCase()))
  );
  const canCreate = query.trim() && !getColumnValues(node.column).includes(query.trim());

  return (
    <div className="mx-2 mb-1.5 p-2.5 bg-[#0d1b3e] border border-white/15 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Mover a…</p>
        <button onClick={onClose} className="p-0.5 text-white/30 hover:text-white/60 transition"><X size={9} /></button>
      </div>
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && query.trim()) {
            onMove(node.guids, node.column, query.trim()); onClose();
          }
        }}
        placeholder="Buscar o nueva categoría…"
        className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[9px] text-white/80 outline-none focus:border-blue-500/50 placeholder:text-white/25"
      />
      <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
        {existing.map(v => (
          <button
            key={v}
            onClick={() => { onMove(node.guids, node.column, v); onClose(); }}
            className="w-full text-left px-2 py-1.5 rounded-lg bg-white/3 hover:bg-blue-500/20 text-[9px] font-bold text-white/60 hover:text-blue-300 border border-transparent hover:border-blue-500/30 transition truncate"
          >
            {v}
          </button>
        ))}
        {canCreate && (
          <button
            onClick={() => { onMove(node.guids, node.column, query.trim()); onClose(); }}
            className="w-full text-left px-2 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-[9px] font-bold text-emerald-300 border border-emerald-500/20 transition"
          >
            + Crear "{query.trim()}"
          </button>
        )}
        {existing.length === 0 && !canCreate && (
          <p className="text-[8px] text-white/25 text-center py-2">Sin resultados</p>
        )}
      </div>
    </div>
  );
}

// ─── TreeNodeRow component ────────────────────────────────────────────────────

function TreeNodeRow({
  node,
  depth,
  colorHex,
  dbIds,
  hidden,
  onSelect,
  onIsolate,
  onToggleHide,
  getDbIds,
  onRename,
  onMove,
  getColumnValues,
}: {
  node:              TreeNode;
  depth:             number;
  colorHex:          string;
  dbIds:             number[];
  hidden:            boolean;
  onSelect:          (node: TreeNode, ids: number[]) => void;
  onIsolate:         (ids: number[]) => void;
  onToggleHide:      (node: TreeNode, ids: number[]) => void;
  getDbIds:          (guids: string[]) => number[];
  onRename:          (column: string, oldVal: string, newVal: string) => void;
  onMove:            (guids: string[], column: string, target: string) => void;
  getColumnValues:   (column: string) => string[];
}) {
  const [open,      setOpen]      = useState(depth === 0);
  const [editing,   setEditing]   = useState(false);
  const [editVal,   setEditVal]   = useState(node.value);
  const [moveOpen,  setMoveOpen]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync editVal when node.value changes externally
  useEffect(() => { setEditVal(node.value); }, [node.value]);

  const hasChildren = node.children.length > 0;
  const count = node.guids.length;

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setEditVal(node.value);
    setTimeout(() => { inputRef.current?.select(); }, 30);
  };

  const confirmEdit = () => {
    const trimmed = editVal.trim();
    if (trimmed && trimmed !== node.value) {
      onRename(node.column, node.value, trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditVal(node.value);
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  confirmEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  return (
    <div>
      {/* Row */}
      <div
        className={`flex items-center gap-1 py-1 px-2 rounded-lg cursor-pointer transition group ${
          hidden ? 'opacity-40' : 'hover:bg-white/8'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => !editing && onSelect(node, dbIds)}
      >
        {/* Expand toggle */}
        <button
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
          className="shrink-0 p-0.5 rounded text-white/30 hover:text-white/70 transition"
        >
          {hasChildren
            ? open
              ? <ChevronDown size={10} />
              : <ChevronRight size={10} />
            : <span className="w-[10px] inline-block" />}
        </button>

        {/* Color dot */}
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: colorHex, opacity: hidden ? 0.3 : 1 }}
        />

        {/* Label / edit input */}
        {editing ? (
          <input
            ref={inputRef}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={confirmEdit}
            onClick={e => e.stopPropagation()}
            className="flex-1 min-w-0 px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/50 rounded text-[10px] font-bold text-white outline-none"
            autoFocus
          />
        ) : (
          <span
            className="flex-1 text-[10px] font-bold text-white/80 truncate min-w-0 ml-1"
            onDoubleClick={startEdit}
            title={`${node.value} — doble clic para editar`}
          >
            {node.value}
          </span>
        )}

        {/* Count */}
        {!editing && <span className="text-[8px] text-white/30 shrink-0">{count}</span>}

        {/* Actions (on hover) */}
        {!editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition ml-1 shrink-0">
            <button
              onClick={e => { e.stopPropagation(); startEdit(e); }}
              className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition"
              title="Editar nombre"
            >
              <Pencil size={8} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); setMoveOpen(o => !o); }}
              className={`p-1 rounded hover:bg-white/10 transition ${
                moveOpen ? 'text-blue-400' : 'text-white/40 hover:text-white/80'
              }`}
              title="Mover a otro grupo"
            >
              <MoveRight size={9} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onToggleHide(node, dbIds); }}
              className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition"
              title={hidden ? 'Mostrar' : 'Ocultar'}
            >
              {hidden ? <Eye size={9} /> : <EyeOff size={9} />}
            </button>
            <button
              onClick={e => { e.stopPropagation(); onIsolate(dbIds); }}
              className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/80 transition"
              title="Aislar en viewer"
            >
              <Maximize2 size={9} />
            </button>
          </div>
        )}
      </div>

      {/* Move panel */}
      {moveOpen && (
        <MovePanel
          node={node}
          getColumnValues={getColumnValues}
          onMove={onMove}
          onClose={() => setMoveOpen(false)}
        />
      )}

      {/* Children */}
      {open && hasChildren && node.children.map((child) => {
        const childDbIds = getDbIds(child.guids);
        return (
          <TreeNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            colorHex={colorHex}
            dbIds={childDbIds}
            hidden={hidden}
            onSelect={onSelect}
            onIsolate={onIsolate}
            onToggleHide={onToggleHide}
            getDbIds={getDbIds}
            onRename={onRename}
            onMove={onMove}
            getColumnValues={getColumnValues}
          />
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface BimTreeExplorerProps {
  rows:       DataRow[];
  columns:    string[];
  guidCol:    string;
  projectId:  string;
  viewerRef:  React.RefObject<ForgeViewerHandle | null>;
  onLaunch4D?: (sequence: SequenceActivity[]) => void;
}

export default function BimTreeExplorer({
  rows, columns, guidCol, projectId, viewerRef, onLaunch4D
}: BimTreeExplorerProps) {
  const STORAGE_KEY = `bim_views_${projectId}`;

  // ── Local editable copy of rows ───────────────────────────────────────────
  const [localRows, setLocalRows] = useState<DataRow[]>(rows);
  useEffect(() => { setLocalRows(rows); }, [rows]);

  // ── Column order for the tree ─────────────────────────────────────────────
  const availCols = columns;
  const [treeColumns, setTreeColumns] = useState<string[]>(availCols.slice(0, 2));
  const [editingTree, setEditingTree] = useState(false);

  // ── Persistence (Supabase) ────────────────────────────────────────────────
  const [saving,   setSaving]   = useState(false);
  const [savedOk,  setSavedOk]  = useState(false);

  const loadFromSupabase = useCallback(async () => {
    if (!projectId) return;
    try {
      const supabase = createClient();
      const { data } = await (supabase as any)
        .from('projects')
        .select('module_config')
        .eq('id', projectId)
        .single();
      const cfg = (data?.module_config as any)?.bim_tree as BimTreeConfig | undefined;
      if (cfg) {
        if (cfg.treeColumns?.length) {
          setTreeColumns(cfg.treeColumns.filter((c: string) => availCols.includes(c)));
        }
        if (cfg.savedViews?.length) {
          setSavedViews(cfg.savedViews);
        }
      }
    } catch { /* silently fail */ }
  }, [projectId, availCols]);

  useEffect(() => { loadFromSupabase(); }, [projectId]);

  const saveToSupabase = useCallback(async (cols: string[], views: SavedView[]) => {
    if (!projectId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: proj } = await (supabase as any)
        .from('projects').select('module_config').eq('id', projectId).single();
      const existing = (proj?.module_config as Record<string, unknown>) ?? {};
      const cfg: BimTreeConfig = {
        treeColumns: cols,
        savedViews:  views,
        savedAt:     new Date().toISOString(),
      };
      await (supabase as any)
        .from('projects')
        .update({ module_config: { ...existing, bim_tree: cfg } })
        .eq('id', projectId);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch { /* silently fail */ } finally {
      setSaving(false);
    }
  }, [projectId]);

  // ── Saved views state + helpers ─────────────────────────────────────────
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewName,   setViewName]   = useState('');
  const [savingView, setSavingView] = useState(false);

  const saveView = () => {
    if (!viewName.trim()) return;
    const view: SavedView = {
      name:      viewName.trim(),
      columns:   [...treeColumns],
      createdAt: new Date().toISOString(),
    };
    const next = [...savedViews.filter(v => v.name !== view.name), view];
    setSavedViews(next);
    setViewName('');
    setSavingView(false);
    saveToSupabase(treeColumns, next);
  };

  const loadView = (view: SavedView) => {
    setTreeColumns(view.columns.filter(c => availCols.includes(c)));
  };

  const deleteView = (name: string) => {
    const next = savedViews.filter(v => v.name !== name);
    setSavedViews(next);
    saveToSupabase(treeColumns, next);
  };

  const handleSaveViewConfig = () => saveToSupabase(treeColumns, savedViews);


  // ── GUID → dbId index ─────────────────────────────────────────────────────
  const [indexBuilt,    setIndexBuilt]    = useState(false);
  const [buildingIndex, setBuildingIndex] = useState(false);
  const guidIndexRef = useRef<Record<string, number>>({});

  const ensureIndex = useCallback(async () => {
    if (indexBuilt || !viewerRef.current) return;
    // If viewer already has the GUID index from background scan, grab it without re-scanning
    const alreadyReady = viewerRef.current.isGuidIndexReady();
    if (!alreadyReady) setBuildingIndex(true);
    try {
      const index = await viewerRef.current.buildGuidIndex(); // instant if cached
      guidIndexRef.current = index;
      setIndexBuilt(true);
    } finally {
      setBuildingIndex(false);
    }
  }, [indexBuilt, viewerRef]);

  const getDbIds = useCallback((guids: string[]): number[] => {
    return guids.map(g => guidIndexRef.current[g]).filter(id => id != null);
  }, []);

  // ── Build tree (from localRows so edits are reflected) ────────────────────
  const tree = useMemo(
    () => treeColumns.length > 0 ? buildTree(localRows, guidCol, treeColumns) : [],
    [localRows, guidCol, treeColumns]
  );

  // ── Apply ALL colors in one pass (no click needed) ────────────────────────
  const applyAllColors = useCallback(() => {
    const vr = viewerRef.current;
    if (!vr || tree.length === 0) return;
    vr.clearHighlights();
    tree.forEach((node, i) => {
      const rgba  = toRgba(PALETTE[i % PALETTE.length]);
      const dbIds = getDbIds(node.guids);
      if (dbIds.length > 0) vr.highlight(dbIds, rgba);
    });
  }, [tree, getDbIds, viewerRef]);

  // ── Auto-load index + auto-color when tree data arrives ───────────────────
  useEffect(() => {
    if (tree.length === 0 || !viewerRef.current) return;
    ensureIndex().then(() => {
      applyAllColors();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.length]);

  // ── Visibility state ───────────────────────────────────────────────────────
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  // ── Active selection ───────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);

  // ── Edit: rename a value in a column ─────────────────────────────────────
  const handleRename = useCallback((column: string, oldVal: string, newVal: string) => {
    if (!newVal.trim() || newVal === oldVal) return;
    setLocalRows(prev => prev.map(row =>
      String(row[column] ?? '').trim() === oldVal || row[column] === oldVal
        ? { ...row, [column]: newVal.trim() }
        : row
    ));
  }, []);

  // ── Move: reassign guids to a different value in the same column ──────────
  const handleMove = useCallback((guids: string[], column: string, target: string) => {
    const guidSet = new Set(guids);
    setLocalRows(prev => prev.map(row =>
      guidSet.has(row[guidCol] as string) ? { ...row, [column]: target } : row
    ));
  }, [guidCol]);

  // ── Get all unique values for a column (for move dropdown) ────────────────
  const getColumnValues = useCallback((column: string): string[] => {
    return [...new Set(localRows.map(r => String(r[column] ?? '').trim()).filter(Boolean))].sort();
  }, [localRows]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleSelect = useCallback(async (node: TreeNode, dbIds: number[]) => {
    await ensureIndex();
    const ids = dbIds.length > 0 ? dbIds : getDbIds(node.guids);
    setActiveId(node.id);
    if (!viewerRef.current) return;
    viewerRef.current.clearHighlights();
    const topIdx = tree.findIndex(n => node.id.startsWith(n.id));
    const hex = PALETTE[(topIdx >= 0 ? topIdx : 0) % PALETTE.length];
    const rgba = toRgba(hex);
    viewerRef.current.highlight(ids, rgba);
  }, [ensureIndex, getDbIds, tree, viewerRef]);

  const handleIsolate = useCallback(async (dbIds: number[]) => {
    await ensureIndex();
    if (!viewerRef.current) return;
    viewerRef.current.isolate(dbIds);
    viewerRef.current.fitToView(dbIds);
  }, [ensureIndex, viewerRef]);

  const handleToggleHide = useCallback(async (node: TreeNode, dbIds: number[]) => {
    await ensureIndex();
    if (!viewerRef.current) return;
    setHiddenIds(prev => {
      const next = new Set(prev);
      if (next.has(node.id)) {
        next.delete(node.id);
        viewerRef.current!.show(dbIds);
      } else {
        next.add(node.id);
        viewerRef.current!.hide(dbIds);
      }
      return next;
    });
  }, [ensureIndex, viewerRef]);

  const showAll = useCallback(() => {
    viewerRef.current?.showAll();
    viewerRef.current?.clearHighlights();
    setHiddenIds(new Set());
    setActiveId(null);
  }, [viewerRef]);

  // ── Export edited CSV ─────────────────────────────────────────────────────
  const exportEdited = useCallback(() => {
    const headers = columns.join(',');
    const body = localRows.map(r =>
      columns.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const csv  = headers + '\n' + body;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'datos-editados.csv';
    a.click(); URL.revokeObjectURL(url);
  }, [columns, localRows]);

  // ── Column order editor ────────────────────────────────────────────────────
  const moveCol = (idx: number, dir: -1 | 1) => {
    const next = [...treeColumns];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setTreeColumns(next);
  };

  const addCol  = (col: string) => { if (!treeColumns.includes(col)) setTreeColumns(p => [...p, col]); };
  const removeCol = (col: string) => { setTreeColumns(p => p.filter(c => c !== col)); };

  // ── Generar Secuencia 4D Automática ───────────────────────────────────────
  const handleGenerate4D = () => {
    if (!onLaunch4D || tree.length === 0) return;
    const sequence: SequenceActivity[] = [];
    let currentDay = 1;
    
    // Fix color based on top level index (to match tree explorer colors)
    for (let i = 0; i < tree.length; i++) {
        const topNode = tree[i];
        const colorHex = PALETTE[i % PALETTE.length];
        
        function traverseColor(n: TreeNode) {
            if (n.children && n.children.length > 0) {
                n.children.forEach(traverseColor);
            } else if (n.guids.length > 0) {
                sequence.push({
                    id: n.id,
                    name: n.value || 'Sin Nombre',
                    startDay: currentDay++,
                    duration: 1,
                    guids: n.guids,
                    colorHex
                });
            }
        }
        traverseColor(topNode);
    }

    onLaunch4D(sequence);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-[270px] shrink-0 flex flex-col bg-[#0a1628] border-r border-white/10 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 py-2.5 border-b border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers size={12} className="text-blue-400" />
            <p className="text-[10px] font-black text-white uppercase tracking-widest">Árbol de Datos</p>
          </div>
          <div className="flex items-center gap-1">
            {indexBuilt && (
              <>
                <button
                  onClick={applyAllColors}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/30 hover:text-amber-300 transition"
                  title="Re-aplicar colores a todos los grupos"
                >
                  <Palette size={11} />
                </button>
                <button
                  onClick={showAll}
                  className="text-[8px] font-bold text-white/30 hover:text-white/60 transition px-1"
                  title="Resetear vista"
                >
                  Reset
                </button>
              </>
            )}
            <button
              onClick={exportEdited}
              className="p-1 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 transition"
              title="Exportar datos editados como CSV"
            >
              <Download size={11} />
            </button>
            {/* Save config button */}
            <button
              onClick={() => saveToSupabase(treeColumns, savedViews)}
              disabled={saving || treeColumns.length === 0}
              title="Guardar configuración del árbol en Supabase"
              className={`p-1 rounded-lg transition ${
                savedOk
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : saving
                    ? 'text-white/20'
                    : 'hover:bg-white/10 text-white/30 hover:text-emerald-300'
              }`}
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : savedOk ? <Check size={11} /> : <Save size={11} />}
            </button>
            <button
              onClick={() => setEditingTree(e => !e)}
              className={`p-1 rounded-lg transition text-[8px] font-black ${
                editingTree ? 'bg-blue-500/30 text-blue-300' : 'hover:bg-white/10 text-white/40'
              }`}
              title="Configurar árbol"
            >
              <GripVertical size={12} />
            </button>
          </div>
        </div>
        
        {/* Action bar insert for 4D */}
        {onLaunch4D && tree.length > 0 && !editingTree && (
           <div className="px-3 pb-2 pt-1 border-b border-white/5">
             <button
                onClick={handleGenerate4D}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-400 font-bold text-[9px] rounded-lg transition uppercase tracking-widest shadow-lg shadow-orange-900/20"
             >
                <PlayCircle size={10} /> Secuenciador 4D Automático
             </button>
           </div>
        )}

        {/* Hint for editing */}
        {!editingTree && tree.length > 0 && (
          <p className="text-[8px] text-white/25 mt-1.5 leading-tight">
            Doble clic para editar · <MoveRight size={8} className="inline" /> para mover
          </p>
        )}

        {/* Index building indicator */}
        {buildingIndex && (
          <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <Loader2 size={9} className="animate-spin text-blue-400" />
            <span className="text-[8px] text-blue-300 font-bold">Indexando GUIDs del modelo…</span>
          </div>
        )}
      </div>

      {/* ── Column configurator ─────────────────────────────────────────────── */}
      {editingTree && (
        <div className="shrink-0 border-b border-white/10 bg-[#0d1b3e]/80">

          <div className="px-3 pt-2.5 pb-1">
            <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1.5">
              Niveles del árbol (orden)
            </p>
            {treeColumns.length === 0 && (
              <p className="text-[8px] text-white/25 italic pb-1">Sin columnas — agrega abajo</p>
            )}
            {treeColumns.map((col, i) => (
              <div key={col} className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="flex-1 text-[9px] font-bold text-white/80 truncate">{col}</span>
                <button onClick={() => moveCol(i, -1)} disabled={i === 0}
                  className="p-0.5 rounded text-white/30 hover:text-white/70 disabled:opacity-20 transition">
                  <ArrowUp size={9} />
                </button>
                <button onClick={() => moveCol(i, 1)} disabled={i === treeColumns.length - 1}
                  className="p-0.5 rounded text-white/30 hover:text-white/70 disabled:opacity-20 transition">
                  <ArrowDown size={9} />
                </button>
                <button onClick={() => removeCol(col)}
                  className="p-0.5 rounded text-white/20 hover:text-rose-400 transition">
                  <X size={9} />
                </button>
              </div>
            ))}
          </div>

          <div className="px-3 pb-2.5">
            <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1">
              Columnas disponibles
            </p>
            <div className="flex flex-wrap gap-1">
              {availCols.filter(c => !treeColumns.includes(c)).map(col => (
                <button
                  key={col}
                  onClick={() => addCol(col)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white/5 hover:bg-blue-500/20 border border-white/10 hover:border-blue-500/30 rounded-lg text-[8px] font-bold text-white/50 hover:text-blue-300 transition"
                >
                  <Plus size={8} /> {col}
                </button>
              ))}
              {availCols.filter(c => !treeColumns.includes(c)).length === 0 && (
                <p className="text-[8px] text-white/20 italic">Todas agregadas</p>
              )}
            </div>
          </div>

          <div className="px-3 pb-2.5 border-t border-white/5 pt-2">
            <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1.5">
              Vistas guardadas
            </p>

            {savedViews.length > 0 && (
              <div className="space-y-1 mb-2">
                {savedViews.map(v => (
                  <div key={v.name} className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg group">
                    <FolderOpen size={9} className="text-amber-400/60 shrink-0" />
                    <span className="flex-1 text-[8px] font-bold text-white/70 truncate">{v.name}</span>
                    <button onClick={() => loadView(v)}
                      className="p-0.5 rounded text-white/30 hover:text-emerald-400 transition opacity-0 group-hover:opacity-100">
                      <Check size={8} />
                    </button>
                    <button onClick={() => deleteView(v.name)}
                      className="p-0.5 rounded text-white/30 hover:text-rose-400 transition opacity-0 group-hover:opacity-100">
                      <Trash2 size={8} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {savingView ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={viewName}
                  onChange={e => setViewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveView(); if (e.key === 'Escape') setSavingView(false); }}
                  placeholder="Nombre de la vista…"
                  className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] text-white/80 outline-none focus:border-blue-500/50"
                />
                <button onClick={saveView} disabled={!viewName.trim()}
                  className="p-1 rounded-lg bg-blue-500/30 text-blue-300 hover:bg-blue-500/50 transition disabled:opacity-30">
                  <Check size={9} />
                </button>
                <button onClick={() => setSavingView(false)}
                  className="p-1 rounded-lg hover:bg-white/10 text-white/30 transition">
                  <X size={9} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSavingView(true)}
                disabled={treeColumns.length === 0}
                className="flex items-center gap-1 text-[8px] font-bold text-white/30 hover:text-white/60 disabled:opacity-20 transition"
              >
                <Save size={9} /> Guardar vista actual
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Tree ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-1">
        {treeColumns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 px-4 text-center">
            <Layers size={20} className="text-white/15" />
            <p className="text-[9px] text-white/30 font-bold">
              Configura las columnas del árbol con el botón <GripVertical size={9} className="inline" />
            </p>
          </div>
        ) : tree.length === 0 ? (
          <p className="text-center text-[9px] text-white/25 py-8">Sin datos</p>
        ) : (
          tree.map((node, i) => {
            const hex    = PALETTE[i % PALETTE.length];
            const dbIds  = getDbIds(node.guids);
            const hidden = hiddenIds.has(node.id);
            return (
              <TreeNodeRow
                key={node.id}
                node={node}
                depth={0}
                colorHex={hex}
                dbIds={dbIds}
                hidden={hidden}
                onSelect={handleSelect}
                onIsolate={handleIsolate}
                onToggleHide={handleToggleHide}
                getDbIds={getDbIds}
                onRename={handleRename}
                onMove={handleMove}
                getColumnValues={getColumnValues}
              />
            );
          })
        )}
      </div>

      {/* ── Footer: stats + edit hint ─────────────────────────────────────────── */}
      {tree.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-t border-white/5">
          <p className="text-[8px] text-white/25 font-bold">
            {tree.length} grupos · {localRows.length} elementos · {treeColumns.join(' › ')}
          </p>
        </div>
      )}
    </div>
  );
}
