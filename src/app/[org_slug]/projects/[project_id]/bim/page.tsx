'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ForgeViewerHandle, ElementProperties, NodeInfo, ModelIndex } from '@/components/awp/ForgeViewer';
import type { BimConfig } from '@/components/modules/BimConfigModal';
import { createClient } from '@/lib/supabase/client';
import {
  Box, Maximize2, RotateCcw, Settings2, Loader2, AlertCircle,
  Download, X, Search, Copy, Check, ChevronRight,
  ChevronDown, Folder, FileBox, Home, Eye, EyeOff,
  CheckCircle2,
} from 'lucide-react';

const ForgeViewer      = dynamic(() => import('@/components/awp/ForgeViewer'),         { ssr: false });
const BimConfigModal   = dynamic(() => import('@/components/modules/BimConfigModal'),   { ssr: false });
const BimDataLinker    = dynamic(() => import('@/components/awp/BimDataLinker'),        { ssr: false });
const Bim4DPlayer      = dynamic(() => import('@/components/awp/Bim4DPlayer'),          { ssr: false });
import type { SequenceActivity } from '@/components/awp/Bim4DPlayer';

// ─── ChildRow — nombre y conteo sin recorrer árbol completo ──────────────────

function ChildRow({
  dbId,
  getName,
  getChildCount,
  onNavigate,
}: {
  dbId:          number;
  getName:       (id: number) => string | null;
  getChildCount: (id: number) => number;
  onNavigate:    (id: number) => void;
}) {
  const name  = getName(dbId) ?? String(dbId);
  const count = getChildCount(dbId);
  const hasChildren = count > 0;

  return (
    <button
      onClick={() => onNavigate(dbId)}
      className="w-full flex items-center gap-2.5 px-3 py-2 border-b border-white/5 hover:bg-white/10 text-left transition group"
    >
      {hasChildren
        ? <Folder size={12} className="text-amber-400/60 shrink-0 group-hover:text-amber-300 transition" />
        : <FileBox size={12} className="text-blue-400/50 shrink-0 group-hover:text-blue-300 transition" />}
      <span className="text-[10px] text-white/70 group-hover:text-white truncate flex-1 transition">
        {name}
      </span>
      {hasChildren && (
        <span className="text-[8px] text-white/25 shrink-0 mr-1">{count}</span>
      )}
      <ChevronRight size={10} className="shrink-0 text-white/20 group-hover:text-white/50 transition" />
    </button>
  );
}

// ─── TreePanel ────────────────────────────────────────────────────────────────

interface TreePanelProps {
  nodeInfo:      NodeInfo;
  properties:    ElementProperties | null;
  loadingProps:  boolean;
  getName:       (dbId: number) => string | null;
  getChildCount: (dbId: number) => number;
  onNavigate:    (dbId: number) => void;
  onClose:       () => void;
  onExport:      () => void;
  onIsolate:     (dbId: number) => void;
  onShowAll:     () => void;
}

