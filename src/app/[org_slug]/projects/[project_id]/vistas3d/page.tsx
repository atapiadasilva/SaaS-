'use client';

import { use, useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { Box, Loader2, MonitorPlay, Check, Layers, AlertCircle } from 'lucide-react';
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

  const viewerRef = useRef<ForgeViewerHandle>(null);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await (supabase as any)
          .from('projects').select('module_config').eq('id', project_id).single();
        
        const mc = data?.module_config as Record<string, unknown> | null;
        const bim = mc?.bim as BimConfig | undefined;
        const linker = mc?.bim_linker as { savedViews?: SavedColorView[] } | undefined;
        
        setConfig(bim ?? null);
        if (linker?.savedViews) {
          setSavedViews(linker.savedViews);
        }
      } catch (e) {
        console.error('Error cargando vistas 3D', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [project_id]);

  // Guarda los dbIds resueltos de vuelta a Supabase para carga instantánea futura
  const persistDbIds = async (updatedViews: SavedColorView[]) => {
    try {
      const supabase = createClient();
      const { data } = await (supabase as any)
        .from('projects').select('module_config').eq('id', project_id).single();
      const mc = (data?.module_config ?? {}) as Record<string, unknown>;
      const linker = (mc.bim_linker ?? {}) as Record<string, unknown>;
      await (supabase as any).from('projects').update({
        module_config: { ...mc, bim_linker: { ...linker, savedViews: updatedViews } },
      }).eq('id', project_id);
      console.log('[BIM] dbIds cacheados en Supabase');
    } catch (e) {
      console.warn('[BIM] Error guardando dbIds cache:', e);
    }
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

      // ── Fast path: todos los nodos tienen dbIds cacheados ──────────────────
      const allCached = visible.every(n => n.dbIds && n.dbIds.length > 0);
      if (allCached) {
        const t0 = performance.now();
        for (const node of visible) {
          const ids = node.dbIds!;
          const existing = colorMap.get(node.color) ?? [];
          colorMap.set(node.color, [...existing, ...ids]);
          allDbIds.push(...ids);
        }
        console.debug(`[BIM] FAST PATH: ${visible.length} grupos desde cache — ${(performance.now()-t0).toFixed(1)}ms`);
      } else {
        // ── Slow path: resolver via universal index → luego cachear ────────────
        if (!vr.isUniversalIndexReady()) {
          console.log('[BIM] Construyendo índice universal...');
          await vr.buildUniversalIndex();
        }
        const t0 = performance.now();
        const resolved = await Promise.all(
          visible.map(async node => {
            const rawIds = node.dbIds?.length ? node.dbIds : await vr.resolveByUniversal(node.guids ?? []);
            // Expandir a nodos hoja para que applyThemingBatch use recursive=false sin freezes
            const leafIds = rawIds.length ? vr.getLeafDbIds(rawIds) : rawIds;
            return { node, dbIds: leafIds };
          })
        );
        console.debug(`[BIM] resolveByUniversal+leaves: ${visible.length} grupos — ${(performance.now()-t0).toFixed(1)}ms`);

        for (const { node, dbIds } of resolved) {
          if (!dbIds.length) continue;
          const existing = colorMap.get(node.color) ?? [];
          colorMap.set(node.color, [...existing, ...dbIds]);
          allDbIds.push(...dbIds);
        }

        // Guardar leaf dbIds en los nodos y persistir en Supabase (sin bloquear)
        const updatedViews = savedViews.map(v => {
          if (v.id !== view.id) return v;
          const resolvedMap = new Map(resolved.map(r => [r.node.value, r.dbIds]));
          return {
            ...v,
            colorNodes: v.colorNodes.map(n => ({
              ...n,
              dbIds: resolvedMap.get(n.value) ?? n.dbIds,
            })),
          };
        });
        setSavedViews(updatedViews);
        persistDbIds(updatedViews);
      }

      vr.showAll();
      vr.setGhosting(false);
      vr.applyThemingBatch(colorMap);

      if (mode === 'isolate' && allDbIds.length) vr.isolateDbIds(allDbIds);
      else if (mode === 'ghost' && allDbIds.length) { vr.isolateDbIds(allDbIds); vr.setGhosting(true); }

    } catch (e) {
      console.warn('[BIM] Error aplicando vista 3d:', e);
    } finally {
      setApplying(false);
    }
  };

  const updateNode = (index: number, changes: Partial<SavedColorView['colorNodes'][0]>) => {
    const next = [...activeNodes];
    next[index] = { ...next[index], ...changes };
    setActiveNodes(next);
    
    const view = savedViews.find(v => v.id === activeViewId);
    if (view) applyView(view, next);
  };

  const applyColorsNow = () => {
    const view = savedViews.find(v => v.id === activeViewId);
    if (view) applyView(view, activeNodes, activeViewMode);
  };

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
            {config && (
              <p className="text-[9px] text-blue-300 font-bold mt-0.5 truncate max-w-[260px]">{config.modelName}</p>
            )}
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
             <div className="text-center">
               <AlertCircle size={40} className="text-white/20 mx-auto mb-4" />
               <p className="text-sm font-black text-white/60 uppercase tracking-widest">Sin modelo configurado</p>
               <p className="text-[10px] text-white/30 mt-2 max-w-xs">Activa el modelo principal desde el módulo "Visor BIM".</p>
             </div>
           </div>
        ) : (
          <>
            <div className="flex-1 relative">
               <ForgeViewer
                  ref={viewerRef}
                  urn={config.urn}
                  onReady={() => setViewerReady(true)}
                />
            </div>

            {/* Sidebar minimalista */}
            {viewerReady && (
              <div className="w-[280px] bg-[#0a1628] border-l border-white/5 flex flex-col shadow-2xl relative z-10 shrink-0">
                <div className="p-4 border-b border-white/5 shrink-0">
                  <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Layers size={13} className="text-blue-400" /> Librería de Vistas
                  </h3>
                  <p className="text-[9px] text-white/40 mt-1">Selecciona una vista para aplicarla al modelo al instante.</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {savedViews.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-[10px] text-white/30 italic">No hay vistas guardadas.</p>
                      <p className="text-[8px] text-white/20 mt-1">Créalas desde "Visor BIM", en el apartado Vincular Datos.</p>
                    </div>
                  ) : (
                    savedViews.map(view => (
                      <div key={view.id} className="mb-2">
                        <button
                          onClick={() => applyView(view)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border transition flex items-center gap-3 relative overflow-hidden group ${
                            activeViewId === view.id
                              ? 'bg-amber-500/10 border-amber-500/30'
                              : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full shrink-0 ${activeViewId === view.id ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'bg-white/20'}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-[10px] font-black truncate ${activeViewId === view.id ? 'text-amber-300' : 'text-white/80 group-hover:text-white'}`}>
                              {view.name}
                            </p>
                            <p className="text-[8px] text-white/40 mt-0.5 truncate uppercase tracking-wider">
                             {view.colorNodes.length} Grupos · Columna: {view.treeCol}
                            </p>
                          </div>
                          {applying && activeViewId === view.id && (
                            <Loader2 size={12} className="animate-spin text-amber-400" />
                          )}
                          {activeViewId === view.id && !applying && (
                            <Check size={12} className="text-amber-400" />
                          )}
                        </button>
                        
                        {/* Panel de edición de la vista activa */}
                        {activeViewId === view.id && (
                          <div className="mt-1 px-2 py-2 bg-black/20 rounded-xl border border-white/5 mb-3">
                            <div className="flex items-center justify-between px-2 mb-2">
                              <p className="text-[9px] font-black tracking-widest text-white/40 uppercase">Árbol de Color</p>
                              <select 
                                value={activeViewMode}
                                onChange={e => {
                                  setActiveViewMode(e.target.value as any);
                                  applyView(view, activeNodes, e.target.value as any);
                                }}
                                className="bg-transparent text-[9px] text-amber-300 font-bold outline-none cursor-pointer"
                              >
                                <option value="all" className="bg-[#0a1628]">Mostrar todos</option>
                                <option value="isolate" className="bg-[#0a1628]">Aislar vista</option>
                                <option value="ghost" className="bg-[#0a1628]">Modo fantasma</option>
                              </select>
                            </div>
                            
                            <div className="max-h-48 overflow-y-auto space-y-1 px-1">
                              {activeNodes.map((node, idx) => (
                                <div key={node.value} className="flex items-center gap-2 p-1 rounded hover:bg-white/5 transition">
                                  <input 
                                    type="color" 
                                    value={node.color}
                                    onBlur={applyColorsNow}
                                    onChange={e => updateNode(idx, { color: e.target.value })}
                                    className="w-4 h-4 rounded cursor-pointer border-none bg-transparent shrink-0"
                                  />
                                  <span className="flex-1 text-[9px] font-bold text-white/70 truncate" title={node.value}>
                                    {node.value || '(sin valor)'}
                                  </span>
                                  <span className="text-[8px] text-white/30 shrink-0 w-8 text-right">
                                    {(node as any).guids?.length || 0}
                                  </span>
                                  <input 
                                    type="checkbox" 
                                    checked={node.visible}
                                    onChange={e => updateNode(idx, { visible: e.target.checked })}
                                    className="accent-blue-500 cursor-pointer w-3 h-3 shrink-0 ml-1"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
