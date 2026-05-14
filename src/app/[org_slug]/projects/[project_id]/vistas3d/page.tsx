'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { setBimLinkerKey } from '@/lib/supabase/projectConfig';
import { Loader2, MonitorPlay, Check, Layers, AlertCircle, MousePointer2, Paintbrush, EyeOff, Plus, Save, CheckCircle2, Copy, Trash2, X, Merge, ChevronUp, ChevronDown, Pencil, Clock, Camera, History, BoxSelect, RotateCcw, FolderPlus, MousePointerClick } from 'lucide-react';
import type { BimConfig } from '@/components/modules/BimConfigModal';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import type { SavedColorView } from '@/components/awp/BimDataLinker';
import ModelTree from '@/components/awp/ModelTree';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

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
  // Paint feedback: index of node just painted
  const [paintedNodeIdx, setPaintedNodeIdx] = useState<number | null>(null);

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
            const loadedViews = await Promise.all((linker.savedViews as SavedColorView[]).map(async v => ({
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
            setSavedViews(loadedViews);
          }
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

  // Selection count is updated via onSelectionChange on ForgeViewer (event-driven, no polling)

  // Auto-aplicar removido por solicitud del usuario para iniciar con el modelo limpio
  /*
  useEffect(() => {
    if (viewerReady && savedViews.length > 0 && !activeViewId && !applying) {
      applyView(savedViews[0]);
    }
  }, [viewerReady, savedViews.length > 0]);
  */

  // Guarda SOLO bim_linker.savedViews via RPC atómica (1 sola llamada, sin leer antes).
  // Payload mínimo: guid + categoría + nombre + color (sin dbIds).
  // Guarda las vistas en Supabase.
  // Ahora PERSISTIMOS los dbIds para que la carga sea instantánea al volver a entrar.
  const persistViews = async (views: SavedColorView[]) => {
    try {
      const compressedViews = await Promise.all(views.map(async v => {
        // Compresion de nodos principales
        const colorNodes = await Promise.all(sanitizeNodes(v.colorNodes).map(async n => {
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
      await setBimLinkerKey(project_id, 'savedViews', compressedViews);
    } catch (e: any) {
      console.error('[BIM] Error persistiendo vistas:', e?.message ?? e);
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
            persistViews(prev.map(v => v.id !== view.id ? v : updatedView));
            return prev.map(v => v.id !== view.id ? v : updatedView);
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
    const newNode = { value: trimmed, color, visible: true, guids: [], dbIds: [] };
    setSavedViews(prev => {
      const updated = prev.map(v => v.id !== viewId ? v : { ...v, colorNodes: [...v.colorNodes, newNode] });
      persistViews(updated);
      return updated;
    });
    if (activeViewId === viewId) setActiveNodes(prev => [...prev, newNode]);
    setAddingCategory(false);
    setNewCategoryInput('');
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
    const next = activeNodes.map((n, i) => i === idx ? { ...n, value: trimmed } : n);
    setActiveNodes(next);
    setSavedViews(prev => {
      const updated = prev.map(v => v.id !== viewId ? v : { ...v, colorNodes: next });
      persistViews(updated);
      return updated;
    });

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

          {/* View Selector Dropdown */}
          <div className="flex items-center gap-3">
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
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>

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
            {/* ── Left Sidebar (Model Tree) ── */}
            {viewerReady && treeOpen && (
              <div style={{ width: treeWidth }} className="bg-[#0a1628] border-r border-white/5 flex flex-col shadow-2xl relative z-10 shrink-0">
                <div className="p-3 border-b border-white/5 shrink-0 flex items-center justify-between">
                  <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Layers size={13} className="text-blue-400" /> Árbol del Modelo
                  </h3>
                  <button onClick={() => setTreeOpen(false)} className="text-white/30 hover:text-white transition">
                    <X size={14} />
                  </button>
                </div>
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
                      // Extrar dbIds hoja de la rama
                      const leafIds = vr.getLeafDbIds([dbId]);
                      if (!leafIds.length) { alert('La rama está vacía.'); return; }
                      
                      // Extraer GUIDs reales
                      // OPTIMIZATION: If the name is long enough, use it as a Universal Index key to save 99% of JSON payload size.
                      // If it's too short or contains weird chars, fallback to extracting all externalIds.
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
                      // Re-apply active view colors if there is one
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
                      // Build final state from current (non-stale) activeNodes and savedViews
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

                {/* Resize handle */}
                <div
                  onMouseDown={startTreeResize}
                  className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-20 hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors"
                  title="Arrastrar para redimensionar"
                />
              </div>
            )}

            {/* ── Center Viewer ── */}
            <div className="flex-1 relative">
              {/* Toggle Tree Button */}
              {viewerReady && !treeOpen && (
                <button
                  onClick={() => setTreeOpen(true)}
                  className="absolute top-4 left-4 z-20 bg-[#0a1628]/90 backdrop-blur-md border border-white/10 text-white px-3 py-2 rounded shadow-xl flex items-center gap-2 hover:bg-white/10 transition group"
                >
                  <Layers size={14} className="text-blue-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Árbol</span>
                </button>
              )}
              <ForgeViewer
                ref={viewerRef}
                urn={config.urn}
                onReady={() => setViewerReady(true)}
                onSelectionChange={(dbIds) => {
                  setSelectionCount(dbIds.length);
                  if (!dbIds.length) {
                    setHighlightedTreeDbId(null);
                    setTreeExpandPath([]);
                    return;
                  }
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

            {/* ── Right Sidebar (Category Details) ── */}
            {viewerReady && (
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
                        {renamingViewId === activeViewId ? (
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
                            onDoubleClick={() => { setRenamingViewId(activeViewId!); setRenamingViewValue(savedViews.find(v => v.id === activeViewId)?.name || ''); }}
                            title={savedViews.find(v => v.id === activeViewId)?.name}
                          >
                            {savedViews.find(v => v.id === activeViewId)?.name}
                          </span>
                        )}
                        <button
                          onClick={() => { setRenamingViewId(activeViewId!); setRenamingViewValue(savedViews.find(v => v.id === activeViewId)?.name || ''); }}
                          className="shrink-0 p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition"
                          title="Renombrar"
                        >
                          <Pencil size={11} />
                        </button>
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
                    {activeNodes.length === 0 && !addingCategory && (
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
                    )}

                    {/* Categories List (Compact) */}
                    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
                      {activeNodes.map((node, idx) => {
                        const isPainted = paintedNodeIdx === idx;
                        const hasSelection = selectionCount > 0;
                        return (
                          <div key={`${node.value}-${idx}`}
                            className={`group/node border-b border-slate-100 flex items-center gap-2 p-1.5 transition-colors rounded ${isPainted ? 'bg-emerald-50 border-emerald-200' : 'bg-white hover:bg-slate-50'}`}>
                            <input type="color" value={node.color}
                              onChange={e => updateNodeState(idx, { color: e.target.value })}
                              onBlur={applyColorsNow}
                              className="w-4 h-4 rounded-sm cursor-pointer border-none bg-transparent shrink-0" />

                            <div className="flex-1 min-w-0">
                              {renamingNodeIdx === idx ? (
                                <input
                                  ref={renameInputRef}
                                  autoFocus
                                  value={renamingValue}
                                  onChange={e => setRenamingValue(e.target.value)}
                                  onBlur={() => handleRenameNode(activeViewId!, idx, renamingValue)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleRenameNode(activeViewId!, idx, renamingValue); if (e.key === 'Escape') setRenamingNodeIdx(null); }}
                                  className="w-full text-[10px] font-bold text-slate-900 bg-white border border-blue-400 rounded px-1 py-0.5 outline-none"
                                />
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

                            {/* Actions: paint button always visible when selection active */}
                            <div className={`flex items-center gap-0.5 transition-opacity ${hasSelection || isPainted ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100'}`}>
                              <button onClick={() => handleZoomNode(idx)}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="Ver en modelo">
                                <MousePointer2 size={11} />
                              </button>
                              <button onClick={() => handleAssignSelectionToNode(activeViewId!, idx)}
                                className={`p-1 rounded transition ${hasSelection ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                                title={hasSelection ? `Pintar ${selectionCount} elem. en este grupo` : 'Pintar selección'}>
                                <Paintbrush size={11} />
                              </button>
                              <button onClick={() => handleRemoveFromNode(activeViewId!, idx)}
                                className="p-1 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded transition"
                                title={hasSelection ? 'Quitar seleccionados de este grupo' : 'Vaciar grupo (elementos vuelven a sin color)'}>
                                <Trash2 size={11} />
                              </button>
                              <button onClick={() => handleDeleteNode(activeViewId!, idx)}
                                className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition"
                                title="Eliminar categoría">
                                <X size={11} />
                              </button>
                            </div>

                            <input type="checkbox" checked={node.visible}
                              onChange={e => updateNode(idx, { visible: e.target.checked })}
                              className="accent-blue-600 cursor-pointer w-3.5 h-3.5 shrink-0 ml-1" />
                          </div>
                        );
                      })}

                      {/* Inline add category */}
                      {addingCategory ? (
                        <div className="flex gap-1 mt-2">
                          <input
                            autoFocus
                            value={newCategoryInput}
                            onChange={e => setNewCategoryInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleAddNewCategory(activeViewId!, newCategoryInput);
                              if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryInput(''); }
                            }}
                            placeholder="Nombre de la categoría…"
                            className="flex-1 text-[10px] px-2 py-1 border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          <button onClick={() => handleAddNewCategory(activeViewId!, newCategoryInput)}
                            disabled={!newCategoryInput.trim()}
                            className="px-2 py-1 bg-blue-500 text-white text-[9px] font-black rounded-lg hover:bg-blue-600 disabled:opacity-30 transition">
                            <Check size={10} />
                          </button>
                          <button onClick={() => { setAddingCategory(false); setNewCategoryInput(''); }}
                            className="px-2 py-1 bg-slate-100 text-slate-500 text-[9px] rounded-lg hover:bg-slate-200 transition">
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setAddingCategory(true)}
                          className="w-full py-2 flex items-center justify-center gap-2 text-[9px] font-black text-blue-600 hover:bg-blue-50 border border-dashed border-blue-200 rounded-lg mt-2 transition-all">
                          <Plus size={12} /> AÑADIR CATEGORÍA
                        </button>
                      )}
                    </div>

                    {/* Save Button */}
                    <div className="p-4 bg-white border-t border-slate-200">
                      <button onClick={() => handleSaveChanges(activeViewId!)} disabled={applying}
                        className={`w-full py-3 flex items-center justify-center gap-2 text-[11px] font-black rounded-xl transition-all shadow-sm ${
                          savedSuccess ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}>
                        {applying ? <Loader2 size={14} className="animate-spin" /> : savedSuccess ? <CheckCircle2 size={14} /> : <Save size={14} />}
                        {savedSuccess ? '¡CAMBIOS GUARDADOS!' : 'GUARDAR CONFIGURACIÓN'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
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
    </div>
  );
}