function TreePanel({
  nodeInfo, properties, loadingProps,
  getName, getChildCount,
  onNavigate, onClose, onExport, onIsolate, onShowAll,
}: TreePanelProps) {
  const [filter,    setFilter]    = useState('');
  const [openCats,  setOpenCats]  = useState<Set<string>>(new Set());
  const [showProps, setShowProps] = useState(false);
  const [copied,    setCopied]    = useState<string | null>(null);
  const [isolated,  setIsolated]  = useState(false);

  // Reset isolated flag when node changes
  useEffect(() => { setIsolated(false); }, [nodeInfo.dbId]);

  const copy = (val: string) => {
    navigator.clipboard.writeText(val).catch(() => {});
    setCopied(val); setTimeout(() => setCopied(null), 1500);
  };

  const toggleCat = (c: string) =>
    setOpenCats(p => { const n = new Set(p); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const handleNavigate = (dbId: number) => {
    setFilter('');
    setShowProps(false);
    onNavigate(dbId);
  };

  const handleIsolate = () => {
    if (isolated) { onShowAll(); setIsolated(false); }
    else          { onIsolate(nodeInfo.dbId); setIsolated(true); }
  };

  const isLeaf = nodeInfo.childIds.length === 0;

  // Filter children by name
  const filteredChildren = nodeInfo.childIds.filter(id => {
    if (!filter) return true;
    const name = getName(id) ?? String(id);
    return name.toLowerCase().includes(filter.toLowerCase());
  });

  // Group properties
  const byCategory: Record<string, ElementProperties['properties']> = {};
  if (properties) {
    for (const p of properties.properties) {
      const cat = p.category || 'Sin categoría';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(p);
    }
  }

  const filteredCats = Object.entries(byCategory).filter(([cat, ps]) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return cat.toLowerCase().includes(q) ||
      ps.some(p => p.displayName.toLowerCase().includes(q) || String(p.displayValue).toLowerCase().includes(q));
  });

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[300px] bg-[#0d1b3e] border-l border-white/10 flex flex-col z-10 shadow-2xl">

      {/* ── Nombre + cerrar ── */}
      <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Inspector</p>
          <p className="text-[13px] font-black text-white truncate mt-0.5 leading-tight" title={nodeInfo.name}>
            {nodeInfo.name || '(raíz)'}
          </p>
          <p className="text-[8px] text-blue-400/40 font-mono mt-0.5">dbId: {nodeInfo.dbId}</p>
        </div>
        <button onClick={onClose} className="shrink-0 p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition">
          <X size={13} />
        </button>
      </div>

      {/* ── Breadcrumb ── */}
      <div className="shrink-0 px-3 py-2 border-b border-white/5 flex items-center gap-1 flex-wrap min-h-[32px]">
        <button
          onClick={() => handleNavigate(nodeInfo.ancestors[0]?.dbId ?? nodeInfo.dbId)}
          className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white/70 transition shrink-0"
          title="Ir al inicio"
        >
          <Home size={10} />
        </button>
        {nodeInfo.ancestors.map((anc, i) => (
          <span key={anc.dbId} className="flex items-center gap-0.5 min-w-0">
            <ChevronRight size={8} className="text-white/20 shrink-0" />
            <button
              onClick={() => handleNavigate(anc.dbId)}
              className="text-[9px] font-bold truncate max-w-[65px] hover:text-white transition text-white/40"
              title={anc.name}
            >
              {anc.name || '…'}
            </button>
          </span>
        ))}
        {nodeInfo.ancestors.length > 0 && (
          <>
            <ChevronRight size={8} className="text-white/20 shrink-0" />
            <span className="text-[9px] font-black text-white truncate max-w-[65px]">
              {nodeInfo.name || '(raíz)'}
            </span>
          </>
        )}
      </div>

      {/* ── Acciones ── */}
      <div className="shrink-0 px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <button
          onClick={handleIsolate}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black transition ${
            isolated
              ? 'bg-blue-500/30 text-blue-300 border border-blue-500/30'
              : 'bg-white/10 hover:bg-white/20 text-white/70'
          }`}
        >
          {isolated ? <EyeOff size={10} /> : <Eye size={10} />}
          {isolated ? 'Mostrar todo' : 'Aislar'}
        </button>
        {nodeInfo.parentId !== null && (
          <button
            onClick={() => handleNavigate(nodeInfo.parentId!)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black bg-white/10 hover:bg-white/20 text-white/70 transition"
          >
            ↑ Subir nivel
          </button>
        )}
      </div>

      {/* ── Buscador ── */}
      <div className="shrink-0 px-3 py-2 border-b border-white/5">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder={isLeaf ? 'Filtrar propiedades…' : 'Filtrar elementos o propiedades…'}
            className="w-full pl-7 pr-3 py-1.5 text-[10px] bg-white/5 border border-white/10 rounded-lg text-white/80 placeholder:text-white/25 outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* ── Lista scrollable ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Hijos */}
        {!isLeaf && (
          <div>
            <button
              onClick={() => setShowProps(false)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 transition border-b border-white/5 text-left"
            >
              {!showProps
                ? <ChevronDown size={10} className="text-white/40" />
                : <ChevronRight size={10} className="text-white/40" />}
              <span className="text-[9px] font-black text-white/60 uppercase tracking-widest flex-1">
                Elementos ({filteredChildren.length}{filter && filteredChildren.length !== nodeInfo.childIds.length ? `/${nodeInfo.childIds.length}` : ''})
              </span>
            </button>

            {!showProps && filteredChildren.map(childId => (
              <ChildRow
                key={childId}
                dbId={childId}
                getName={getName}
                getChildCount={getChildCount}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        )}

        {/* Propiedades */}
        <div>
          <button
            onClick={() => setShowProps(s => !s)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 transition border-b border-white/5 text-left"
          >
            {(showProps || isLeaf)
              ? <ChevronDown size={10} className="text-white/40" />
              : <ChevronRight size={10} className="text-white/40" />}
            <span className="text-[9px] font-black text-white/60 uppercase tracking-widest flex-1">
              Propiedades
            </span>
            {loadingProps && <Loader2 size={10} className="animate-spin text-blue-400" />}
          </button>

          {(showProps || isLeaf) && (
            loadingProps ? (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 size={16} className="animate-spin text-blue-400/60" />
                <span className="text-[9px] text-white/30">Cargando…</span>
              </div>
            ) : filteredCats.length === 0 ? (
              <p className="text-center text-[9px] text-white/30 py-6">
                {filter ? 'Sin resultados' : 'Sin propiedades'}
              </p>
            ) : (
              filteredCats.map(([cat, ps]) => {
                const isOpen = openCats.has(cat);
                const filtered = filter
                  ? ps.filter(p =>
                      p.displayName.toLowerCase().includes(filter.toLowerCase()) ||
                      String(p.displayValue).toLowerCase().includes(filter.toLowerCase())
                    )
                  : ps;
                if (filtered.length === 0) return null;
                return (
                  <div key={cat}>
                    <button
                      onClick={() => toggleCat(cat)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 border-b border-white/5 text-left transition"
                    >
                      {isOpen
                        ? <ChevronDown size={9} className="text-white/30" />
                        : <ChevronRight size={9} className="text-white/30" />}
                      <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider truncate flex-1">
                        {cat}
                      </span>
                      <span className="text-[8px] text-white/25 shrink-0">{filtered.length}</span>
                    </button>

                    {isOpen && filtered.map(p => (
                      <div
                        key={p.attributeName + p.displayName}
                        className="flex items-start justify-between gap-2 px-3 py-1.5 border-b border-white/5 hover:bg-white/5 group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[8px] text-white/35 font-semibold leading-tight">{p.displayName}</p>
                          <p className="text-[10px] text-white/80 font-mono break-all leading-tight mt-0.5">
                            {String(p.displayValue)}
                          </p>
                        </div>
                        <button
                          onClick={() => copy(String(p.displayValue))}
                          className="shrink-0 p-1 opacity-0 group-hover:opacity-100 rounded hover:bg-white/10 text-white/40 transition"
                        >
                          {copied === String(p.displayValue)
                            ? <Check size={9} className="text-emerald-400" />
                            : <Copy size={9} />}
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 px-3 py-2.5 border-t border-white/10">
        <button
          onClick={onExport}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[9px] font-black text-white/70 transition"
        >
          <Download size={10} /> Exportar todas las propiedades del modelo
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BimPage({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { project_id } = use(params);

  const [config,      setConfig]      = useState<BimConfig | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [viewerReady, setViewerReady] = useState(false);
  const [configOpen,  setConfigOpen]  = useState(false);
  const [exporting,   setExporting]   = useState(false);

  const [nodeInfo,     setNodeInfo]     = useState<NodeInfo | null>(null);
  const [elementProps, setElementProps] = useState<ElementProperties | null>(null);
  const [loadingProps, setLoadingProps] = useState(false);
  const [bimIndex,       setBimIndex]       = useState<ModelIndex | null>(null);
  const [indexState,     setIndexState]     = useState<'idle' | 'scanning' | 'saving' | 'ready'>('idle');
  const [indexProgress,  setIndexProgress]  = useState(0);
  const [active4DSequence, setActive4DSequence] = useState<SequenceActivity[] | null>(null);

  const viewerRef       = useRef<ForgeViewerHandle>(null);
  const ignoringSelect  = useRef(false);

  // ── Load config + cached index from Supabase ─────────────────────────────────

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await (supabase as any)
        .from('projects').select('module_config').eq('id', project_id).single();
      const mc  = data?.module_config as Record<string, unknown> | null;
      const bim = mc?.bim as BimConfig | undefined;
      const idx = mc?.bim_index as ModelIndex | undefined;
      setConfig(bim ?? null);
      if (idx?.guidIndex) { setBimIndex(idx); setIndexState('ready'); }
      setLoading(false);
    }
    load();
  }, [project_id]);

  const handleConfigSave = useCallback((cfg: BimConfig | null) => {
    setConfig(cfg);
    setViewerReady(false);
    setConfigOpen(false);
    setNodeInfo(null);
    setElementProps(null);
  }, []);

  // ── Navegar a un nodo (desde panel o desde viewer) ────────────────────────────

  const navigateToNode = useCallback(async (dbId: number, fromViewer = false) => {
    const vr = viewerRef.current;
    if (!vr) return;

    // Si viene del panel, seleccionar en viewer sin disparar el handler de nuevo
    if (!fromViewer) {
      ignoringSelect.current = true;
      vr.navigateTo(dbId);
      setTimeout(() => { ignoringSelect.current = false; }, 100);
    }

    // Actualizar árbol (sincrónico, barato)
    const info = vr.getNodeInfo(dbId);
    setNodeInfo(info);
    setElementProps(null);

    // Cargar propiedades (async)
    setLoadingProps(true);
    try {
      const props = await vr.getProperties(dbId);
      setElementProps(props);
    } catch (e) {
      console.error('getProperties error:', e);
    } finally {
      setLoadingProps(false);
    }
  }, []);

  // ── Selección desde el viewer ─────────────────────────────────────────────────

  const handleSelectionChange = useCallback((dbIds: number[]) => {
    if (ignoringSelect.current || dbIds.length === 0) return;
    navigateToNode(dbIds[0], true);
  }, [navigateToNode]);

  // ── Export ───────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (!viewerRef.current) return;
    setExporting(true);
    try {
      const csv  = await viewerRef.current.exportAllProperties([]);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `propiedades-${config?.modelName ?? 'modelo'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error('Export error:', e); }
    finally { setExporting(false); }
  }, [config?.modelName]);

  // ── Index ready → guardar en Supabase ────────────────────────────────────────

  const handleIndexReady = useCallback(async (index: ModelIndex) => {
    setBimIndex(index);
    setIndexState('saving');
    try {
      const supabase = createClient();
      const { data: proj } = await (supabase as any)
        .from('projects').select('module_config').eq('id', project_id).single();
      const existing = (proj?.module_config as Record<string, unknown>) ?? {};
      await (supabase as any)
        .from('projects')
        .update({ module_config: { ...existing, bim_index: index } })
        .eq('id', project_id);
      setIndexState('ready');
    } catch {
      setIndexState('ready'); // silently ignore save errors
    }
  }, [project_id]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-65px)] overflow-hidden -mx-8 -my-8 bg-[#0C1E4F]">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#0C1E4F] px-5 py-2.5 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-white/10 flex items-center justify-center">
            <Box size={13} className="text-white" />
          </div>
          <div>
            <p className="text-[11px] font-black text-white uppercase tracking-widest leading-none">Visor BIM</p>
            {config && (
              <p className="text-[9px] text-blue-300 font-bold mt-0.5 truncate max-w-[260px]">{config.modelName}</p>
            )}
          </div>

          {/* Index status */}
          {viewerReady && indexState !== 'idle' && (
            indexState === 'ready' ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 size={9} />
                Índice listo · {Object.keys(bimIndex?.guidIndex ?? {}).length.toLocaleString('es')} elem.
              </div>
            ) : (
              /* scanning / saving — show progress bar */
              <div className="flex items-center gap-2 min-w-[200px]">
                <Loader2 size={9} className="animate-spin text-amber-300 shrink-0" />
                <div className="flex-1 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black text-amber-300/80 uppercase tracking-widest">
                      {indexState === 'saving' ? 'Guardando…' : 'Indexando propiedades…'}
                    </span>
                    <span className="text-[8px] font-black text-amber-300">{indexProgress}%</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: `${indexProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {viewerReady && (
            <>
              <button onClick={() => viewerRef.current?.fitToView()}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black text-white/80 transition">
                <Maximize2 size={9} /> Encuadrar
              </button>
              <button onClick={() => { viewerRef.current?.showAll(); setNodeInfo(null); setElementProps(null); }}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black text-white/80 transition">
                <RotateCcw size={9} /> Mostrar todo
              </button>
              <button onClick={handleExport} disabled={exporting}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[9px] font-black text-white/80 transition disabled:opacity-50"
                title="Exporta CSV con todas las propiedades">
                {exporting ? <Loader2 size={9} className="animate-spin" /> : <Download size={9} />}
                Exportar propiedades
              </button>
            </>
          )}
          <button onClick={() => setConfigOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-black text-white/80 transition border border-white/10">
            <Settings2 size={11} />
            {config ? 'Cambiar modelo' : 'Configurar modelo'}
          </button>
        </div>
      </div>

      {/* ── Viewer + panels ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">

        {/* Center + right panels */}
        <div className="flex-1 overflow-hidden relative">

        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0d1b3e]">
            <Loader2 size={24} className="animate-spin text-blue-400" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargando configuración…</p>
          </div>

        ) : config?.urn ? (
          <>
            <ForgeViewer
              ref={viewerRef}
              urn={config.urn}
              onReady={() => { setViewerReady(true); setIndexState(s => s === 'ready' ? 'ready' : 'scanning'); }}
              onSelectionChange={handleSelectionChange}
              cachedIndex={bimIndex}
              onIndexReady={handleIndexReady}
              onIndexProgress={(pct) => {
                if (pct === -1) { setIndexProgress(100); }
                else { setIndexProgress(pct); }
              }}
            />

            {/* Hint */}
            {viewerReady && !nodeInfo && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
                <div className="bg-black/40 backdrop-blur-sm rounded-2xl px-4 py-2 border border-white/10">
                  <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">
                    Haz clic en un elemento para inspeccionar sus propiedades
                  </p>
                </div>
              </div>
            )}

            {nodeInfo && (
              <TreePanel
                nodeInfo={nodeInfo}
                properties={elementProps}
                loadingProps={loadingProps}
                getName={(id) => viewerRef.current?.getNodeName(id) ?? null}
                getChildCount={(id) => viewerRef.current?.getChildCount(id) ?? 0}
                onNavigate={(dbId) => navigateToNode(dbId, false)}
                onClose={() => {
                  setNodeInfo(null);
                  setElementProps(null);
                  viewerRef.current?.showAll();
                }}
                onExport={handleExport}
                onIsolate={(dbId) => viewerRef.current?.isolate([dbId])}
                onShowAll={() => viewerRef.current?.showAll()}
              />
            )}
          </>

        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[#0d1b3e]">
            <div className="w-24 h-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Box size={40} className="text-white/20" />
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-white/60 uppercase tracking-widest">Sin modelo configurado</p>
              <p className="text-[10px] text-white/30 mt-2 max-w-xs">
                Configura un modelo desde Autodesk ACC para visualizarlo aquí.
              </p>
            </div>
            <button onClick={() => setConfigOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-[#0C1E4F] rounded-xl text-[11px] font-black hover:bg-blue-50 transition shadow-lg">
              <Settings2 size={13} /> Configurar modelo 3D
            </button>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <AlertCircle size={13} className="text-amber-400 shrink-0" />
              <p className="text-[9px] text-amber-300 font-bold">
                Módulo BIM activo — configura un modelo para habilitar el visor
              </p>
            </div>
          </div>
        )}
        </div>{/* end center viewer */}

        {/* Right: Data linker sidebar — always visible */}
        <BimDataLinker
          supabaseProjectId={project_id}
          viewerRef={viewerRef}
          onClose={() => {}}
        />
      </div>

      {configOpen && (
        <BimConfigModal
          projectId={project_id}
          current={config}
          onSave={handleConfigSave}
          onClose={() => setConfigOpen(false)}
        />
      )}

      {active4DSequence && (
        <Bim4DPlayer
           activities={active4DSequence}
           viewerRef={viewerRef}
           onClose={() => setActive4DSequence(null)}
        />
      )}
    </div>
  );
}
