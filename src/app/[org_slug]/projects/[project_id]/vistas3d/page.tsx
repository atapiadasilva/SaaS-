'use client';

import { use, useState, useEffect, useRef, useCallback, Fragment, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { get as idbGet } from 'idb-keyval';
import { createClient } from '@/lib/supabase/client';
import { setBimLinkerKey } from '@/lib/supabase/projectConfig';
import { Loader2, MonitorPlay, Check, Layers, AlertCircle, MousePointer2, Paintbrush, EyeOff, Plus, Save, CheckCircle2, Copy, Trash2, X, Merge, ChevronUp, ChevronDown, Pencil, Clock, Camera, History, BoxSelect, RotateCcw, FolderPlus, MousePointerClick, Table2, RefreshCw, Tag, ListOrdered, ChevronRight, ChevronLeft, Workflow, GitBranch, ArrowDown, GripVertical, Zap, FileSpreadsheet, Link2, CalendarDays, BarChart3, TrendingUp, Play, Pause, SkipForward, SkipBack, Calendar } from 'lucide-react';
import type { BimConfig } from '@/components/modules/BimConfigModal';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import type { SavedColorView } from '@/components/awp/BimDataLinker';
import ModelTree from '@/components/awp/ModelTree';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

type BimColumn   = { key: string; category: string; attributeName: string; displayName: string };
type CustomCol   = { key: string; label: string };
type TableRow    = { dbId: number; elementName: string; groupValue: string; groupColor: string; bimProps: Record<string, string> };
type DiscoveredProp     = { attributeName: string; displayName: string };
type DiscoveredCategory = { category: string; props: DiscoveredProp[] };
type TagQueueItem = { dbId: number; name: string; groupValue: string; groupColor: string; loading?: boolean };
type CodebookEntry    = { prefix: string; description: string; catColKey?: string };
type PropExtractRule  = { category: string; attributeName: string; displayName: string; colKey: string };
type CubicacionItem   = { id: string; itemCode: string; description: string; tagPrefix: string; quantityColKey: string; unit: string };
type PropTreeLeaf     = { value: string; dbIds: number[]; count: number };
type PropTreeProp     = { attributeName: string; displayName: string; values: PropTreeLeaf[] };
type PropTreeCategory = { category: string; props: PropTreeProp[] };
type FormulaOperator  = 'equals' | 'notEquals' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'notEmpty' | 'isEmpty';
type FormulaRule      = { id: string; sourceColKey: string; operator: FormulaOperator; matchValue: string; outputValue: string };
type FormulaCol       = { key: string; label: string; rules: FormulaRule[]; defaultValue: string };
type FileVersion      = { id: string; fileName: string; date: string; rows: Record<string, string>[]; columns: string[] };
type WbsExcelSource   = { versionId: string; excelKeyCol: string; bimKeyCol: string };
type WbsNodeDates     = { start: string; end: string };
type WbsTreeNode      = { value: string; rows: TableRow[]; children: Map<string, WbsTreeNode>; color?: string };

export default function Vistas3DPage({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { project_id } = use(params);

  const [config, setConfig] = useState<BimConfig | null>(null);
  const [savedViews, setSavedViews] = useState<SavedColorView[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerReady, setViewerReady] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null); // null = Draft/Current
  const [activeViewMode, setActiveViewMode] = useState<'all'|'isolate'|'ghost'>('all');
  const [activeNodes, setActiveNodes] = useState<SavedColorView['colorNodes']>([]);
  const [applying, setApplying] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [deepSelection, setDeepSelection] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);

  // Inline rename: nodes
  const [renamingNodeIdx, setRenamingNodeIdx] = useState<number | null>(null);
  const [renamingValue,   setRenamingValue]   = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Inline rename: view title
  const [renamingViewId,    setRenamingViewId]    = useState<string | null>(null);
  const [renamingViewValue, setRenamingViewValue] = useState('');
  const renameViewRef = useRef<HTMLInputElement>(null);

  // Merge modal state
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeName, setMergeName] = useState('');

  // ─── Compatibilidad con GUIDs comprimidos almacenados anteriormente ────────────
  const decompressGuids = async (compressed: string | string[]): Promise<string[]> => {
    if (Array.isArray(compressed)) return compressed;
    if (!compressed) return [];
    if (compressed.startsWith('GZ:')) {
      if (typeof DecompressionStream === 'undefined') return [];
      try {
        const binary = atob(compressed.slice(3));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        const text = await new Response(stream).text();
        return text ? text.split(',') : [];
      } catch (e) {
        return [];
      }
    }
    return compressed.split(',');
  };

  const compressGuids = async (guids: string[]): Promise<string> => {
    if (!guids || guids.length === 0) return '';
    const str = guids.join(',');
    if (typeof CompressionStream === 'undefined') return str;
    try {
      const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
      const buffer = await new Response(stream).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      return 'GZ:' + btoa(binary);
    } catch (e) {
      return str;
    }
  };


  const viewerRef = useRef<ForgeViewerHandle>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeWidth, setTreeWidth] = useState(280);
  const treeResizingRef = useRef(false);
  const treeResizeStartX = useRef(0);
  const treeResizeStartW = useRef(0);
  // Pestaña del panel izquierdo: árbol modelo o árbol propiedades
  const [leftPanelTab, setLeftPanelTab] = useState<'model' | 'props'>('model');
  // Árbol de propiedades
  const [propTreeData, setPropTreeData] = useState<PropTreeCategory[]>([]);
  const [propTreeLoading, setPropTreeLoading] = useState(false);
  const [propTreeSearch, setPropTreeSearch] = useState('');
  const [propTreeExpCats, setPropTreeExpCats] = useState<Set<string>>(new Set());
  const [propTreeExpProps, setPropTreeExpProps] = useState<Set<string>>(new Set());

  const startTreeResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    treeResizingRef.current = true;
    treeResizeStartX.current = e.clientX;
    treeResizeStartW.current = treeWidth;
    const onMove = (ev: MouseEvent) => {
      if (!treeResizingRef.current) return;
      const delta = ev.clientX - treeResizeStartX.current;
      setTreeWidth(Math.max(200, Math.min(600, treeResizeStartW.current + delta)));
    };
    const onUp = () => {
      treeResizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [treeWidth]);

  // Selection state
  const [selectionCount, setSelectionCount] = useState(0);
  // Bidirectional tree↔viewer sync
  const [highlightedTreeDbId, setHighlightedTreeDbId] = useState<number | null>(null);
  const [treeExpandPath, setTreeExpandPath] = useState<number[]>([]);
  const treeRootDbIds = useRef<Set<number>>(new Set());
  // Inline add-category
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  // CWA 2-level WBS state
  const [expandedCwas, setExpandedCwas] = useState<Set<string>>(new Set());
  const [addingDiscToCwa, setAddingDiscToCwa] = useState<string | null>(null); // kept for compat
  const [newDiscInput, setNewDiscInput] = useState('');
  // Global disciplines (shared template across all CWAs)
  const [addingGlobalDisc, setAddingGlobalDisc] = useState(false);
  const [newGlobalDiscInput, setNewGlobalDiscInput] = useState('');
  // Paint feedback: index of node just painted
  const [paintedNodeIdx, setPaintedNodeIdx] = useState<number | null>(null);
  // Debounced-save infrastructure: ref always holds latest savedViews so the
  // debounce callback never closes over stale state.
  const savedViewsRef = useRef<SavedColorView[]>([]);
  const saveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);

  useEffect(() => {
    let retries = 0;
    const load = async () => {
      try {
        const supabase = createClient();
        const { data } = await (supabase as any)
          .from('projects').select('module_config').eq('id', project_id).single();
        const mc = data?.module_config as Record<string, unknown> | null;
        const bim = mc?.bim as BimConfig | undefined;
        const linker = mc?.bim_linker as any;
        if (linker) {
          if (linker.savedViews) {
            const loadedViewsRaw = await Promise.all((linker.savedViews as SavedColorView[]).map(async v => ({
              ...v,
              colorNodes: await Promise.all(v.colorNodes.map(async n => ({
                ...n,
                guids: await decompressGuids(n.guids as unknown as (string | string[]))
              }))),
              versions: v.versions ? await Promise.all(v.versions.map(async ver => ({
                ...ver,
                colorNodes: await Promise.all(ver.colorNodes.map(async n => ({
                  ...n,
                  guids: await decompressGuids(n.guids as unknown as (string | string[]))
                })))
              }))) : []
            })));
            // Deduplicate discipline nodes (parent+value) on every load — cleans stale dupes
            const loadedViews = loadedViewsRaw.map(v => ({
              ...v,
              colorNodes: deduplicateDiscNodes(v.colorNodes),
            }));
            // Always ensure the CWA view exists and is first
            const hasCwa = loadedViews.some(v => v.viewType === 'cwa');
            const cwaView: SavedColorView = hasCwa ? loadedViews.find(v => v.viewType === 'cwa')! : {
              id: 'view_cwa',
              name: 'Áreas de Trabajo (CWA)',
              viewType: 'cwa',
              keyCol: '', treeCol: '', viewMode: 'all',
              colorNodes: [],
              createdAt: new Date().toISOString(),
            };
            const nonCwa = loadedViews.filter(v => v.viewType !== 'cwa');
            const finalViews = [cwaView, ...nonCwa];
            setSavedViews(finalViews);
            if (!hasCwa) persistViews(finalViews);
          } else {
            // No views at all — create the mandatory CWA view
            const cwaView: SavedColorView = {
              id: 'view_cwa',
              name: 'Áreas de Trabajo (CWA)',
              viewType: 'cwa',
              keyCol: '', treeCol: '', viewMode: 'all',
              colorNodes: [],
              createdAt: new Date().toISOString(),
            };
            setSavedViews([cwaView]);
            persistViews([cwaView]);
          }
          if (linker.table_bim_cols) setBimColumns(linker.table_bim_cols as BimColumn[]);
          if (linker.table_custom_cols) setCustomColumns(linker.table_custom_cols as CustomCol[]);
          if (linker.table_custom_vals) setCustomValues(linker.table_custom_vals as Record<string, Record<string, string>>);
          if (linker.tag_codebook)         setTagCodebook(linker.tag_codebook as CodebookEntry[]);
          if (linker.prop_extract_rules)   setPropExtractRules(linker.prop_extract_rules as PropExtractRule[]);
          if (linker.queue_visible_cols)   setQueueVisibleCols(linker.queue_visible_cols as string[]);
          if (linker.cubicacion_items)     setCubicacionItems(linker.cubicacion_items as CubicacionItem[]);
          if (linker.formula_cols)         setFormulaColumns(linker.formula_cols as FormulaCol[]);
          if (linker.wbs_levels)           setWbsLevels(linker.wbs_levels as string[]);
          if (linker.wbs_excel_source)     setWbsExcelSource(linker.wbs_excel_source as WbsExcelSource);
          if (linker.keyCol)               setBimLinkerKeyCol(linker.keyCol as string);
          if (linker.wbs_dates)            setWbsDates(linker.wbs_dates as Record<string, WbsNodeDates>);
          if (linker.wbs_node_colors)      setWbsNodeColors(linker.wbs_node_colors as Record<string, string>);
        } else {
          // No linker config at all — bootstrap the mandatory CWA view
          const cwaView: SavedColorView = {
            id: 'view_cwa',
            name: 'Áreas de Trabajo (CWA)',
            viewType: 'cwa',
            keyCol: '', treeCol: '', viewMode: 'all',
            colorNodes: [],
            createdAt: new Date().toISOString(),
          };
          setSavedViews([cwaView]);
          persistViews([cwaView]);
        }
        if (bim) {
          setConfig(bim);
        } else if (retries < 3) {
          retries++;
          setTimeout(load, 3000);
        }
        setLoading(false);
      } catch (e) { console.error('Error cargando vistas 3D', e); setLoading(false); }
    };
    load();
  }, [project_id]);

  useEffect(() => {
    if (viewerReady && viewerRef.current) {
      viewerRef.current.setDeepSelection(deepSelection);
    }
  }, [viewerReady, deepSelection]);

  useEffect(() => { activeNodesRef.current = activeNodes; }, [activeNodes]);
  useEffect(() => { savedViewsRef.current = savedViews; }, [savedViews]);

  // Cargar archivos Excel desde IndexedDB (los mismos que usa el Visor BIM)
  useEffect(() => {
    idbGet(`bim-linker-versions-${project_id}`).then((cached: FileVersion[] | undefined) => {
      if (cached?.length) setExcelVersions(cached);
    }).catch(() => {});
  }, [project_id]);

  // Al cambiar el modelo (URN) limpiar las propiedades descubiertas para forzar re-descubrimiento
  useEffect(() => { setDiscoveredProps([]); }, [config?.urn]);

  // Selection count is updated via onSelectionChange on ForgeViewer (event-driven, no polling)

  // Auto-aplicar la primera vista cuando el viewer esté listo.
  // Si la CWA está vacía, siempre la seleccionamos primero para que el usuario la rellene.
  useEffect(() => {
    if (!viewerReady || savedViews.length === 0 || activeViewId || applying) return;
    const cwa = savedViews.find(v => v.viewType === 'cwa');
    if (cwa && cwa.colorNodes.length === 0) {
      applyView(cwa);
    } else {
      applyView(savedViews[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerReady, savedViews.length]);

  // Debounced auto-save: schedules a save 600 ms after the last call.
  // Uses savedViewsRef.current so it always saves the LATEST state, even if
  // multiple rapid changes (add CWA then immediately add discipline) happen
  // before React has committed the new state to the closure.
  const debouncedSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setAutoSaving(true);
      try { await persistViews(savedViewsRef.current); }
      catch (e) { console.error('[auto-save] Error guardando CWA/disc:', e); }
      finally { setAutoSaving(false); }
    }, 600);
  };

  // Guarda SOLO bim_linker.savedViews via RPC atómica (1 sola llamada, sin leer antes).
  // Guarda las vistas en Supabase incluyendo dbIds para carga instantánea.
  const persistViews = async (views: SavedColorView[]) => {
    const compressedViews = await Promise.all(views.map(async v => {
      // Dedup disc nodes + sanitize dbId/guid conflicts before saving
      const colorNodes = await Promise.all(sanitizeNodes(deduplicateDiscNodes(v.colorNodes)).map(async n => {
        const { guids, ...rest } = n;
        return {
          ...rest,
          guids: (guids && guids.length > 50) ? await compressGuids(guids) : (guids || [])
        };
      }));

      // Compresion de versiones
      const versions = v.versions ? await Promise.all(v.versions.map(async ver => ({
        ...ver,
        colorNodes: await Promise.all(ver.colorNodes.map(async n => {
          const { guids, ...rest } = n;
          return {
            ...rest,
            guids: (guids && guids.length > 50) ? await compressGuids(guids) : (guids || [])
          };
        }))
      }))) : [];

      return { ...v, colorNodes, versions };
    }));
    try {
      await setBimLinkerKey(project_id, 'savedViews', compressedViews);
    } catch (e: any) {
      console.error('[BIM] Error guardando vistas:', e?.message ?? e);
      throw e; // Re-lanzar para que handleSaveChanges muestre alert al usuario
    }
  };

  // ─── Versiones / Snapshots ──────────────────────────────────────────────────
  const handleCreateSnapshot = async (viewId: string) => {
    const name = prompt('Nombre para esta versión (ej: "Semana 10", "Hito Civil"):', `Versión ${new Date().toLocaleDateString()}`);
    if (!name) return;

    setSavedViews(prev => {
      const updated = prev.map(v => {
        if (v.id !== viewId) return v;
        const newVersion = {
          id: `ver_${Date.now()}`,
          name,
          createdAt: new Date().toISOString(),
          colorNodes: JSON.parse(JSON.stringify(activeNodes)) // Deep copy
        };
        return {
          ...v,
          versions: [newVersion, ...(v.versions || [])]
        };
      });
      persistViews(updated);
      return updated;
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleSelectVersion = (versionId: string | null) => {
    setActiveVersionId(versionId);
    const view = savedViews.find(v => v.id === activeViewId);
    if (!view) return;

    if (versionId === null) {
      // Volver al Draft/Actual
      setActiveNodes(view.colorNodes);
      applyView(view, view.colorNodes);
    } else {
      // Cargar versión histórica
      const ver = view.versions?.find(v => v.id === versionId);
      if (ver) {
        setActiveNodes(ver.colorNodes);
        applyView(view, ver.colorNodes);
      }
    }
  };

  const handleDeleteVersion = (viewId: string, versionId: string) => {
    if (!confirm('¿Eliminar esta versión del historial?')) return;
    setSavedViews(prev => {
      const updated = prev.map(v => {
        if (v.id !== viewId) return v;
        return {
          ...v,
          versions: (v.versions || []).filter(ver => ver.id !== versionId)
        };
      });
      persistViews(updated);
      return updated;
    });
    if (activeVersionId === versionId) handleSelectVersion(null);
  };

  const handleRestoreVersion = (viewId: string, versionId: string) => {
    if (!confirm('¿Restaurar esta versión como estado actual (Draft)? Los cambios no guardados se reemplazarán.')) return;
    const view = savedViews.find(v => v.id === viewId);
    if (!view) return;
    const ver = view.versions?.find(v => v.id === versionId);
    if (!ver) return;
    const restoredNodes = JSON.parse(JSON.stringify(ver.colorNodes));
    setSavedViews(prev => {
      const updated = prev.map(v => v.id !== viewId ? v : { ...v, colorNodes: restoredNodes });
      persistViews(updated);
      return updated;
    });
    setActiveNodes(restoredNodes);
    setActiveVersionId(null);
    applyView({ ...view, colorNodes: restoredNodes }, restoredNodes);
  };

  const handleCreateNewView = () => {
    const newView: SavedColorView = {
      id: `view_${Date.now()}`,
      name: `Vista ${savedViews.length + 1}`,
      keyCol: '',
      treeCol: '',
      viewMode: 'all',
      colorNodes: [],
      createdAt: new Date().toISOString(),
    };
    setSavedViews(prev => {
      const updated = [...prev, newView];
      persistViews(updated);
      return updated;
    });
    setActiveViewId(newView.id);
    setActiveNodes([]);
    setActiveViewMode('all');
    setActiveVersionId(null);
    setTimeout(() => {
      setRenamingViewId(newView.id);
      setRenamingViewValue(newView.name);
    }, 80);
  };

  const handleAssignEach = async (items: { dbId: number; name: string }[]) => {
    if (!activeViewId) {
      alert('Selecciona o crea una Vista activa primero.');
      return;
    }
    const vr = viewerRef.current;
    if (!vr) return;
    setApplying(true);
    try {
      let currentNodes = [...activeNodes];
      const newNodes: SavedColorView['colorNodes'] = [];

      for (const { dbId, name } of items) {
        const leafIds = vr.getLeafDbIds([dbId]);
        if (!leafIds.length) continue;
        let guids: string[] = [];
        if (name && name.length >= 3) {
          guids = [name.trim()];
        } else {
          try { guids = await vr.getExternalIds(leafIds); } catch { guids = []; }
        }
        const leafSet = new Set(leafIds);
        const guidSet = new Set(guids);
        currentNodes = currentNodes.map(n => cleanNodeFrom(n, leafSet, guidSet));
        const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
        newNodes.push({ value: name, color, visible: true, guids, dbIds: leafIds });
      }

      const finalNodes = [...currentNodes, ...newNodes];
      const updatedViews = savedViews.map(v =>
        v.id !== activeViewId ? v : { ...v, colorNodes: finalNodes }
      );
      setSavedViews(updatedViews);
      persistViews(updatedViews);
      setActiveNodes(finalNodes);
      const currentView = updatedViews.find(v => v.id === activeViewId);
      if (currentView) applyView(currentView, finalNodes);
    } catch (e) {
      console.error('Error asignando ramas separadas', e);
    } finally {
      setApplying(false);
    }
  };

  // Limpia un nodo eliminando dbIds y guids que pertenecen a otro conjunto.
  // Si todos los dbIds son removidos, también limpia los guids para prevenir re-resolución stale.
  const cleanNodeFrom = (
    node: SavedColorView['colorNodes'][0],
    dbSet: Set<number>,
    gSet: Set<string>,
  ): SavedColorView['colorNodes'][0] => {
    const prevDbCount = (node.dbIds || []).length;
    const cleanedDbIds = (node.dbIds || []).filter(id => !dbSet.has(id));
    const cleanedGuids = (node.guids || []).filter(g => !gSet.has(g));
    // Si el nodo tenía dbIds y ahora quedó vacío, limpiar guids residuales también
    const guids = (prevDbCount > 0 && cleanedDbIds.length === 0) ? [] : cleanedGuids;
    return { ...node, dbIds: cleanedDbIds, guids };
  };

  const sanitizeNodes = (nodes: SavedColorView['colorNodes']): SavedColorView['colorNodes'] => {
    const seenDbIds = new Set<number>();
    const seenGuids = new Set<string>();
    // REGLA DE ORO: El último en la lista o el más reciente manda.
    // Procesamos de ABAJO HACIA ARRIBA (reverse) para que los conjuntos inferiores (nuevos) tengan prioridad.
    const reversed = [...nodes].reverse();
    const cleaned = reversed.map(node => {
      const dbIds = (node.dbIds || []).filter(id => {
        if (seenDbIds.has(id)) return false;
        seenDbIds.add(id);
        return true;
      });
      const guids = (node.guids || []).filter(g => {
        if (seenGuids.has(g)) return false;
        seenGuids.add(g);
        return true;
      });
      return { ...node, dbIds, guids };
    });
    return cleaned.reverse();
  };

  // Remove duplicate discipline nodes: for each (parent, value) pair keep the
  // copy with the most assignments (guids+dbIds). CWA nodes (no parent) pass through.
  const deduplicateDiscNodes = (nodes: SavedColorView['colorNodes']): SavedColorView['colorNodes'] => {
    const seen = new Map<string, SavedColorView['colorNodes'][0]>();
    const result: SavedColorView['colorNodes'] = [];
    for (const node of nodes) {
      if (!node.parent) { result.push(node); continue; }
      const key = `${node.parent}::${node.value}`;
      const prev = seen.get(key);
      if (!prev) { seen.set(key, node); result.push(node); continue; }
      const prevScore = (prev.guids?.length ?? 0) + (prev.dbIds?.length ?? 0);
      const nodeScore = (node.guids?.length ?? 0) + (node.dbIds?.length ?? 0);
      if (nodeScore > prevScore) {
        const idx = result.indexOf(prev);
        if (idx !== -1) result[idx] = node;
        seen.set(key, node);
      }
      // else discard the duplicate
    }
    return result;
  };

  const applyView = async (view: SavedColorView | null, overrideNodes?: SavedColorView['colorNodes'], overrideMode?: 'all'|'isolate'|'ghost') => {
    if (!view) return;
    const mode  = overrideMode ?? (activeViewId === view.id ? activeViewMode : view.viewMode);
    let nodes = overrideNodes ?? (activeViewId === view.id ? activeNodes : view.colorNodes);
    
    // REGLA DE ORO: Un elemento solo puede estar en un conjunto.
    nodes = sanitizeNodes(nodes);

    if (activeViewId !== view.id) {
      setActiveViewId(view.id);
      setActiveNodes(view.colorNodes);
      setActiveViewMode(view.viewMode);
    }

      const vr = viewerRef.current;
      if (!vr) return;

      // Guard: si ningún nodo tiene elementos asignados, no tocar el visor para no perder colores
      const hasAnyElements = nodes.some(n => (n.dbIds?.length ?? 0) > 0 || (n.guids?.length ?? 0) > 0);
      if (!hasAnyElements) return;

      setApplying(true);
      try {
        const visible = nodes.filter(n => n.visible);
        const hidden  = nodes.filter(n => !n.visible);
        const colorMap = new Map<string, number[]>();
        let allDbIds: number[] = [];
        let hiddenDbIds: number[] = [];

        // Limpiar colores previos inmediatamente para dar feedback visual
        vr.clearHighlights();
        vr.showAll();
        vr.setGhosting(false);

        // dbIds === undefined → never resolved (legacy), needs GUID lookup.
        // dbIds === [] → explicitly empty (elements removed), trust it, don't re-resolve.
        // dbIds.length > 0 → cached, use directly.
        const needsResolution = (n: typeof nodes[0]) =>
          n.dbIds === undefined && (n.guids?.length ?? 0) > 0;

        const allCached = visible.every(n => !needsResolution(n));

        if (allCached) {
          for (const node of visible) {
            const ids = node.dbIds ?? [];
            if (ids.length) {
              colorMap.set(node.color, [...(colorMap.get(node.color) ?? []), ...ids]);
              allDbIds.push(...ids);
            }
          }
          for (const node of hidden) {
            if (node.dbIds?.length) hiddenDbIds.push(...node.dbIds);
          }
          vr.applyThemingBatch(colorMap);
        } else {
          if (!vr.isUniversalIndexReady()) await vr.buildUniversalIndex();
          const resolved = await Promise.all(
            visible.map(async node => {
              let rawIds: number[];
              if (node.dbIds !== undefined) {
                // Trust explicit dbIds (even if empty — means node was cleared)
                rawIds = node.dbIds;
              } else if (node.guids?.length) {
                // Legacy: no dbIds stored yet → resolve from GUIDs
                rawIds = await vr.resolveByUniversal(node.guids);
                if (!rawIds.length) {
                  try { rawIds = await vr.resolveExternalIds(node.guids); } catch { rawIds = []; }
                }
              } else {
                rawIds = [];
              }
              const leafIds = rawIds.length ? vr.getLeafDbIds(rawIds) : rawIds;
              if (leafIds.length) {
                colorMap.set(node.color, [...(colorMap.get(node.color) ?? []), ...leafIds]);
                allDbIds.push(...leafIds);
              }
              return { node, dbIds: leafIds };
            })
          );
          vr.applyThemingBatch(colorMap);

          const resolvedMap = new Map(resolved.map(r => [r.node.value, r.dbIds]));

          // Use prev inside setSavedViews to avoid overwriting nodes added AFTER applyView started.
          // view.colorNodes may be stale if onAssignMultiple already pushed a new node via setSavedViews.
          setSavedViews(prev => {
            const liveView = prev.find(v => v.id === view.id);
            if (!liveView) return prev;
            const mergedColorNodes = liveView.colorNodes.map(n => ({
              ...n, dbIds: resolvedMap.get(n.value) ?? n.dbIds,
            }));
            const updatedView = { ...liveView, colorNodes: mergedColorNodes };
            const nextViews = prev.map(v => v.id !== view.id ? v : updatedView);
            persistViews(nextViews).catch(e => console.error('[BIM] Auto-persist failed:', e?.message ?? e));
            return nextViews;
          });

          setActiveNodes(prev => prev.map(n => {
            const ids = resolvedMap.get(n.value);
            return ids !== undefined ? { ...n, dbIds: ids } : n;
          }));

          // Recolectar IDs ocultos resueltos
          for (const node of hidden) {
            const ids = resolvedMap.get(node.value);
            if (ids?.length) hiddenDbIds.push(...ids);
          }
        }

        if (mode === 'isolate' && allDbIds.length) vr.isolateDbIds(allDbIds);
        else if (mode === 'ghost' && allDbIds.length) { vr.isolateDbIds(allDbIds); vr.setGhosting(true); }
        else if (mode === 'all' && hiddenDbIds.length) {
          vr.hide(hiddenDbIds);
        }

        // Re-aplicar colores SINCRÓNICAMENTE después del cambio de modo
        // (no usar setTimeout — puede re-pintar con colorMap stale de una llamada anterior)
        if (colorMap.size > 0) vr.applyThemingBatch(colorMap);
      } catch (e) { console.warn('[BIM] Error aplicando vista:', e); }
      finally { setApplying(false); }
    };

  const handleZoomNode = (nodeIndex: number) => {
    const vr = viewerRef.current;
    if (!vr) return;
    const node = activeNodes[nodeIndex];
    if (node.dbIds?.length) vr.fitToView(node.dbIds);
  };

  const handleRemoveFromNode = async (viewId: string, nodeIndex: number) => {
    const vr = viewerRef.current;
    if (!vr) return;
    const selected = vr.getSelectedIds();

    let nextNodes: typeof activeNodes;

    if (selected.length === 0) {
      // No selection → clear ALL elements from this group (they go back to vacío)
      nextNodes = activeNodes.map((n, i) => i !== nodeIndex ? n : { ...n, dbIds: [], guids: [] });
    } else {
      // Has selection → remove only the selected elements from this group
      const leafToRemove = vr.getLeafDbIds(selected);
      const removeDbSet = new Set(leafToRemove);
      let removeGuids: string[] = [];
      try { removeGuids = await vr.getExternalIds(leafToRemove); } catch {}
      const removeGuidSet = new Set(removeGuids);
      nextNodes = activeNodes.map((n, i) => i !== nodeIndex ? n : {
        ...n,
        dbIds: (n.dbIds || []).filter(id => !removeDbSet.has(id)),
        guids: (n.guids || []).filter(g => !removeGuidSet.has(g)),
      });
      vr.select([]);
    }

    setActiveNodes(nextNodes);
    setSavedViews(prev => {
      const updated = prev.map(v => v.id !== viewId ? v : { ...v, colorNodes: nextNodes });
      persistViews(updated);
      return updated;
    });

    const view = savedViews.find(v => v.id === viewId);
    if (view) applyView(view, nextNodes);
  };

  // Update state only — used by color picker onChange to avoid re-painting on every drag tick
  const updateNodeState = (index: number, changes: Partial<SavedColorView['colorNodes'][0]>) => {
    const next = [...activeNodes];
    const cachedDbIds = savedViews.find(v => v.id === activeViewId)?.colorNodes[index]?.dbIds;
    next[index] = { ...next[index], dbIds: next[index].dbIds?.length ? next[index].dbIds : cachedDbIds, ...changes };
    setActiveNodes(next);
    return next;
  };

  // Update state AND re-paint the viewer
  const updateNode = (index: number, changes: Partial<SavedColorView['colorNodes'][0]>) => {
    const next = updateNodeState(index, changes);
    const view = savedViews.find(v => v.id === activeViewId);
    if (view) applyView(view, next);
  };

  const applyColorsNow = () => {
    const view = savedViews.find(v => v.id === activeViewId);
    if (view) applyView(view, activeNodes, activeViewMode);
  };

  // ── Delete a single color node — elements return to original model colors ──
  const handleDeleteNode = async (viewId: string, nodeIndex: number) => {
    const next = activeNodes.filter((_, i) => i !== nodeIndex);
    setActiveNodes(next);
    const updatedViews = savedViews.map(v => v.id !== viewId ? v : { ...v, colorNodes: next });
    setSavedViews(updatedViews);
    persistViews(updatedViews);
    const updatedView = updatedViews.find(v => v.id === viewId);
    if (updatedView) await applyView(updatedView, next);
  };

  const handleMoveNode = async (viewId: string, nodeIndex: number, direction: 'up' | 'down') => {
    if (direction === 'up' && nodeIndex === 0) return;
    if (direction === 'down' && nodeIndex === activeNodes.length - 1) return;

    const next = [...activeNodes];
    const swapIdx = direction === 'up' ? nodeIndex - 1 : nodeIndex + 1;
    [next[nodeIndex], next[swapIdx]] = [next[swapIdx], next[nodeIndex]];
    
    setActiveNodes(next);
    
    const updatedViews = savedViews.map(v => v.id !== viewId ? v : { ...v, colorNodes: next });
    setSavedViews(updatedViews);
    await persistViews(updatedViews);
  };

  // ── Duplicate a view ──────────────────────────────────────────────────────
  const handleDuplicateView = async (viewId: string) => {
    const original = savedViews.find(v => v.id === viewId);
    if (!original) return;
    const copy: SavedColorView = {
      ...original,
      id: `view_${Date.now()}`,
      name: `${original.name} (copia)`,
      createdAt: new Date().toISOString(),
    };
    setSavedViews(prev => {
      const updated = [...prev, copy];
      persistViews(updated);
      return updated;
    });
  };

  // ── Delete a view ────────────────────────────────────────────────────────
  const handleDeleteView = async (viewId: string) => {
    const view = savedViews.find(v => v.id === viewId);
    if (view?.viewType === 'cwa') { alert('La vista CWA es obligatoria y no puede eliminarse.'); return; }
    if (!confirm('¿Eliminar esta vista permanentemente?')) return;
    setSavedViews(prev => {
      const updated = prev.filter(v => v.id !== viewId);
      persistViews(updated);
      return updated;
    });
    if (activeViewId === viewId) {
      setActiveViewId(null); setActiveNodes([]);
      viewerRef.current?.showAll(); viewerRef.current?.clearHighlights();
    }
  };

  // ── Merge views ───────────────────────────────────────────────────────────
  const handleMergeViews = async () => {
    if (mergeSelected.size < 2 || !mergeName.trim()) return;
    const selected = savedViews.filter(v => mergeSelected.has(v.id));
    // Combine colorNodes; when same value appears in multiple views, merge their dbIds/guids
    const merged = new Map<string, SavedColorView['colorNodes'][0]>();
    for (const view of selected) {
      for (const node of view.colorNodes) {
        if (merged.has(node.value)) {
          const ex = merged.get(node.value)!;
          merged.set(node.value, {
            ...ex,
            dbIds: Array.from(new Set([...(ex.dbIds ?? []), ...(node.dbIds ?? [])])),
            guids: Array.from(new Set([...(ex.guids ?? []), ...(node.guids ?? [])])),
          });
        } else {
          merged.set(node.value, { ...node });
        }
      }
    }
    const newView: SavedColorView = {
      id: `view_${Date.now()}`,
      name: mergeName.trim(),
      keyCol: selected[0].keyCol,
      treeCol: selected.map(v => v.treeCol).join(' + '),
      viewMode: 'all',
      colorNodes: Array.from(merged.values()),
      createdAt: new Date().toISOString(),
    };
    setSavedViews(prev => {
      const updated = [...prev, newView];
      persistViews(updated);
      return updated;
    });
    setMergeOpen(false);
    setMergeSelected(new Set());
    setMergeName('');
  };

  const handleAssignSelectionToNode = async (viewId: string, nodeIndex: number) => {
    const vr = viewerRef.current;
    if (!vr) return;
    let rawSelectedDbIds = vr.getSelectedIds();
    if (!rawSelectedDbIds.length && vr.getIsolatedNodes) {
      rawSelectedDbIds = vr.getIsolatedNodes();
    }
    if (!rawSelectedDbIds.length) {
      alert("Por favor selecciona o aísla (filtra) elementos en el modelo antes de asignar.");
      return;
    }
    const selectedDbIds = vr.getLeafDbIds ? vr.getLeafDbIds(rawSelectedDbIds) : rawSelectedDbIds;
    setApplying(true);
    try {
      let selectedGuids: string[] = [];
      try {
        selectedGuids = await vr.getExternalIds(selectedDbIds);
      } catch {}
      const dbSet = new Set(selectedDbIds);
      const gSet  = new Set(selectedGuids);
      const nextViews = savedViews.map(v => {
        if (v.id !== viewId) return v;
        // Usar activeNodes como fuente de verdad para la vista activa
        // (puede tener cambios de color, categorías nuevas, etc. aún no guardados)
        const baseNodes = (activeViewId === viewId) ? activeNodes : v.colorNodes;
        return { ...v, colorNodes: baseNodes.map((node, i) => {
          if (i === nodeIndex) {
            return {
              ...node,
              dbIds: Array.from(new Set([...(node.dbIds||[]), ...selectedDbIds])),
              guids: Array.from(new Set([...(node.guids||[]), ...selectedGuids]))
            };
          }
          // Limpiar de todos los demás grupos por dbId (authoritative)
          // y también por guid; si tras limpiar dbIds queda vacío, limpiar guids también
          const cleanedDbIds = (node.dbIds||[]).filter(id => !dbSet.has(id));
          const cleanedGuids = (node.guids||[]).filter(g => !gSet.has(g));
          return {
            ...node,
            dbIds: cleanedDbIds,
            // Si el nodo quedó sin ningún dbId conocido, borrar guids residuales
            // para evitar que una re-resolución futura vuelva a asignar el elemento
            guids: cleanedDbIds.length === 0 && (node.dbIds||[]).length > 0 ? [] : cleanedGuids,
          };
        })};
      });
      setSavedViews(nextViews);
      if (activeViewId === viewId) {
        const newNodes = nextViews.find(v => v.id === viewId)!.colorNodes;
        setActiveNodes(newNodes);
        applyView(nextViews.find(v => v.id === viewId)!, newNodes);
      }
      persistViews(nextViews);
      vr.select([]);
      // Visual feedback: flash the painted node green briefly
      setPaintedNodeIdx(nodeIndex);
      setTimeout(() => setPaintedNodeIdx(null), 1800);
    } catch (e) { console.error('Error asignando selección', e); }
    finally { setApplying(false); }
  };

  const handleAddNewCategory = (viewId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const cwaNode = { value: trimmed, color, visible: true, guids: [] as string[], dbIds: [] as number[] };
    setSavedViews(prev => {
      const view = prev.find(v => v.id === viewId);
      // Auto-create one discipline node per global discipline template
      const globalDiscs = view?.globalDisciplines || [];
      const discNodes = globalDiscs.map(d => ({
        value: d.name, color: d.color, visible: true,
        guids: [] as string[], dbIds: [] as number[], parent: trimmed,
      }));
      const next = prev.map(v => v.id !== viewId ? v : {
        ...v, colorNodes: [...v.colorNodes, cwaNode, ...discNodes],
      });
      savedViewsRef.current = next;
      return next;
    });
    if (activeViewId === viewId) {
      const globalDiscs = savedViewsRef.current.find(v => v.id === viewId)?.globalDisciplines || [];
      const discNodes = globalDiscs.map(d => ({
        value: d.name, color: d.color, visible: true,
        guids: [] as string[], dbIds: [] as number[], parent: trimmed,
      }));
      setActiveNodes(prev => [...prev, cwaNode, ...discNodes]);
    }
    setAddingCategory(false);
    setNewCategoryInput('');
    debouncedSave();
  };

  // Add a discipline node under a CWA parent
  const handleAddDisc = (viewId: string, cwaValue: string, discName: string) => {
    const trimmed = discName.trim();
    if (!trimmed) return;
    const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const newNode = { value: trimmed, color, visible: true, guids: [] as string[], dbIds: [] as number[], parent: cwaValue };
    // Functional setter ensures we read the very latest colorNodes (no stale closure).
    setSavedViews(prev => {
      const next = prev.map(v => v.id !== viewId ? v : { ...v, colorNodes: [...v.colorNodes, newNode] });
      savedViewsRef.current = next; // keep ref immediately in sync
      return next;
    });
    if (activeViewId === viewId) setActiveNodes(prev => [...prev, newNode]);
    setAddingDiscToCwa(null);
    setNewDiscInput('');
    setExpandedCwas(prev => new Set([...prev, cwaValue]));
    debouncedSave();
  };

  // ── Global disciplines ──────────────────────────────────────────────────────
  // Add a discipline to the global template AND to every existing CWA.
  const handleAddGlobalDisc = (viewId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    setSavedViews(prev => {
      const next = prev.map(v => {
        if (v.id !== viewId) return v;
        const existing = (v.globalDisciplines || []).map(d => d.name);
        if (existing.includes(trimmed)) return v; // already in global list
        const newGlobalDiscs = [...(v.globalDisciplines || []), { name: trimmed, color }];
        // Dedup first so we don't compound on existing mess
        const clean = deduplicateDiscNodes(v.colorNodes);
        const cwaNodes = clean.filter(n => !n.parent);
        // Only add disc nodes for CWAs that don't already have this discipline
        const newDiscNodes = cwaNodes
          .filter(cwa => !clean.some(n => n.parent === cwa.value && n.value === trimmed))
          .map(cwa => ({
            value: trimmed, color, visible: true,
            guids: [] as string[], dbIds: [] as number[], parent: cwa.value,
          }));
        return { ...v, globalDisciplines: newGlobalDiscs, colorNodes: [...clean, ...newDiscNodes] };
      });
      savedViewsRef.current = next;
      return next;
    });
    if (activeViewId === viewId) {
      setActiveNodes(prev => {
        const clean = deduplicateDiscNodes(prev as SavedColorView['colorNodes']) as typeof prev;
        const cwaNodes = clean.filter((n: any) => !n.parent);
        const newDiscNodes = cwaNodes
          .filter((cwa: any) => !clean.some((n: any) => n.parent === cwa.value && n.value === trimmed))
          .map((cwa: any) => ({
            value: trimmed, color, visible: true,
            guids: [] as string[], dbIds: [] as number[], parent: cwa.value,
          }));
        return [...clean, ...newDiscNodes];
      });
    }
    setAddingGlobalDisc(false);
    setNewGlobalDiscInput('');
    debouncedSave();
  };

  // Remove a discipline from the global template AND from every CWA.
  const handleRemoveGlobalDisc = (viewId: string, discName: string) => {
    setSavedViews(prev => {
      const next = prev.map(v => {
        if (v.id !== viewId) return v;
        return {
          ...v,
          globalDisciplines: (v.globalDisciplines || []).filter(d => d.name !== discName),
          colorNodes: v.colorNodes.filter(n => !(n.parent && n.value === discName)),
        };
      });
      savedViewsRef.current = next;
      return next;
    });
    if (activeViewId === viewId)
      setActiveNodes(prev => prev.filter((n: any) => !(n.parent && n.value === discName)));
    debouncedSave();
  };

  // Change the color of a global discipline across all CWA children.
  const handleGlobalDiscColor = (viewId: string, discName: string, color: string) => {
    setSavedViews(prev => {
      const next = prev.map(v => {
        if (v.id !== viewId) return v;
        return {
          ...v,
          globalDisciplines: (v.globalDisciplines || []).map(d => d.name === discName ? { ...d, color } : d),
          colorNodes: v.colorNodes.map(n =>
            n.parent && n.value === discName ? { ...n, color } : n
          ),
        };
      });
      savedViewsRef.current = next;
      return next;
    });
    if (activeViewId === viewId)
      setActiveNodes(prev => prev.map((n: any) =>
        n.parent && n.value === discName ? { ...n, color } : n
      ));
    // No debounce — color drag triggers many events; let onBlur call applyColorsNow
  };

  const handleRenameView = useCallback(async (viewId: string, newName: string) => {
    const trimmed = newName.trim();
    setRenamingViewId(null);
    if (!trimmed) return;
    setSavedViews(prev => {
      const updated = prev.map(v => v.id !== viewId ? v : { ...v, name: trimmed });
      persistViews(updated);
      return updated;
    });
  }, [savedViews]);

  const handleRenameNode = useCallback(async (viewId: string, idx: number, newValue: string) => {
    const trimmed = newValue.trim();
    setRenamingNodeIdx(null);
    if (!trimmed || trimmed === activeNodes[idx]?.value) return;
    const oldValue = activeNodes[idx]?.value;
    // When renaming a CWA node, also update parent references in discipline children
    const next = activeNodes.map((n, i) => {
      if (i === idx) return { ...n, value: trimmed };
      if ((n as any).parent === oldValue) return { ...n, parent: trimmed };
      return n;
    });
    setActiveNodes(next);
    const updatedViews = savedViews.map(v => v.id !== viewId ? v : { ...v, colorNodes: next });
    setSavedViews(updatedViews);
    try { await persistViews(updatedViews); } catch (e) { console.error('[rename] Error guardando:', e); }
  }, [activeNodes, savedViews]);

  const handleSaveChanges = async (viewId: string) => {
    setApplying(true);
    try {
      const nextViews = savedViews.map(v => {
        if (v.id !== viewId) return v;
        const mergedNodes = activeNodes.map(an => {
          const cached = v.colorNodes.find(cn => cn.value === an.value);
          return { ...an, dbIds: an.dbIds?.length ? an.dbIds : cached?.dbIds };
        });
        return { ...v, colorNodes: mergedNodes, viewMode: activeViewMode };
      });
      setSavedViews(nextViews);
      await persistViews(nextViews);
      
      // Forzar re-pintado inmediato para confirmar visualmente
      const currentView = nextViews.find(v => v.id === viewId);
      if (currentView) applyView(currentView, currentView.colorNodes);

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (e: any) {
      console.error('Error guardando vista', e);
      alert('⚠️ Error al guardar: ' + (e?.message ?? 'Error desconocido'));
    }
    finally { setApplying(false); }
  };

  const handleSelectNodeElements = (nodeIndex: number) => {
    const vr = viewerRef.current;
    if (!vr) return;
    const node = activeNodes[nodeIndex];
    if (node.dbIds?.length) vr.select(node.dbIds);
  };

  const handleHideSelection = () => {
    const vr = viewerRef.current;
    if (!vr) return;
    const selected = vr.getSelectedIds();
    if (selected.length > 0) { vr.hide(selected); vr.select([]); }
  };

  // ─── Tabla de propiedades del modelo ──────────────────────────────────────
  const [tableOpen, setTableOpen] = useState(false);
  const [tableHeight, setTableHeight] = useState(260);
  const tableResizingRef = useRef(false);
  const tableResizeStartY = useRef(0);
  const tableResizeStartH = useRef(0);
  const [bimColumns, setBimColumns] = useState<BimColumn[]>([]);
  const [customColumns, setCustomColumns] = useState<CustomCol[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, Record<string, string>>>({});
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  // Filas filtradas según visibilidad del árbol de color (checkboxes panel derecho)
  const visibleTableRows = useMemo(() => {
    const visibleValues = new Set(
      activeNodes.filter(n => n.visible !== false).map(n => n.value)
    );
    return tableRows.filter(r => visibleValues.has(r.groupValue));
  }, [tableRows, activeNodes]);

  // WBS-specific rows: all model elements loaded independently of active color views
  const [wbsAllRows,    setWbsAllRows]    = useState<TableRow[]>([]);
  const [wbsDataLoading, setWbsDataLoading] = useState(false);

  // WBS uses wbsAllRows when available, falls back to visibleTableRows
  const wbsRows = useMemo(() =>
    wbsAllRows.length > 0 ? wbsAllRows : visibleTableRows,
    [wbsAllRows, visibleTableRows]
  );
  const [tableLoading, setTableLoading] = useState(false);
  const [tableProgress, setTableProgress] = useState(0);
  const [propPickerOpen, setPropPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [discoveredProps, setDiscoveredProps] = useState<DiscoveredCategory[]>([]);
  const [discoveringProps, setDiscoveringProps] = useState(false);
  const [editingCell, setEditingCell] = useState<{ dbId: number; colKey: string; value: string } | null>(null);
  const [addingCustomCol, setAddingCustomCol] = useState(false);
  const [newCustomColName, setNewCustomColName] = useState('');

  // ─── Cola de Tags ──────────────────────────────────────────────────────────
  const [tagQueue, setTagQueue] = useState<TagQueueItem[]>([]);
  const [tagQueueFocusIdx, setTagQueueFocusIdx] = useState(0);
  const [tableTab, setTableTab] = useState<'table' | 'queue'>('table');
  const tagQueueRef = useRef<TagQueueItem[]>([]);
  const activeNodesRef = useRef<typeof activeNodes>([]);
  const lastSelectedDbIdsRef = useRef<number[]>([]); // para property discovery

  // ─── Generador de Tags automático ─────────────────────────────────────────
  const [tagGenPrefix, setTagGenPrefix] = useState('');
  const [tagGenCounter, setTagGenCounter] = useState(1);
  const [tagGenColKey, setTagGenColKey] = useState('');
  const [tagGenPadding, setTagGenPadding] = useState(3); // dígitos: 001, 0001, etc.

  // ─── Codebook y extracción automática de propiedades ──────────────────────
  const [tagCodebook, setTagCodebook]           = useState<CodebookEntry[]>([]);
  const [propExtractRules, setPropExtractRules] = useState<PropExtractRule[]>([]);
  const [showCodebookEditor, setShowCodebookEditor] = useState(false);
  const [liveBimProps, setLiveBimProps]         = useState<{ category: string; attributeName: string; displayName: string; value: string }[]>([]);
  const [liveBimLoading, setLiveBimLoading]     = useState(false);
  const [queueVisibleCols, setQueueVisibleCols] = useState<string[]>([]); // vacío = todas visibles
  const [showQueueColPicker, setShowQueueColPicker] = useState(false);

  // ─── Cubicación ────────────────────────────────────────────────────────────
  const [cubicacionItems, setCubicacionItems] = useState<CubicacionItem[]>([]);
  const [editingCubId, setEditingCubId] = useState<string | null>(null);
  const [newCubItem, setNewCubItem] = useState<Partial<CubicacionItem>>({});
  const [expandedCubIds, setExpandedCubIds] = useState<Set<string>>(new Set());

  // ─── Columnas Fórmula ──────────────────────────────────────────────────────
  const [formulaColumns,  setFormulaColumns]  = useState<FormulaCol[]>([]);
  const [editingFormula,  setEditingFormula]  = useState<FormulaCol | null>(null);

  // ─── WBS / Árbol Pivot ────────────────────────────────────────────────────
  const [wbsLevels,       setWbsLevels]       = useState<string[]>([]);
  const [wbsExpanded,     setWbsExpanded]     = useState<Set<string>>(new Set());
  const [wbsExcelSource,  setWbsExcelSource]  = useState<WbsExcelSource | null>(null);
  const [excelVersions,   setExcelVersions]   = useState<FileVersion[]>([]);
  const [bimLinkerKeyCol, setBimLinkerKeyCol] = useState<string>(''); // keyCol del Visor BIM (columna de unión Excel→modelo)

  // ─── WBS Tab mode ─────────────────────────────────────────────────────────
  const [mainTab,             setMainTab]             = useState<'viewer' | 'wbs'>('viewer');
  const [wbsDates,            setWbsDates]            = useState<Record<string, WbsNodeDates>>({});
  const [wbsNodeColors,       setWbsNodeColors]       = useState<Record<string, string>>({});
  const [wbsLoadingProgram,   setWbsLoadingProgram]   = useState(false);
  const [progWbsMap,          setProgWbsMap]          = useState<Record<string, { wbs: string; desc: string }>>({});
  const [wbsSeqStep,        setWbsSeqStep]        = useState(0);
  const [wbsSeqActive,      setWbsSeqActive]      = useState(false);
  const [wbsChartMetricCol, setWbsChartMetricCol] = useState<string>('');
  const [wbsRightPanelTab,  setWbsRightPanelTab]  = useState<'gantt' | 'charts'>('gantt');
  const wbsSeqIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Join map: excelKeyColValue → excel row (built at component level to respect Rules of Hooks)
  const wbsExcelMap = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    if (!wbsExcelSource) return m;
    const ver = excelVersions.find(v => v.id === wbsExcelSource.versionId);
    if (!ver || !wbsExcelSource.excelKeyCol) return m;
    for (const r of ver.rows) {
      const k = String(r[wbsExcelSource.excelKeyCol] ?? '').trim();
      if (k) m.set(k, r);
    }
    return m;
  }, [wbsExcelSource, excelVersions]);

  // All columns available for WBS hierarchy (component-level for shared use)
  const wbsAllCols = useMemo(() => {
    const activeExcelVer = wbsExcelSource
      ? excelVersions.find(v => v.id === wbsExcelSource.versionId) ?? null
      : null;
    const excelCols = activeExcelVer
      ? activeExcelVer.columns.map(c => ({ key: `excel__${c}`, label: c, type: 'custom' as const }))
      : [];
    const progCols = Object.keys(progWbsMap).length > 0
      ? [
          { key: 'prog__wbs',  label: 'WBS Programa',      type: 'custom' as const },
          { key: 'prog__desc', label: 'Actividad Programa', type: 'custom' as const },
        ]
      : [];
    return [
      { key: '__view__',  label: 'NOMBRE DE VISTA', type: 'group'   as const },
      { key: '__group__', label: 'GRUPO (color)',    type: 'group'   as const },
      ...progCols,
      ...formulaColumns.map(c => ({ key: c.key, label: c.label,       type: 'formula' as const })),
      ...bimColumns.map(c => ({ key: c.key, label: c.displayName,      type: 'bim'     as const })),
      ...customColumns.map(c => ({ key: c.key, label: c.label,         type: 'custom'  as const })),
      ...excelCols,
    ];
  }, [wbsExcelSource, excelVersions, formulaColumns, bimColumns, customColumns, progWbsMap]);

  // Get WBS cell value for a row (component-level for shared use)
  const getWbsVal = useCallback((row: TableRow, colKey: string): string => {
    if (colKey === '__group__') return row.groupValue;
    if (colKey === '__view__')  return row.bimProps['__view__'] ?? '';
    if (colKey.startsWith('prog__')) {
      const prog = progWbsMap[String(row.dbId)];
      if (!prog) return '—';
      if (colKey === 'prog__wbs')  return prog.wbs  || '—';
      if (colKey === 'prog__desc') return prog.desc || '—';
      return '—';
    }
    if (colKey.startsWith('excel__') && wbsExcelSource) {
      const excelColName = colKey.slice(7);
      const bimVal = row.bimProps[wbsExcelSource.bimKeyCol]
        ?? customValues[String(row.dbId)]?.[wbsExcelSource.bimKeyCol] ?? '';
      return wbsExcelMap.get(bimVal.trim())?.[excelColName] ?? '—';
    }
    return row.bimProps[colKey] ?? customValues[String(row.dbId)]?.[colKey] ?? '—';
  }, [wbsExcelSource, wbsExcelMap, customValues, progWbsMap]);

  // Build WBS tree recursively
  const buildWbsTree = useCallback((rows: TableRow[], levels: string[], depth = 0): Map<string, WbsTreeNode> => {
    const map = new Map<string, WbsTreeNode>();
    if (depth >= levels.length) return map;
    for (const row of rows) {
      const val = getWbsVal(row, levels[depth]) || '(vacío)';
      if (!map.has(val)) map.set(val, { value: val, rows: [], children: new Map(), color: levels[depth] === '__group__' ? row.groupColor : undefined });
      map.get(val)!.rows.push(row);
    }
    if (depth + 1 < levels.length) {
      for (const node of map.values()) {
        node.children = buildWbsTree(node.rows, levels, depth + 1);
      }
    }
    return map;
  }, [getWbsVal]);

  // Flatten WBS tree into sorted sequence nodes (used by sequencer + S-curve)
  const getWbsSeqNodes = useCallback(() => {
    if (wbsLevels.length === 0 || wbsRows.length === 0) return [];
    const tree = buildWbsTree(wbsRows, wbsLevels);
    const palette = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];
    const result: { label: string; path: string; dbIds: number[]; start: string; end: string; color: string; depth: number }[] = [];
    let pi = 0;
    const walk = (nodes: Map<string, WbsTreeNode>, path: string, depth: number) => {
      for (const [val, node] of Array.from(nodes.entries())) {
        const nodePath = `${path}::${val}`;
        const dates = wbsDates[nodePath] ?? { start: '', end: '' };
        const color = (depth === 0 ? wbsNodeColors[val] : undefined) ?? palette[pi % palette.length];
        if (depth === 0) pi++;
        result.push({ label: val, path: nodePath, dbIds: node.rows.map(r => r.dbId), start: dates.start, end: dates.end, color, depth });
        if (node.children.size > 0) walk(node.children, nodePath, depth + 1);
      }
    };
    walk(tree, 'root', 0);
    return result.filter(n => n.dbIds.length > 0).sort((a, b) => {
      if (!a.start && !b.start) return 0;
      if (!a.start) return 1;
      if (!b.start) return -1;
      return a.start.localeCompare(b.start);
    });
  }, [wbsLevels, wbsRows, buildWbsTree, wbsDates, wbsNodeColors]);

  // Color model elements by WBS root node colors
  const colorByWbs = useCallback(() => {
    const vr = viewerRef.current;
    if (!vr || wbsLevels.length === 0 || wbsRows.length === 0) return;
    const tree = buildWbsTree(wbsRows, wbsLevels);
    const palette = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];
    const colorMap = new Map<string, number[]>();
    const nextColors: Record<string, string> = { ...wbsNodeColors };
    let pi = Object.keys(wbsNodeColors).length;
    for (const [rootVal, rootNode] of Array.from(tree.entries())) {
      if (!nextColors[rootVal]) { nextColors[rootVal] = palette[pi % palette.length]; pi++; }
      const dbIds = rootNode.rows.map(r => r.dbId);
      if (dbIds.length) colorMap.set(nextColors[rootVal], [...(colorMap.get(nextColors[rootVal]) ?? []), ...dbIds]);
    }
    vr.clearHighlights();
    vr.showAll();
    vr.applyThemingBatch(colorMap);
    setWbsNodeColors(nextColors);
    setBimLinkerKey(project_id, 'wbs_node_colors', nextColors).catch(console.error);
  }, [viewerRef, wbsLevels, wbsRows, buildWbsTree, wbsNodeColors, project_id]);

  // Load ALL model elements for WBS (independent of active color view)
  const loadWbsData = useCallback(async () => {
    const vr = viewerRef.current;
    if (!vr) return;
    setWbsDataLoading(true);
    try {
      const mapping = await vr.getExternalIdMapping(); // externalId → dbId
      const allDbIds = Object.values(mapping).filter(id => id > 0);
      if (!allDbIds.length) return;

      const bulkResults = await vr.loadBulkElementProps(allDbIds, []);
      const propsById = new Map(bulkResults.map(r => [r.dbId, r]));

      const rows: TableRow[] = [];
      for (const dbId of allDbIds) {
        const r = propsById.get(dbId);
        const name = r?.name ?? String(dbId);
        if (/^(Mesh|\[\d+\])$/i.test(name)) continue;
        const bimProps: Record<string, string> = {};
        for (const col of bimColumns) {
          bimProps[col.key] =
            r?.props[col.displayName] ??
            r?.props[col.displayName?.toUpperCase?.()] ??
            r?.props[col.attributeName] ??
            r?.props[col.attributeName?.toUpperCase?.()] ??
            '';
        }
        bimProps['__view__']  = '';
        bimProps['__group__'] = 'Todos';
        rows.push({ dbId, elementName: name, groupValue: 'Todos', groupColor: '#64748b', bimProps });
      }
      setWbsAllRows(rows);
    } catch (e) {
      console.error('Error loading WBS data', e);
    } finally {
      setWbsDataLoading(false);
    }
  }, [viewerRef, bimColumns]);

  // Auto-populate WBS dates from linked program activities
  const loadWbsDatesFromProgram = useCallback(async () => {
    const vr = viewerRef.current;
    if (!vr) return;
    setWbsLoadingProgram(true);
    try {
      const [activitiesRes, linksRes] = await Promise.all([
        fetch(`/api/program?project_id=${project_id}`).then(r => r.json()),
        fetch(`/api/program-links?project_id=${project_id}`).then(r => r.json()),
      ]);
      const activities: Record<string, { wbs_code: string; start_date: string; end_date: string; description: string }> = {};
      for (const a of (activitiesRes as any[])) {
        activities[a.id] = { wbs_code: a.wbs_code ?? '', start_date: a.start_date ?? '', end_date: a.end_date ?? '', description: a.description ?? '' };
      }
      // Build map: externalId → { min start, max end } + wbs/desc for first activity
      const extMap    = new Map<string, { start: string; end: string }>();
      const extToAct  = new Map<string, { wbs: string; desc: string }>();
      for (const link of (linksRes as any[])) {
        const act = activities[link.activity_id];
        if (!act || !link.external_ids?.length) continue;
        for (const extId of link.external_ids as string[]) {
          const existing = extMap.get(extId);
          const s = act.start_date;
          const e = act.end_date;
          if (!existing) { extMap.set(extId, { start: s, end: e }); } else {
            if (s && (!existing.start || s < existing.start)) existing.start = s;
            if (e && (!existing.end   || e > existing.end))   existing.end   = e;
          }
          if (!extToAct.has(extId)) extToAct.set(extId, { wbs: act.wbs_code, desc: act.description });
        }
      }
      if (extMap.size === 0) return;

      // Resolve externalId → dbId for the progWbsMap
      const allExtIds = Array.from(extToAct.keys());
      const newProgWbsMap: Record<string, { wbs: string; desc: string }> = {};
      const RESOLVE_CHUNK = 500;
      for (let i = 0; i < allExtIds.length; i += RESOLVE_CHUNK) {
        const chunk = allExtIds.slice(i, i + RESOLVE_CHUNK);
        const dbIds = await vr.resolveExternalIds(chunk);
        for (let j = 0; j < chunk.length; j++) {
          if (dbIds[j] > 0) newProgWbsMap[String(dbIds[j])] = extToAct.get(chunk[j])!;
        }
      }
      setProgWbsMap(newProgWbsMap);
      // Auto-select WBS Programa as first level when no levels are configured
      if (wbsLevels.length === 0 && Object.keys(newProgWbsMap).length > 0) {
        const newLevels = ['prog__wbs'];
        setWbsLevels(newLevels);
        await setBimLinkerKey(project_id, 'wbs_levels', newLevels);
      }

      // Flatten WBS tree to all nodes at all levels
      const allNodes: { nodePath: string; dbIds: number[] }[] = [];
      const collectNodes = (nodes: Map<string, WbsTreeNode>, path: string, depth: number) => {
        for (const [val, node] of nodes.entries()) {
          const nodePath = `${path}::${val}`;
          // Collect all rows recursively for this node
          const collectDbIds = (n: WbsTreeNode): number[] => {
            const ids = n.rows.map(r => r.dbId);
            for (const child of n.children.values()) ids.push(...collectDbIds(child));
            return ids;
          };
          allNodes.push({ nodePath, dbIds: collectDbIds(node) });
          if (depth < wbsLevels.length - 1) collectNodes(node.children, nodePath, depth + 1);
        }
      };
      const tree = buildWbsTree(wbsRows, wbsLevels);
      collectNodes(tree, '', 0);

      // Resolve external IDs in batches of 500
      const newDates: Record<string, WbsNodeDates> = { ...wbsDates };
      for (const { nodePath, dbIds } of allNodes) {
        if (!dbIds.length) continue;
        const CHUNK = 500;
        let extIds: string[] = [];
        for (let i = 0; i < dbIds.length; i += CHUNK) {
          const chunk = await vr.getExternalIds(dbIds.slice(i, i + CHUNK));
          extIds.push(...chunk);
        }
        let minStart = '';
        let maxEnd   = '';
        for (const extId of extIds) {
          const d = extMap.get(extId);
          if (!d) continue;
          if (d.start && (!minStart || d.start < minStart)) minStart = d.start;
          if (d.end   && (!maxEnd   || d.end   > maxEnd))   maxEnd   = d.end;
        }
        if (minStart || maxEnd) newDates[nodePath] = { start: minStart, end: maxEnd };
      }
      setWbsDates(newDates);
      await setBimLinkerKey(project_id, 'wbs_dates', newDates);
    } catch (e) {
      console.error('Error loading WBS dates from program', e);
    } finally {
      setWbsLoadingProgram(false);
    }
  }, [viewerRef, wbsLevels, wbsRows, buildWbsTree, wbsDates, project_id, progWbsMap]);

  // Cargar propiedades BIM del elemento enfocado en la cola (debe ir DESPUÉS de todos los useState)
  useEffect(() => {
    const item = tagQueue[tagQueueFocusIdx];
    if (!item || !viewerRef.current || tableTab !== 'queue') return;
    setLiveBimLoading(true);
    setLiveBimProps([]);
    viewerRef.current.getProperties(item.dbId)
      .then(result => {
        setLiveBimProps((result.properties ?? []).map((p: any) => ({
          category: p.category ?? '',
          attributeName: p.attributeName ?? '',
          displayName: p.displayName || p.attributeName || '',
          value: String(p.displayValue ?? ''),
        })));
      })
      .catch(() => setLiveBimProps([]))
      .finally(() => setLiveBimLoading(false));
  }, [tagQueueFocusIdx, tagQueue, tableTab]);

  // ─── Tabla: resize handle ─────────────────────────────────────────────────
  const startTableResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    tableResizingRef.current = true;
    tableResizeStartY.current = e.clientY;
    tableResizeStartH.current = tableHeight;
    const onMove = (ev: MouseEvent) => {
      if (!tableResizingRef.current) return;
      const delta = tableResizeStartY.current - ev.clientY;
      setTableHeight(Math.max(120, Math.min(600, tableResizeStartH.current + delta)));
    };
    const onUp = () => {
      tableResizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [tableHeight]);

  // ─── Tabla: descubrir propiedades disponibles muestreando el modelo ─────────
  const discoverProperties = useCallback(async () => {
    const vr = viewerRef.current;
    if (!vr) return;
    setDiscoveringProps(true);
    try {
      // Prioridad 1: último elemento seleccionado (propiedades exactas visibles en el popup)
      const sampleIds = lastSelectedDbIdsRef.current.length > 0
        ? lastSelectedDbIdsRef.current
        : vr.getSelectedIds().filter(id => id > 0).slice(0, 5);

      if (sampleIds.length > 0) {
        const catMap = new Map<string, Map<string, string>>();
        await Promise.all(sampleIds.map(async dbId => {
          try {
            const res = await vr.getProperties(dbId);
            for (const p of res.properties) {
              const rawCat = p.category ?? '';
              const cat = rawCat.startsWith('__') ? 'Other' : (rawCat || 'Other');
              if (!catMap.has(cat)) catMap.set(cat, new Map());
              catMap.get(cat)!.set(p.attributeName ?? p.displayName, p.displayName || p.attributeName);
            }
          } catch {}
        }));
        if (catMap.size > 0) {
          const result = Array.from(catMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, pm]) => ({
              category,
              props: Array.from(pm.entries()).map(([an, dn]) => ({ attributeName: an, displayName: dn }))
                .sort((a, b) => a.displayName.localeCompare(b.displayName)),
            }));
          setDiscoveredProps(result);
          return;
        }
      }
      // Prioridad 2: muestreo amplio del modelo completo
      const result = await vr.discoverPropertyCategories();
      setDiscoveredProps(result);
    } catch (e) {
      console.error('[tabla] discoverProperties error', e);
    } finally {
      setDiscoveringProps(false);
    }
  }, []);

  // ─── Árbol de Propiedades: construcción ─────────────────────────────────────
  const buildPropTree = useCallback(async () => {
    const vr = viewerRef.current;
    if (!vr) return;
    setPropTreeLoading(true);
    setPropTreeData([]);
    try {
      // Usa getBulkProperties sobre TODOS los elementos del modelo en una sola llamada
      const result = await vr.buildPropTreeData();
      setPropTreeData(result);
    } catch (e) {
      console.error('[PropTree] Error construyendo árbol', e);
    } finally {
      setPropTreeLoading(false);
    }
  }, []);

  // ─── Tabla: cargar filas (una por elemento) ───────────────────────────────
  const loadTableRows = useCallback(async (bimCols?: BimColumn[]) => {
    const vr = viewerRef.current;
    const cols = bimCols ?? bimColumns;
    if (!vr) return;
    setTableLoading(true);
    setTableProgress(0);
    const viewName = savedViews.find(v => v.id === activeViewId)?.name ?? '';
    try {
      // Paso 1: recolectar todos los dbIds y mapearlos a su nodo
      const dbIdToNode = new Map<number, { groupValue: string; groupColor: string }>();
      const allNodes = activeNodes.filter(n => (n.dbIds?.length ?? 0) > 0 || (n.guids?.length ?? 0) > 0);
      for (const node of allNodes) {
        let dbIds: number[] = node.dbIds ?? [];
        if (!dbIds.length && (node.guids?.length ?? 0) > 0) {
          try { dbIds = await vr.resolveExternalIds(node.guids!); } catch {}
        }
        for (const dbId of dbIds) dbIdToNode.set(dbId, { groupValue: node.value, groupColor: node.color });
      }
      if (dbIdToNode.size === 0) { setTableRows([]); return; }
      setTableProgress(15);

      // Paso 2: traer TODAS las propiedades sin filtro para evitar desajustes de nombres.
      // getBulkProperties con filtro solo retorna elementos que tienen ese displayName exacto;
      // si el attributeName difiere del displayName en el modelo, se pierde el valor.
      const allDbIds = Array.from(dbIdToNode.keys());
      const bulkResults = await vr.loadBulkElementProps(allDbIds, []);
      setTableProgress(85);

      const propsById = new Map(bulkResults.map(r => [r.dbId, r]));

      // Paso 4: incluir TODOS los elementos del árbol de color, con o sin propiedades
      const rows: TableRow[] = [];
      for (const [dbId, nodeInfo] of dbIdToNode) {
        const r = propsById.get(dbId);
        const name = r?.name || String(dbId);
        // Descartar solo fragmentos de geometría reales (Mesh, [N]) — no IDs numéricos válidos
        if (/^(Mesh|\[\d+\])$/i.test(name)) continue;
        const bimProps: Record<string, string> = {};
        for (const col of cols) {
          // Buscar por displayName, attributeName y sus versiones en mayúsculas
          bimProps[col.key] =
            r?.props[col.displayName] ??
            r?.props[col.displayName?.toUpperCase?.()] ??
            r?.props[col.attributeName] ??
            r?.props[col.attributeName?.toUpperCase?.()] ??
            '';
        }
        bimProps['__view__']  = viewName;
        bimProps['__group__'] = nodeInfo.groupValue;
        rows.push({ dbId, elementName: name, groupValue: nodeInfo.groupValue, groupColor: nodeInfo.groupColor, bimProps });
      }

      // Evaluar columnas fórmula (una pasada sobre todas las filas)
      const evalRule = (src: string, op: FormulaOperator, match: string): boolean => {
        const s = src.toLowerCase(); const m = match.toLowerCase();
        switch (op) {
          case 'equals':      return s === m;
          case 'notEquals':   return s !== m;
          case 'contains':    return s.includes(m);
          case 'notContains': return !s.includes(m);
          case 'startsWith':  return s.startsWith(m);
          case 'endsWith':    return s.endsWith(m);
          case 'notEmpty':    return src.trim() !== '';
          case 'isEmpty':     return src.trim() === '';
        }
      };
      for (const fc of formulaColumns) {
        for (const row of rows) {
          let computed = fc.defaultValue ?? '';
          for (const rule of fc.rules) {
            const src =
              rule.sourceColKey === '__name__'  ? row.elementName :
              rule.sourceColKey === '__group__' ? row.groupValue  :
              row.bimProps[rule.sourceColKey] ??
              customValues[String(row.dbId)]?.[rule.sourceColKey] ??
              '';
            if (evalRule(src, rule.operator, rule.matchValue)) { computed = rule.outputValue; break; }
          }
          row.bimProps[fc.key] = computed;
        }
      }

      setTableRows(rows);
    } finally {
      setTableLoading(false);
      setTableProgress(0);
    }
  }, [activeNodes, bimColumns, formulaColumns, customValues, activeViewId, savedViews]);

  // ─── Tabla: agregar columna BIM ────────────────────────────────────────────
  const addBimColumn = async (category: string, prop: DiscoveredProp) => {
    const key = `bim__${category}__${prop.attributeName}`;
    if (bimColumns.some(c => c.key === key)) return;
    const newCol: BimColumn = { key, category, attributeName: prop.attributeName, displayName: prop.displayName };
    const nextCols = [...bimColumns, newCol];
    setBimColumns(nextCols);
    setPropPickerOpen(false);
    setPickerCategory(null);
    await setBimLinkerKey(project_id, 'table_bim_cols', nextCols);
    await loadTableRows(nextCols);
  };

  // ─── Tabla: agregar columna personalizada ─────────────────────────────────
  const addCustomColumn = async () => {
    const label = newCustomColName.trim();
    if (!label) return;
    const key = `custom__${Date.now()}`;
    const nextCols = [...customColumns, { key, label }];
    setCustomColumns(nextCols);
    setNewCustomColName('');
    setAddingCustomCol(false);
    await setBimLinkerKey(project_id, 'table_custom_cols', nextCols);
  };

  // ─── Tabla: editar celda personalizada ────────────────────────────────────
  const commitCellEdit = async () => {
    if (!editingCell) return;
    const { dbId, colKey, value } = editingCell;
    const strId = String(dbId);
    const nextVals = { ...customValues, [strId]: { ...(customValues[strId] ?? {}), [colKey]: value } };
    setCustomValues(nextVals);
    setEditingCell(null);
    await setBimLinkerKey(project_id, 'table_custom_vals', nextVals);
  };

  // ─── Tabla: eliminar columna ──────────────────────────────────────────────
  // ─── Cola de Tags: agregar elementos seleccionados en orden ───────────────
  const addToTagQueue = useCallback(async (dbIds: number[]) => {
    const vr = viewerRef.current;
    if (!vr || !dbIds.length) return;
    const currentIds = new Set(tagQueueRef.current.map(i => i.dbId));
    const newIds = dbIds.filter(id => !currentIds.has(id));
    // Si el elemento ya está, enfocar el primero que se re-seleccionó
    if (!newIds.length) {
      const reIdx = tagQueueRef.current.findIndex(i => i.dbId === dbIds[dbIds.length - 1]);
      if (reIdx >= 0) setTagQueueFocusIdx(reIdx);
      return;
    }
    const placeholders: TagQueueItem[] = newIds.map(id => ({ dbId: id, name: String(id), groupValue: '', groupColor: '#94a3b8', loading: true }));
    const next = [...tagQueueRef.current, ...placeholders];
    tagQueueRef.current = next;
    setTagQueue([...next]);
    setTagQueueFocusIdx(next.length - newIds.length);
    const resolved = await Promise.all(newIds.map(async id => {
      let name = String(id);
      let groupValue = '';
      let groupColor = '#94a3b8';
      try { const props = await vr.getProperties(id); name = props.name || String(id); } catch {}
      for (const node of activeNodesRef.current) {
        if (node.dbIds?.includes(id)) { groupValue = node.value; groupColor = node.color; break; }
      }
      return { dbId: id, name, groupValue, groupColor, loading: false };
    }));
    setTagQueue(prev => {
      const updated = prev.map(item => resolved.find(r => r.dbId === item.dbId) ?? item);
      tagQueueRef.current = updated;
      return updated;
    });
  }, []);

  const saveTagCodebook = async (entries: CodebookEntry[]) => {
    setTagCodebook(entries);
    await setBimLinkerKey(project_id, 'tag_codebook', entries);
  };

  const savePropExtractRules = async (rules: PropExtractRule[]) => {
    setPropExtractRules(rules);
    await setBimLinkerKey(project_id, 'prop_extract_rules', rules);
  };

  const removeBimColumn = async (key: string) => {
    const next = bimColumns.filter(c => c.key !== key);
    setBimColumns(next);
    setTableRows(prev => prev.map(r => { const b = { ...r.bimProps }; delete b[key]; return { ...r, bimProps: b }; }));
    await setBimLinkerKey(project_id, 'table_bim_cols', next);
  };

  const removeCustomColumn = async (key: string) => {
    const next = customColumns.filter(c => c.key !== key);
    setCustomColumns(next);
    await setBimLinkerKey(project_id, 'table_custom_cols', next);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] overflow-hidden -mx-8 -my-8 bg-white">

      {/* ── Top bar ── */}
      <div className="shrink-0 bg-white px-5 py-2 flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <MonitorPlay size={14} className="text-blue-600" />
            </div>
            <div>
              <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest leading-none">Vistas 3D</p>
              {config && <p className="text-[9px] text-slate-500 font-bold mt-0.5 truncate max-w-[200px]">{config.modelName}</p>}
            </div>
          </div>

          <div className="h-8 w-[1px] bg-slate-200 mx-2" />

          {/* Main tab switcher: VISOR 3D | WBS */}
          <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[10px] font-black shrink-0">
            <button
              onClick={() => setMainTab('viewer')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition ${mainTab === 'viewer' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              <MonitorPlay size={11} /> VISOR 3D
            </button>
            <button
              onClick={() => setMainTab('wbs')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition ${mainTab === 'wbs' ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              <Workflow size={11} /> WBS
            </button>
          </div>

          <div className="h-8 w-[1px] bg-slate-200 mx-2" />

          {/* View Selector Dropdown */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <select
                value={activeViewId || ''}
                onChange={e => {
                  const view = savedViews.find(v => v.id === e.target.value);
                  if (view) applyView(view);
                }}
                className="bg-slate-100 text-[11px] font-black text-slate-900 py-1.5 px-3 rounded-lg border-none outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-w-[200px]"
              >
                <option value="">{savedViews.length === 0 ? '— Sin vistas —' : 'Seleccionar vista...'}</option>
                {savedViews.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.viewType === 'cwa'
                      ? (v.colorNodes.length === 0 ? `⚠ ${v.name} — Sin definir` : `✓ ${v.name}`)
                      : v.name}
                  </option>
                ))}
              </select>
              {/* CWA warning pill */}
              {savedViews.find(v => v.viewType === 'cwa')?.colorNodes.length === 0 && (
                <button
                  onClick={() => { const cwa = savedViews.find(v => v.viewType === 'cwa'); if (cwa) applyView(cwa); }}
                  className="flex items-center gap-1 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[9px] font-black uppercase tracking-wide transition animate-pulse"
                  title="Debes definir las Áreas de Trabajo CWA"
                >
                  <AlertCircle size={11} /> Definir CWA
                </button>
              )}
            </div>

            <button
              onClick={handleCreateNewView}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wide transition shadow-sm active:scale-95"
              title="Crear nueva vista vacía"
            >
              <FolderPlus size={13} /> Nueva
            </button>

            <div className="flex items-center gap-1">
              <button onClick={() => activeViewId && handleDuplicateView(activeViewId)} disabled={!activeViewId}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600 transition disabled:opacity-30" title="Duplicar">
                <Copy size={14} />
              </button>
              <button onClick={() => activeViewId && handleDeleteView(activeViewId)} disabled={!activeViewId}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-500 transition disabled:opacity-30" title="Eliminar">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {savedViews.length >= 2 && (
            <button
              onClick={() => { setMergeOpen(true); setMergeSelected(new Set()); setMergeName(''); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-blue-700 shadow-sm transition"
            >
              <Merge size={12} /> Fusionar Vistas
            </button>
          )}
        </div>
      </div>

      {/* ── Viewer + SidePanel ── */}
      <div className="flex-1 overflow-hidden flex relative">

        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0d1b3e]">
            <Loader2 size={24} className="animate-spin text-blue-400" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargando visualizador…</p>
          </div>
        ) : !config?.urn ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[#0d1b3e]">
            <AlertCircle size={40} className="text-white/20 mx-auto" />
            <p className="text-sm font-black text-white/60 uppercase tracking-widest">Sin modelo configurado</p>
            <p className="text-[10px] text-white/30 max-w-xs text-center">Activa el modelo desde el módulo "Visor BIM".</p>
          </div>
        ) : (
          <>
            {/* ── Left Sidebar (Model Tree + Prop Tree) — viewer mode only ── */}
            {mainTab === 'viewer' && viewerReady && treeOpen && (
              <div style={{ width: treeWidth }} className="bg-[#0a1628] border-r border-white/5 flex flex-col shadow-2xl relative z-10 shrink-0">
                {/* Header con pestañas */}
                <div className="shrink-0 border-b border-white/5">
                  <div className="flex">
                    <button
                      onClick={() => setLeftPanelTab('model')}
                      className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition border-b-2 ${
                        leftPanelTab === 'model'
                          ? 'text-blue-400 border-blue-400 bg-white/5'
                          : 'text-white/30 border-transparent hover:text-white/60'
                      }`}
                    >
                      <Layers size={11} /> Modelo
                    </button>
                    <button
                      onClick={() => {
                        setLeftPanelTab('props');
                        if (propTreeData.length === 0 && !propTreeLoading) buildPropTree();
                      }}
                      className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition border-b-2 ${
                        leftPanelTab === 'props'
                          ? 'text-violet-400 border-violet-400 bg-white/5'
                          : 'text-white/30 border-transparent hover:text-white/60'
                      }`}
                    >
                      <Tag size={11} /> Propiedades
                    </button>
                    <button onClick={() => setTreeOpen(false)} className="px-3 text-white/20 hover:text-white transition">
                      <X size={13} />
                    </button>
                  </div>
                </div>

                {/* Contenido por pestaña */}
                {leftPanelTab === 'model' ? (
                  <ModelTree
                    viewerRef={viewerRef}
                    highlightedDbId={highlightedTreeDbId}
                    expandPath={treeExpandPath}
                    onRootsLoaded={(ids) => { treeRootDbIds.current = new Set(ids); }}
                    onSelectNode={(dbId) => {
                      const vr = viewerRef.current;
                      if (vr) {
                        vr.select([dbId]);
                        vr.fitToView([dbId]);
                      }
                      setHighlightedTreeDbId(dbId);
                    }}
                    onAssignBranch={async (dbId, name) => {
                      if (!activeViewId) {
                        alert('Selecciona o crea una Vista activa primero en la barra derecha.');
                        return;
                      }
                      const vr = viewerRef.current;
                      if (!vr) return;
                      setApplying(true);
                      try {
                        const leafIds = vr.getLeafDbIds([dbId]);
                        if (!leafIds.length) { alert('La rama está vacía.'); return; }
                        let guids: string[] = [];
                        if (name && name.length >= 3) {
                          guids = [name.trim()];
                        } else {
                          guids = await vr.getExternalIds(leafIds);
                        }
                        const color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
                        const newNode = { value: name, color, visible: true, guids, dbIds: leafIds };
                        const leafSet = new Set(leafIds);
                        const guidSet = new Set(guids);
                        const finalActiveNodes = [
                          ...activeNodes.map(n => cleanNodeFrom(n, leafSet, guidSet)),
                          newNode,
                        ];
                        const updatedViews = savedViews.map(v => {
                          if (v.id !== activeViewId) return v;
                          const cleanedNodes = v.colorNodes.map(n => cleanNodeFrom(n, leafSet, guidSet));
                          return { ...v, colorNodes: [...cleanedNodes, newNode] };
                        });
                        setSavedViews(updatedViews);
                        persistViews(updatedViews);
                        setActiveNodes(finalActiveNodes);
                        const currentView = updatedViews.find(v => v.id === activeViewId);
                        if (currentView) applyView(currentView, finalActiveNodes);
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setApplying(false);
                      }
                    }}
                    onCheckedChange={(branchDbIds) => {
                      const vr = viewerRef.current;
                      if (!vr) return;
                      if (!branchDbIds.length) {
                        vr.showAll();
                        vr.setGhosting(false);
                        const activeView = savedViews.find(v => v.id === activeViewId);
                        if (activeView) applyView(activeView);
                        return;
                      }
                      const leafIds = branchDbIds.flatMap(id => vr.getLeafDbIds([id]));
                      if (!leafIds.length) return;
                      vr.isolateDbIds(leafIds);
                      vr.setGhosting(true);
                      vr.fitToView(leafIds);
                    }}
                    onAssignMultiple={async (items) => {
                      if (!activeViewId) {
                        alert('Selecciona o crea una Vista activa primero en la barra derecha.');
                        return;
                      }
                      const vr = viewerRef.current;
                      if (!vr) return;
                      setApplying(true);
                      try {
                        const allLeafIds: number[] = [];
                        const allGuids: string[] = [];
                        for (const { dbId, name } of items) {
                          const leafIds = vr.getLeafDbIds([dbId]);
                          allLeafIds.push(...leafIds);
                          if (name && name.length >= 3) {
                            allGuids.push(name.trim());
                          } else {
                            const guids = await vr.getExternalIds(leafIds);
                            allGuids.push(...guids);
                          }
                        }
                        const uniqueLeafIds = [...new Set(allLeafIds)];
                        const uniqueGuids = [...new Set(allGuids)];
                        if (!uniqueLeafIds.length) return;
                        const nodeName = items.length === 1
                          ? items[0].name
                          : `${items[0].name} (+${items.length - 1})`;
                        const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                        const newNode = { value: nodeName, color, visible: true, guids: uniqueGuids, dbIds: uniqueLeafIds };
                        const finalActiveNodes = [
                          ...activeNodes.map(n => ({
                            ...n,
                            dbIds: (n.dbIds || []).filter(id => !uniqueLeafIds.includes(id)),
                            guids: (n.guids || []).filter(g => !uniqueGuids.includes(g)),
                          })),
                          newNode,
                        ];
                        const updatedViews = savedViews.map(v => {
                          if (v.id !== activeViewId) return v;
                          const cleanedNodes = v.colorNodes.map(n => ({
                            ...n,
                            dbIds: (n.dbIds || []).filter(id => !uniqueLeafIds.includes(id)),
                            guids: (n.guids || []).filter(g => !uniqueGuids.includes(g)),
                          }));
                          return { ...v, colorNodes: [...cleanedNodes, newNode] };
                        });
                        const updatedView = updatedViews.find(v => v.id === activeViewId)!;
                        setSavedViews(updatedViews);
                        persistViews(updatedViews);
                        setActiveNodes(finalActiveNodes);
                        await applyView(updatedView, finalActiveNodes);
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setApplying(false);
                      }
                    }}
                    onAssignEach={handleAssignEach}
                  />
                ) : (
                  /* ── Árbol de Propiedades ── */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Toolbar */}
                    <div className="shrink-0 px-3 py-2 border-b border-white/5 flex items-center gap-2">
                      {/* Búsqueda */}
                      <div className="relative flex-1">
                        <input
                          value={propTreeSearch}
                          onChange={e => setPropTreeSearch(e.target.value)}
                          placeholder="Buscar categoría, propiedad o valor…"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 transition"
                        />
                        {propTreeSearch && (
                          <button onClick={() => setPropTreeSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition">
                            <X size={11} />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={buildPropTree}
                        disabled={propTreeLoading}
                        title="Recargar árbol de propiedades desde el modelo"
                        className="shrink-0 p-1.5 text-white/30 hover:text-violet-400 transition disabled:opacity-40 rounded-lg hover:bg-white/5"
                      >
                        <RefreshCw size={12} className={propTreeLoading ? 'animate-spin' : ''} />
                      </button>
                    </div>

                    {/* Instrucción */}
                    {!propTreeLoading && propTreeData.length > 0 && (
                      <div className="shrink-0 px-3 py-1.5 border-b border-white/5 flex items-center gap-1.5">
                        <MousePointerClick size={9} className="text-violet-400/60 shrink-0" />
                        <span className="text-[9px] text-white/25">Clic en un valor para seleccionar en el modelo</span>
                      </div>
                    )}

                    {/* Contenido del árbol */}
                    <div className="flex-1 overflow-y-auto">
                      {propTreeLoading && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                          <RefreshCw size={18} className="animate-spin text-violet-400" />
                          <p className="text-[10px] text-white/40 text-center px-4">Leyendo propiedades de todos<br/>los elementos del modelo…</p>
                        </div>
                      )}
                      {!propTreeLoading && propTreeData.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 px-4">
                          <Tag size={22} className="text-white/10" />
                          <p className="text-[10px] text-white/30 text-center">Sin propiedades cargadas.<br/>Asegúrate de que el modelo esté visible.</p>
                          <button
                            onClick={buildPropTree}
                            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wide transition"
                          >
                            Cargar Propiedades
                          </button>
                        </div>
                      )}
                      {!propTreeLoading && propTreeData.length > 0 && (() => {
                        const search = propTreeSearch.toLowerCase();
                        const filteredCats = propTreeData
                          .map(cat => ({
                            ...cat,
                            props: cat.props
                              .map(prop => ({
                                ...prop,
                                values: prop.values.filter(v =>
                                  !search ||
                                  cat.category.toLowerCase().includes(search) ||
                                  prop.displayName.toLowerCase().includes(search) ||
                                  v.value.toLowerCase().includes(search)
                                ),
                              }))
                              .filter(p => p.values.length > 0),
                          }))
                          .filter(c => c.props.length > 0);

                        if (filteredCats.length === 0) {
                          return (
                            <div className="text-center py-8 text-[10px] text-white/30">
                              Sin resultados para «{propTreeSearch}»
                            </div>
                          );
                        }

                        return (
                          <div className="divide-y divide-white/5">
                            {filteredCats.map(cat => {
                              const catExpanded = propTreeExpCats.has(cat.category) || !!search;
                              const totalElems = cat.props.reduce((s, p) => s + p.values.reduce((ss, v) => ss + v.count, 0), 0);
                              return (
                                <div key={cat.category}>
                                  {/* Cabecera categoría */}
                                  <button
                                    onClick={() => setPropTreeExpCats(prev => {
                                      const s = new Set(prev);
                                      s.has(cat.category) ? s.delete(cat.category) : s.add(cat.category);
                                      return s;
                                    })}
                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition text-left group"
                                  >
                                    {catExpanded
                                      ? <ChevronDown size={11} className="text-violet-400 shrink-0" />
                                      : <ChevronRight size={11} className="text-white/30 shrink-0 group-hover:text-white/60" />}
                                    <span className="text-[10px] font-black text-white/80 flex-1 truncate">{cat.category}</span>
                                    <span className="text-[8px] text-white/20 font-mono shrink-0">{cat.props.length}p · {totalElems}el</span>
                                  </button>

                                  {/* Propiedades */}
                                  {catExpanded && cat.props.map(prop => {
                                    const propKey = `${cat.category}::${prop.attributeName}`;
                                    const propExpanded = propTreeExpProps.has(propKey) || !!search;
                                    const totalPropElems = prop.values.reduce((s, v) => s + v.count, 0);
                                    return (
                                      <div key={propKey}>
                                        <button
                                          onClick={() => setPropTreeExpProps(prev => {
                                            const s = new Set(prev);
                                            s.has(propKey) ? s.delete(propKey) : s.add(propKey);
                                            return s;
                                          })}
                                          className="w-full flex items-center gap-2 pl-6 pr-3 py-1.5 hover:bg-white/5 transition text-left group"
                                        >
                                          {propExpanded
                                            ? <ChevronDown size={10} className="text-violet-300/50 shrink-0" />
                                            : <ChevronRight size={10} className="text-white/20 shrink-0 group-hover:text-white/50" />}
                                          <span className="text-[10px] font-semibold text-white/60 flex-1 truncate">{prop.displayName}</span>
                                          <span className="text-[8px] text-white/15 font-mono shrink-0">{totalPropElems}el</span>
                                        </button>

                                        {/* Valores */}
                                        {propExpanded && (
                                          <div className="pb-0.5">
                                            {prop.values.map(leaf => (
                                              <div
                                                key={leaf.value}
                                                className="flex items-center pl-10 pr-1.5 py-1 hover:bg-violet-500/10 transition group/leaf"
                                              >
                                                {/* Clic principal: seleccionar */}
                                                <button
                                                  onClick={() => {
                                                    const vr = viewerRef.current;
                                                    if (!vr || !leaf.dbIds.length) return;
                                                    vr.select(leaf.dbIds);
                                                    vr.fitToView(leaf.dbIds);
                                                  }}
                                                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                                                  title={`Seleccionar ${leaf.count} elemento${leaf.count !== 1 ? 's' : ''} con "${prop.displayName}" = "${leaf.value}"`}
                                                >
                                                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400/30 group-hover/leaf:bg-violet-400 transition shrink-0" />
                                                  <span className="text-[10px] text-white/50 flex-1 truncate group-hover/leaf:text-white/90 transition">{leaf.value}</span>
                                                  <span className="text-[8px] font-black text-violet-400/50 group-hover/leaf:text-violet-300 shrink-0 transition bg-violet-500/10 group-hover/leaf:bg-violet-500/20 px-1.5 py-0.5 rounded-full">{leaf.count}</span>
                                                </button>
                                                {/* Botón aislar (aparece en hover) */}
                                                <button
                                                  onClick={() => {
                                                    const vr = viewerRef.current;
                                                    if (!vr || !leaf.dbIds.length) return;
                                                    vr.showAll();
                                                    vr.isolateDbIds(leaf.dbIds);
                                                    vr.setGhosting(true);
                                                    vr.fitToView(leaf.dbIds);
                                                  }}
                                                  title={`Aislar ${leaf.count} elemento${leaf.count !== 1 ? 's' : ''}`}
                                                  className="opacity-0 group-hover/leaf:opacity-100 transition ml-1 p-1 text-white/30 hover:text-violet-300 rounded"
                                                >
                                                  <EyeOff size={9} />
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}


                {/* Resize handle */}
                <div
                  onMouseDown={startTreeResize}
                  className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-20 hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors"
                  title="Arrastrar para redimensionar"
                />
              </div>
            )}

            {/* ── WBS Left Panel (WBS tab only) ── */}
            {mainTab === 'wbs' && viewerReady && (() => {
              const wbsTree = buildWbsTree(wbsRows, wbsLevels);
              const seqNodes = getWbsSeqNodes();
              const palette = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16'];
              let rootPaletteIdx = 0;

              const renderWbsWithDates = (nodes: Map<string, WbsTreeNode>, path: string, depth: number): React.ReactNode => {
                if (nodes.size === 0) return null;
                return Array.from(nodes.entries()).map(([val, node]) => {
                  const nodePath = `${path}::${val}`;
                  const isExpanded = wbsExpanded.has(nodePath);
                  const hasChildren = node.children.size > 0 && depth < wbsLevels.length - 1;
                  const dates = wbsDates[nodePath] ?? { start: '', end: '' };
                  const nodeColor = depth === 0
                    ? (wbsNodeColors[val] ?? palette[rootPaletteIdx++ % palette.length])
                    : (node.color ?? '#94a3b8');

                  return (
                    <div key={nodePath}>
                      <div
                        className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100 hover:bg-violet-50/40 group transition-colors"
                        style={{ paddingLeft: `${8 + depth * 16}px` }}
                      >
                        <button
                          onClick={() => setWbsExpanded(prev => { const s = new Set(prev); s.has(nodePath) ? s.delete(nodePath) : s.add(nodePath); return s; })}
                          className="shrink-0 w-4 flex items-center justify-center text-slate-400"
                        >
                          {hasChildren ? (isExpanded ? <ChevronDown size={10} className="text-violet-500" /> : <ChevronRight size={10} />) : <div className="w-2 h-2 rounded-full bg-slate-200" />}
                        </button>
                        <div className="w-3 h-3 rounded-sm shrink-0 cursor-pointer" style={{ backgroundColor: nodeColor }}
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'color';
                            input.value = nodeColor;
                            input.onchange = () => {
                              const next = { ...wbsNodeColors, [val]: input.value };
                              setWbsNodeColors(next);
                              setBimLinkerKey(project_id, 'wbs_node_colors', next).catch(console.error);
                            };
                            input.click();
                          }}
                        />
                        <span className="flex-1 text-[11px] font-semibold text-slate-700 truncate min-w-0">{val}</span>
                        <span className="text-[9px] font-bold text-slate-400 shrink-0 tabular-nums mr-1">{node.rows.length}</span>
                        <button
                          onClick={e => { e.stopPropagation(); viewerRef.current?.isolateDbIds(node.rows.map(r => r.dbId)); viewerRef.current?.fitToView(node.rows.map(r => r.dbId)); viewerRef.current?.setGhosting(true); }}
                          title="Aislar en el visor"
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-violet-600 transition rounded shrink-0"
                        ><EyeOff size={10} /></button>
                      </div>
                      {/* Date row */}
                      <div className="flex items-center gap-1 border-b border-slate-50 bg-slate-50/60" style={{ paddingLeft: `${8 + (depth + 1) * 16}px`, paddingRight: 8, paddingTop: 2, paddingBottom: 3 }}>
                        <CalendarDays size={9} className="text-emerald-500 shrink-0" />
                        <input
                          type="date"
                          value={dates.start}
                          onChange={async e => {
                            const next = { ...wbsDates, [nodePath]: { ...dates, start: e.target.value } };
                            setWbsDates(next);
                            await setBimLinkerKey(project_id, 'wbs_dates', next);
                          }}
                          className="text-[9px] text-slate-600 border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:border-violet-400 flex-1 min-w-0"
                          title="Fecha inicio"
                        />
                        <span className="text-[8px] text-slate-300">→</span>
                        <input
                          type="date"
                          value={dates.end}
                          onChange={async e => {
                            const next = { ...wbsDates, [nodePath]: { ...dates, end: e.target.value } };
                            setWbsDates(next);
                            await setBimLinkerKey(project_id, 'wbs_dates', next);
                          }}
                          className="text-[9px] text-slate-600 border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:border-violet-400 flex-1 min-w-0"
                          title="Fecha fin"
                        />
                      </div>
                      {isExpanded && hasChildren && renderWbsWithDates(node.children, nodePath, depth + 1)}
                    </div>
                  );
                });
              };

              return (
                <div className="w-[320px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden z-10">
                  {/* Header */}
                  <div className="shrink-0 px-3 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                    <Workflow size={13} className="text-violet-600 shrink-0" />
                    <span className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex-1">WBS</span>
                    <button
                      onClick={loadWbsData}
                      disabled={wbsDataLoading}
                      title="Cargar todos los elementos del modelo en el WBS"
                      className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-black transition disabled:opacity-40"
                    >
                      {wbsDataLoading ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />}
                      {wbsAllRows.length > 0 ? `${wbsAllRows.length} elem.` : 'Cargar datos'}
                    </button>
                    <button
                      onClick={loadWbsDatesFromProgram}
                      disabled={wbsLoadingProgram}
                      title="Cargar fechas automáticamente desde el programa vinculado al modelo"
                      className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[9px] font-black transition disabled:opacity-40"
                    >
                      {wbsLoadingProgram ? <Loader2 size={9} className="animate-spin" /> : <CalendarDays size={9} />}
                      Del Programa
                    </button>
                    <button
                      onClick={colorByWbs}
                      disabled={wbsLevels.length === 0 || wbsRows.length === 0}
                      title="Colorear elementos del modelo por nodo WBS raíz"
                      className="flex items-center gap-1 px-2 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-[9px] font-black transition disabled:opacity-40"
                    >
                      <Paintbrush size={9} /> Colorear
                    </button>
                  </div>

                  {/* Excel source + hierarchy levels (compact) */}
                  <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-violet-50/30 space-y-1.5">
                    {/* File selector */}
                    <div className="flex items-center gap-1.5">
                      <FileSpreadsheet size={10} className="text-emerald-600 shrink-0" />
                      <select
                        value={wbsExcelSource?.versionId ?? ''}
                        onChange={async e => {
                          const vId = e.target.value;
                          if (!vId) {
                            setWbsExcelSource(null);
                            await setBimLinkerKey(project_id, 'wbs_excel_source', null);
                            const cleaned = wbsLevels.filter(l => !l.startsWith('excel__'));
                            if (cleaned.length !== wbsLevels.length) { setWbsLevels(cleaned); await setBimLinkerKey(project_id, 'wbs_levels', cleaned); }
                            return;
                          }
                          const autoBimKey = bimColumns.find(c =>
                            c.displayName.toLowerCase() === bimLinkerKeyCol.toLowerCase() ||
                            c.attributeName.toLowerCase() === bimLinkerKeyCol.toLowerCase()
                          )?.key ?? bimColumns[0]?.key ?? '';
                          const next: WbsExcelSource = { versionId: vId, excelKeyCol: bimLinkerKeyCol, bimKeyCol: autoBimKey };
                          setWbsExcelSource(next);
                          await setBimLinkerKey(project_id, 'wbs_excel_source', next);
                        }}
                        className="flex-1 text-[9px] font-bold text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 bg-white focus:outline-none cursor-pointer min-w-0"
                      >
                        <option value="">Propiedades del modelo</option>
                        {excelVersions.map(v => <option key={v.id} value={v.id}>{v.fileName}</option>)}
                      </select>
                      {wbsExcelSource && bimLinkerKeyCol && (
                        <span className="text-[8px] text-slate-400 flex items-center gap-0.5 shrink-0"><Link2 size={7} />{bimLinkerKeyCol}</span>
                      )}
                    </div>
                    {/* Levels */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <Workflow size={9} className="text-violet-500 shrink-0" />
                      {wbsLevels.map((lvlKey, i) => {
                        const col = wbsAllCols.find(c => c.key === lvlKey);
                        return (
                          <div key={lvlKey} className="flex items-center gap-0.5">
                            {i > 0 && <ChevronRight size={8} className="text-violet-300" />}
                            <div className="flex items-center gap-0.5 bg-white border border-violet-200 rounded-full px-1.5 py-0.5 text-[8px] font-bold text-violet-700">
                              <span>{col?.label ?? lvlKey}</span>
                              <button onClick={() => { const n = wbsLevels.filter((_, j) => j !== i); setWbsLevels(n); setBimLinkerKey(project_id, 'wbs_levels', n); }} className="text-violet-300 hover:text-red-500"><X size={7} /></button>
                            </div>
                          </div>
                        );
                      })}
                      <select
                        value=""
                        onChange={async e => {
                          const v = e.target.value;
                          if (!v || wbsLevels.includes(v)) return;
                          const n = [...wbsLevels, v];
                          setWbsLevels(n);
                          await setBimLinkerKey(project_id, 'wbs_levels', n);
                        }}
                        className="text-[8px] font-bold text-violet-600 border border-dashed border-violet-300 rounded-full px-1.5 py-0.5 bg-white focus:outline-none cursor-pointer"
                      >
                        <option value="">+ Nivel…</option>
                        {wbsAllCols.filter(c => !wbsLevels.includes(c.key)).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                      {wbsLevels.length > 0 && <button onClick={() => setWbsExpanded(new Set())} className="ml-auto text-[8px] text-slate-400 hover:text-slate-600">Colapsar</button>}
                    </div>
                  </div>

                  {/* Sequencer controls */}
                  {seqNodes.length > 0 && (
                    <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-amber-50/40 flex items-center gap-2">
                      <Calendar size={11} className="text-amber-600 shrink-0" />
                      <span className="text-[9px] font-black text-amber-700 flex-1 truncate">
                        {wbsSeqActive ? `Paso ${wbsSeqStep + 1}/${seqNodes.length}: ${seqNodes[wbsSeqStep]?.label ?? ''}` : `Secuenciar (${seqNodes.length} pasos)`}
                      </span>
                      <button
                        onClick={() => {
                          const step = Math.max(0, wbsSeqStep - 1);
                          setWbsSeqStep(step);
                          setWbsSeqActive(true);
                          const node = seqNodes[step];
                          if (node && viewerRef.current) {
                            viewerRef.current.showAll();
                            viewerRef.current.isolateDbIds(node.dbIds);
                            viewerRef.current.fitToView(node.dbIds);
                            viewerRef.current.setGhosting(true);
                          }
                        }}
                        disabled={!wbsSeqActive && wbsSeqStep === 0}
                        className="p-1 text-amber-600 hover:bg-amber-100 rounded disabled:opacity-30 transition"
                      ><SkipBack size={12} /></button>
                      <button
                        onClick={() => {
                          if (wbsSeqActive) {
                            setWbsSeqActive(false);
                            viewerRef.current?.showAll();
                            viewerRef.current?.setGhosting(false);
                            const view = savedViews.find(v => v.id === activeViewId);
                            if (view) applyView(view);
                          } else {
                            setWbsSeqActive(true);
                            setWbsSeqStep(0);
                            const node = seqNodes[0];
                            if (node && viewerRef.current) {
                              viewerRef.current.showAll();
                              viewerRef.current.isolateDbIds(node.dbIds);
                              viewerRef.current.fitToView(node.dbIds);
                              viewerRef.current.setGhosting(true);
                            }
                          }
                        }}
                        className="p-1 rounded bg-amber-500 hover:bg-amber-600 text-white transition"
                      >{wbsSeqActive ? <Pause size={12} /> : <Play size={12} />}</button>
                      <button
                        onClick={() => {
                          const step = Math.min(seqNodes.length - 1, wbsSeqStep + 1);
                          setWbsSeqStep(step);
                          setWbsSeqActive(true);
                          const node = seqNodes[step];
                          if (node && viewerRef.current) {
                            viewerRef.current.showAll();
                            viewerRef.current.isolateDbIds(node.dbIds);
                            viewerRef.current.fitToView(node.dbIds);
                            viewerRef.current.setGhosting(true);
                          }
                        }}
                        disabled={wbsSeqActive && wbsSeqStep === seqNodes.length - 1}
                        className="p-1 text-amber-600 hover:bg-amber-100 rounded disabled:opacity-30 transition"
                      ><SkipForward size={12} /></button>
                    </div>
                  )}

                  {/* WBS Tree with dates */}
                  <div className="flex-1 overflow-y-auto">
                    {wbsLevels.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-300 p-6 text-center">
                        <Workflow size={28} className="opacity-30" />
                        <p className="text-[11px] font-bold text-slate-400">Define la jerarquía WBS</p>
                        <p className="text-[10px] text-slate-300">Usa <strong>+ Nivel</strong> arriba para añadir columnas de agrupación.</p>
                      </div>
                    )}
                    {wbsLevels.length > 0 && visibleTableRows.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-300 p-4 text-center">
                        <p className="text-[10px]">Sin datos. Carga primero los datos en la pestaña TABLA (en la vista VISOR 3D).</p>
                      </div>
                    )}
                    {wbsRows.length === 0 && (
                      <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 text-center">
                        {wbsDataLoading
                          ? <Loader2 size={20} className="animate-spin text-blue-400" />
                          : <>
                              <RefreshCw size={20} className="text-slate-300" />
                              <p className="text-[10px] text-slate-400 font-semibold">Haz clic en <strong className="text-blue-600">Cargar datos</strong> para traer los elementos del modelo al WBS</p>
                            </>
                        }
                      </div>
                    )}
                    {wbsLevels.length > 0 && wbsRows.length > 0 && (
                      <div className="divide-y divide-slate-50">
                        {renderWbsWithDates(wbsTree, 'root', 0)}
                      </div>
                    )}
                    {wbsLevels.length === 0 && wbsRows.length > 0 && (
                      <p className="text-[10px] text-slate-400 text-center py-6 px-4">Selecciona al menos un nivel en <strong>+ Nivel…</strong> para construir el árbol WBS</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Center Viewer ── */}
            <div className="flex-1 flex flex-col relative">
              {/* Viewer area */}
              <div className="flex-1 relative">
                {/* Toggle Tree Button — viewer mode only */}
                {mainTab === 'viewer' && viewerReady && !treeOpen && (
                  <button
                    onClick={() => setTreeOpen(true)}
                    className="absolute top-4 left-4 z-20 bg-[#0a1628]/90 backdrop-blur-md border border-white/10 text-white px-3 py-2 rounded shadow-xl flex items-center gap-2 hover:bg-white/10 transition group"
                  >
                    <Layers size={14} className="text-blue-400 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Árbol</span>
                  </button>
                )}
                {/* Toggle Table / Cola Button — viewer mode only */}
                {mainTab === 'viewer' && viewerReady && !tableOpen && (
                  <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
                    <button
                      onClick={() => { setTableTab('table'); setTableOpen(true); }}
                      className="bg-[#0a1628]/90 backdrop-blur-md border border-white/10 text-white px-3 py-2 rounded shadow-xl flex items-center gap-2 hover:bg-white/10 transition group"
                    >
                      <Table2 size={14} className="text-blue-400 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Tabla</span>
                    </button>
                    <button
                      onClick={() => { setTableTab('queue'); setTableOpen(true); }}
                      className="bg-[#0a1628]/90 backdrop-blur-md border border-white/10 text-white px-3 py-2 rounded shadow-xl flex items-center gap-2 hover:bg-white/10 transition group relative"
                    >
                      <Tag size={14} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Cola Tags</span>
                      {tagQueue.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white text-[8px] font-black flex items-center justify-center">{tagQueue.length}</span>
                      )}
                    </button>
                    <button
                      onClick={() => viewerRef.current?.removeAllTransparency()}
                      className="bg-[#0a1628]/90 backdrop-blur-md border border-white/10 text-white px-3 py-2 rounded shadow-xl flex items-center gap-2 hover:bg-white/10 transition group ml-2"
                      title="Quitar transparencia (volver elementos sólidos)"
                    >
                      <EyeOff size={14} className="text-rose-400 group-hover:scale-110 transition-transform" />
                      <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Visibilidad Sólida</span>
                    </button>
                  </div>
                )}
                <ForgeViewer
                  ref={viewerRef}
                  urn={config.urn}
                  onReady={() => setViewerReady(true)}
                  onSelectionChange={(dbIds) => {
                    setSelectionCount(dbIds.length);
                    if (dbIds.length) lastSelectedDbIdsRef.current = dbIds.slice(0, 5);
                    if (!dbIds.length) {
                      setHighlightedTreeDbId(null);
                      setTreeExpandPath([]);
                      return;
                    }
                    // Cola de tags: acumular en orden
                    addToTagQueue(dbIds);
                    const vr = viewerRef.current;
                    if (!vr) return;

                    // En multi-select el array llega acumulado; navegar al último elemento
                    const target = dbIds[dbIds.length - 1];

                    // Construir camino completo: elemento seleccionado → raíz
                    const path: number[] = [];
                    let cur: number | null = target;
                    const visited = new Set<number>();
                    while (cur !== null && !visited.has(cur)) {
                      path.unshift(cur); // prepend → orden raíz-primero
                      visited.add(cur);
                      cur = vr.getParentDbId(cur);
                    }

                    setHighlightedTreeDbId(target);
                    setTreeExpandPath(path);
                    setTreeOpen(true);
                  }}
                />
              </div>

              {/* ── Tabla de Propiedades — viewer mode only ── */}
              {mainTab === 'viewer' && tableOpen && viewerReady && (
                <div style={{ height: tableHeight }} className="shrink-0 bg-white border-t-2 border-slate-200 flex flex-col select-none relative">
                  {/* Drag handle para redimensionar */}
                  <div
                    onMouseDown={startTableResize}
                    className="absolute top-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-blue-400/30 active:bg-blue-400/50 transition-colors z-10"
                  />

                  {/* Header */}
                  <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50 mt-1">
                    <div className="flex items-center gap-3">
                      {/* Tab switcher */}
                      <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[9px] font-black">
                        <button
                          onClick={() => setTableTab('table')}
                          className={`flex items-center gap-1 px-2.5 py-1 transition ${tableTab === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                        >
                          <Table2 size={10} /> TABLA
                        </button>
                        <button
                          onClick={() => setTableTab('queue')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 transition ${tableTab === 'queue' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                        >
                          <Tag size={10} /> COLA DE TAGS
                          {tagQueue.length > 0 && (
                            <span className={`rounded-full w-4 h-4 flex items-center justify-center text-[8px] font-black ${tableTab === 'queue' ? 'bg-white/20' : 'bg-emerald-500 text-white'}`}>{tagQueue.length}</span>
                          )}
                        </button>
                        <button
                          onClick={() => setTableTab('cubicacion' as any)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 transition ${tableTab === ('cubicacion' as any) ? 'bg-orange-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                        >
                          <ListOrdered size={10} /> CUBICACIÓN
                          {cubicacionItems.length > 0 && (
                            <span className={`rounded-full w-4 h-4 flex items-center justify-center text-[8px] font-black ${tableTab === ('cubicacion' as any) ? 'bg-white/20' : 'bg-orange-500 text-white'}`}>{cubicacionItems.length}</span>
                          )}
                        </button>
                        <button
                          onClick={() => setTableTab('wbs' as any)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 transition ${tableTab === ('wbs' as any) ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                        >
                          <Workflow size={10} /> WBS
                        </button>
                      </div>
                      {tableTab === 'table' && tableRows.length > 0 && (
                        <span className="text-[9px] text-slate-400 font-bold">
                          {visibleTableRows.length}{visibleTableRows.length !== tableRows.length ? `/${tableRows.length}` : ''} elementos
                        </span>
                      )}
                      {tableTab === 'table' && tableLoading && tableProgress > 0 && (
                        <div className="flex items-center gap-1.5">
                          <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all" style={{ width: `${tableProgress}%` }} />
                          </div>
                          <span className="text-[9px] text-slate-400">{tableProgress}%</span>
                        </div>
                      )}
                      {tableTab === 'queue' && tagQueue.length > 0 && (
                        <button
                          onClick={() => { setTagQueue([]); tagQueueRef.current = []; setTagQueueFocusIdx(0); }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-slate-400 hover:text-red-500 hover:bg-red-50 transition font-bold"
                        >
                          <X size={9} /> Limpiar cola
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Calcular / Refresh */}
                      <button
                        onClick={() => loadTableRows()}
                        disabled={tableLoading || !activeNodes.length}
                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wide transition disabled:opacity-40"
                      >
                        {tableLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                        {tableRows.length ? 'Actualizar' : 'Cargar datos'}
                      </button>

                      {/* Menú agregar columna */}
                      <div className="relative">
                        <button
                          onClick={async () => {
                            if (!propPickerOpen) await discoverProperties(); // siempre fresco al abrir
                            setPropPickerOpen(v => !v);
                            setPickerCategory(null);
                            setPickerSearch('');
                            setAddingCustomCol(false);
                          }}
                          disabled={discoveringProps}
                          className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wide transition disabled:opacity-40"
                        >
                          {discoveringProps ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                          Columna
                        </button>

                        {/* Picker de propiedades del modelo */}
                        {propPickerOpen && (() => {
                          const q = pickerSearch.trim().toLowerCase();
                          // Con búsqueda: lista plana filtrada de todas las props
                          const searchResults: { category: string; attributeName: string; displayName: string }[] = [];
                          if (q) {
                            for (const cat of discoveredProps) {
                              for (const prop of cat.props) {
                                if (
                                  prop.displayName.toLowerCase().includes(q) ||
                                  prop.attributeName.toLowerCase().includes(q) ||
                                  cat.category.toLowerCase().includes(q)
                                ) {
                                  searchResults.push({ category: cat.category, attributeName: prop.attributeName, displayName: prop.displayName });
                                }
                              }
                            }
                          }
                          return (
                            <div className="absolute right-0 bottom-full mb-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl w-[440px] flex flex-col overflow-hidden" style={{ height: 420 }}>
                              {/* Header + buscador */}
                              <div className="shrink-0 px-3 pt-3 pb-2 border-b border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Propiedad del modelo</span>
                                  <button onClick={() => { setPropPickerOpen(false); setPickerCategory(null); setPickerSearch(''); }} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"><X size={11} /></button>
                                </div>
                                <input
                                  autoFocus
                                  value={pickerSearch}
                                  onChange={e => { setPickerSearch(e.target.value); setPickerCategory(null); }}
                                  placeholder="Buscar propiedad… (ej: Volume, CWP, EWP)"
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-400/30 bg-slate-50"
                                />
                              </div>

                              {q ? (
                                /* ── Resultados de búsqueda (lista plana) ── */
                                <div className="flex-1 overflow-y-auto">
                                  {searchResults.length === 0 && (
                                    <div className="px-4 py-6 text-center text-[9px] text-slate-400">Sin resultados para "{pickerSearch}"</div>
                                  )}
                                  {searchResults.map(({ category, attributeName, displayName }) => {
                                    const already = bimColumns.some(c => c.key === `bim__${category}__${attributeName}`);
                                    return (
                                      <button
                                        key={`${category}__${attributeName}`}
                                        onClick={() => { if (!already) addBimColumn(category, { attributeName, displayName }); }}
                                        disabled={already}
                                        className={`w-full text-left px-3 py-2 border-b border-slate-50 flex items-start gap-2 transition ${already ? 'opacity-40 cursor-default' : 'hover:bg-blue-50'}`}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <p className={`text-[10px] font-bold truncate ${already ? 'text-slate-400' : 'text-slate-800'}`}>{displayName}</p>
                                          <p className="text-[8px] text-slate-400 truncate">{category}</p>
                                        </div>
                                        {already && <span className="text-[8px] text-slate-300 shrink-0 pt-0.5">añadida</span>}
                                        {!already && <Plus size={10} className="shrink-0 text-blue-400 mt-0.5 opacity-0 group-hover:opacity-100" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                /* ── Vista por categorías (dos paneles) ── */
                                <div className="flex-1 overflow-hidden flex">
                                  <div className="w-[160px] border-r border-slate-100 overflow-y-auto shrink-0">
                                    {discoveredProps.length === 0 && (
                                      <div className="px-3 py-4 text-[9px] text-slate-400 text-center">Sin datos.<br/>Cargando modelo…</div>
                                    )}
                                    {discoveredProps.map(cat => (
                                      <button
                                        key={cat.category}
                                        onClick={() => setPickerCategory(cat.category)}
                                        className={`w-full text-left px-3 py-2 text-[9px] font-bold transition truncate ${pickerCategory === cat.category ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                                      >
                                        {cat.category}
                                        <span className={`ml-1 text-[8px] ${pickerCategory === cat.category ? 'text-blue-200' : 'text-slate-300'}`}>({cat.props.length})</span>
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex-1 overflow-y-auto">
                                    {!pickerCategory && (
                                      <div className="px-3 py-6 text-[9px] text-slate-400 text-center">← Elige una categoría<br/>o usa el buscador</div>
                                    )}
                                    {pickerCategory && (discoveredProps.find(c => c.category === pickerCategory)?.props ?? []).map(prop => {
                                      const already = bimColumns.some(c => c.key === `bim__${pickerCategory}__${prop.attributeName}`);
                                      return (
                                        <button
                                          key={prop.attributeName}
                                          onClick={() => { if (!already) addBimColumn(pickerCategory!, prop); }}
                                          disabled={already}
                                          className={`w-full text-left px-3 py-2 text-[9px] border-b border-slate-50 transition ${already ? 'text-slate-300 cursor-default' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-bold'}`}
                                        >
                                          {prop.displayName}
                                          {already && <span className="ml-1 text-[8px] text-slate-300">(añadida)</span>}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {/* Footer: columna personalizada + fórmula */}
                              <div className="shrink-0 border-t border-slate-100">
                                <button
                                  onClick={() => { setAddingCustomCol(true); setPropPickerOpen(false); setPickerSearch(''); }}
                                  className="w-full text-left px-3 py-2.5 text-[9px] font-black text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5 transition border-b border-slate-50"
                                >
                                  <Plus size={10} /> Columna personalizada
                                </button>
                                <button
                                  onClick={() => {
                                    setPropPickerOpen(false);
                                    setEditingFormula({ key: `formula__${Date.now()}`, label: '', rules: [{ id: `r${Date.now()}`, sourceColKey: bimColumns[0]?.key ?? '', operator: 'equals', matchValue: '', outputValue: '' }], defaultValue: '' });
                                  }}
                                  className="w-full text-left px-3 py-2.5 text-[9px] font-black text-violet-700 hover:bg-violet-50 flex items-center gap-1.5 transition"
                                >
                                  <Zap size={10} /> Columna fórmula (si → entonces)
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Input para columna personalizada */}
                        {addingCustomCol && (
                          <div className="absolute right-0 bottom-full mb-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl p-3 w-[260px]">
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-wider mb-2">Nueva columna personalizada</p>
                            <input
                              autoFocus
                              value={newCustomColName}
                              onChange={e => setNewCustomColName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') addCustomColumn(); if (e.key === 'Escape') { setAddingCustomCol(false); setNewCustomColName(''); }}}
                              placeholder="Nombre de la columna…"
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-400/30 mb-2"
                            />
                            <div className="flex gap-1.5">
                              <button onClick={addCustomColumn} disabled={!newCustomColName.trim()} className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg text-[9px] font-black hover:bg-emerald-700 transition disabled:opacity-30">Crear</button>
                              <button onClick={() => { setAddingCustomCol(false); setNewCustomColName(''); }} className="py-1.5 px-3 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black hover:bg-slate-200 transition">Cancelar</button>
                            </div>
                          </div>
                        )}
                      </div>

                      <button onClick={() => setTableOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
                        <X size={13} />
                      </button>
                    </div>
                  </div>

                  {/* ── Cola de Tags ── */}
                  {tableTab === 'queue' && (
                    <div className="flex-1 overflow-hidden flex">
                      {tagQueue.length === 0 ? (() => {
                        // Vista de revisión: muestra todos los elementos ya tageados agrupados por prefijo
                        const tagColKey = tagGenColKey || customColumns[0]?.key || '';
                        const taggedEntries = tagColKey
                          ? Object.entries(customValues).filter(([, cols]) => cols[tagColKey])
                          : [];

                        if (taggedEntries.length === 0) {
                          return (
                            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-300">
                              <Tag size={24} className="opacity-30" />
                              <p className="text-[10px] font-bold text-slate-400">Selecciona elementos en el visor para agregarlos a la cola</p>
                              <p className="text-[9px] text-slate-300">Los elementos aparecerán aquí en el orden en que los seleccionas</p>
                            </div>
                          );
                        }

                        // Agrupar por prefijo
                        const groupMap = new Map<string, { dbId: string; tag: string; name: string; groupColor: string }[]>();
                        for (const [dbId, cols] of taggedEntries) {
                          const tag = cols[tagColKey] ?? '';
                          const m = tag.match(/^([A-Za-z][A-Za-z0-9]{0,11})-\d+$/);
                          const prefix = m ? m[1].toUpperCase() : '—';
                          if (!groupMap.has(prefix)) groupMap.set(prefix, []);
                          const qItem = tagQueue.find(q => String(q.dbId) === dbId);
                          const tRow  = tableRows.find(r => String(r.dbId) === dbId);
                          const name  = qItem?.name || tRow?.elementName || `ID ${dbId}`;
                          const groupColor = qItem?.groupColor || tRow?.groupColor || '#94a3b8';
                          groupMap.get(prefix)!.push({ dbId, tag, name, groupColor });
                        }
                        const sortedGroups = Array.from(groupMap.entries())
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([prefix, elems]) => ({ prefix, elems: [...elems].sort((a, b) => a.tag.localeCompare(b.tag)) }));

                        return (
                          <div className="flex-1 overflow-hidden flex flex-col">
                            {/* Header */}
                            <div className="shrink-0 px-4 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                              <Tag size={12} className="text-emerald-600 shrink-0" />
                              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex-1">Tags Guardados</span>
                              <span className="text-[9px] text-slate-400">{taggedEntries.length} elemento{taggedEntries.length !== 1 ? 's' : ''}</span>
                            </div>
                            {/* Grupos */}
                            <div className="flex-1 overflow-y-auto">
                              {sortedGroups.map(({ prefix, elems }) => (
                                <div key={prefix}>
                                  {/* Cabecera del grupo */}
                                  <div className="sticky top-0 z-10 px-4 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
                                    <span className="px-2 py-0.5 bg-emerald-600 text-white rounded font-mono font-black text-[10px] tracking-widest">{prefix}</span>
                                    <span className="text-[9px] text-emerald-600 font-bold">{elems.length} elementos</span>
                                    <button
                                      onClick={() => { setTagGenPrefix(prefix); }}
                                      title="Cargar prefijo en generador"
                                      className="ml-auto p-1 text-emerald-400 hover:text-emerald-700 transition rounded"
                                    ><Tag size={10} /></button>
                                  </div>
                                  {/* Filas de elementos */}
                                  {elems.map(el => (
                                    <div
                                      key={el.dbId}
                                      className="group flex items-center gap-2 px-4 py-1.5 border-b border-slate-50 hover:bg-slate-50 transition-colors"
                                    >
                                      {/* Color del grupo BIM */}
                                      <div className="w-2.5 h-2.5 rounded-sm shrink-0 opacity-70" style={{ backgroundColor: el.groupColor }} />
                                      {/* TAG editable */}
                                      <input
                                        value={customValues[el.dbId]?.[tagColKey] ?? el.tag}
                                        onChange={async e => {
                                          const v = e.target.value;
                                          const nv = { ...customValues, [el.dbId]: { ...(customValues[el.dbId] ?? {}), [tagColKey]: v } };
                                          setCustomValues(nv);
                                          await setBimLinkerKey(project_id, 'table_custom_vals', nv);
                                        }}
                                        className="w-24 shrink-0 px-1.5 py-0.5 border border-transparent hover:border-emerald-300 focus:border-emerald-400 rounded font-mono font-black text-[10px] text-emerald-700 bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400/40 transition"
                                      />
                                      {/* Nombre del elemento */}
                                      <span className="flex-1 text-[10px] text-slate-600 truncate" title={el.name}>{el.name}</span>
                                      {/* Acciones */}
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                        <button
                                          onClick={() => { viewerRef.current?.select([Number(el.dbId)]); viewerRef.current?.fitToView([Number(el.dbId)]); }}
                                          title="Ver en visor"
                                          className="p-1 text-slate-400 hover:text-blue-600 transition rounded"
                                        ><MousePointerClick size={11} /></button>
                                        <button
                                          onClick={() => {
                                            const nv = { ...customValues };
                                            if (nv[el.dbId]) { delete nv[el.dbId][tagColKey]; }
                                            setCustomValues(nv);
                                            setBimLinkerKey(project_id, 'table_custom_vals', nv);
                                          }}
                                          title="Borrar tag"
                                          className="p-1 text-slate-400 hover:text-red-500 transition rounded"
                                        ><X size={11} /></button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })() : (
                        <>
                          {/* Lista izquierda */}
                          <div className="w-[240px] border-r border-slate-200 overflow-y-auto shrink-0 flex flex-col">
                            {(() => {
                              // Precalcular el tag proyectado para cada elemento de la cola
                              const activeColKey = tagGenColKey || customColumns[0]?.key || '';
                              let pendingOffset = 0; // cuántos sin tag hemos visto antes
                              return tagQueue.map((item, idx) => {
                                const stored = activeColKey
                                  ? (customValues[String(item.dbId)]?.[activeColKey] ?? '')
                                  : '';
                                let tagPreview = '';
                                let tagApplied = false;
                                if (tagGenPrefix && activeColKey) {
                                  if (stored) {
                                    tagPreview = stored;
                                    tagApplied = true;
                                  } else {
                                    tagPreview = `${tagGenPrefix}-${String(tagGenCounter + pendingOffset).padStart(tagGenPadding, '0')}`;
                                    pendingOffset++;
                                  }
                                }
                                return (
                                  <div
                                    key={item.dbId}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => { setTagQueueFocusIdx(idx); viewerRef.current?.select([item.dbId]); viewerRef.current?.fitToView([item.dbId]); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setTagQueueFocusIdx(idx); viewerRef.current?.select([item.dbId]); viewerRef.current?.fitToView([item.dbId]); } }}
                                    className={`w-full text-left px-3 py-2 border-b border-slate-100 flex items-center gap-2 transition group cursor-pointer ${idx === tagQueueFocusIdx ? 'bg-emerald-50 border-l-2 border-l-emerald-500' : 'hover:bg-slate-50'}`}
                                  >
                                    <span className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-black shrink-0 ${idx === tagQueueFocusIdx ? 'bg-emerald-500 text-white' : tagApplied ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</span>
                                    <div className="flex-1 min-w-0">
                                      {item.loading ? (
                                        <div className="h-3 bg-slate-200 rounded animate-pulse w-3/4" />
                                      ) : (
                                        <>
                                          <p className="text-[10px] font-bold text-slate-700 truncate">{item.name}</p>
                                          {/* Preview del tag — verde oscuro si ya aplicado, verde claro si proyectado */}
                                          {tagPreview && (
                                            <p className={`text-[9px] font-black font-mono mt-0.5 truncate ${tagApplied ? 'text-emerald-600' : 'text-emerald-400'}`}>
                                              {tagPreview}
                                              {!tagApplied && <span className="text-emerald-300 font-normal ml-0.5 text-[8px]">↗</span>}
                                            </p>
                                          )}
                                          {!tagPreview && item.groupValue && (
                                            <div className="flex items-center gap-1 mt-0.5">
                                              <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: item.groupColor }} />
                                              <span className="text-[8px] text-slate-400 truncate">{item.groupValue}</span>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        const next = tagQueue.filter((_, i) => i !== idx);
                                        setTagQueue(next);
                                        tagQueueRef.current = next;
                                        if (tagQueueFocusIdx >= next.length) setTagQueueFocusIdx(Math.max(0, next.length - 1));
                                      }}
                                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-red-400 transition rounded shrink-0"
                                    >
                                      <X size={9} />
                                    </button>
                                  </div>
                                );
                              });
                            })()}
                          </div>

                          {/* Panel derecho: detalle + edición del elemento activo */}
                          {(() => {
                            const item = tagQueue[tagQueueFocusIdx];
                            if (!item) return null;

                            // Valor generado por el tag automático
                            // El número correcto = contador base + cuántos elementos SIN tag vienen antes del enfocado
                            const activeColKey = tagGenColKey || customColumns[0]?.key || '';
                            const storedForFocused = activeColKey ? (customValues[String(item.dbId)]?.[activeColKey] ?? '') : '';
                            let pendingBefore = 0;
                            if (tagGenPrefix && activeColKey && !storedForFocused) {
                              for (let j = 0; j < tagQueueFocusIdx; j++) {
                                const prevStored = customValues[String(tagQueue[j].dbId)]?.[activeColKey] ?? '';
                                if (!prevStored) pendingBefore++;
                              }
                            }
                            const generatedTag = tagGenPrefix && activeColKey && !storedForFocused
                              ? `${tagGenPrefix}-${String(tagGenCounter + pendingBefore).padStart(tagGenPadding, '0')}`
                              : storedForFocused; // si ya tiene valor, mostrar el guardado

                            const codebookMatch = tagCodebook.find(e => e.prefix.toUpperCase() === tagGenPrefix.toUpperCase());

                            // Guardar valor en customValues
                            const saveColValue = async (dbId: number, colKey: string, val: string) => {
                              const strId = String(dbId);
                              const nextVals = { ...customValues, [strId]: { ...(customValues[strId] ?? {}), [colKey]: val } };
                              setCustomValues(nextVals);
                              await setBimLinkerKey(project_id, 'table_custom_vals', nextVals);
                            };

                            // Aplicar tag generado y pasar al siguiente
                            const applyTagAndNext = async () => {
                              if (!generatedTag || !activeColKey) return;
                              await saveColValue(item.dbId, activeColKey, generatedTag);
                              // Saltar contador al número justo después del que se acaba de aplicar
                              setTagGenCounter(tagGenCounter + pendingBefore + 1);
                              if (tagQueueFocusIdx < tagQueue.length - 1) {
                                const next = tagQueueFocusIdx + 1;
                                setTagQueueFocusIdx(next);
                                viewerRef.current?.select([tagQueue[next].dbId]);
                              }
                            };

                            return (
                              <div className="flex-1 overflow-y-auto flex flex-col">

                                {/* ── Generador de Tags ── */}
                                <div className="shrink-0 bg-emerald-50 border-b border-emerald-200 px-4 py-3">
                                  <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <Tag size={10} /> Tag Automático
                                  </p>
                                  <div className="flex items-end gap-2 flex-wrap">
                                    {/* Prefijo */}
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[8px] font-black text-emerald-600 uppercase tracking-wider">Prefijo</label>
                                      <input
                                        value={tagGenPrefix}
                                        onChange={e => setTagGenPrefix(e.target.value.toUpperCase())}
                                        placeholder="Ej: MHA"
                                        maxLength={12}
                                        className="w-24 px-2 py-1.5 border border-emerald-300 rounded-lg text-[11px] font-black text-emerald-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40 placeholder:text-emerald-200 placeholder:font-normal uppercase"
                                      />
                                    </div>
                                    {/* Desde número */}
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[8px] font-black text-emerald-600 uppercase tracking-wider">Desde</label>
                                      <input
                                        type="number"
                                        min={1}
                                        value={tagGenCounter}
                                        onChange={e => setTagGenCounter(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-16 px-2 py-1.5 border border-emerald-300 rounded-lg text-[11px] font-mono text-emerald-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                                      />
                                    </div>
                                    {/* Dígitos */}
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[8px] font-black text-emerald-600 uppercase tracking-wider">Dígitos</label>
                                      <select
                                        value={tagGenPadding}
                                        onChange={e => setTagGenPadding(Number(e.target.value))}
                                        className="w-14 px-1.5 py-1.5 border border-emerald-300 rounded-lg text-[11px] font-mono text-emerald-800 bg-white focus:outline-none"
                                      >
                                        <option value={2}>2</option>
                                        <option value={3}>3</option>
                                        <option value={4}>4</option>
                                      </select>
                                    </div>
                                    {/* Columna destino */}
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[8px] font-black text-emerald-600 uppercase tracking-wider">En columna</label>
                                      {customColumns.length > 0 ? (
                                        <select
                                          value={tagGenColKey || customColumns[0]?.key}
                                          onChange={e => setTagGenColKey(e.target.value)}
                                          className="px-1.5 py-1.5 border border-emerald-300 rounded-lg text-[11px] text-emerald-800 bg-white focus:outline-none"
                                        >
                                          {customColumns.map(c => (
                                            <option key={c.key} value={c.key}>{c.label}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <button
                                          onClick={async () => {
                                            const key = `custom_${Date.now()}`;
                                            const newCol = { key, label: 'TAG' };
                                            const next = [newCol];
                                            setCustomColumns(next);
                                            setTagGenColKey(key);
                                            await setBimLinkerKey(project_id, 'table_custom_cols', next);
                                          }}
                                          className="flex items-center gap-1 px-2 py-1.5 border border-dashed border-emerald-400 rounded-lg text-[10px] font-black text-emerald-600 hover:bg-emerald-100 transition whitespace-nowrap"
                                        >
                                          <Plus size={10} /> Crear columna TAG
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Preview + botón aplicar */}
                                  {tagGenPrefix && (tagGenColKey || customColumns.length > 0) && (
                                    <div className="mt-3 flex items-center gap-3">
                                      <div className="flex items-center gap-2 bg-white border border-emerald-300 rounded-lg px-3 py-2 flex-1">
                                        <Tag size={11} className="text-emerald-500 shrink-0" />
                                        <span className="text-[14px] font-black text-emerald-700 font-mono tracking-widest">{generatedTag}</span>
                                      </div>
                                      <button
                                        onClick={applyTagAndNext}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-[10px] font-black uppercase tracking-wide transition shadow-sm shrink-0"
                                      >
                                        <Check size={12} /> Aplicar y Sig <ChevronRight size={11} />
                                      </button>
                                      <button
                                        onClick={async () => {
                                          if (!generatedTag || !activeColKey) return;
                                          // Aplicar tag proyectado a TODOS los elementos sin tag en la cola
                                          let offset = 0;
                                          const newVals = JSON.parse(JSON.stringify(customValues));
                                          for (const qi of tagQueue) {
                                            const stored = newVals[String(qi.dbId)]?.[activeColKey] ?? '';
                                            if (stored) continue;
                                            const tag = `${tagGenPrefix}-${String(tagGenCounter + offset).padStart(tagGenPadding, '0')}`;
                                            newVals[String(qi.dbId)] = { ...(newVals[String(qi.dbId)] ?? {}), [activeColKey]: tag };
                                            // Codebook auto-fill
                                            if (codebookMatch) {
                                              const catKey = codebookMatch.catColKey ?? customColumns.find(c => /categ|descri|tipo/i.test(c.label))?.key;
                                              if (catKey) newVals[String(qi.dbId)][catKey] = codebookMatch.description;
                                            }
                                            offset++;
                                          }
                                          setCustomValues(newVals);
                                          await setBimLinkerKey(project_id, 'table_custom_vals', newVals);
                                          setTagGenCounter(c => c + offset);
                                          setTableTab('cubicacion' as any);
                                        }}
                                        disabled={!tagGenPrefix || !activeColKey || tagQueue.length === 0}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white rounded-lg text-[10px] font-black uppercase tracking-wide transition shadow-sm shrink-0 disabled:opacity-40"
                                        title="Aplicar tags consecutivos a TODOS los elementos de la cola"
                                      >
                                        <Check size={12} /> Taggear Todo <ListOrdered size={11} />
                                      </button>
                                    </div>
                                  )}
                                  {!tagGenPrefix && (
                                    <p className="mt-2 text-[9px] text-emerald-400 italic">Escribe un prefijo para activar el tag automático (ej: MHA, VHA, LOS…)</p>
                                  )}
                                </div>

                                {/* ── Info del elemento + nav ── */}
                                <div className="shrink-0 px-4 pt-3 pb-2 flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Elemento {tagQueueFocusIdx + 1} / {tagQueue.length}</p>
                                    {item.loading ? (
                                      <div className="h-4 bg-slate-200 rounded animate-pulse w-48" />
                                    ) : (
                                      <p className="text-[13px] font-black text-slate-800">{item.name}</p>
                                    )}
                                    {item.groupValue && (
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: item.groupColor }} />
                                        <span className="text-[10px] font-bold text-slate-500">{item.groupValue}</span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      disabled={tagQueueFocusIdx === 0}
                                      onClick={() => { const i = tagQueueFocusIdx - 1; setTagQueueFocusIdx(i); viewerRef.current?.select([tagQueue[i].dbId]); }}
                                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 disabled:opacity-30 transition"
                                    >
                                      <ChevronLeft size={13} />
                                    </button>
                                    <button
                                      disabled={tagQueueFocusIdx >= tagQueue.length - 1}
                                      onClick={() => { const i = tagQueueFocusIdx + 1; setTagQueueFocusIdx(i); viewerRef.current?.select([tagQueue[i].dbId]); }}
                                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 disabled:opacity-30 transition"
                                    >
                                      <ChevronRight size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* ── Columnas: cabecera con selector ── */}
                                <div className="shrink-0 px-4 pt-2 pb-1 flex items-center justify-between relative">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                    Campos
                                    {queueVisibleCols.length > 0 && (
                                      <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[8px]">{queueVisibleCols.length} selec.</span>
                                    )}
                                  </span>
                                  <button
                                    onClick={() => setShowQueueColPicker(v => !v)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black transition ${showQueueColPicker ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                    title="Elegir qué columnas mostrar aquí"
                                  >
                                    <Pencil size={9} /> Columnas
                                  </button>

                                  {/* Picker flotante */}
                                  {showQueueColPicker && (
                                    <div className="absolute top-full right-4 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl w-[260px] overflow-hidden">
                                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Columnas visibles en la cola</span>
                                        <button onClick={() => setShowQueueColPicker(false)} className="text-slate-400 hover:text-slate-600 transition"><X size={10} /></button>
                                      </div>
                                      <div className="max-h-[260px] overflow-y-auto divide-y divide-slate-50">
                                        {/* Columnas personalizadas */}
                                        {customColumns.length > 0 && (
                                          <>
                                            <div className="px-3 py-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Personalizadas</div>
                                            {customColumns.map(col => {
                                              const checked = queueVisibleCols.length === 0 || queueVisibleCols.includes(col.key);
                                              return (
                                                <label key={col.key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                                                  <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                      // Si está en modo "todas visibles" (vacío), inicializar con todas excepto esta
                                                      const currentSet = queueVisibleCols.length === 0
                                                        ? [...customColumns.map(c => c.key), ...bimColumns.map(c => c.key)]
                                                        : [...queueVisibleCols];
                                                      const next = checked
                                                        ? currentSet.filter(k => k !== col.key)
                                                        : [...currentSet, col.key];
                                                      setQueueVisibleCols(next);
                                                      setBimLinkerKey(project_id, 'queue_visible_cols', next);
                                                    }}
                                                    className="w-3.5 h-3.5 accent-blue-600 rounded"
                                                  />
                                                  <span className="text-[10px] font-bold text-slate-700 flex-1 truncate">{col.label}</span>
                                                  <span className="text-[8px] text-slate-300 font-mono">personalizada</span>
                                                </label>
                                              );
                                            })}
                                          </>
                                        )}
                                        {/* Columnas BIM */}
                                        {bimColumns.length > 0 && (
                                          <>
                                            <div className="px-3 py-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">Propiedades BIM</div>
                                            {bimColumns.map(col => {
                                              const checked = queueVisibleCols.length === 0 || queueVisibleCols.includes(col.key);
                                              return (
                                                <label key={col.key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                                                  <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => {
                                                      const currentSet = queueVisibleCols.length === 0
                                                        ? [...customColumns.map(c => c.key), ...bimColumns.map(c => c.key)]
                                                        : [...queueVisibleCols];
                                                      const next = checked
                                                        ? currentSet.filter(k => k !== col.key)
                                                        : [...currentSet, col.key];
                                                      setQueueVisibleCols(next);
                                                      setBimLinkerKey(project_id, 'queue_visible_cols', next);
                                                    }}
                                                    className="w-3.5 h-3.5 accent-blue-600 rounded"
                                                  />
                                                  <span className="text-[10px] font-bold text-slate-700 flex-1 truncate">{col.displayName}</span>
                                                  <span className="text-[8px] text-slate-300 font-mono truncate max-w-[60px]">{col.category}</span>
                                                </label>
                                              );
                                            })}
                                          </>
                                        )}
                                        {customColumns.length === 0 && bimColumns.length === 0 && (
                                          <div className="px-3 py-4 text-[9px] text-slate-400 text-center italic">Sin columnas disponibles.<br/>Crea columnas en la pestaña Tabla.</div>
                                        )}
                                      </div>
                                      {/* Botón "mostrar todas" */}
                                      {queueVisibleCols.length > 0 && (
                                        <div className="px-3 py-2 border-t border-slate-100">
                                          <button
                                            onClick={() => { setQueueVisibleCols([]); setBimLinkerKey(project_id, 'queue_visible_cols', []); }}
                                            className="w-full py-1.5 text-[9px] font-black text-slate-500 hover:bg-slate-100 rounded-lg transition"
                                          >
                                            Mostrar todas
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* ── Campos visibles del elemento ── */}
                                <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3">
                                  {customColumns.length === 0 && bimColumns.length === 0 ? (
                                    <div className="text-[9px] text-slate-300 italic mt-2">
                                      Crea columnas en la pestaña <strong>Tabla</strong> con el botón + Columna
                                    </div>
                                  ) : (
                                    <>
                                      {/* Columnas personalizadas editables (filtradas) */}
                                      {(() => {
                                        const visibleCustom = customColumns.filter(col =>
                                          queueVisibleCols.length === 0 || queueVisibleCols.includes(col.key)
                                        );
                                        if (visibleCustom.length === 0) return null;
                                        const lastIdx = visibleCustom.length - 1;
                                        return (
                                          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-1">
                                            {visibleCustom.map((col, colIdx) => {
                                              const stored = customValues[String(item.dbId)]?.[col.key] ?? '';
                                              const isTagTarget = (tagGenColKey || customColumns[0]?.key) === col.key;
                                              return (
                                                <div key={col.key} className={`flex flex-col gap-1 ${isTagTarget && tagGenPrefix ? 'col-span-2' : ''}`}>
                                                  <label className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${isTagTarget && tagGenPrefix ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                    {isTagTarget && tagGenPrefix && <Tag size={9} />}
                                                    {col.label}
                                                  </label>
                                                  <input
                                                    value={stored}
                                                    onChange={async e => saveColValue(item.dbId, col.key, e.target.value)}
                                                    onKeyDown={async e => {
                                                      if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        if (isTagTarget && tagGenPrefix && generatedTag && !stored) {
                                                          await applyTagAndNext();
                                                        } else if (colIdx === lastIdx) {
                                                          if (tagQueueFocusIdx < tagQueue.length - 1) {
                                                            const next = tagQueueFocusIdx + 1;
                                                            setTagQueueFocusIdx(next);
                                                            viewerRef.current?.select([tagQueue[next].dbId]);
                                                          }
                                                        }
                                                      }
                                                      if (e.key === 'Tab' && colIdx === lastIdx) {
                                                        e.preventDefault();
                                                        if (tagQueueFocusIdx < tagQueue.length - 1) {
                                                          const next = tagQueueFocusIdx + 1;
                                                          setTagQueueFocusIdx(next);
                                                          viewerRef.current?.select([tagQueue[next].dbId]);
                                                        }
                                                      }
                                                    }}
                                                    placeholder={isTagTarget && tagGenPrefix ? generatedTag : `Escribir ${col.label}…`}
                                                    className={`px-2.5 py-1.5 border rounded-lg text-[11px] focus:outline-none transition bg-white ${isTagTarget && tagGenPrefix ? 'border-emerald-300 focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-500 placeholder:text-emerald-300 placeholder:font-black placeholder:font-mono' : 'border-slate-200 focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400'}`}
                                                  />
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      })()}

                                      {/* Columnas BIM visibles (lectura) */}
                                      {(() => {
                                        const visibleBim = bimColumns.filter(col =>
                                          queueVisibleCols.length === 0 || queueVisibleCols.includes(col.key)
                                        );
                                        if (visibleBim.length === 0) return null;
                                        return (
                                          <div className="border-t border-slate-100 pt-3 mt-1">
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                              {visibleBim.map(col => {
                                                const row = tableRows.find(r => r.dbId === item.dbId);
                                                const val = row?.bimProps[col.key] ?? '—';
                                                return (
                                                  <div key={col.key} className="flex flex-col gap-0.5 bg-slate-50 rounded-lg px-2.5 py-2">
                                                    <span className="text-[8px] font-black text-slate-400 truncate uppercase tracking-wide">{col.displayName}</span>
                                                    <span className="text-[11px] font-mono font-bold text-slate-700 truncate">{val}</span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  )}

                  {/* ── Cubicación ── */}
                  {tableTab === ('cubicacion' as any) && (() => {
                    const tagColKey = tagGenColKey || customColumns[0]?.key || '';

                    // Prefijos disponibles: del codebook + extraídos de valores ya tageados
                    const availablePrefixes = Array.from(new Set([
                      ...tagCodebook.map(e => e.prefix.toUpperCase()),
                      ...Object.values(customValues).flatMap(cols => {
                        const tv = tagColKey ? (cols[tagColKey] ?? '') : '';
                        const m = tv.match(/^([A-Z][A-Z0-9]{1,11})-\d+$/i);
                        return m ? [m[1].toUpperCase()] : [];
                      }),
                    ])).sort();

                    // Obtener elementos de un ítem (con tag, nombre y cantidad)
                    const getItemElements = (item: CubicacionItem) => {
                      const prefix = item.tagPrefix.toUpperCase();
                      const elems: { dbId: string; tag: string; name: string; qty: string }[] = [];
                      Object.entries(customValues).forEach(([dbId, cols]) => {
                        const tagVal = cols[tagColKey] ?? '';
                        if (!tagVal.toUpperCase().startsWith(prefix + '-') && tagVal.toUpperCase() !== prefix) return;
                        const queueItem = tagQueue.find(q => String(q.dbId) === dbId);
                        const tableRow  = tableRows.find(r => String(r.dbId) === dbId);
                        const name = queueItem?.name || tableRow?.elementName || `ID ${dbId}`;
                        const qty  = item.quantityColKey ? (cols[item.quantityColKey] ?? '') : '';
                        elems.push({ dbId, tag: tagVal, name, qty });
                      });
                      elems.sort((a, b) => a.tag.localeCompare(b.tag));
                      return elems;
                    };

                    // Calcular totales por ítem
                    const computeTotals = (item: CubicacionItem) => {
                      const elems = getItemElements(item);
                      const total = elems.reduce((s, e) => { const q = parseFloat(e.qty); return s + (isNaN(q) ? 0 : q); }, 0);
                      return { count: elems.length, total };
                    };
                    const saveCubicacion = async (items: CubicacionItem[]) => {
                      setCubicacionItems(items);
                      await setBimLinkerKey(project_id, 'cubicacion_items', items);
                    };
                    return (
                      <div className="flex-1 overflow-hidden flex flex-col">
                        {/* Toolbar */}
                        <div className="shrink-0 px-4 py-2 flex items-center gap-3 border-b border-slate-100 bg-slate-50/60">
                          <ListOrdered size={13} className="text-slate-500 shrink-0" />
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex-1">Ítems de Cubicación</span>
                          <button
                            onClick={() => {
                              const id = `cub_${Date.now()}`;
                              setEditingCubId(id);
                              setNewCubItem({ id, itemCode: '', description: '', tagPrefix: '', quantityColKey: customColumns[0]?.key ?? '', unit: 'm³' });
                            }}
                            className="flex items-center gap-1.5 px-3 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-[9px] font-black uppercase tracking-wide transition shadow-sm"
                          >
                            <Plus size={10} /> Agregar Ítem
                          </button>
                        </div>

                        {/* Tabla de ítems */}
                        <div className="flex-1 overflow-auto">
                          <table className="w-full text-[10px] border-collapse">
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-slate-50">
                                <th className="text-left px-3 py-2 text-[8px] font-black text-slate-500 uppercase tracking-wider border-b border-r border-slate-100 w-[100px]">Código</th>
                                <th className="text-left px-3 py-2 text-[8px] font-black text-slate-500 uppercase tracking-wider border-b border-r border-slate-100 min-w-[180px]">Descripción</th>
                                <th className="text-left px-3 py-2 text-[8px] font-black text-slate-500 uppercase tracking-wider border-b border-r border-slate-100 w-[100px]">Columna Qty</th>
                                <th className="text-left px-3 py-2 text-[8px] font-black text-slate-500 uppercase tracking-wider border-b border-r border-slate-100 w-[50px]">Unidad</th>
                                <th className="text-left px-3 py-2 text-[8px] font-black text-slate-500 uppercase tracking-wider border-b border-r border-slate-100 w-[50px]">Elem.</th>
                                <th className="text-left px-3 py-2 text-[8px] font-black text-slate-500 uppercase tracking-wider border-b border-r border-slate-100 w-[110px]">Total</th>
                                <th className="text-left px-3 py-2 text-[8px] font-black text-slate-500 uppercase tracking-wider border-b border-r border-slate-100 w-[90px]">TAG</th>
                                <th className="border-b border-slate-100 w-[80px]" />
                              </tr>
                            </thead>
                            <tbody>
                              {/* Fila nueva */}
                              {editingCubId === newCubItem.id && newCubItem.id && (
                                <tr className="bg-slate-50/60">
                                  {(['itemCode','description'] as const).map(field => (
                                    <td key={field} className="px-2 py-1 border-b border-r border-slate-100">
                                      <input
                                        autoFocus={field === 'itemCode'}
                                        value={newCubItem[field] ?? ''}
                                        onChange={e => setNewCubItem(p => ({ ...p, [field]: e.target.value }))}
                                        placeholder={field === 'itemCode' ? '01.02.03' : 'Descripción…'}
                                        className="w-full px-1.5 py-1 border border-slate-300 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-slate-400"
                                      />
                                    </td>
                                  ))}
                                  <td className="px-2 py-1 border-b border-r border-slate-100">
                                    <select value={newCubItem.quantityColKey ?? ''} onChange={e => setNewCubItem(p => ({ ...p, quantityColKey: e.target.value }))} className="w-full px-1 py-1 border border-slate-300 rounded text-[9px] focus:outline-none">
                                      <option value="">— ninguna —</option>
                                      {customColumns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-2 py-1 border-b border-r border-slate-100">
                                    <input value={newCubItem.unit ?? ''} onChange={e => setNewCubItem(p => ({ ...p, unit: e.target.value }))} placeholder="m³" className="w-full px-1.5 py-1 border border-slate-300 rounded text-[10px] focus:outline-none" />
                                  </td>
                                  <td className="px-2 py-1 border-b border-r border-slate-100 text-slate-300 text-center">—</td>
                                  <td className="px-2 py-1 border-b border-r border-slate-100 text-slate-300 text-center">—</td>
                                  <td className="px-2 py-1 border-b border-r border-slate-100">
                                    <select
                                      value={newCubItem.tagPrefix ?? ''}
                                      onChange={e => setNewCubItem(p => ({ ...p, tagPrefix: e.target.value }))}
                                      className="w-full px-1 py-1 border border-slate-300 rounded text-[9px] focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white font-mono font-black text-emerald-700"
                                    >
                                      <option value="">— prefijo —</option>
                                      {availablePrefixes.map(pf => <option key={pf} value={pf}>{pf}</option>)}
                                      <option value="__custom__">✏ otro…</option>
                                    </select>
                                    {newCubItem.tagPrefix === '__custom__' && (
                                      <input
                                        autoFocus
                                        placeholder="MHA"
                                        className="mt-1 w-full px-1.5 py-1 border border-slate-300 rounded text-[10px] font-mono font-black uppercase focus:outline-none focus:ring-1 focus:ring-slate-400"
                                        onChange={e => setNewCubItem(p => ({ ...p, tagPrefix: e.target.value.toUpperCase() }))}
                                      />
                                    )}
                                  </td>
                                  <td className="px-2 py-1 border-b border-slate-100">
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => {
                                          if (!newCubItem.itemCode || !newCubItem.description || !newCubItem.tagPrefix) return;
                                          const item = newCubItem as CubicacionItem;
                                          saveCubicacion([...cubicacionItems, item]);
                                          setEditingCubId(null); setNewCubItem({});
                                        }}
                                        className="px-2 py-1 bg-slate-700 text-white rounded text-[8px] font-black hover:bg-slate-800 transition"
                                      >OK</button>
                                      <button onClick={() => { setEditingCubId(null); setNewCubItem({}); }} className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-[8px] font-black hover:bg-slate-200 transition">✕</button>
                                    </div>
                                  </td>
                                </tr>
                              )}

                              {/* Ítems existentes */}
                              {cubicacionItems.length === 0 && editingCubId !== newCubItem.id && (
                                <tr>
                                  <td colSpan={8} className="px-4 py-8 text-center text-[10px] text-slate-400">
                                    <ListOrdered size={20} className="mx-auto mb-2 opacity-20" />
                                    Agrega ítems del itemizado con el botón <strong>+ Agregar Ítem</strong>
                                  </td>
                                </tr>
                              )}
                              {cubicacionItems.map(item => {
                                const { count, total } = computeTotals(item);
                                const isEditing = editingCubId === item.id && editingCubId !== newCubItem.id;
                                if (isEditing) {
                                  const draft = newCubItem;
                                  return (
                                    <tr key={item.id} className="bg-slate-50/40">
                                      {(['itemCode','description'] as const).map(field => (
                                        <td key={field} className="px-2 py-1 border-b border-r border-slate-100">
                                          <input autoFocus={field === 'itemCode'} value={draft[field] ?? item[field]} onChange={e => setNewCubItem(p => ({ ...p, [field]: e.target.value }))} className="w-full px-1.5 py-1 border border-slate-300 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-slate-400" />
                                        </td>
                                      ))}
                                      <td className="px-2 py-1 border-b border-r border-slate-100">
                                        <select value={draft.quantityColKey ?? item.quantityColKey} onChange={e => setNewCubItem(p => ({ ...p, quantityColKey: e.target.value }))} className="w-full px-1 py-1 border border-slate-300 rounded text-[9px] focus:outline-none">
                                          <option value="">— ninguna —</option>
                                          {customColumns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                        </select>
                                      </td>
                                      <td className="px-2 py-1 border-b border-r border-slate-100">
                                        <input value={draft.unit ?? item.unit} onChange={e => setNewCubItem(p => ({ ...p, unit: e.target.value }))} className="w-full px-1.5 py-1 border border-slate-300 rounded text-[10px] focus:outline-none" />
                                      </td>
                                      <td className="px-2 py-1 border-b border-r border-slate-100 text-slate-400">{count}</td>
                                      <td className="px-2 py-1 border-b border-r border-slate-100 text-slate-400">{total > 0 ? total.toFixed(3) : '—'}</td>
                                      <td className="px-2 py-1 border-b border-r border-slate-100">
                                        <select
                                          value={draft.tagPrefix ?? item.tagPrefix}
                                          onChange={e => setNewCubItem(p => ({ ...p, tagPrefix: e.target.value }))}
                                          className="w-full px-1 py-1 border border-slate-300 rounded text-[9px] focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white font-mono font-black text-emerald-700"
                                        >
                                          <option value="">— prefijo —</option>
                                          {availablePrefixes.map(pf => <option key={pf} value={pf}>{pf}</option>)}
                                          <option value="__custom__">✏ otro…</option>
                                        </select>
                                        {(draft.tagPrefix ?? item.tagPrefix) === '__custom__' && (
                                          <input
                                            autoFocus
                                            placeholder="MHA"
                                            className="mt-1 w-full px-1.5 py-1 border border-slate-300 rounded text-[10px] font-mono font-black uppercase focus:outline-none focus:ring-1 focus:ring-slate-400"
                                            onChange={e => setNewCubItem(p => ({ ...p, tagPrefix: e.target.value.toUpperCase() }))}
                                          />
                                        )}
                                      </td>
                                      <td className="px-2 py-1 border-b border-slate-100">
                                        <div className="flex gap-1">
                                          <button onClick={() => { const updated = cubicacionItems.map(x => x.id === item.id ? { ...item, ...newCubItem } as CubicacionItem : x); saveCubicacion(updated); setEditingCubId(null); setNewCubItem({}); }} className="px-2 py-1 bg-slate-700 text-white rounded text-[8px] font-black hover:bg-slate-800 transition">OK</button>
                                          <button onClick={() => { setEditingCubId(null); setNewCubItem({}); }} className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-[8px] font-black hover:bg-slate-200 transition">✕</button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                }
                                const expanded = expandedCubIds.has(item.id);
                                const elems   = expanded ? getItemElements(item) : [];
                                return (
                                  <Fragment key={item.id}>
                                    {/* Fila cabecera del ítem */}
                                    <tr className="group bg-white hover:bg-slate-50/80 transition-colors cursor-pointer" onClick={() => setExpandedCubIds(prev => { const s = new Set(prev); s.has(item.id) ? s.delete(item.id) : s.add(item.id); return s; })}>
                                      <td className="px-3 py-2 border-b border-r border-slate-100">
                                        <div className="flex items-center gap-1.5">
                                          {expanded ? <ChevronDown size={11} className="text-slate-400 shrink-0" /> : <ChevronRight size={11} className="text-slate-300 shrink-0" />}
                                          <span className="font-mono font-black text-slate-700">{item.itemCode}</span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 border-b border-r border-slate-100 font-bold text-slate-700">{item.description}</td>
                                      <td className="px-3 py-2 border-b border-r border-slate-100 text-slate-500 text-[9px]">{customColumns.find(c => c.key === item.quantityColKey)?.label ?? <span className="text-slate-300 italic">sin col.</span>}</td>
                                      <td className="px-3 py-2 border-b border-r border-slate-100 text-slate-500 font-mono">{item.unit}</td>
                                      <td className="px-3 py-2 border-b border-r border-slate-100 font-black text-slate-700 text-center">{count}</td>
                                      <td className="px-3 py-2 border-b border-r border-slate-100">
                                        {total > 0 ? <span className="font-black text-slate-700 font-mono">{total.toFixed(3)} <span className="font-normal text-slate-400 text-[8px]">{item.unit}</span></span> : <span className="text-slate-300 italic text-[9px]">sin datos</span>}
                                      </td>
                                      <td className="px-3 py-2 border-b border-r border-slate-100">
                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono font-black text-[9px]">{item.tagPrefix}</span>
                                          <button onClick={() => { setTagGenPrefix(item.tagPrefix); setTableTab('queue'); }} title="Ir a taggear" className="p-0.5 text-slate-400 hover:text-emerald-600 transition"><Tag size={10} /></button>
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 border-b border-slate-100" onClick={e => e.stopPropagation()}>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                          <button onClick={() => { setEditingCubId(item.id); setNewCubItem({ ...item }); }} className="p-1 text-slate-400 hover:text-blue-600 transition rounded"><Pencil size={11} /></button>
                                          <button onClick={() => saveCubicacion(cubicacionItems.filter(x => x.id !== item.id))} className="p-1 text-slate-400 hover:text-red-500 transition rounded"><Trash2 size={11} /></button>
                                        </div>
                                      </td>
                                    </tr>
                                    {/* Filas de elementos expandidos */}
                                    {expanded && elems.map(el => (
                                      <tr key={el.dbId} className="bg-slate-50/30 hover:bg-slate-50 transition-colors">
                                        <td className="pl-8 pr-3 py-1.5 border-b border-r border-slate-100">
                                          <span className="font-mono font-black text-[9px] text-slate-500">{el.tag}</span>
                                        </td>
                                        <td className="px-3 py-1.5 border-b border-r border-slate-100 text-slate-600 text-[9px] truncate max-w-[200px]" title={el.name}>{el.name}</td>
                                        <td className="px-3 py-1.5 border-b border-r border-slate-100">
                                          <span className="text-[8px] text-slate-400">{customColumns.find(c => c.key === item.quantityColKey)?.label ?? 'cantidad'}</span>
                                        </td>
                                        <td className="px-3 py-1.5 border-b border-r border-slate-100 text-slate-400 text-[9px] font-mono">{item.unit}</td>
                                        <td className="border-b border-r border-slate-100" />
                                        <td className="px-2 py-1 border-b border-r border-slate-100">
                                          <input
                                            value={el.qty}
                                            onChange={async e => {
                                              const newVals = { ...customValues, [el.dbId]: { ...(customValues[el.dbId] ?? {}), [item.quantityColKey]: e.target.value } };
                                              setCustomValues(newVals);
                                              await setBimLinkerKey(project_id, 'table_custom_vals', newVals);
                                            }}
                                            placeholder="0.000"
                                            className="w-24 px-2 py-0.5 border border-slate-200 rounded text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400"
                                          />
                                        </td>
                                        <td className="border-b border-r border-slate-100">
                                          <span className="font-mono font-black text-[9px] text-emerald-600 px-2">{el.tag}</span>
                                        </td>
                                        <td className="border-b border-slate-100" />
                                      </tr>
                                    ))}
                                    {expanded && elems.length === 0 && (
                                      <tr>
                                        <td colSpan={8} className="pl-10 py-2 border-b border-slate-50 text-[9px] text-slate-300 italic">
                                          Sin elementos taggeados con el prefijo <strong>{item.tagPrefix}-</strong>. Usa <Tag size={9} className="inline" /> para taggear elementos.
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Resumen total general */}
                        {cubicacionItems.length > 0 && (
                          <div className="shrink-0 px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-4 flex-wrap">
                            {cubicacionItems.map(item => {
                              const { count, total } = computeTotals(item);
                              if (count === 0) return null;
                              return (
                                <div key={item.id} className="flex items-center gap-1.5 text-[9px]">
                                  <span className="font-mono font-black text-slate-600">{item.itemCode}</span>
                                  <span className="text-slate-400">·</span>
                                  <span className="text-slate-600">{count} elem.</span>
                                  {total > 0 && <><span className="text-slate-400">·</span><span className="font-black text-slate-700 font-mono">{total.toFixed(2)} {item.unit}</span></>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── WBS / Árbol Pivot ── */}
                  {tableTab === ('wbs' as any) && (() => {
                    // Uses component-level wbsAllCols, getWbsVal, buildWbsTree
                    const allCols = wbsAllCols;
                    const tree = buildWbsTree(visibleTableRows, wbsLevels);

                    const renderTree = (nodes: Map<string, WbsTreeNode>, path: string, depth: number): React.ReactNode => {
                      if (nodes.size === 0) return null;
                      return Array.from(nodes.entries()).map(([val, node]) => {
                        const nodePath = `${path}::${val}`;
                        const isExpanded = wbsExpanded.has(nodePath);
                        const hasChildren = node.children.size > 0;
                        const isLeaf = !hasChildren || depth >= wbsLevels.length - 1;
                        return (
                          <div key={nodePath}>
                            <div
                              className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 hover:bg-violet-50/40 cursor-pointer group transition-colors`}
                              style={{ paddingLeft: `${12 + depth * 20}px` }}
                              onClick={() => {
                                setWbsExpanded(prev => {
                                  const s = new Set(prev);
                                  s.has(nodePath) ? s.delete(nodePath) : s.add(nodePath);
                                  return s;
                                });
                                // Seleccionar + aislar en el visor
                                const allDbIds = node.rows.map(r => r.dbId);
                                if (allDbIds.length) {
                                  viewerRef.current?.select(allDbIds);
                                  viewerRef.current?.fitToView(allDbIds);
                                }
                              }}
                            >
                              {!isLeaf ? (
                                isExpanded
                                  ? <ChevronDown size={11} className="text-violet-500 shrink-0" />
                                  : <ChevronRight size={11} className="text-slate-400 shrink-0" />
                              ) : <div className="w-[11px] shrink-0" />}
                              {node.color && <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: node.color }} />}
                              <span className="text-[11px] font-bold text-slate-700 flex-1 truncate">{val}</span>
                              <span className="text-[9px] font-black text-slate-400 shrink-0">{node.rows.length} elem.</span>
                              <button
                                onClick={e => { e.stopPropagation(); viewerRef.current?.isolateDbIds(node.rows.map(r => r.dbId)); viewerRef.current?.setGhosting(true); }}
                                title="Aislar en el visor"
                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-violet-600 transition rounded"
                              ><EyeOff size={10} /></button>
                            </div>
                            {isExpanded && !isLeaf && renderTree(node.children, nodePath, depth + 1)}
                            {isExpanded && isLeaf && node.rows.map(row => (
                              <div
                                key={row.dbId}
                                className="flex items-center gap-2 border-b border-slate-50 hover:bg-blue-50/30 cursor-pointer transition-colors"
                                style={{ paddingLeft: `${12 + (depth + 1) * 20}px`, paddingRight: 12, paddingTop: 4, paddingBottom: 4 }}
                                onClick={() => { viewerRef.current?.select([row.dbId]); viewerRef.current?.fitToView([row.dbId]); }}
                              >
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                                <span className="text-[10px] text-slate-600 flex-1 truncate">{row.elementName}</span>
                                <span className="text-[8px] text-slate-300 font-mono shrink-0">{row.dbId}</span>
                              </div>
                            ))}
                          </div>
                        );
                      });
                    };

                    return (
                      <div className="flex-1 overflow-hidden flex flex-col">
                        {/* Excel source picker — join se toma automáticamente del Visor BIM */}
                        <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2 flex-wrap">
                          <FileSpreadsheet size={11} className="text-emerald-600 shrink-0" />
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest shrink-0">Fuente:</span>
                          <select
                            value={wbsExcelSource?.versionId ?? ''}
                            onChange={async e => {
                              const vId = e.target.value;
                              if (!vId) {
                                setWbsExcelSource(null);
                                await setBimLinkerKey(project_id, 'wbs_excel_source', null);
                                const cleaned = wbsLevels.filter(l => !l.startsWith('excel__'));
                                if (cleaned.length !== wbsLevels.length) { setWbsLevels(cleaned); await setBimLinkerKey(project_id, 'wbs_levels', cleaned); }
                                return;
                              }
                              // keyCol viene del Visor BIM automáticamente
                              // bimKeyCol: buscar columna BIM cuyo displayName coincida con keyCol del linker
                              const autoBimKey = bimColumns.find(c =>
                                c.displayName.toLowerCase() === bimLinkerKeyCol.toLowerCase() ||
                                c.attributeName.toLowerCase() === bimLinkerKeyCol.toLowerCase()
                              )?.key ?? bimColumns[0]?.key ?? '';
                              const next: WbsExcelSource = {
                                versionId: vId,
                                excelKeyCol: bimLinkerKeyCol,   // columna Excel = keyCol del Visor BIM
                                bimKeyCol:   autoBimKey,        // propiedad BIM que contiene el mismo ID
                              };
                              setWbsExcelSource(next);
                              await setBimLinkerKey(project_id, 'wbs_excel_source', next);
                            }}
                            className="text-[9px] font-bold text-emerald-700 border border-emerald-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-emerald-400 cursor-pointer flex-1 min-w-0"
                          >
                            <option value="">Propiedades del modelo BIM</option>
                            {excelVersions.map(v => (
                              <option key={v.id} value={v.id}>{v.fileName} ({v.date})</option>
                            ))}
                          </select>
                          {wbsExcelSource && bimLinkerKeyCol && (
                            <span className="text-[8px] text-slate-400 shrink-0 flex items-center gap-1">
                              <Link2 size={8} /> via <span className="font-black text-emerald-600">{bimLinkerKeyCol}</span>
                            </span>
                          )}
                        </div>

                        {/* Builder de niveles */}
                        <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-violet-50/40 flex items-center gap-2 flex-wrap">
                          <Workflow size={12} className="text-violet-600 shrink-0" />
                          <span className="text-[9px] font-black text-violet-700 uppercase tracking-widest shrink-0">Jerarquía:</span>
                          {wbsLevels.map((lvlKey, i) => {
                            const col = allCols.find(c => c.key === lvlKey);
                            return (
                              <div key={lvlKey} className="flex items-center gap-1">
                                {i > 0 && <ChevronRight size={10} className="text-violet-300" />}
                                <div className="flex items-center gap-1 bg-white border border-violet-200 rounded-full px-2 py-0.5 text-[9px] font-bold text-violet-700">
                                  <span>{col?.label ?? lvlKey}</span>
                                  <button onClick={() => { const n = wbsLevels.filter((_, j) => j !== i); setWbsLevels(n); setBimLinkerKey(project_id, 'wbs_levels', n); }} className="text-violet-300 hover:text-red-500 transition"><X size={8} /></button>
                                </div>
                              </div>
                            );
                          })}
                          {/* Selector para agregar nivel */}
                          <select
                            value=""
                            onChange={async e => {
                              const v = e.target.value;
                              if (!v || wbsLevels.includes(v)) return;
                              const n = [...wbsLevels, v];
                              setWbsLevels(n);
                              await setBimLinkerKey(project_id, 'wbs_levels', n);
                            }}
                            className="text-[9px] font-bold text-violet-600 border border-dashed border-violet-300 rounded-full px-2 py-0.5 bg-white focus:outline-none cursor-pointer"
                          >
                            <option value="">+ Agregar nivel…</option>
                            {allCols.filter(c => !wbsLevels.includes(c.key)).map(c => (
                              <option key={c.key} value={c.key}>{c.label}</option>
                            ))}
                          </select>
                          {wbsLevels.length > 0 && (
                            <button
                              onClick={() => setWbsExpanded(new Set())}
                              className="ml-auto text-[9px] text-slate-400 hover:text-slate-600 transition"
                            >Colapsar todo</button>
                          )}
                        </div>

                        {/* Árbol */}
                        <div className="flex-1 overflow-y-auto">
                          {wbsLevels.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-300 p-6 text-center">
                              <Workflow size={28} className="opacity-30" />
                              <p className="text-[11px] font-bold text-slate-400">Define la jerarquía del WBS</p>
                              <p className="text-[10px] text-slate-300">Usa <strong>+ Agregar nivel</strong> para seleccionar las columnas que definen la estructura del árbol.<br/> Primero necesitas cargar datos en la pestaña TABLA.</p>
                            </div>
                          )}
                          {wbsLevels.length > 0 && visibleTableRows.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-300 p-4 text-center">
                              <p className="text-[10px]">Sin datos. Carga primero los datos en la pestaña TABLA.</p>
                            </div>
                          )}
                          {wbsLevels.length > 0 && visibleTableRows.length > 0 && (
                            <div className="divide-y divide-slate-50">
                              {renderTree(tree, 'root', 0)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Grid / Tabla */}
                  {tableTab === 'table' && <div className="flex-1 overflow-auto" onClick={() => editingCell && commitCellEdit()}>
                    {(bimColumns.length === 0 && customColumns.length === 0) ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
                        <Table2 size={24} className="opacity-20" />
                        <p className="text-[10px] font-bold">Agrega columnas con el botón <strong>+ Columna</strong></p>
                        <p className="text-[9px] text-slate-300">Elige propiedades del modelo o crea columnas personalizadas</p>
                      </div>
                    ) : (
                      <table className="w-full text-[10px] border-collapse">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-100">
                            <th className="text-left px-3 py-2 text-[9px] font-black text-slate-500 uppercase tracking-wider border-b border-r border-slate-200 w-[120px] shrink-0">Grupo</th>
                            <th className="text-left px-3 py-2 text-[9px] font-black text-slate-500 uppercase tracking-wider border-b border-r border-slate-200 min-w-[160px]">Elemento</th>
                            {bimColumns.map(col => (
                              <th key={col.key} className="group text-left px-3 py-2 text-[9px] font-black text-slate-500 uppercase tracking-wider border-b border-r border-slate-100 min-w-[110px]">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="min-w-0">
                                    <div className="text-[7px] text-slate-400 font-bold normal-case truncate">{col.category}</div>
                                    <div className="truncate">{col.displayName}</div>
                                  </div>
                                  <button onClick={() => removeBimColumn(col.key)} title="Eliminar columna" className="shrink-0 p-0.5 text-slate-200 hover:text-red-500 hover:bg-red-50 transition rounded opacity-0 group-hover:opacity-100">
                                    <X size={10} />
                                  </button>
                                </div>
                              </th>
                            ))}
                            {formulaColumns.map(col => (
                              <th key={col.key} className="group text-left px-3 py-2 text-[9px] font-black text-violet-600 uppercase tracking-wider border-b border-r border-violet-100 min-w-[120px] bg-violet-50/30">
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1 min-w-0">
                                    <Zap size={9} className="shrink-0 text-violet-400" />
                                    <span className="truncate">{col.label}</span>
                                  </div>
                                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                                    <button onClick={() => setEditingFormula(col)} title="Editar fórmula" className="p-0.5 text-violet-300 hover:text-violet-700 hover:bg-violet-100 transition rounded">
                                      <Pencil size={9} />
                                    </button>
                                    <button onClick={async () => { const n = formulaColumns.filter(c => c.key !== col.key); setFormulaColumns(n); await setBimLinkerKey(project_id, 'formula_cols', n); }} title="Eliminar" className="p-0.5 text-slate-200 hover:text-red-500 hover:bg-red-50 transition rounded">
                                      <X size={9} />
                                    </button>
                                  </div>
                                </div>
                              </th>
                            ))}
                            {customColumns.map(col => (
                              <th key={col.key} className="group text-left px-3 py-2 text-[9px] font-black text-emerald-600 uppercase tracking-wider border-b border-r border-emerald-100 min-w-[140px] bg-emerald-50/40">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="truncate">{col.label}</span>
                                  <button onClick={() => removeCustomColumn(col.key)} title="Eliminar columna" className="shrink-0 p-0.5 text-slate-200 hover:text-red-500 hover:bg-red-50 transition rounded opacity-0 group-hover:opacity-100">
                                    <X size={10} />
                                  </button>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.length === 0 && !tableLoading && (
                            <tr>
                              <td colSpan={2 + bimColumns.length + customColumns.length} className="px-4 py-6 text-center text-[10px] text-slate-400">
                                Haz clic en <strong>Cargar datos</strong> para ver los elementos de los grupos
                              </td>
                            </tr>
                          )}
                          {tableRows.length > 0 && visibleTableRows.length === 0 && !tableLoading && (
                            <tr>
                              <td colSpan={2 + bimColumns.length + customColumns.length} className="px-4 py-6 text-center text-[10px] text-slate-400">
                                Todos los grupos están ocultos — activa al menos uno en el panel de colores
                              </td>
                            </tr>
                          )}
                          {visibleTableRows.map((row, i) => (
                            <tr key={row.dbId} className={`group ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-blue-50/30 transition-colors`}>
                              {/* Grupo */}
                              <td className="px-3 py-1 border-b border-r border-slate-100">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: row.groupColor }} />
                                  <span className="text-[9px] font-bold text-slate-600 truncate max-w-[90px]" title={row.groupValue}>{row.groupValue}</span>
                                </div>
                              </td>
                              {/* Nombre del elemento */}
                              <td className="px-3 py-1 border-b border-r border-slate-100 text-slate-700 font-medium truncate max-w-[200px]" title={row.elementName}>
                                {row.elementName}
                              </td>
                              {/* Propiedades BIM (solo lectura) */}
                              {bimColumns.map(col => (
                                <td key={col.key} className="px-3 py-1 border-b border-r border-slate-100 text-slate-600 font-mono text-[9px]">
                                  {tableLoading ? <span className="text-slate-200 animate-pulse">…</span> : (row.bimProps[col.key] ?? <span className="text-slate-200">—</span>)}
                                </td>
                              ))}
                              {/* Columnas fórmula (solo lectura, en violeta) */}
                              {formulaColumns.map(col => (
                                <td key={col.key} className="px-3 py-1 border-b border-r border-violet-100 bg-violet-50/20 text-violet-700 font-mono text-[9px] font-bold">
                                  {row.bimProps[col.key] || <span className="text-violet-200">—</span>}
                                </td>
                              ))}
                              {/* Columnas personalizadas (editables) */}
                              {customColumns.map(col => {
                                const stored = customValues[String(row.dbId)]?.[col.key] ?? '';
                                const isEditing = editingCell?.dbId === row.dbId && editingCell?.colKey === col.key;
                                return (
                                  <td
                                    key={col.key}
                                    className="px-2 py-0.5 border-b border-r border-emerald-100 bg-emerald-50/20"
                                    onClick={e => { e.stopPropagation(); if (!isEditing) { if (editingCell) commitCellEdit(); setEditingCell({ dbId: row.dbId, colKey: col.key, value: stored }); }}}
                                  >
                                    {isEditing ? (
                                      <input
                                        autoFocus
                                        value={editingCell.value}
                                        onChange={e => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
                                        onBlur={commitCellEdit}
                                        onKeyDown={e => { if (e.key === 'Enter') commitCellEdit(); if (e.key === 'Escape') setEditingCell(null); }}
                                        className="w-full px-1 py-0.5 text-[10px] border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                                        onClick={e => e.stopPropagation()}
                                      />
                                    ) : (
                                      <span className={`text-[10px] block min-h-[16px] cursor-text rounded px-1 hover:bg-emerald-100 transition ${stored ? 'text-slate-700' : 'text-slate-300'}`}>
                                        {stored || <span className="italic text-[9px]">clic para editar</span>}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>}
                </div>
              )}
            </div>

            {/* ── Right Sidebar (Category Details) — viewer mode only ── */}
            {mainTab === 'viewer' && viewerReady && (
              <div className="w-[340px] bg-slate-50 border-l border-slate-200 flex flex-col shadow-xl relative z-10 shrink-0">
                {!activeViewId ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                    <div className="w-16 h-16 rounded-3xl bg-blue-500/5 flex items-center justify-center">
                      <MonitorPlay size={32} className="text-blue-200" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Selecciona una Vista</p>
                      <p className="text-[10px] text-slate-400 mt-2">Elige una vista del menú superior para empezar a gestionar sus grupos y colores.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Active View Header — two rows so nothing gets clipped */}
                    <div className="px-3 pt-3 pb-2 border-b border-slate-200 bg-white space-y-2">
                      {/* Row 1: view name + rename */}
                      <div className="flex items-center gap-2 min-w-0">
                        <Layers size={13} className="text-blue-600 shrink-0" />
                        {(() => {
                          const activeView = savedViews.find(v => v.id === activeViewId);
                          const isCwa = activeView?.viewType === 'cwa';
                          return isCwa ? (
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[8px] font-black uppercase tracking-wide shrink-0">
                                <AlertCircle size={9} /> CWA
                              </span>
                              <span className="flex-1 text-[11px] font-black text-slate-900 uppercase tracking-wide truncate">
                                {activeView.name}
                              </span>
                            </div>
                          ) : renamingViewId === activeViewId ? (
                            <input
                              ref={renameViewRef}
                              autoFocus
                              value={renamingViewValue}
                              onChange={e => setRenamingViewValue(e.target.value)}
                              onBlur={() => handleRenameView(activeViewId!, renamingViewValue)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameView(activeViewId!, renamingViewValue);
                                if (e.key === 'Escape') setRenamingViewId(null);
                              }}
                              className="flex-1 text-[11px] font-black text-slate-900 bg-slate-50 border border-blue-400 rounded px-2 py-0.5 outline-none min-w-0"
                            />
                          ) : (
                            <span
                              className="flex-1 text-[11px] font-black text-slate-900 uppercase tracking-wide truncate cursor-text"
                              onDoubleClick={() => { setRenamingViewId(activeViewId!); setRenamingViewValue(activeView?.name || ''); }}
                              title={activeView?.name}
                            >
                              {activeView?.name}
                            </span>
                          );
                        })()}
                        {savedViews.find(v => v.id === activeViewId)?.viewType !== 'cwa' && (
                          <button
                            onClick={() => { setRenamingViewId(activeViewId!); setRenamingViewValue(savedViews.find(v => v.id === activeViewId)?.name || ''); }}
                            className="shrink-0 p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition"
                            title="Renombrar"
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                      </div>

                      {/* Row 2: action buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleCreateSnapshot(activeViewId!)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wide transition-all shadow-sm active:scale-95 shrink-0"
                          title="Guardar estado actual como versión"
                        >
                          <Camera size={11} /> Snapshot
                        </button>
                        <button
                          onClick={() => setShowTimeline(!showTimeline)}
                          className={`p-1.5 rounded-lg border transition-all shrink-0 ${showTimeline ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                          title="Historial de versiones"
                        >
                          <History size={13} />
                        </button>
                        <button
                          onClick={() => { const next = !deepSelection; setDeepSelection(next); viewerRef.current?.setDeepSelection(next); }}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-all shrink-0 ${deepSelection ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-400 hover:text-indigo-600'}`}
                          title="Selección Profunda — captura pernos y geometría oculta"
                        >
                          <BoxSelect size={11} />
                          <span className="text-[8px] font-black uppercase">Profunda</span>
                        </button>
                        <button
                          onClick={() => {
                            const next = !multiSelect;
                            setMultiSelect(next);
                            viewerRef.current?.setMultiSelect(next);
                          }}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-all shrink-0 ${multiSelect ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-400 hover:text-emerald-600'}`}
                          title="Multi-selección — cada clic suma al conjunto (sin mantener Ctrl)"
                        >
                          <MousePointerClick size={11} />
                          <span className="text-[8px] font-black uppercase">Multi</span>
                        </button>
                        <select
                          value={activeViewMode}
                          onChange={e => {
                            const v = savedViews.find(v => v.id === activeViewId)!;
                            setActiveViewMode(e.target.value as any);
                            applyView(v, activeNodes, e.target.value as any);
                          }}
                          className="flex-1 min-w-0 bg-slate-100 text-[9px] text-blue-600 font-black outline-none cursor-pointer px-2 py-1 rounded"
                        >
                          <option value="all">Ver todo</option>
                          <option value="isolate">Aislar</option>
                          <option value="ghost">Fantasma</option>
                        </select>
                      </div>

                      {/* Version Banner (if viewing history) */}
                      {activeVersionId && (
                        <div className="mx-4 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-2 text-amber-700">
                            <Clock size={12} />
                            <span className="text-[10px] font-bold uppercase tracking-tight">Viendo Histórico</span>
                          </div>
                          <button onClick={() => handleSelectVersion(null)} className="text-[10px] font-black text-amber-800 underline hover:no-underline">
                            VOLVER
                          </button>
                        </div>
                      )}

                      {/* Timeline / History Panel */}
                      {showTimeline && (
                        <div className="mx-4 mt-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top duration-300">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <History size={10} /> Línea de Tiempo del Proyecto
                          </p>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                            <div 
                              onClick={() => handleSelectVersion(null)}
                              className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${!activeVersionId ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100' : 'bg-white border-slate-100 hover:border-blue-200'}`}
                            >
                              <div>
                                <p className="text-[10px] font-black text-slate-900 uppercase">Estado Actual (Draft)</p>
                                <p className="text-[9px] text-slate-400 font-bold">Últimos cambios en vivo</p>
                              </div>
                              {!activeVersionId && <CheckCircle2 size={14} className="text-blue-500" />}
                            </div>

                            {(savedViews.find(v => v.id === activeViewId)?.versions || []).map((ver) => (
                              <div 
                                key={ver.id}
                                onClick={() => handleSelectVersion(ver.id)}
                                className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between group ${activeVersionId === ver.id ? 'bg-amber-50 border-amber-200 ring-1 ring-amber-100' : 'bg-white border-slate-100 hover:border-amber-200'}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-black text-slate-900 uppercase truncate">{ver.name}</p>
                                  <p className="text-[9px] text-slate-400 font-bold">
                                    {new Date(ver.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleRestoreVersion(activeViewId!, ver.id); }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-emerald-600 transition"
                                    title="Restaurar como estado actual (Draft)"
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteVersion(activeViewId!, ver.id); }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition">
                                    <Trash2 size={12} />
                                  </button>
                                  {activeVersionId === ver.id && <CheckCircle2 size={14} className="text-amber-500" />}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="px-4 mt-4 text-[9px] text-slate-400 font-bold uppercase tracking-wider">Gestión de Árbol de Color</p>
                    </div>

                    {/* Selection indicator — shown when viewer has elements selected */}
                    {selectionCount > 0 && (
                      <div className="mx-2 mt-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                        <Paintbrush size={11} className="text-amber-500 shrink-0" />
                        <span className="text-[10px] font-black text-amber-700 flex-1">
                          {selectionCount} elem. seleccionados
                        </span>
                        <span className="text-[9px] text-amber-500">↓ Pintar en grupo</span>
                      </div>
                    )}

                    {/* Empty state — no nodes yet */}
                    {activeNodes.length === 0 && !addingCategory && (() => {
                      const isCwa = savedViews.find(v => v.id === activeViewId)?.viewType === 'cwa';
                      return isCwa ? (
                        <div className="mx-2 mt-3 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl text-center space-y-3">
                          <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto">
                            <AlertCircle size={24} className="text-amber-500" />
                          </div>
                          <div>
                            <p className="text-[11px] font-black text-amber-800 uppercase tracking-wide">CWA Obligatorio</p>
                            <p className="text-[9px] text-amber-700 leading-relaxed mt-1">
                              Debes definir las <strong>Áreas de Trabajo (CWA)</strong> antes de continuar.<br/>
                              Cada CWA agrupa un conjunto de elementos del modelo que serán ejecutados como una unidad de planificación.
                            </p>
                          </div>
                          <div className="bg-amber-100 rounded-lg px-3 py-2 text-left space-y-1">
                            <p className="text-[8px] font-black text-amber-700 uppercase tracking-widest">Cómo definir CWAs:</p>
                            <ol className="text-[9px] text-amber-700 space-y-0.5 list-decimal list-inside">
                              <li>Abre el Árbol del modelo (botón izquierda del visor)</li>
                              <li>Selecciona los elementos de un área</li>
                              <li>Asígnalos con un nombre de CWA y color</li>
                              <li>Repite para cada área de trabajo</li>
                            </ol>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setTreeOpen(true)}
                              className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black rounded-lg transition flex items-center justify-center gap-1"
                            >
                              <Layers size={10} /> Abrir Árbol del Modelo
                            </button>
                            <button
                              onClick={() => setAddingCategory(true)}
                              className="py-2 px-3 bg-white border border-amber-300 hover:bg-amber-50 text-amber-700 text-[9px] font-black rounded-lg transition flex items-center justify-center gap-1"
                            >
                              <Plus size={10} /> Manual
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mx-2 mt-3 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center">
                          <Layers size={20} className="text-slate-300 mx-auto mb-2" />
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide mb-1">Sin grupos de color</p>
                          <p className="text-[9px] text-slate-400 leading-relaxed">
                            Abre el <span className="font-black text-blue-500">Árbol</span> (botón arriba-izquierda del visor), selecciona ramas y asígnalas — o añade una categoría manual.
                          </p>
                          <div className="flex gap-1 mt-2">
                            <button
                              onClick={() => setTreeOpen(true)}
                              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black rounded-lg transition flex items-center justify-center gap-1"
                            >
                              <Layers size={10} /> Abrir Árbol
                            </button>
                            <button
                              onClick={() => setAddingCategory(true)}
                              className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-[9px] font-black rounded-lg transition flex items-center justify-center gap-1"
                            >
                              <Plus size={10} /> Manual
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Categories List — 2-level for CWA, flat for others */}
                    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
                      {(() => {
                        const isCwaView = savedViews.find(v => v.id === activeViewId)?.viewType === 'cwa';

                        if (isCwaView) {
                          // ── 2-level CWA tree with global disciplines ───────
                          const cwaView    = savedViews.find(v => v.id === activeViewId)!;
                          const globalDiscs = cwaView?.globalDisciplines || [];
                          const cwaNodes   = activeNodes.filter((n: any) => !n.parent);
                          const hasSelection = selectionCount > 0;
                          return (
                            <>
                              {/* ── GLOBAL DISCIPLINES SECTION ── */}
                              <div className="mb-2 border border-blue-100 rounded-xl overflow-hidden">
                                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-600">
                                  <GitBranch size={10} className="text-blue-200 shrink-0" />
                                  <span className="text-[9px] font-black text-white uppercase tracking-widest flex-1">Disciplinas Globales</span>
                                  <span className="text-[8px] text-blue-200">Se replican en cada CWA</span>
                                </div>
                                <div className="bg-blue-50 px-2 py-1.5 space-y-0.5">
                                  {globalDiscs.length === 0 && !addingGlobalDisc && (
                                    <p className="text-[9px] text-blue-400 text-center py-1">
                                      Define las disciplinas que tendrá cada CWA (HOR, ARQ, ELE…)
                                    </p>
                                  )}
                                  {globalDiscs.map((d, di) => (
                                    <div key={`gdisc-${d.name}`} className="group/gd flex items-center gap-1.5 px-1.5 py-0.5 bg-white rounded-lg border border-blue-100 hover:border-blue-300 transition">
                                      <input type="color" value={d.color}
                                        onChange={e => handleGlobalDiscColor(activeViewId!, d.name, e.target.value)}
                                        onBlur={() => { applyColorsNow(); debouncedSave(); }}
                                        className="w-3 h-3 rounded cursor-pointer border-none bg-transparent shrink-0" />
                                      <span className="flex-1 text-[10px] font-black text-slate-700">{d.name}</span>
                                      <button onClick={() => handleRemoveGlobalDisc(activeViewId!, d.name)}
                                        className="opacity-0 group-hover/gd:opacity-100 p-0.5 text-slate-300 hover:text-red-500 transition rounded" title="Eliminar disciplina de todos los CWA">
                                        <X size={9} />
                                      </button>
                                    </div>
                                  ))}
                                  {addingGlobalDisc ? (
                                    <div className="flex gap-1 mt-1">
                                      <input autoFocus value={newGlobalDiscInput}
                                        onChange={e => setNewGlobalDiscInput(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handleAddGlobalDisc(activeViewId!, newGlobalDiscInput);
                                          if (e.key === 'Escape') { setAddingGlobalDisc(false); setNewGlobalDiscInput(''); }
                                        }}
                                        placeholder="Ej: HOR, ARQ, ELE…"
                                        className="flex-1 text-[10px] px-2 py-0.5 border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                      <button onClick={() => handleAddGlobalDisc(activeViewId!, newGlobalDiscInput)} disabled={!newGlobalDiscInput.trim()}
                                        className="px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-black rounded-lg hover:bg-blue-700 disabled:opacity-30 transition">
                                        <Check size={9} />
                                      </button>
                                      <button onClick={() => { setAddingGlobalDisc(false); setNewGlobalDiscInput(''); }}
                                        className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition">
                                        <X size={9} />
                                      </button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setAddingGlobalDisc(true)}
                                      className="w-full py-1 mt-0.5 flex items-center justify-center gap-1 text-[9px] font-black text-blue-600 hover:bg-blue-100 border border-dashed border-blue-300 rounded-lg transition">
                                      <Plus size={9} /> Agregar disciplina
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* ── CWA TREE ── */}
                              {cwaNodes.map((cwa: any, cwaIdx: number) => {
                                const realIdx = activeNodes.indexOf(cwa);
                                const expanded = expandedCwas.has(cwa.value);
                                const discNodes = activeNodes.filter((n: any) => n.parent === cwa.value);
                                const discCount = discNodes.reduce((s: number, n: any) => s + ((n as any).guids?.length || n.dbIds?.length || 0), 0);
                                return (
                                  <div key={`cwa-${cwa.value}`} className="mb-1">
                                    {/* CWA header row */}
                                    <div className="flex items-center gap-1.5 px-1.5 py-1 bg-slate-800 rounded-lg group/cwa">
                                      <button onClick={() => setExpandedCwas(prev => { const s = new Set(prev); s.has(cwa.value) ? s.delete(cwa.value) : s.add(cwa.value); return s; })}
                                        className="text-slate-400 hover:text-white transition shrink-0">
                                        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                      </button>
                                      <input type="color" value={cwa.color}
                                        onChange={e => updateNodeState(realIdx, { color: e.target.value })}
                                        onBlur={applyColorsNow}
                                        className="w-3.5 h-3.5 rounded cursor-pointer border-none bg-transparent shrink-0" />
                                      {renamingNodeIdx === realIdx ? (
                                        <input ref={renameInputRef} autoFocus value={renamingValue}
                                          onChange={e => setRenamingValue(e.target.value)}
                                          onBlur={() => handleRenameNode(activeViewId!, realIdx, renamingValue)}
                                          onKeyDown={e => { if (e.key === 'Enter') handleRenameNode(activeViewId!, realIdx, renamingValue); if (e.key === 'Escape') setRenamingNodeIdx(null); }}
                                          className="flex-1 text-[10px] font-black text-white bg-slate-700 border border-blue-400 rounded px-1 py-0.5 outline-none" />
                                      ) : (
                                        <span className="flex-1 text-[10px] font-black text-white truncate cursor-text"
                                          onDoubleClick={() => { setRenamingNodeIdx(realIdx); setRenamingValue(cwa.value); }}>
                                          {cwa.value}
                                        </span>
                                      )}
                                      <span className="text-[8px] text-slate-400 tabular-nums shrink-0">{discCount} elem.</span>
                                      <button onClick={() => handleDeleteNode(activeViewId!, realIdx)}
                                        className="opacity-0 group-hover/cwa:opacity-100 p-0.5 text-slate-500 hover:text-red-400 hover:bg-white/10 rounded transition shrink-0" title="Eliminar CWA">
                                        <X size={10} />
                                      </button>
                                      <input type="checkbox" checked={cwa.visible}
                                        onChange={e => updateNode(realIdx, { visible: e.target.checked })}
                                        className="accent-blue-400 cursor-pointer w-3 h-3 shrink-0" />
                                    </div>

                                    {/* Discipline rows (collapsible) */}
                                    {expanded && (
                                      <div className="ml-3 mt-0.5 space-y-0.5">
                                        {discNodes.map((disc: any) => {
                                          const dIdx = activeNodes.indexOf(disc);
                                          const isPainted = paintedNodeIdx === dIdx;
                                          return (
                                            <div key={`disc-${disc.value}-${dIdx}`}
                                              className={`group/disc flex items-center gap-1.5 px-1.5 py-1 rounded transition-colors ${isPainted ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 hover:bg-white border border-slate-100'}`}>
                                              <div className="w-0.5 self-stretch bg-slate-300 rounded-full shrink-0" />
                                              <input type="color" value={disc.color}
                                                onChange={e => updateNodeState(dIdx, { color: e.target.value })}
                                                onBlur={applyColorsNow}
                                                className="w-3.5 h-3.5 rounded cursor-pointer border-none bg-transparent shrink-0" />
                                              <span className="flex-1 text-[10px] font-bold text-slate-700 truncate">
                                                {isPainted ? '✓ ' : ''}{disc.value}
                                              </span>
                                              <span className="text-[8px] text-slate-400 tabular-nums shrink-0">
                                                {(disc as any).guids?.length || disc.dbIds?.length || 0}
                                              </span>
                                              <div className={`flex items-center gap-0.5 transition-opacity ${hasSelection || isPainted ? 'opacity-100' : 'opacity-0 group-hover/disc:opacity-100'}`}>
                                                <button onClick={() => handleZoomNode(dIdx)} className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="Ver en modelo">
                                                  <MousePointer2 size={10} />
                                                </button>
                                                <button onClick={() => handleAssignSelectionToNode(activeViewId!, dIdx)}
                                                  className={`p-0.5 rounded transition ${hasSelection ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-amber-500'}`}
                                                  title={hasSelection ? `Asignar ${selectionCount} elem.` : 'Asignar selección'}>
                                                  <Paintbrush size={10} />
                                                </button>
                                                <button onClick={() => handleRemoveFromNode(activeViewId!, dIdx)}
                                                  className="p-0.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded transition" title="Vaciar">
                                                  <Trash2 size={10} />
                                                </button>
                                              </div>
                                              <input type="checkbox" checked={disc.visible}
                                                onChange={e => updateNode(dIdx, { visible: e.target.checked })}
                                                className="accent-blue-600 cursor-pointer w-3 h-3 shrink-0" />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Add CWA */}
                              {addingCategory ? (
                                <div className="flex gap-1 mt-2">
                                  <input autoFocus value={newCategoryInput}
                                    onChange={e => setNewCategoryInput(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') handleAddNewCategory(activeViewId!, newCategoryInput);
                                      if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryInput(''); }
                                    }}
                                    placeholder="Nombre del CWA…"
                                    className="flex-1 text-[10px] px-2 py-1 border border-slate-700 bg-slate-800 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder-slate-500" />
                                  <button onClick={() => handleAddNewCategory(activeViewId!, newCategoryInput)} disabled={!newCategoryInput.trim()}
                                    className="px-2 py-1 bg-amber-500 text-white text-[9px] font-black rounded-lg hover:bg-amber-600 disabled:opacity-30 transition">
                                    <Check size={10} />
                                  </button>
                                  <button onClick={() => { setAddingCategory(false); setNewCategoryInput(''); }}
                                    className="px-2 py-1 bg-slate-700 text-slate-400 text-[9px] rounded-lg hover:bg-slate-600 transition">
                                    <X size={10} />
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => setAddingCategory(true)}
                                  className="w-full py-2 flex items-center justify-center gap-2 text-[9px] font-black text-amber-600 hover:bg-amber-50 border border-dashed border-amber-300 rounded-lg mt-2 transition-all">
                                  <Plus size={12} /> AÑADIR CWA
                                </button>
                              )}
                            </>
                          );
                        }

                        // ── Flat list for non-CWA views ──────────────────────
                        const hasSelection = selectionCount > 0;
                        return (
                          <>
                            {activeNodes.map((node, idx) => {
                              const isPainted = paintedNodeIdx === idx;
                              return (
                                <div key={`${node.value}-${idx}`}
                                  className={`group/node border-b border-slate-100 flex items-center gap-2 p-1.5 transition-colors rounded ${isPainted ? 'bg-emerald-50 border-emerald-200' : 'bg-white hover:bg-slate-50'}`}>
                                  <input type="color" value={node.color}
                                    onChange={e => updateNodeState(idx, { color: e.target.value })}
                                    onBlur={applyColorsNow}
                                    className="w-4 h-4 rounded-sm cursor-pointer border-none bg-transparent shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    {renamingNodeIdx === idx ? (
                                      <input ref={renameInputRef} autoFocus value={renamingValue}
                                        onChange={e => setRenamingValue(e.target.value)}
                                        onBlur={() => handleRenameNode(activeViewId!, idx, renamingValue)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleRenameNode(activeViewId!, idx, renamingValue); if (e.key === 'Escape') setRenamingNodeIdx(null); }}
                                        className="w-full text-[10px] font-bold text-slate-900 bg-white border border-blue-400 rounded px-1 py-0.5 outline-none" />
                                    ) : (
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-700 truncate cursor-text hover:text-blue-600 pr-2"
                                          onDoubleClick={() => { setRenamingNodeIdx(idx); setRenamingValue(node.value); }}>
                                          {isPainted ? '✓ ' : ''}{node.value}
                                        </span>
                                        <span className="text-[9px] font-bold text-slate-300 tabular-nums shrink-0">
                                          {(node as any).guids?.length || node.dbIds?.length || 0}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className={`flex items-center gap-0.5 transition-opacity ${hasSelection || isPainted ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100'}`}>
                                    <button onClick={() => handleZoomNode(idx)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="Ver en modelo"><MousePointer2 size={11} /></button>
                                    <button onClick={() => handleAssignSelectionToNode(activeViewId!, idx)}
                                      className={`p-1 rounded transition ${hasSelection ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                                      title={hasSelection ? `Pintar ${selectionCount} elem.` : 'Pintar selección'}><Paintbrush size={11} /></button>
                                    <button onClick={() => handleRemoveFromNode(activeViewId!, idx)} className="p-1 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded transition" title="Vaciar grupo"><Trash2 size={11} /></button>
                                    <button onClick={() => handleDeleteNode(activeViewId!, idx)} className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition" title="Eliminar"><X size={11} /></button>
                                  </div>
                                  <input type="checkbox" checked={node.visible}
                                    onChange={e => updateNode(idx, { visible: e.target.checked })}
                                    className="accent-blue-600 cursor-pointer w-3.5 h-3.5 shrink-0 ml-1" />
                                </div>
                              );
                            })}
                            {addingCategory ? (
                              <div className="flex gap-1 mt-2">
                                <input autoFocus value={newCategoryInput}
                                  onChange={e => setNewCategoryInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleAddNewCategory(activeViewId!, newCategoryInput);
                                    if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryInput(''); }
                                  }}
                                  placeholder="Nombre de la categoría…"
                                  className="flex-1 text-[10px] px-2 py-1 border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
                                <button onClick={() => handleAddNewCategory(activeViewId!, newCategoryInput)} disabled={!newCategoryInput.trim()}
                                  className="px-2 py-1 bg-blue-500 text-white text-[9px] font-black rounded-lg hover:bg-blue-600 disabled:opacity-30 transition"><Check size={10} /></button>
                                <button onClick={() => { setAddingCategory(false); setNewCategoryInput(''); }}
                                  className="px-2 py-1 bg-slate-100 text-slate-500 text-[9px] rounded-lg hover:bg-slate-200 transition"><X size={10} /></button>
                              </div>
                            ) : (
                              <button onClick={() => setAddingCategory(true)}
                                className="w-full py-2 flex items-center justify-center gap-2 text-[9px] font-black text-blue-600 hover:bg-blue-50 border border-dashed border-blue-200 rounded-lg mt-2 transition-all">
                                <Plus size={12} /> AÑADIR CATEGORÍA
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* Save Button */}
                    <div className="p-4 bg-white border-t border-slate-200 space-y-1.5">
                      {autoSaving && (
                        <p className="flex items-center justify-center gap-1 text-[9px] text-slate-400 animate-pulse">
                          <Loader2 size={9} className="animate-spin" /> Guardando cambios automáticamente…
                        </p>
                      )}
                      <button onClick={() => handleSaveChanges(activeViewId!)} disabled={applying || autoSaving}
                        className={`w-full py-3 flex items-center justify-center gap-2 text-[11px] font-black rounded-xl transition-all shadow-sm ${
                          savedSuccess ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60'
                        }`}>
                        {applying ? <Loader2 size={14} className="animate-spin" /> : savedSuccess ? <CheckCircle2 size={14} /> : <Save size={14} />}
                        {savedSuccess ? '¡CAMBIOS GUARDADOS!' : 'GUARDAR CONFIGURACIÓN'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── WBS Right Panel (WBS tab only) ── */}
            {mainTab === 'wbs' && viewerReady && (() => {
              const seqNodes = getWbsSeqNodes();
              const allDates = [...seqNodes.map(n => n.start).filter(Boolean), ...seqNodes.map(n => n.end).filter(Boolean)];
              const minDate = allDates.length > 0 ? allDates.reduce((a, b) => a < b ? a : b) : '';
              const maxDate = allDates.length > 0 ? allDates.reduce((a, b) => a > b ? a : b) : '';
              const totalDays = (minDate && maxDate)
                ? Math.max(1, Math.round((new Date(maxDate).getTime() - new Date(minDate).getTime()) / 86400000))
                : 1;
              const dateToX = (dateStr: string, w: number): number => {
                if (!dateStr || !minDate) return 0;
                const diff = new Date(dateStr).getTime() - new Date(minDate).getTime();
                return (diff / (totalDays * 86400000)) * w;
              };
              const tree = buildWbsTree(visibleTableRows, wbsLevels);
              const barData = Array.from(tree.entries()).map(([val, node]) => ({
                label: val, count: node.rows.length, color: wbsNodeColors[val] ?? '#8b5cf6',
              }));
              const maxCount = Math.max(1, ...barData.map(b => b.count));
              const scurveData: { date: string; cum: number }[] = [];
              if (seqNodes.some(n => n.start)) {
                const weekMap = new Map<string, number>();
                for (const n of [...seqNodes].filter(n => n.start).sort((a, b) => a.start.localeCompare(b.start))) {
                  const d = new Date(n.start);
                  const wk = `${d.getFullYear()}-${String(Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7)).padStart(2, '0')}`;
                  weekMap.set(wk, (weekMap.get(wk) ?? 0) + n.dbIds.length);
                }
                let cum = 0;
                for (const [wk, cnt] of Array.from(weekMap.entries()).sort(([a], [b]) => a.localeCompare(b))) {
                  cum += cnt; scurveData.push({ date: wk, cum });
                }
              }
              return (
                <div className="w-[360px] bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-hidden z-10">
                  <div className="shrink-0 border-b border-slate-200 flex bg-slate-50">
                    <button onClick={() => setWbsRightPanelTab('gantt')} className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 border-b-2 transition ${wbsRightPanelTab === 'gantt' ? 'text-emerald-600 border-emerald-500 bg-white' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>
                      <CalendarDays size={11} /> Planificación
                    </button>
                    <button onClick={() => setWbsRightPanelTab('charts')} className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 border-b-2 transition ${wbsRightPanelTab === 'charts' ? 'text-violet-600 border-violet-500 bg-white' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>
                      <BarChart3 size={11} /> Gráficos
                    </button>
                  </div>

                  {wbsRightPanelTab === 'gantt' && (
                    <div className="flex-1 overflow-y-auto">
                      {seqNodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                          <CalendarDays size={28} className="text-slate-200" />
                          <p className="text-[11px] font-bold text-slate-400">Sin fechas definidas</p>
                          <p className="text-[10px] text-slate-300">Asigna fechas inicio/fin en el panel izquierdo.</p>
                        </div>
                      ) : (
                        <>
                          <div className="sticky top-0 bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex items-center gap-2 z-10">
                            <TrendingUp size={10} className="text-emerald-500" />
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex-1">Gantt</span>
                            <span className="text-[8px] text-slate-400">{minDate ? new Date(minDate).toLocaleDateString('es', {month:'short',year:'2-digit'}) : '?'}</span>
                            <span className="text-[8px] text-slate-300 mx-0.5">→</span>
                            <span className="text-[8px] text-slate-400">{maxDate ? new Date(maxDate).toLocaleDateString('es', {month:'short',year:'2-digit'}) : '?'}</span>
                          </div>
                          {seqNodes.map((node, i) => {
                            const BAR_W = 150;
                            const x1 = node.start ? dateToX(node.start, BAR_W) : 0;
                            const x2 = node.end ? dateToX(node.end, BAR_W) : (node.start ? x1 + 8 : 0);
                            const bw = Math.max(4, x2 - x1);
                            const isSeq = wbsSeqActive && i === wbsSeqStep;
                            return (
                              <div key={node.path} onClick={() => { setWbsSeqStep(i); setWbsSeqActive(true); if (viewerRef.current && node.dbIds.length) { viewerRef.current.showAll(); viewerRef.current.isolateDbIds(node.dbIds); viewerRef.current.fitToView(node.dbIds); viewerRef.current.setGhosting(true); } }}
                                className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-50 hover:bg-emerald-50/40 cursor-pointer transition ${isSeq ? 'bg-amber-50' : ''}`}
                                style={{ paddingLeft: `${12 + node.depth * 10}px` }}>
                                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: node.color }} />
                                <span className="text-[10px] font-medium text-slate-700 w-[80px] truncate shrink-0">{node.label}</span>
                                <div style={{ width: BAR_W }} className="shrink-0 relative h-3.5">
                                  <div className="absolute inset-0 bg-slate-100 rounded-full" />
                                  {(node.start || node.end) && <div className="absolute top-0.5 bottom-0.5 rounded-full" style={{ left: x1, width: bw, backgroundColor: node.color + 'cc' }} />}
                                </div>
                                <span className="text-[8px] text-slate-400 shrink-0 tabular-nums">{node.dbIds.length}</span>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}

                  {wbsRightPanelTab === 'charts' && (
                    <div className="flex-1 overflow-y-auto p-3 space-y-5">
                      {barData.length > 0 && (
                        <div>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <BarChart3 size={10} className="text-violet-500" /> Elementos por nodo WBS raíz
                          </p>
                          <div className="space-y-1.5">
                            {barData.map(b => (
                              <div key={b.label} className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: b.color }} />
                                <span className="text-[9px] text-slate-600 w-[80px] truncate shrink-0">{b.label}</span>
                                <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${(b.count / maxCount) * 100}%`, backgroundColor: b.color }} />
                                </div>
                                <span className="text-[9px] font-black text-slate-500 shrink-0 w-7 text-right">{b.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {scurveData.length > 1 && (() => {
                        const maxCum = scurveData[scurveData.length - 1]?.cum ?? 1;
                        const W = 320, H = 150, pL = 30, pB = 20, pT = 8, pR = 8;
                        const iW = W - pL - pR, iH = H - pT - pB;
                        const pts = scurveData.map((d, i) => [
                          pL + (i / Math.max(1, scurveData.length - 1)) * iW,
                          pT + iH - (d.cum / maxCum) * iH,
                        ] as [number, number]);
                        const linePath = `M ${pts.map(p => p.join(',')).join(' L ')}`;
                        const fillPath = `M ${pL},${pT + iH} L ${pts.map(p => p.join(',')).join(' L ')} L ${pL + iW},${pT + iH} Z`;
                        const yTicks = [0, 0.5, 1].map(r => ({ v: Math.round(r * maxCum), y: pT + iH - r * iH }));
                        const xIdxs = scurveData.length <= 5 ? scurveData.map((_, i) => i) : [0, Math.floor((scurveData.length - 1) / 2), scurveData.length - 1];
                        return (
                          <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                              <TrendingUp size={10} className="text-emerald-500" /> Curva S — acumulado planificado
                            </p>
                            <div className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
                              <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
                                {yTicks.map(t => (
                                  <g key={t.v}>
                                    <line x1={pL} y1={t.y} x2={pL + iW} y2={t.y} stroke="#e2e8f0" strokeWidth="1" />
                                    <text x={pL - 3} y={t.y + 3} textAnchor="end" fontSize="7" fill="#94a3b8">{t.v}</text>
                                  </g>
                                ))}
                                <path d={fillPath} fill="#8b5cf6" fillOpacity="0.1" />
                                <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" fill="#8b5cf6" />)}
                                {xIdxs.map((idx, i) => (
                                  <text key={i} x={pts[idx][0]} y={H - 4} textAnchor="middle" fontSize="7" fill="#94a3b8">{scurveData[idx]?.date?.slice(-5)}</text>
                                ))}
                                <line x1={pL} y1={pT} x2={pL} y2={pT + iH} stroke="#cbd5e1" strokeWidth="1" />
                                <line x1={pL} y1={pT + iH} x2={pL + iW} y2={pT + iH} stroke="#cbd5e1" strokeWidth="1" />
                              </svg>
                              <div className="flex items-center justify-between px-3 py-1 border-t border-slate-100">
                                <span className="text-[8px] text-slate-400">{scurveData[0]?.date}</span>
                                <span className="text-[9px] font-black text-violet-600">{maxCum} elem. totales</span>
                                <span className="text-[8px] text-slate-400">{scurveData[scurveData.length - 1]?.date}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      {barData.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                          <BarChart3 size={28} className="text-slate-200" />
                          <p className="text-[11px] font-bold text-slate-400">Sin datos</p>
                          <p className="text-[10px] text-slate-300">Carga datos en la pestaña TABLA del VISOR 3D primero.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* ── Merge Modal ── */}
      {mergeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a1628] border border-white/10 rounded-2xl shadow-2xl w-[360px] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[12px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <Merge size={13} className="text-blue-400" /> Fusionar Vistas
                </h3>
                <p className="text-[9px] text-white/40 mt-0.5">Combina los grupos de 2 o más vistas en una nueva vista</p>
              </div>
              <button onClick={() => setMergeOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition">
                <X size={14} />
              </button>
            </div>

            {/* View selector */}
            <div className="space-y-1.5 mb-4 max-h-52 overflow-y-auto">
              {savedViews.map(view => (
                <label key={view.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition ${
                  mergeSelected.has(view.id) ? 'bg-blue-500/15 border-blue-500/40' : 'bg-white/5 border-white/5 hover:bg-white/8'
                }`}>
                  <input type="checkbox" checked={mergeSelected.has(view.id)}
                    onChange={e => {
                      const next = new Set(mergeSelected);
                      e.target.checked ? next.add(view.id) : next.delete(view.id);
                      setMergeSelected(next);
                    }}
                    className="accent-blue-500 w-3.5 h-3.5 cursor-pointer shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] font-black truncate ${mergeSelected.has(view.id) ? 'text-blue-300' : 'text-white/70'}`}>{view.name}</p>
                    <p className="text-[8px] text-white/30">{view.colorNodes.length} grupos</p>
                  </div>
                  {/* Color strip */}
                  <div className="flex gap-0.5 shrink-0">
                    {view.colorNodes.slice(0, 6).map((n, i) => (
                      <div key={i} className="w-2 h-4 rounded-sm" style={{ backgroundColor: n.color }} />
                    ))}
                  </div>
                </label>
              ))}
            </div>

            {/* Preview */}
            {mergeSelected.size >= 2 && (
              <div className="mb-3 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <p className="text-[9px] text-blue-300 font-bold">
                  {(() => {
                    const groups = new Set(
                      savedViews.filter(v => mergeSelected.has(v.id)).flatMap(v => v.colorNodes.map(n => n.value))
                    ).size;
                    return `${groups} grupos en la vista resultante`;
                  })()}
                </p>
              </div>
            )}

            {/* Name input */}
            <input
              value={mergeName}
              onChange={e => setMergeName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleMergeViews()}
              placeholder="Nombre de la vista fusionada…"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-[11px] text-white font-bold placeholder:text-white/20 outline-none focus:border-blue-500/40 mb-3"
            />

            <div className="flex gap-2">
              <button onClick={() => setMergeOpen(false)}
                className="flex-1 py-2 rounded-xl border border-white/10 text-[10px] font-black text-white/40 hover:bg-white/5 transition">
                Cancelar
              </button>
              <button
                onClick={handleMergeViews}
                disabled={mergeSelected.size < 2 || !mergeName.trim()}
                className="flex-2 px-5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-black transition disabled:opacity-30 flex items-center gap-1.5 justify-center"
              >
                <Merge size={11} /> Crear vista fusionada
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Formula Editor Modal ─── */}
      {editingFormula && (() => {
        const isNew = !formulaColumns.some(c => c.key === editingFormula.key);
        const OPERATORS: { value: FormulaOperator; label: string }[] = [
          { value: 'equals',      label: 'es igual a' },
          { value: 'notEquals',   label: 'no es igual a' },
          { value: 'contains',    label: 'contiene' },
          { value: 'notContains', label: 'no contiene' },
          { value: 'startsWith',  label: 'empieza con' },
          { value: 'endsWith',    label: 'termina con' },
          { value: 'notEmpty',    label: 'no está vacío' },
          { value: 'isEmpty',     label: 'está vacío' },
        ];
        const needsMatch = (op: FormulaOperator) => !['notEmpty', 'isEmpty'].includes(op);

        const allCols: { key: string; label: string }[] = [
          { key: '__name__',  label: 'Nombre de elemento' },
          { key: '__view__',  label: 'Nombre de vista' },
          { key: '__group__', label: 'Grupo (color)' },
          ...(bimColumns.map(c => ({ key: c.key, label: `${c.category} › ${c.displayName}` }))),
          ...(customColumns.map((c: CustomCol) => ({ key: c.key, label: c.label }))),
        ];

        const updateRule = (ruleId: string, patch: Partial<FormulaRule>) => {
          setEditingFormula(prev => prev ? {
            ...prev,
            rules: prev.rules.map(r => r.id === ruleId ? { ...r, ...patch } : r),
          } : null);
        };

        const addRule = () => {
          setEditingFormula(prev => prev ? {
            ...prev,
            rules: [...prev.rules, { id: `r${Date.now()}`, sourceColKey: allCols[0]?.key ?? '', operator: 'equals', matchValue: '', outputValue: '' }],
          } : null);
        };

        const removeRule = (ruleId: string) => {
          setEditingFormula(prev => prev ? { ...prev, rules: prev.rules.filter(r => r.id !== ruleId) } : null);
        };

        const handleSave = async () => {
          if (!editingFormula.label.trim()) return;
          const next = isNew
            ? [...formulaColumns, editingFormula]
            : formulaColumns.map(c => c.key === editingFormula.key ? editingFormula : c);
          setFormulaColumns(next);
          await setBimLinkerKey(project_id, 'formula_cols', next);
          setEditingFormula(null);
        };

        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditingFormula(null)}>
            <div
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white shrink-0">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                  <Zap size={15} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-violet-700 uppercase tracking-widest">
                    {isNew ? 'Nueva columna fórmula' : 'Editar columna fórmula'}
                  </p>
                  <p className="text-[10px] text-slate-400">Reglas SI → ENTONCES evaluadas por fila</p>
                </div>
                <button onClick={() => setEditingFormula(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
                  <X size={14} />
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

                {/* Column label */}
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Nombre de la columna</label>
                  <input
                    autoFocus
                    value={editingFormula.label}
                    onChange={e => setEditingFormula(prev => prev ? { ...prev, label: e.target.value } : null)}
                    placeholder="Ej: Tipo de elemento, Partida, Sistema…"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-800 placeholder:text-slate-300 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200 transition"
                  />
                </div>

                {/* Rules */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Reglas (se evalúan en orden)</label>
                    <button
                      onClick={addRule}
                      className="flex items-center gap-1 px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-[9px] font-black transition"
                    >
                      <Plus size={10} /> Añadir regla
                    </button>
                  </div>

                  <div className="space-y-2">
                    {editingFormula.rules.map((rule, idx) => (
                      <div key={rule.id} className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        {/* Rule index */}
                        <span className="mt-1.5 w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-[9px] font-black flex items-center justify-center shrink-0">{idx + 1}</span>

                        <div className="flex-1 grid grid-cols-[1fr_auto_1fr_1fr] gap-2 min-w-0">
                          {/* Source column */}
                          <div>
                            <p className="text-[8px] text-slate-400 font-black uppercase mb-1">SI columna</p>
                            <select
                              value={rule.sourceColKey}
                              onChange={e => updateRule(rule.id, { sourceColKey: e.target.value })}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-700 outline-none focus:border-violet-400 transition"
                            >
                              {allCols.map(c => (
                                <option key={c.key} value={c.key}>{c.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Operator */}
                          <div>
                            <p className="text-[8px] text-slate-400 font-black uppercase mb-1">Condición</p>
                            <select
                              value={rule.operator}
                              onChange={e => updateRule(rule.id, { operator: e.target.value as FormulaOperator })}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-700 outline-none focus:border-violet-400 transition"
                            >
                              {OPERATORS.map(op => (
                                <option key={op.value} value={op.value}>{op.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Match value */}
                          <div>
                            <p className="text-[8px] text-slate-400 font-black uppercase mb-1">Valor a comparar</p>
                            {needsMatch(rule.operator) ? (
                              <input
                                value={rule.matchValue}
                                onChange={e => updateRule(rule.id, { matchValue: e.target.value })}
                                placeholder="Texto…"
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-700 placeholder:text-slate-300 outline-none focus:border-violet-400 transition"
                              />
                            ) : (
                              <div className="px-2 py-1.5 bg-slate-100 rounded-lg text-[9px] text-slate-400 italic">N/A</div>
                            )}
                          </div>

                          {/* Output value */}
                          <div>
                            <p className="text-[8px] text-slate-400 font-black uppercase mb-1">ENTONCES escribe</p>
                            <input
                              value={rule.outputValue}
                              onChange={e => updateRule(rule.id, { outputValue: e.target.value })}
                              placeholder="Resultado…"
                              className="w-full px-2 py-1.5 bg-white border border-violet-200 rounded-lg text-[9px] font-bold text-violet-700 placeholder:text-violet-200 outline-none focus:border-violet-400 transition"
                            />
                          </div>
                        </div>

                        {/* Delete rule */}
                        <button
                          onClick={() => removeRule(rule.id)}
                          disabled={editingFormula.rules.length === 1}
                          className="mt-1.5 p-1 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-50 transition disabled:opacity-20"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Default value */}
                <div>
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                    Valor por defecto <span className="font-normal normal-case text-slate-400">(cuando ninguna regla coincide)</span>
                  </label>
                  <input
                    value={editingFormula.defaultValue}
                    onChange={e => setEditingFormula(prev => prev ? { ...prev, defaultValue: e.target.value } : null)}
                    placeholder="Dejar vacío o escribir un valor…"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-600 placeholder:text-slate-300 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-200 transition"
                  />
                </div>

                {/* Live preview */}
                {editingFormula.rules.length > 0 && (
                  <div className="p-3 bg-violet-50 border border-violet-100 rounded-xl">
                    <p className="text-[9px] font-black text-violet-600 uppercase tracking-widest mb-2">Vista previa de lógica</p>
                    <div className="space-y-1">
                      {editingFormula.rules.map((rule, idx) => {
                        const col = allCols.find(c => c.key === rule.sourceColKey);
                        const op = OPERATORS.find(o => o.value === rule.operator);
                        return (
                          <p key={rule.id} className="text-[10px] text-violet-700 font-mono">
                            <span className="text-violet-400">#{idx + 1}</span>{' '}
                            SI <span className="font-black">{col?.label ?? rule.sourceColKey}</span>{' '}
                            {op?.label}{' '}
                            {needsMatch(rule.operator) && <span className="font-black">&ldquo;{rule.matchValue}&rdquo;</span>}
                            {' '}→ <span className="font-black text-violet-600">&ldquo;{rule.outputValue}&rdquo;</span>
                          </p>
                        );
                      })}
                      <p className="text-[10px] text-slate-400 font-mono">
                        Por defecto → &ldquo;{editingFormula.defaultValue || '(vacío)'}&rdquo;
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50 shrink-0">
                <button
                  onClick={() => setEditingFormula(null)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 text-[10px] font-black text-slate-400 hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={!editingFormula.label.trim()}
                  className="flex-2 px-6 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black transition disabled:opacity-30 flex items-center gap-1.5 justify-center"
                >
                  <Zap size={11} /> {isNew ? 'Crear columna' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
