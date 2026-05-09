'use client';

import { use, useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { setBimLinkerKey } from '@/lib/supabase/projectConfig';
import { Loader2, MonitorPlay, Check, Layers, AlertCircle, MousePointer2, Paintbrush, EyeOff, Plus, Save, CheckCircle2, Copy, Trash2, X, Merge } from 'lucide-react';
import type { BimConfig } from '@/components/modules/BimConfigModal';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import type { SavedColorView } from '@/components/awp/BimDataLinker';

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
  const [activeViewMode, setActiveViewMode] = useState<'all'|'isolate'|'ghost'>('all');
  const [activeNodes, setActiveNodes] = useState<SavedColorView['colorNodes']>([]);
  const [applying, setApplying] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Merge modal state
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeName, setMergeName] = useState('');

  const viewerRef = useRef<ForgeViewerHandle>(null);

  useEffect(() => {
    let retries = 0;
    const load = async () => {
      try {
        const supabase = createClient();
        const { data } = await (supabase as any)
          .from('projects').select('module_config').eq('id', project_id).single();
        const mc = data?.module_config as Record<string, unknown> | null;
        const bim = mc?.bim as BimConfig | undefined;
        const linker = mc?.bim_linker as { savedViews?: SavedColorView[] } | undefined;
        if (linker?.savedViews) setSavedViews(linker.savedViews);
        if (bim) {
          setConfig(bim);
          setLoading(false);
        } else if (retries < 3) {
          // Config may not be saved yet — retry silently up to 3×
          retries++;
          setTimeout(load, 3000);
        } else {
          setLoading(false);
        }
      } catch (e) { console.error('Error cargando vistas 3D', e); setLoading(false); }
    };
    load();
  }, [project_id]);

  const persistDbIds = async (updatedViews: SavedColorView[]) => {
    try {
      await setBimLinkerKey(project_id, 'savedViews', updatedViews);
    } catch (e) { console.warn('[BIM] Error guardando:', e); }
  };

  const applyView = async (view: SavedColorView | null, overrideNodes?: SavedColorView['colorNodes'], overrideMode?: 'all'|'isolate'|'ghost') => {
    if (!view) return;
    const mode  = overrideMode ?? (activeViewId === view.id ? activeViewMode : view.viewMode);
    const nodes = overrideNodes ?? (activeViewId === view.id ? activeNodes : view.colorNodes);

    if (activeViewId !== view.id) {
      setActiveViewId(view.id);
      setActiveNodes(view.colorNodes);
      setActiveViewMode(view.viewMode);
    }

    const vr = viewerRef.current;
    if (!vr) return;
    setApplying(true);
    try {
      const visible = nodes.filter(n => n.visible);
      const colorMap = new Map<string, number[]>();
      let allDbIds: number[] = [];

      const allCached = visible.every(n => n.dbIds && n.dbIds.length > 0);
      if (allCached) {
        for (const node of visible) {
          const ids = node.dbIds!;
          colorMap.set(node.color, [...(colorMap.get(node.color) ?? []), ...ids]);
          allDbIds.push(...ids);
        }
      } else {
        if (!vr.isUniversalIndexReady()) await vr.buildUniversalIndex();
        const resolved = await Promise.all(
          visible.map(async node => {
            const rawIds = node.dbIds?.length ? node.dbIds : await vr.resolveByUniversal(node.guids ?? []);
            const leafIds = rawIds.length ? vr.getLeafDbIds(rawIds) : rawIds;
            return { node, dbIds: leafIds };
          })
        );
        for (const { node, dbIds } of resolved) {
          if (!dbIds.length) continue;
          colorMap.set(node.color, [...(colorMap.get(node.color) ?? []), ...dbIds]);
          allDbIds.push(...dbIds);
        }
        const resolvedMap = new Map(resolved.map(r => [r.node.value, r.dbIds]));
        const updatedViews = savedViews.map(v => v.id !== view.id ? v : {
          ...v,
          colorNodes: v.colorNodes.map(n => ({ ...n, dbIds: resolvedMap.get(n.value) ?? n.dbIds })),
        });
        setActiveNodes(prev => prev.map(n => {
          const ids = resolvedMap.get(n.value);
          return ids?.length ? { ...n, dbIds: ids } : n;
        }));
        setSavedViews(updatedViews);
        persistDbIds(updatedViews);
      }

      vr.showAll(); vr.setGhosting(false);
      vr.applyThemingBatch(colorMap);
      if (mode === 'isolate' && allDbIds.length) vr.isolateDbIds(allDbIds);
      else if (mode === 'ghost' && allDbIds.length) { vr.isolateDbIds(allDbIds); vr.setGhosting(true); }
    } catch (e) { console.warn('[BIM] Error aplicando vista:', e); }
    finally { setApplying(false); }
  };

  const updateNode = (index: number, changes: Partial<SavedColorView['colorNodes'][0]>) => {
    const next = [...activeNodes];
    const cachedDbIds = savedViews.find(v => v.id === activeViewId)?.colorNodes[index]?.dbIds;
    next[index] = { ...next[index], dbIds: next[index].dbIds?.length ? next[index].dbIds : cachedDbIds, ...changes };
    setActiveNodes(next);
    const view = savedViews.find(v => v.id === activeViewId);
    if (view) applyView(view, next);
  };

  const applyColorsNow = () => {
    const view = savedViews.find(v => v.id === activeViewId);
    if (view) applyView(view, activeNodes, activeViewMode);
  };

  // ── Delete a single color node — elements absorbed into (vacío) ──────────
  const handleDeleteNode = async (viewId: string, nodeIndex: number) => {
    const deleted = activeNodes[nodeIndex];
    const rest    = activeNodes.filter((_, i) => i !== nodeIndex);

    // Merge deleted node's elements into (vacío), creating it if needed
    const VACIO = '(vacío)';
    const vacioIdx = rest.findIndex(n => n.value === VACIO);
    let next: SavedColorView['colorNodes'];
    if (vacioIdx >= 0) {
      next = rest.map((n, i) => i !== vacioIdx ? n : {
        ...n,
        guids:  [...(n.guids  ?? []), ...(deleted.guids  ?? [])],
        dbIds:  [...(n.dbIds  ?? []), ...(deleted.dbIds  ?? [])],
      });
    } else {
      next = [...rest, {
        value:   VACIO,
        color:   '#94a3b8',
        visible: true,
        guids:   deleted.guids  ?? [],
        dbIds:   deleted.dbIds  ?? [],
      }];
    }

    setActiveNodes(next);
    const updatedViews = savedViews.map(v => v.id !== viewId ? v : { ...v, colorNodes: next });
    setSavedViews(updatedViews);
    const view = savedViews.find(v => v.id === viewId);
    if (view) applyView({ ...view, colorNodes: next }, next);
    await persistDbIds(updatedViews);
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
    const updatedViews = [...savedViews, copy];
    setSavedViews(updatedViews);
    await persistDbIds(updatedViews);
  };

  // ── Delete a view ────────────────────────────────────────────────────────
  const handleDeleteView = async (viewId: string) => {
    if (!confirm('¿Eliminar esta vista permanentemente?')) return;
    const updatedViews = savedViews.filter(v => v.id !== viewId);
    setSavedViews(updatedViews);
    if (activeViewId === viewId) {
      setActiveViewId(null); setActiveNodes([]);
      viewerRef.current?.showAll(); viewerRef.current?.clearHighlights();
    }
    await persistDbIds(updatedViews);
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
    const updatedViews = [...savedViews, newView];
    setSavedViews(updatedViews);
    await persistDbIds(updatedViews);
    setMergeOpen(false);
    setMergeSelected(new Set());
    setMergeName('');
  };

  const handleAssignSelectionToNode = async (viewId: string, nodeIndex: number) => {
    const vr = viewerRef.current;
    if (!vr) return;
    const rawSelectedDbIds = vr.getSelectedIds();
    if (!rawSelectedDbIds.length) return;
    const selectedDbIds = vr.getLeafDbIds ? vr.getLeafDbIds(rawSelectedDbIds) : rawSelectedDbIds;
    setApplying(true);
    try {
      let selectedGuids: string[] = [];
      try {
        const map = await vr.getExternalIdMapping();
        const rev = new Map(Object.entries(map).map(([k, v]) => [v, k]));
        selectedGuids = selectedDbIds.map(id => rev.get(id)).filter(Boolean) as string[];
      } catch {}
      const dbSet = new Set(selectedDbIds);
      const gSet  = new Set(selectedGuids);
      const updatedViews = savedViews.map(v => {
        if (v.id !== viewId) return v;
        return { ...v, colorNodes: v.colorNodes.map((node, i) => i === nodeIndex
          ? { ...node, dbIds: Array.from(new Set([...(node.dbIds||[]), ...selectedDbIds])), guids: Array.from(new Set([...(node.guids||[]), ...selectedGuids])) }
          : { ...node, dbIds: (node.dbIds||[]).filter(id => !dbSet.has(id)), guids: (node.guids||[]).filter(g => !gSet.has(g)) }
        )};
      });
      setSavedViews(updatedViews);
      if (activeViewId === viewId) {
        const newNodes = updatedViews.find(v => v.id === viewId)!.colorNodes;
        setActiveNodes(newNodes);
        const colorMap = new Map<string, number[]>();
        newNodes.filter(n => n.visible).forEach(n => {
          if (n.dbIds?.length) colorMap.set(n.color, [...(colorMap.get(n.color)??[]), ...n.dbIds]);
        });
        vr.applyThemingBatch(colorMap);
      }
      await persistDbIds(updatedViews);
      vr.select([]);
    } catch (e) { console.error('Error asignando selección', e); }
    finally { setApplying(false); }
  };

  const handleAddNewCategory = async (viewId: string) => {
    const newName = prompt('Nombre de la nueva categoría:');
    if (!newName?.trim()) return;
    const color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    const newNode = { value: newName.trim(), color, visible: true, guids: [], dbIds: [] };
    const updatedViews = savedViews.map(v => v.id !== viewId ? v : { ...v, colorNodes: [...v.colorNodes, newNode] });
    setSavedViews(updatedViews);
    if (activeViewId === viewId) setActiveNodes([...activeNodes, newNode]);
    await persistDbIds(updatedViews);
  };

  const handleSaveChanges = async (viewId: string) => {
    setApplying(true);
    try {
      const updatedViews = savedViews.map(v => {
        if (v.id !== viewId) return v;
        const mergedNodes = activeNodes.map(an => {
          const cached = v.colorNodes.find(cn => cn.value === an.value);
          return { ...an, dbIds: an.dbIds?.length ? an.dbIds : cached?.dbIds };
        });
        return { ...v, colorNodes: mergedNodes, viewMode: activeViewMode };
      });
      setSavedViews(updatedViews);
      await persistDbIds(updatedViews);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (e) { console.error('Error guardando vista', e); }
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
    <div className="flex flex-col h-[calc(100vh-65px)] overflow-hidden -mx-8 -my-8 bg-[#0C1E4F]">

      {/* ── Top bar ── */}
      <div className="shrink-0 bg-[#0C1E4F] px-5 py-2.5 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <MonitorPlay size={13} className="text-blue-400" />
          </div>
          <div>
            <p className="text-[11px] font-black text-white uppercase tracking-widest leading-none">Vistas 3D Guardadas</p>
            {config && <p className="text-[9px] text-blue-300 font-bold mt-0.5 truncate max-w-[260px]">{config.modelName}</p>}
          </div>
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
            <div className="flex-1 relative">
              <ForgeViewer ref={viewerRef} urn={config.urn} onReady={() => setViewerReady(true)} />
            </div>

            {/* ── Sidebar ── */}
            {viewerReady && (
              <div className="w-[292px] bg-[#0a1628] border-l border-white/5 flex flex-col shadow-2xl relative z-10 shrink-0">

                {/* Header */}
                <div className="p-4 border-b border-white/5 shrink-0 flex items-center justify-between">
                  <div>
                    <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <Layers size={13} className="text-blue-400" /> Librería de Vistas
                    </h3>
                    <p className="text-[9px] text-white/30 mt-0.5">{savedViews.length} vista{savedViews.length !== 1 ? 's' : ''}</p>
                  </div>
                  {savedViews.length >= 2 && (
                    <button
                      onClick={() => { setMergeOpen(true); setMergeSelected(new Set()); setMergeName(''); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[9px] font-black uppercase tracking-wide transition"
                      title="Fusionar vistas"
                    >
                      <Merge size={11} /> Fusionar
                    </button>
                  )}
                </div>

                {/* Views list */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {savedViews.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-[10px] text-white/30 italic">No hay vistas guardadas.</p>
                      <p className="text-[8px] text-white/20 mt-1">Créalas desde "Visor BIM" → Vincular Datos.</p>
                    </div>
                  ) : savedViews.map(view => (
                    <div key={view.id} className="mb-2">

                      {/* View card */}
                      <div className={`rounded-xl border transition overflow-hidden group/card ${
                        activeViewId === view.id ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/5 hover:bg-white/8 hover:border-white/10'
                      }`}>
                        {/* Main row */}
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <button onClick={() => applyView(view)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${activeViewId === view.id ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-white/20'}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-[10px] font-black truncate ${activeViewId === view.id ? 'text-amber-300' : 'text-white/80'}`}>{view.name}</p>
                              <p className="text-[8px] text-white/40 truncate uppercase tracking-wider">{view.colorNodes.length} grupos</p>
                            </div>
                          </button>

                          {/* Action buttons */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => handleDuplicateView(view.id)}
                              title="Duplicar vista"
                              className="p-1.5 rounded text-white/30 hover:text-blue-300 hover:bg-blue-400/10 transition"
                            ><Copy size={10} /></button>
                            <button
                              onClick={() => handleDeleteView(view.id)}
                              title="Eliminar vista"
                              className="p-1.5 rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 transition"
                            ><Trash2 size={10} /></button>
                          </div>

                          {applying && activeViewId === view.id && <Loader2 size={12} className="animate-spin text-amber-400 shrink-0" />}
                          {activeViewId === view.id && !applying && <Check size={12} className="text-amber-400 shrink-0" />}
                        </div>

                        {/* Color tree panel (active view only) */}
                        {activeViewId === view.id && (
                          <div className="px-2 py-2 bg-black/20 border-t border-white/5">
                            <div className="flex items-center justify-between px-1 mb-2">
                              <p className="text-[9px] font-black tracking-widest text-white/40 uppercase">Árbol de Color</p>
                              <div className="flex items-center gap-1">
                                <button onClick={handleHideSelection} title="Ocultar selección" className="p-1 hover:bg-white/10 rounded text-white/30 hover:text-white transition">
                                  <EyeOff size={11} />
                                </button>
                                <select
                                  value={activeViewMode}
                                  onChange={e => { setActiveViewMode(e.target.value as any); applyView(view, activeNodes, e.target.value as any); }}
                                  className="bg-transparent text-[9px] text-amber-300 font-bold outline-none cursor-pointer"
                                >
                                  <option value="all" className="bg-[#0a1628]">Mostrar todos</option>
                                  <option value="isolate" className="bg-[#0a1628]">Aislar vista</option>
                                  <option value="ghost" className="bg-[#0a1628]">Modo fantasma</option>
                                </select>
                              </div>
                            </div>

                            <div className="max-h-48 overflow-y-auto space-y-0.5 px-1">
                              {activeNodes.map((node, idx) => (
                                <div key={node.value} className="flex items-center gap-1 p-1 rounded hover:bg-white/5 transition group/node">
                                  <input type="color" value={node.color} onBlur={applyColorsNow}
                                    onChange={e => updateNode(idx, { color: e.target.value })}
                                    className="w-4 h-4 rounded cursor-pointer border-none bg-transparent shrink-0" />
                                  <span className="flex-1 text-[9px] font-bold text-white/70 truncate pl-0.5" title={node.value}>
                                    {node.value || '(sin valor)'}
                                  </span>
                                  <span className="text-[8px] text-white/30 shrink-0 w-6 tabular-nums text-right">
                                    {(node as any).guids?.length || node.dbIds?.length || 0}
                                  </span>
                                  <div className="flex opacity-0 group-hover/node:opacity-100 transition-opacity gap-0.5">
                                    <button onClick={() => handleSelectNodeElements(idx)} title="Seleccionar en modelo"
                                      className="p-1 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 rounded transition">
                                      <MousePointer2 size={9} />
                                    </button>
                                    <button onClick={() => handleAssignSelectionToNode(view.id, idx)} title="Asignar selección"
                                      className="p-1 text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 rounded transition">
                                      <Paintbrush size={9} />
                                    </button>
                                    <button onClick={() => handleDeleteNode(view.id, idx)} title="Eliminar este grupo"
                                      className="p-1 text-red-400/60 hover:text-red-400 hover:bg-red-400/10 rounded transition">
                                      <Trash2 size={9} />
                                    </button>
                                  </div>
                                  <input type="checkbox" checked={node.visible}
                                    onChange={e => updateNode(idx, { visible: e.target.checked })}
                                    className="accent-blue-500 cursor-pointer w-3 h-3 shrink-0 ml-0.5" />
                                </div>
                              ))}
                            </div>

                            <div className="px-1 pt-2 space-y-1">
                              <button onClick={() => handleAddNewCategory(view.id)}
                                className="w-full py-1.5 flex items-center justify-center gap-1.5 text-[9px] font-bold text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10 border border-dashed border-amber-500/20 rounded-lg transition">
                                <Plus size={10} /> Añadir categoría
                              </button>
                              <button onClick={() => handleSaveChanges(view.id)} disabled={applying}
                                className={`w-full py-1.5 flex items-center justify-center gap-1.5 text-[9px] font-bold rounded-lg transition disabled:opacity-50 ${
                                  savedSuccess ? 'text-emerald-300 bg-emerald-400/20' : 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'
                                }`}>
                                {applying ? <Loader2 size={10} className="animate-spin" /> : savedSuccess ? <CheckCircle2 size={10} /> : <Save size={10} />}
                                {savedSuccess ? '¡Guardado!' : 'Guardar configuración'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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
