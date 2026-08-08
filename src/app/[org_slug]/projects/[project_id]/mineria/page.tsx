'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import BimConfigModal, { type BimConfig } from '@/components/modules/BimConfigModal';
import IwpManager, { type IwpViewerBridge } from '@/components/awp/IwpManager';
import IwpSkyline from '@/components/awp/IwpSkyline';
import { HiloWave, HiloTrace } from '@/components/brand/Hilo';
import { CwpGantt } from '@/components/awp/CwpGantt';
import { Search, Loader2, Package, ListChecks, Layers, FileText, Box, X, ChevronRight, ChevronLeft, CheckSquare, Square, Eye, Ghost, ListTree, Calendar, Columns3, Crosshair, Settings, ChevronDown, PenLine, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { esCwpPlaceholder } from '@/lib/awp-codigo';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

// ─── Types ──────────────────────────────────────────────────────────────────
interface MItem { co: string; de: string; ob: string | null; un: string; qt: number; pu: number; tot: number; guid: string | null; }
interface MPlano { doc: string; de: string; ti: string; tieneArchivo: boolean; }
interface MTask { id: string; n: string; hh: number; s: string | null; e: string | null; code: string; }
interface MProg { hh: number; acts: number; start: string | null; end: string | null; tasks: MTask[]; }
interface MCwp {
  cwa: string; cv: string; cvName: string; disc: string; dn: string; cwp: string; ewp: string;
  nombre: string; alcance: string | null; color: string; costo: number;
  items: MItem[]; planos: MPlano[]; qty: Record<string, Record<string, number>>; prog: MProg | null;
  nElementos: number;
}
interface MCwa { cwa: string; name: string; }
interface MDisc { code: string; name: string; color: string; n: number; }
interface MData { cwp: MCwp[]; cwa: MCwa[]; disc: MDisc[]; kpi: { costo: number; part: number; plan: number; hh: number; }; }

type DetailTab = 'resumen' | 'itemizado' | 'planos' | 'programa' | 'iwp';
const TABS: { id: DetailTab; label: string }[] = [
  { id: 'resumen',    label: 'Resumen' },
  { id: 'itemizado',  label: 'Itemizado y Cantidades' },
  { id: 'planos',     label: 'Planos' },
  { id: 'programa',   label: 'Programa' },
  { id: 'iwp',        label: 'IWP' },
];

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const fmm = (v: number) => !v ? '—' : '$' + Math.round(v / 1e6).toLocaleString('es-CL') + ' MM';
const fn  = (v: number) => Math.round(v).toLocaleString('es-CL');
const fq  = (v: number) => v % 1 === 0 ? v.toLocaleString('es-CL') : v.toLocaleString('es-CL', { maximumFractionDigits: 1 });
const fd  = (s: string | null) => s ? s.slice(8, 10) + '-' + MESES[+s.slice(5, 7) - 1] + '-' + s.slice(2, 4) : '—';

export default function MineriaPage() {
  const params = useParams();
  const project_id = params.project_id as string;
  const org_slug = params.org_slug as string;

  const [data, setData] = useState<MData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeDiscs, setActiveDiscs] = useState<Set<string>>(new Set());
  const [selectedCwp, setSelectedCwp] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<DetailTab>('resumen');

  const [bimUrn, setBimUrn] = useState<string | null>(null);
  const [bimConfig, setBimConfig] = useState<BimConfig | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showViewer, setShowViewer] = useState(true);
  const [viewerWidth, setViewerWidth] = useState<number | string>('50%');
  const [ghostMode, setGhostMode] = useState(true);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerStatus, setViewerStatus] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [indexProgress, setIndexProgress] = useState<number>(-1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [showSkyline, setShowSkyline] = useState(false);
  const viewerRef = useRef<ForgeViewerHandle | null>(null);
  const resizingRef = useRef(false);

  // Puente viewer → IwpManager: captura de scope y selección de elementos para scoping gráfico de IWP.
  const iwpViewerBridge: IwpViewerBridge = useMemo(() => ({
    getScreenshot: () => new Promise<string | null>(resolve => {
      const v = viewerRef.current?.getViewer?.();
      if (!v?.getScreenShot) return resolve(null);
      v.getScreenShot(1024, 640, (blobUrl: string) => {
        fetch(blobUrl)
          .then(r => r.blob())
          .then(b => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result));
            fr.onerror = () => resolve(null);
            fr.readAsDataURL(b);
          })
          .catch(() => resolve(null));
      });
    }),
    getSelectedMonikers: async () => {
      const h = viewerRef.current;
      if (!h) return [];
      const ids = h.getSelectedIds();
      if (!ids.length) return [];
      const leaf = h.getLeafDbIds(ids);
      const model = h.getModel?.();
      if (!model?.getExternalIdMapping) return [];
      const mapping: Record<string, number> = await new Promise((res, rej) => model.getExternalIdMapping(res, rej));
      const idSet = new Set(leaf.length ? leaf : ids);
      return Object.entries(mapping).filter(([, dbId]) => idSet.has(dbId as number)).map(([eid]) => eid);
    },
  }), []);

  const CWP_PROP = (bimConfig?.cwpCategory && bimConfig?.cwpPropName) ? `${bimConfig.cwpCategory}/${bimConfig.cwpPropName}` : (bimConfig?.cwpPropName || 'CWP');
  const [pendingMonikers, setPendingMonikers] = useState<string[] | null>(null);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = typeof viewerWidth === 'number' ? viewerWidth : (document.documentElement.clientWidth / 2);
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = startWidth - (ev.clientX - startX);
      setViewerWidth(Math.min(1100, Math.max(280, next)));
    };
    const onUp = () => {
      resizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [viewerWidth]);

  useEffect(() => {
    if (!project_id) return;
    setLoading(true);
    fetch(`/api/mining-data?project_id=${project_id}`)
      .then(r => r.json())
      .then((d: MData) => {
        setData(d);
        setActiveDiscs(new Set(d.disc.map(x => x.code)));
        // `?cwp=` permite llegar acá desde la Sala de Apertura o desde un enlace compartido
        // y caer en el paquete correcto, en vez de en el primero de la lista.
        const pedido = new URLSearchParams(window.location.search).get('cwp');
        const destino = pedido && d.cwp.some(x => x.cwp === pedido) ? pedido : d.cwp[0]?.cwp;
        if (destino) setSelectedCwp(destino);
      })
      .finally(() => setLoading(false));
  }, [project_id]);

  useEffect(() => {
    if (!project_id) return;
    const supabase = createClient() as any;
    supabase.from('projects').select('module_config').eq('id', project_id).single()
      .then(({ data: d }: any) => {
        const bim = d?.module_config?.bim as BimConfig | undefined;
        if (bim?.urn) { setBimUrn(bim.urn); setBimConfig(bim); }
      });
  }, [project_id]);

  const toggleDisc = useCallback((code: string) => {
    setActiveDiscs(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }, []);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.cwp.filter(c => activeDiscs.has(c.disc) &&
      (!q || (c.cwp + ' ' + c.nombre + ' ' + (c.alcance ?? '')).toLowerCase().includes(q)));
  }, [data, activeDiscs, search]);

  const selected = useMemo(() => data?.cwp.find(c => c.cwp === selectedCwp) ?? null, [data, selectedCwp]);

  const activeFilterSet = useMemo(() => checked.size ? [...checked] : (selectedCwp ? [selectedCwp] : []), [checked, selectedCwp]);

  const filterByCwps = useCallback(async (cwpIds: string[]) => {
    if (!viewerRef.current || !cwpIds.length) return;
    if (indexProgress >= 0 && indexProgress < 100) return; // Wait for index to finish
    setViewerStatus(cwpIds.length > 1 ? `Filtrando modelo por ${cwpIds.length} CWP…` : 'Filtrando modelo por CWP…');
    try {
      // 1. Buscar los SP3D_MONIKER de estos CWPs en la BD
      const res = await fetch(`/api/mining-elementos/monikers-by-nivel?project_id=${project_id}&nivel=cwp&codigos=${cwpIds.map(encodeURIComponent).join(',')}`);
      const json = await res.json();
      const groups: Record<string, string[]> = json.groups ?? {};
      const allMonikers = Object.values(groups).flat();
      if (!allMonikers.length) { setMatchCount(0); return; }
      if (!viewerRef.current) return; // el visor se cerró mientras esperábamos la BD

      // 2. Intentar resolución directa por externalId mapping (no requiere instance tree completo)
      const model = viewerRef.current.getModel?.() ?? (viewerRef.current as any).model;
      let dbIds: number[] = [];

      if (model || viewerRef.current) {
        try {
          const mapping = await new Promise<Record<string, number>>((res, rej) => {
            const timeout = setTimeout(() => rej(new Error('Mapping timeout')), 30000);
            const m = viewerRef.current?.getModel?.() ?? model;
            if (!m?.getExternalIdMapping) throw new Error('No model');
            m.getExternalIdMapping(
              (map: Record<string, number>) => { clearTimeout(timeout); res(map); },
              (err: any) => { clearTimeout(timeout); rej(err); }
            );
          });
          const monikerSet = new Set(allMonikers.map(m => m.trim().toLowerCase()));
          for (const [eid, dbId] of Object.entries(mapping)) {
            if (monikerSet.has(eid.trim().toLowerCase())) dbIds.push(dbId);
          }
          console.log('[CWP-FILTER] externalId mapping: resolved', dbIds.length, 'of', allMonikers.length, 'monikers');
        } catch (e) {
          console.warn('[CWP-FILTER] externalId mapping failed:', e);
        }
      }

      // 4. Fallback: si externalId no encontró todos los elementos, usar property index
      if (dbIds.length < allMonikers.length && viewerRef.current) {
        console.log(`[CWP-FILTER] Fallback: externalId resolvió ${dbIds.length}/${allMonikers.length}, usando property index...`);
        const itemProp = (bimConfig?.itemCategory && bimConfig?.itemPropName) ? `${bimConfig.itemCategory}/${bimConfig.itemPropName}` : (bimConfig?.itemPropName || 'SP3D_MONIKER');
        setViewerStatus('Construyendo índice de propiedades (primera vez)…');
        await viewerRef.current.buildPropertyMultiIndex(itemProp);
        const fbIds = await viewerRef.current?.resolveMonikers(allMonikers, itemProp) ?? [];

        let finalIds = fbIds;
        // Si con categoría no encontró nada, intentar sin categoría
        if (!finalIds.length && itemProp.includes('/') && viewerRef.current) {
          const fallback = itemProp.split('/').pop()!;
          await viewerRef.current.buildPropertyMultiIndex(fallback);
          finalIds = await viewerRef.current?.resolveMonikers(allMonikers, fallback) ?? [];
        }

        // Merge arrays efficiently
        const dbIdSet = new Set(dbIds);
        for (const id of finalIds) dbIdSet.add(id);
        dbIds = Array.from(dbIdSet);
      }

      setMatchCount(dbIds.length);
      if (!dbIds.length || !viewerRef.current) return; // el visor pudo cerrarse durante la resolución
      viewerRef.current.showOnly(dbIds, ghostMode);
      viewerRef.current.fitToView(dbIds);
    } catch (err) {
      console.error('[CWP-FILTER] ERROR:', err);
    } finally {
      setViewerStatus(null);
    }
  }, [project_id, bimConfig, ghostMode]);

  const toggleChecked = useCallback((cwp: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(cwp) ? next.delete(cwp) : next.add(cwp);
      return next;
    });
  }, []);

  // Mantiene el visor sincronizado: cada cambio en la selección (single o múltiple) re-filtra el modelo si el visor ya está abierto
  useEffect(() => {
    if (showViewer && viewerReady && activeFilterSet.length) filterByCwps(activeFilterSet);
  }, [activeFilterSet, showViewer, viewerReady, filterByCwps]);

  // Aísla en 3D un set puntual de elementos (ej. los vinculados a una partida del itemizado), por SP3d Moniker
  const filterByMonikers = useCallback((monikers: string[]) => {
    if (!monikers.length) return;
    setShowViewer(true);
    setPendingMonikers(monikers);
  }, []);

  useEffect(() => {
    if (!showViewer || !viewerReady || !pendingMonikers || !viewerRef.current) return;
    const monikers = pendingMonikers;
    setPendingMonikers(null);
    (async () => {
      setViewerStatus('Resolviendo IDs geométricos…');
      try {
        const itemProp = (bimConfig?.itemCategory && bimConfig?.itemPropName) ? `${bimConfig.itemCategory}/${bimConfig.itemPropName}` : (bimConfig?.itemPropName || 'SP3D_MONIKER');
        const dbIds = await viewerRef.current!.resolveMonikers(monikers, itemProp);
        setMatchCount(dbIds.length);
        if (dbIds.length) { viewerRef.current!.isolate(dbIds); viewerRef.current!.fitToView(dbIds); }
      } finally {
        setViewerStatus(null);
      }
    })();
  }, [showViewer, viewerReady, pendingMonikers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando datos AWP de minería…
      </div>
    );
  }

  if (!data || !data.cwp.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
        <Package className="w-10 h-10 opacity-30" />
        <p className="text-sm font-semibold">Sin data AWP cargada para este proyecto todavía.</p>
      </div>
    );
  }

  const topLink = 'px-3 py-1.5 rounded-full border border-[#EEEEEE] bg-white hover:border-[#FF0000]/50 hover:text-[#A00000] text-[#757575] text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0';

  return (
    <div className="h-full flex flex-col -m-6 bg-white">
      {/* Top bar — Hilo Digital: blanco, hilo rojo, KPIs como nodos */}
      <div className="relative bg-white border-b border-[#EEEEEE] px-6 py-3 flex items-center gap-5 shrink-0 overflow-hidden">
        <HiloWave className="absolute left-[180px] top-0 h-full w-[360px]" opacity={0.1} />
        <h1 className="font-display text-[17px] font-bold text-[#1A1A1A] relative">
          Explorador <span className="text-[#FF0000]">CWP</span>
        </h1>
        <div className="flex gap-6 ml-auto flex-wrap relative">
          {/* Los cajones "por asignar" no son paquetes: contarlos daba 74 aquí contra 69
              en la Sala de Apertura y en Conciliación, sobre el mismo proyecto. */}
          <Kpi value={fn(data.cwp.filter((c: any) => !esCwpPlaceholder(c.cwp)).length)} label="CWP" />
          {/* Las etiquetas dicen de dónde sale cada número, porque en este proyecto conviven
              tres fuentes de HH y dos de plata. `part` son líneas del itemizado, no
              suministros — esos son `mining_suministro`, otra tabla. `hh` es del programa
              P333, no el `hh_planner` del CWP: son cifras distintas y se llamaban igual. */}
          <Kpi value={fn(data.kpi.part)} label="ítems itemizado" />
          <Kpi value={fn(data.kpi.plan)} label="planos" />
          <Kpi value={fn(data.kpi.costo / 1e6)} label="MM CLP oferta" />
          <Kpi value={fn(data.kpi.hh)} label="HH programa" />
        </div>
        <Link href={`/${org_slug}/projects/${project_id}/mineria/elementos`} className={topLink}>
          <ListChecks className="w-3.5 h-3.5 text-[#FF0000]" /> Elementos
        </Link>
        <Link href={`/${org_slug}/projects/${project_id}/mineria/sistemas`} className={topLink}>
          <Layers className="w-3.5 h-3.5 text-[#FF0000]" /> Sistemas
        </Link>
        <Link href={`/${org_slug}/projects/${project_id}/mineria/atributos`} className={topLink}
          title="Conformidad del modelo contra la tabla de atributos del Anexo 7 (Guía BIM–AWP Codelco / CChC)">
          <ClipboardCheck className="w-3.5 h-3.5 text-[#FF0000]" /> Anexo 7
        </Link>
        <button onClick={() => setShowSkyline(true)}
          className="px-3 py-1.5 rounded-full bg-[#FF0000] hover:bg-[#A00000] text-white text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0 shadow-[0_2px_10px_rgba(255,0,0,0.25)]">
          <Columns3 className="w-3.5 h-3.5" /> Skyline IWP
        </button>
        <Link href={`/${org_slug}/projects/${project_id}/mineria/documentos`} className={topLink}>
          <FileText className="w-3.5 h-3.5 text-[#FF0000]" /> Documentos
        </Link>
        {/* El explorador de servicios (mineria/explorador) sigue accesible por URL, pero
            fuera de la barra: es un experimento a medio construir y el botón confundía
            con el título de esta misma página. */}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar — colapsable para agrandar el modelo 3D */}
        {sidebarCollapsed ? (
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="Mostrar lista de CWP"
            className="w-7 bg-white border-r border-slate-200 shrink-0 flex flex-col items-center pt-3 hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4 text-slate-400" />
            <ListTree className="w-3.5 h-3.5 text-slate-400 mt-2" />
          </button>
        ) : (
        <div className="w-[320px] bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">CWP</span>
              <button onClick={() => setSidebarCollapsed(true)} title="Ocultar lista" className="p-1 rounded hover:bg-slate-100 text-slate-400">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar CWP, nombre o equipo…"
                className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-[12px] outline-none focus:border-red-500"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.disc.map(d => (
                <button
                  key={d.code} onClick={() => toggleDisc(d.code)}
                  title={d.name}
                  className="rounded-full px-2.5 py-1 text-[10px] font-extrabold text-white transition"
                  style={{ background: d.color, opacity: activeDiscs.has(d.code) ? 1 : 0.32 }}
                >
                  {d.code} ({d.n})
                </button>
              ))}
            </div>
          </div>
          {checked.size > 0 && (
            <div className="px-3 py-2 bg-[#1A1A1A] text-white flex items-center gap-2 shrink-0">
              <span className="text-[10.5px] font-bold">{checked.size} CWP seleccionados</span>
              <button onClick={() => setChecked(new Set())} className="text-white/60 hover:text-white ml-auto" title="Limpiar selección">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            <SidebarList
              visible={visible} cwa={data.cwa} selectedCwp={selectedCwp} checked={checked}
              onSelect={(cwp) => { setSelectedCwp(cwp); setTab('resumen'); }}
              onToggleCheck={toggleChecked}
            />
          </div>
        </div>
        )}

        {/* Detail panel — colapsable para agrandar el modelo 3D */}
        {detailCollapsed ? (
          <button
            onClick={() => setDetailCollapsed(false)}
            title="Mostrar detalle del CWP"
            className="w-7 bg-white border-r border-slate-200 shrink-0 flex flex-col items-center pt-3 hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4 text-slate-400" />
            <FileText className="w-3.5 h-3.5 text-slate-400 mt-2" />
          </button>
        ) : (
        <div className="flex-1 overflow-y-auto relative min-w-0">
          <button
            onClick={() => setDetailCollapsed(true)}
            title="Ocultar detalle"
            className="absolute top-2 right-2 z-10 p-1.5 rounded bg-white border border-slate-200 hover:bg-slate-50 text-slate-400 shadow-sm"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {selected ? (
            <DetailPanel
              c={selected} cwaName={data.cwa.find(x => x.cwa === selected.cwa)?.name ?? ''}
              tab={tab} setTab={setTab} projectId={project_id} orgSlug={org_slug}
              onIsolateMonikers={filterByMonikers}
              iwpViewerBridge={iwpViewerBridge}
              ganttCwps={checked.size > 0 ? data.cwp.filter(x => checked.has(x.cwp)) : [selected]}
            />
          ) : (
            <div className="p-10 text-center text-slate-400 italic">Selecciona un CWP de la lista.</div>
          )}
        </div>
        )}

        {/* Viewer drawer — toma todo el ancho libre cuando sidebar y/o detalle están ocultos */}
        {showViewer && (
          <div className={cn('flex shrink-0 relative', (sidebarCollapsed || detailCollapsed) && 'flex-1')} style={(sidebarCollapsed || detailCollapsed) ? undefined : { width: viewerWidth }}>
            <div
              onMouseDown={onResizeStart}
              className="absolute left-0 top-0 h-full w-1.5 -ml-[3px] cursor-col-resize z-20 hover:bg-red-500/40 active:bg-red-500/60 transition-colors"
              title="Arrastra para redimensionar"
            />
            <div className="flex-1 border-l border-slate-200 bg-[#060d1f] flex flex-col min-w-0">
            <div className="px-3 py-2 flex items-center justify-between bg-[#0a1628] border-b border-white/5">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Visor 3D{matchCount != null && ` · ${matchCount} elementos`}
              </span>
              <button
                onClick={() => setGhostMode(prev => !prev)}
                title={ghostMode ? 'Modo FANTASMA: al aislar, lo no resaltado queda transparente. Click para cambiar a Aislado.' : 'Modo AISLADO: al aislar, lo no resaltado se oculta del todo. Click para cambiar a Fantasma.'}
                className={cn('p-1.5 rounded flex items-center gap-1 transition', ghostMode ? 'bg-white/10 text-slate-300' : 'bg-red-500/30 text-red-300')}
              >
                {ghostMode ? <Ghost className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span className="text-[9px] font-bold uppercase">{ghostMode ? 'Fantasma' : 'Aislado'}</span>
              </button>
            </div>
            <div className="flex-1 relative">
              {!bimUrn ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 px-6 text-center">
                  <Box className="w-10 h-10 opacity-20" />
                  <div className="text-xs">Configura el modelo BIM en Autodesk Platform Services para activar el visor.</div>
                  <button onClick={() => setShowPicker(true)} className="text-[11px] font-black text-red-400 hover:text-red-300">
                    Configurar modelo →
                  </button>
                </div>
              ) : (
                <ForgeViewer
                  ref={viewerRef} urn={bimUrn}
                  onIndexProgress={setIndexProgress}
                  onIndexReady={() => { if (activeFilterSet.length) filterByCwps(activeFilterSet); }}
                  onReady={() => { setViewerReady(true); }}
                  disableBackgroundIndex={true}
                />
              )}
              {viewerStatus && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full">
                  <Loader2 className="w-3 h-3 animate-spin" /> {viewerStatus}
                </div>
              )}
              {!viewerStatus && matchCount === 0 && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-amber-500/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-lg">
                  Sin coincidencias: este CWP no tiene elementos vinculados en el modelo todavía
                </div>
              )}
              {indexProgress >= 0 && indexProgress < 100 && (
                <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-white">
                  <div className="bg-slate-800/95 p-6 rounded-xl shadow-2xl border border-slate-700/50 flex flex-col items-center min-w-[320px]">
                    <Loader2 className="w-8 h-8 animate-spin text-red-400 mb-4" />
                    <h3 className="font-bold text-[15px] mb-1.5 text-center text-slate-100">Indexando Modelo BIM</h3>
                    <div className="text-[11px] text-slate-400 text-center mb-5 max-w-[260px] leading-relaxed">
                      Preparando los datos para búsquedas rápidas. Esto se hace una sola vez y se guarda en tu navegador.
                    </div>
                    <div className="w-full bg-slate-900/80 rounded-full h-2 mb-2.5 overflow-hidden shadow-inner border border-black/20">
                      <div className="bg-[#FF0000] h-2 rounded-full transition-all duration-300 ease-out" style={{ width: `${indexProgress}%` }}></div>
                    </div>
                    <div className="text-[10px] font-black text-red-300 tracking-wider">{indexProgress}%</div>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        )}
      </div>

      {showPicker && (
        <BimConfigModal
          projectId={project_id}
          current={bimConfig}
          onSave={(cfg) => {
            if (cfg?.urn) { setBimUrn(cfg.urn); setBimConfig(cfg); }
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
          returnPath={typeof window !== 'undefined' ? window.location.pathname : undefined}
        />
      )}

      {showSkyline && (
        <IwpSkyline
          projectId={project_id}
          onClose={() => setShowSkyline(false)}
          onOpenIwp={(cwpId) => { setSelectedCwp(cwpId); setTab('iwp'); setShowSkyline(false); setDetailCollapsed(false); }}
        />
      )}
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="hilo-dot hilo-dot--open shrink-0" />
      <div className="text-left">
        <b className="text-[15px] block leading-none text-[#1A1A1A]">{value}</b>
        <span className="text-[9px] uppercase tracking-wider text-[#BDBDBD]">{label}</span>
      </div>
    </div>
  );
}

function SidebarList({ visible, cwa, selectedCwp, checked, onSelect, onToggleCheck }: {
  visible: MCwp[]; cwa: MCwa[]; selectedCwp: string | null; checked: Set<string>;
  onSelect: (cwp: string) => void; onToggleCheck: (cwp: string) => void;
}) {
  if (!visible.length) return <div className="p-8 text-center text-[12px] text-slate-400 italic">Sin CWP para el filtro.</div>;
  let lastCwa = '', lastCv = '';
  const rows: React.ReactNode[] = [];
  for (const c of visible) {
    if (c.cwa !== lastCwa) {
      lastCwa = c.cwa; lastCv = '';
      const nm = cwa.find(x => x.cwa === c.cwa)?.name ?? '';
      rows.push(
        <div key={'cwa-' + c.cwa} className="text-[10px] font-extrabold text-white bg-[#13386b] px-3 py-1.5 sticky top-0 uppercase tracking-wide">
          CWA {c.cwa} · {nm}
        </div>
      );
    }
    if (c.cv !== lastCv) {
      lastCv = c.cv;
      rows.push(
        <div key={'cv-' + c.cv} className="text-[10px] font-bold text-slate-500 bg-[#EEF3F9] px-3 py-1 border-b border-slate-100">
          {c.cv} · {c.cvName}
        </div>
      );
    }
    const noData = !c.items.length && !c.planos.length;
    rows.push(
      <div
        key={c.cwp} onClick={() => onSelect(c.cwp)}
        className={cn(
          'px-3 py-2 border-b border-slate-100 cursor-pointer flex items-center gap-2 hover:bg-red-50',
          selectedCwp === c.cwp && 'bg-red-50 shadow-[inset_3px_0_0_#FF0000]',
          checked.has(c.cwp) && 'bg-red-50/60'
        )}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCheck(c.cwp); }}
          title="Sumar a la selección múltiple para el visor 3D"
          className="shrink-0"
        >
          {checked.has(c.cwp)
            ? <CheckSquare className="w-3.5 h-3.5 text-[#FF0000]" />
            : <Square className="w-3.5 h-3.5 text-slate-300" />}
        </button>
        <span className="min-w-[26px] text-center rounded px-1.5 py-0.5 text-white text-[9.5px] font-extrabold shrink-0" style={{ background: c.color }}>
          {c.disc}
        </span>
        <div className="flex-1 overflow-hidden">
          <div className="font-mono font-extrabold text-[11px] text-[#1A1A1A]">{c.cwp}</div>
          <div className="text-[10px] text-slate-400 truncate">{c.nombre}</div>
        </div>
        {noData && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Sin datos" />}
        <span title={c.nElementos > 0 ? `${c.nElementos} elementos en el modelo` : 'Sin elementos en el modelo todavía'}>
          <Box className={cn('w-3 h-3 shrink-0', c.nElementos > 0 ? 'text-emerald-500' : 'text-slate-300')} />
        </span>
        <div className="text-[9px] text-slate-400 text-right font-mono shrink-0">
          {c.items.length}p·{c.planos.length}pl<br />{c.prog ? fn(c.prog.hh) + ' HH' : ''}
        </div>
      </div>
    );
  }
  return <>{rows}</>;
}

function DetailPanel({ c, cwaName, tab, setTab, projectId, orgSlug, onIsolateMonikers, iwpViewerBridge, ganttCwps }: {
  c: MCwp; cwaName: string; tab: DetailTab; setTab: (t: DetailTab) => void; projectId: string; orgSlug: string;
  onIsolateMonikers: (monikers: string[]) => void;
  iwpViewerBridge?: IwpViewerBridge;
  // CWP que grafica la pestaña Programa: los marcados con checkbox, o el abierto si no hay checks
  ganttCwps?: MCwp[];
}) {
  const gantt = ganttCwps?.length ? ganttCwps : [c];
  return (
    <div>
      <div className="bg-white px-6 py-4 border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="min-w-[34px] text-center rounded-md px-2.5 py-1 text-white text-[13px] font-extrabold" style={{ background: c.color }}>{c.disc}</span>
          <span className="font-mono text-[20px] font-extrabold text-[#1A1A1A]">{c.cwp}</span>
          <span className="text-[14px] text-slate-600">{c.nombre}</span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/${orgSlug}/projects/${projectId}/mineria/cwp-ficha/${encodeURIComponent(c.cwp)}`}
              title="Editar la ficha del CWP (texto, imágenes, secciones por departamento)"
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-slate-300 px-3 py-1 text-[11px] font-extrabold text-slate-600 hover:bg-slate-50 transition"
            >
              <PenLine className="w-3.5 h-3.5" /> Editar ficha
            </Link>
            <a
              href={`/${orgSlug}/projects/${projectId}/mineria/cwp-ficha/${encodeURIComponent(c.cwp)}/print`}
              target="_blank" rel="noreferrer" title="Ficha del CWP lista para imprimir o guardar como PDF"
              className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#FF0000] px-3.5 py-1 text-[11px] font-extrabold text-[#FF0000] hover:bg-red-50 transition"
            >
              <FileText className="w-3.5 h-3.5" /> Ficha PDF
            </a>
          </div>
        </div>
        <div className="mt-2.5" title={`${cwaName} · ${c.cvName} · ${c.dn}`}>
          <HiloTrace nodes={[
            { label: 'CWA', value: c.cwa },
            { label: 'CV', value: c.cv },
            { label: 'CWP', value: c.cwp },
            { label: 'EWP', value: c.ewp || '—', muted: !c.ewp },
          ]} />
        </div>
        <div className="flex gap-6 mt-3 flex-wrap">
          <DK label="Costo oferta" value={fmm(c.costo)} color="text-green-700" />
          <DK label="Ítems del itemizado" value={String(c.items.length)} />
          <DK label="Planos" value={String(c.planos.length)} />
          <DK label="HH programa" value={c.prog ? fn(c.prog.hh) : '—'} color="text-orange-600" />
        </div>
      </div>
      <div className="flex gap-1 px-6 bg-white border-b-2 border-slate-200 flex-wrap sticky top-[97px] z-10">
        {TABS.map(t => (
          <button
            key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2.5 text-[12px] font-bold border-b-[3px] -mb-[2px] transition flex items-center gap-1.5',
              tab === t.id ? 'text-[#1A1A1A] border-[#FF0000]' : 'text-slate-400 border-transparent hover:text-[#A00000]'
            )}
          >
            {t.label}
            {t.id === 'itemizado' && <Badge n={c.items.length} active={tab === t.id} />}
            {t.id === 'planos' && <Badge n={c.planos.length} active={tab === t.id} />}
            {t.id === 'programa' && <Badge n={gantt.reduce((s, x) => s + (x.prog?.acts ?? 0), 0)} active={tab === t.id} />}
          </button>
        ))}
      </div>
      <div className="px-6 py-5 pb-12">
        {tab === 'resumen' && <ResumenTab c={c} projectId={projectId} />}
        {tab === 'itemizado' && <ItemizadoTab c={c} projectId={projectId} onIsolateMonikers={onIsolateMonikers} />}
        {tab === 'planos' && <PlanosTab c={c} />}
        {tab === 'programa' && <CwpGantt cwps={gantt} projectId={projectId} />}
        {tab === 'iwp' && <IwpManager projectId={projectId} cwp={{ cwp: c.cwp, disc: c.disc, nombre: c.nombre, prog: c.prog }} viewer={iwpViewerBridge} />}
      </div>
    </div>
  );
}

function Badge({ n, active }: { n: number; active: boolean }) {
  return <span className={cn('rounded-full px-1.5 text-[9.5px] ml-1', active ? 'bg-[#FF0000] text-white' : 'bg-slate-200 text-slate-500')}>{n}</span>;
}

function DK({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <b className={cn('text-[18px] font-extrabold text-[#1A1A1A] block', color)}>{value}</b>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}

interface CwpResumen {
  cwp: {
    fecha_ifc: string | null; status_cwp: string | null; suministro: string | null;
    ruta_critica: boolean | null; hito_contractual: string | null; hh_planner: number | null;
    fecha_ini: string | null; fecha_fin: string | null; costo_oferta_clp: number | null; pct_hh_proyecto: number | null;
  };
  mc: { n_actividades: number; n_items: number; items_sin_match: number; monto_clp: number; hh: number;
        top_items: { item: string; descripcion: string; unidad: string; cantidad: number; monto: number; hh: number }[] };
  docs: { exactos: number; sugeridos: number };
  iwp: { n: number; hh_asignadas: number; avance_pct: number; constraints_pendientes: number; por_status: Record<string, number> };
}

function ResumenTab({ c, projectId }: { c: MCwp; projectId: string }) {
  const [ctx, setCtx] = useState<CwpResumen | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCtx(null);
    fetch(`/api/mining-cwp-resumen?project_id=${projectId}&cwp_id=${encodeURIComponent(c.cwp)}`)
      .then(r => r.json())
      .then(d => { if (active && !d.error) setCtx(d); });
    return () => { active = false; };
  }, [c.cwp, projectId]);

  // ── Narrativa ejecutiva generada desde la red de datos ──
  const hoy = new Date().toISOString().slice(0, 10);
  const frases = useMemo(() => {
    if (!ctx) return [];
    const f: { icon: string; text: string; alerta?: boolean }[] = [];
    const w = ctx.cwp;
    if (c.prog) {
      f.push({ icon: '📅', text: `El programa vigente (P333 Rev E) le asigna ${c.prog.acts} actividades por ${fn(c.prog.hh)} HH, ejecutándose desde ${fd(c.prog.start)} hasta ${fd(c.prog.end)}.` });
    } else {
      f.push({ icon: '📅', text: 'Este paquete aún NO tiene actividades en el programa vigente — no se puede planificar su ejecución todavía.', alerta: true });
    }
    if (w.fecha_ifc) {
      f.push(w.fecha_ifc <= hoy
        ? { icon: '📐', text: `La ingeniería IFC ya fue emitida (${fd(w.fecha_ifc)}) — el paquete se puede detallar.` }
        : { icon: '📐', text: `La ingeniería IFC está planificada para ${fd(w.fecha_ifc)} — antes de esa fecha no se puede congelar el alcance.`, alerta: true });
    } else {
      f.push({ icon: '📐', text: 'Sin fecha de emisión IFC definida para este paquete.', alerta: true });
    }
    if (w.suministro) f.push({ icon: '🚚', text: `Suministro: ${w.suministro}.` });
    if (ctx.mc.monto_clp > 0) {
      f.push({ icon: '💰', text: `Vale ${fmm(ctx.mc.monto_clp)} cobrables vía ${ctx.mc.n_items} ítems del itemizado (${ctx.mc.n_actividades} actividades vinculadas en la MC).` });
    } else {
      f.push({ icon: '💰', text: 'Sin ítems de cobro vinculados en la Matriz de Correspondencia — el avance de este paquete hoy no se puede valorizar.', alerta: true });
    }
    if (ctx.mc.items_sin_match > 0) f.push({ icon: '⚠️', text: `${ctx.mc.items_sin_match} vínculos de la MC usan numeración que no existe en el itemizado (corregir antes de cobrar).`, alerta: true });
    f.push(ctx.docs.exactos > 0
      ? { icon: '📄', text: `${ctx.docs.exactos} documento(s) oficiales del CWP en Aconex${ctx.docs.sugeridos ? ` + ${ctx.docs.sugeridos} asociados por área/disciplina` : ''}.` }
      : { icon: '📄', text: 'Sin documentos oficiales identificados en Aconex para este CWP.', alerta: true });
    if (ctx.iwp.n > 0) {
      f.push({ icon: '🧱', text: `Abierto en ${ctx.iwp.n} IWP (${fn(ctx.iwp.hh_asignadas)} HH asignadas) con ${ctx.iwp.avance_pct}% de avance físico ponderado${ctx.iwp.constraints_pendientes ? ` y ${ctx.iwp.constraints_pendientes} restricción(es) sin despejar` : ', sin restricciones pendientes'}.` });
    } else {
      f.push({ icon: '🧱', text: 'Todavía no se abre en IWP — nadie puede ejecutarlo en terreno hasta que se corte en paquetes de instalación.', alerta: true });
    }
    if (w.ruta_critica) f.push({ icon: '🔥', text: 'Este paquete está en la RUTA CRÍTICA del proyecto.', alerta: true });
    if (w.hito_contractual) f.push({ icon: '🎯', text: `Amarrado al hito contractual: ${w.hito_contractual}.` });
    return f;
  }, [ctx, c.prog, hoy]);

  // ── Ruta a ejecución: estados del hilo ──
  const ruta = useMemo(() => {
    if (!ctx) return [];
    const w = ctx.cwp;
    const ok = (b: boolean) => b ? 'ok' : 'falta';
    return [
      { label: 'IFC', state: w.fecha_ifc ? (w.fecha_ifc <= hoy ? 'ok' : 'espera') : 'falta', detail: w.fecha_ifc ? fd(w.fecha_ifc) : 'sin fecha' },
      { label: 'Planos', state: ok(ctx.docs.exactos > 0), detail: `${ctx.docs.exactos} en Aconex` },
      { label: 'Programa', state: ok(!!c.prog), detail: c.prog ? `${c.prog.acts} act.` : 'sin actividades' },
      { label: 'Valorización', state: ok(ctx.mc.monto_clp > 0), detail: ctx.mc.monto_clp > 0 ? fmm(ctx.mc.monto_clp) : 'sin MC' },
      { label: 'Suministro', state: w.suministro ? 'espera' : 'na', detail: w.suministro ? 'comprometido' : '—' },
      { label: 'IWP', state: ctx.iwp.n > 0 ? (ctx.iwp.constraints_pendientes === 0 ? 'ok' : 'espera') : 'falta', detail: ctx.iwp.n > 0 ? `${ctx.iwp.n} creados` : 'sin abrir' },
    ];
  }, [ctx, c.prog, hoy]);

  const RUTA_COLOR: Record<string, string> = { ok: '#16A34A', espera: '#F59E0B', falta: '#FF0000', na: '#BDBDBD' };

  return (
    <div className="space-y-5">
      {/* ── Contexto ejecutivo ── */}
      <div className="border border-[#EEEEEE] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#EEEEEE] flex items-center justify-between bg-white">
          <div className="font-display text-[13px] font-bold text-[#1A1A1A]">¿Qué es este paquete y cómo va? <span className="text-[#FF0000]">— resumen ejecutivo</span></div>
          {ctx?.cwp.status_cwp && (
            <span className="px-2.5 py-1 rounded-full border border-[#FF0000]/40 text-[#A00000] text-[9.5px] font-black uppercase tracking-wider">{ctx.cwp.status_cwp}</span>
          )}
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-[#FAFAFA] border-l-4 border-[#FF0000] rounded-r-lg px-4 py-3 text-[12.5px] text-[#4A4A4A] leading-relaxed">
            <b>Alcance:</b> {c.alcance ?? '—'}
          </div>
          {ctx === null ? (
            <div className="flex items-center gap-2 text-slate-400 text-[11.5px]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cruzando programa, MC, itemizado, Aconex e IWP…</div>
          ) : (
            <ul className="space-y-1.5">
              {frases.map((s, i) => (
                <li key={i} className={cn('flex items-start gap-2 text-[12.5px] leading-relaxed', s.alerta ? 'text-[#A00000]' : 'text-[#4A4A4A]')}>
                  <span className="shrink-0">{s.icon}</span>
                  <span>{s.alerta ? <b>{s.text}</b> : s.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ruta a ejecución — el hilo de preparación */}
        {ctx && (
          <div className="px-5 pb-5 pt-1">
            <div className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[#BDBDBD] mb-3">Ruta a ejecución</div>
            <div className="flex items-start">
              {ruta.map((n, i) => (
                <Fragment key={n.label}>
                  {i > 0 && <div className="flex-1 mt-[5px] border-t-[1.5px]" style={{ borderColor: `${RUTA_COLOR[ruta[i - 1].state]}66` }} />}
                  <div className="flex flex-col items-center gap-1 px-1.5">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{
                      background: n.state === 'espera' || n.state === 'na' ? '#fff' : RUTA_COLOR[n.state],
                      border: `2.5px solid ${RUTA_COLOR[n.state]}`,
                      boxShadow: n.state !== 'na' ? `0 0 0 3px ${RUTA_COLOR[n.state]}22` : undefined,
                    }} />
                    <span className="text-[9.5px] font-black uppercase tracking-wide text-[#1A1A1A]">{n.label}</span>
                    <span className="text-[9px] text-[#757575] text-center leading-tight max-w-[90px]">{n.detail}</span>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── KPIs ── */}
      {ctx && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ResumenKpi label="HH programa" value={c.prog ? fn(c.prog.hh) : '—'} sub={ctx.cwp.hh_planner ? `planner: ${fn(ctx.cwp.hh_planner)}` : undefined} />
          <ResumenKpi label="Monto cobrable (MC↔itemizado)" value={ctx.mc.monto_clp ? fmm(ctx.mc.monto_clp) : '—'} sub={`${ctx.mc.n_items} ítems`} accent />
          <ResumenKpi label="Ventana programa" value={c.prog ? `${fd(c.prog.start)} → ${fd(c.prog.end)}` : '—'} sub={ctx.cwp.ruta_critica ? '🔥 ruta crítica' : undefined} />
          <ResumenKpi label="Avance físico (IWP)" value={ctx.iwp.n ? `${ctx.iwp.avance_pct}%` : '—'} sub={ctx.iwp.n ? `${ctx.iwp.n} IWP · ${fn(ctx.iwp.hh_asignadas)} HH` : 'sin IWP'} />
        </div>
      )}

      {/* ── Qué se cobra: top ítems del itemizado ── */}
      {ctx && ctx.mc.top_items.length > 0 && (
        <div className="border border-[#EEEEEE] rounded-2xl overflow-hidden">
          <div className="px-5 py-2.5 border-b border-[#EEEEEE] font-display text-[12px] font-bold text-[#1A1A1A]">
            Qué se cobra en este paquete <span className="text-[#BDBDBD] normal-case font-sans font-normal">(ítems del itemizado vía MC, ordenados por monto)</span>
          </div>
          <table className="w-full text-[11.5px]">
            <thead><tr className="bg-[#FAFAFA] text-[#757575] text-[10px] uppercase">
              <th className="text-left px-4 py-1.5 font-bold">Ítem</th><th className="text-left px-2 py-1.5 font-bold">Descripción</th>
              <th className="text-right px-2 py-1.5 font-bold">Cantidad</th><th className="text-right px-2 py-1.5 font-bold">HH</th><th className="text-right px-4 py-1.5 font-bold">Monto</th>
            </tr></thead>
            <tbody>
              {ctx.mc.top_items.map(it => (
                <tr key={it.item} className="border-t border-[#F5F5F5]">
                  <td className="px-4 py-1.5 font-mono font-bold text-[#A00000]">{it.item}</td>
                  <td className="px-2 py-1.5 text-[#4A4A4A]">{it.descripcion}</td>
                  <td className="px-2 py-1.5 text-right">{fq(it.cantidad)} {it.unidad}</td>
                  <td className="px-2 py-1.5 text-right">{fn(it.hh)}</td>
                  <td className="px-4 py-1.5 text-right font-bold text-[#1A1A1A]">{fmm(it.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

function ResumenKpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="border border-[#EEEEEE] rounded-2xl px-4 py-3 bg-white">
      <div className="flex items-center gap-2">
        <span className={cn('hilo-dot shrink-0', !accent && 'hilo-dot--open')} />
        <span className="text-[9.5px] font-black uppercase tracking-[0.1em] text-[#BDBDBD]">{label}</span>
      </div>
      <div className={cn('text-[17px] font-extrabold mt-1 leading-tight', accent ? 'text-[#A00000]' : 'text-[#1A1A1A]')}>{value}</div>
      {sub && <div className="text-[10px] text-[#757575] mt-0.5">{sub}</div>}
    </div>
  );
}

interface ElementoLink {
  sp3d_moniker: string; name: string | null; tag_unificado: string | null; tipo_elemento: string | null; descripcion: string | null;
  especialidad_cod: string | null; especialidad_nombre: string | null; categoria_constructiva: string | null;
  sitio: string | null; sector: string | null; area_unidad: string | null; sistema_servicio: string | null;
  obra_tipo: string | null; obra_target: string | null; material: string | null; especificacion: string | null;
  isometrico: string | null; spool: string | null; pid: string | null; cwp_id: string | null; pwp_elemento: string | null;
  estado: string | null; avance_pct: number | null; item_o_adicional: string | null;
  diametro_in: number | null; longitud_m: number | null; peso_kg: number | null; volumen_m3: number | null;
}
const ELEMENT_COLUMNS: { key: keyof ElementoLink; label: string }[] = [
  { key: 'tag_unificado', label: 'TAG' },
  { key: 'name', label: 'Tag nativo SmartPlant' },
  { key: 'especialidad_nombre', label: 'Especialidad' },
  { key: 'categoria_constructiva', label: 'Categoría constructiva' },
  { key: 'sector', label: 'Sector' },
  { key: 'area_unidad', label: 'Unidad' },
  { key: 'sistema_servicio', label: 'Sistema' },
  { key: 'obra_tipo', label: 'Obra' },
  { key: 'material', label: 'Material' },
  { key: 'especificacion', label: 'Especificación' },
  { key: 'isometrico', label: 'Isométrico' },
  { key: 'pwp_elemento', label: 'PWP' },
  { key: 'estado', label: 'Estado' },
  { key: 'avance_pct', label: 'Avance %' },
  { key: 'item_o_adicional', label: 'Item/Adicional' },
  { key: 'sp3d_moniker', label: 'SP3d Moniker' },
];
const DEFAULT_ELEMENT_COLS: (keyof ElementoLink)[] = ['tag_unificado', 'especialidad_nombre', 'sector', 'estado', 'avance_pct'];

function ItemizadoTab({ c, projectId, onIsolateMonikers }: { c: MCwp; projectId: string; onIsolateMonikers: (monikers: string[]) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cache, setCache] = useState<Record<string, ElementoLink[]>>({});
  const [loadingCodigo, setLoadingCodigo] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<keyof ElementoLink>>(new Set(DEFAULT_ELEMENT_COLS));
  const [showColPicker, setShowColPicker] = useState(false);

  const loadCodigo = useCallback(async (codigo: string) => {
    if (cache[codigo]) return;
    setLoadingCodigo(codigo);
    try {
      const r = await fetch(`/api/mining-elementos/by-codigo?project_id=${projectId}&codigo=${encodeURIComponent(codigo)}`);
      const d = await r.json();
      setCache(prev => ({ ...prev, [codigo]: d.elementos ?? [] }));
    } finally {
      setLoadingCodigo(null);
    }
  }, [cache, projectId]);

  const toggleExpand = useCallback((codigo: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else { next.add(codigo); loadCodigo(codigo); }
      return next;
    });
  }, [loadCodigo]);

  const toggleCol = useCallback((key: keyof ElementoLink) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const verEn3D = useCallback(async (codigo: string) => {
    let els = cache[codigo];
    if (!els) {
      setLoadingCodigo(codigo);
      const r = await fetch(`/api/mining-elementos/by-codigo?project_id=${projectId}&codigo=${encodeURIComponent(codigo)}`);
      const d = await r.json();
      els = d.elementos ?? [];
      setCache(prev => ({ ...prev, [codigo]: els }));
      setLoadingCodigo(null);
    }
    onIsolateMonikers(els.map(e => e.sp3d_moniker));
  }, [cache, projectId, onIsolateMonikers]);

  if (!c.items.length) return <Empty text="Sin partidas en el itemizado para este CWP." />;
  let tot = 0;
  const totQty: Record<string, number> = {};
  c.items.forEach(it => { if (it.un) totQty[it.un] = (totQty[it.un] ?? 0) + it.qt; });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex flex-wrap gap-3">
          {Object.entries(totQty).map(([u, v]) => (
            <span key={u} className="text-[10.5px] text-slate-500 bg-slate-100 rounded px-2 py-1">
              <b className="font-mono text-[#1A1A1A]">{fq(v)}</b> {u}
            </span>
          ))}
        </div>
        <div className="relative">
          <button
            onClick={() => setShowColPicker(s => !s)}
            className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded px-2.5 py-1.5"
          >
            <Columns3 className="w-3.5 h-3.5" /> Columnas
          </button>
          {showColPicker && (
            <div className="absolute right-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-56 max-h-72 overflow-y-auto">
              {ELEMENT_COLUMNS.map(col => (
                <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-slate-50 rounded cursor-pointer">
                  <input type="checkbox" checked={visibleCols.has(col.key)} onChange={() => toggleCol(col.key)} />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm text-[11.5px]">
        <thead><tr className="bg-[#1A1A1A] text-white text-[10.5px]">
          <Th></Th><Th>Código</Th><Th>Descripción</Th><Th>Obra</Th><Th center>Un.</Th><Th right>Cant.</Th><Th right>PU CLP</Th><Th right>Total CLP</Th><Th center>3D</Th>
        </tr></thead>
        <tbody>
          {c.items.map((it, i) => { tot += it.tot; const isOpen = expanded.has(it.co); return (
            <Fragment key={it.co + i}>
              <tr className={cn('border-b border-slate-100 cursor-pointer hover:bg-red-50', i % 2 === 0 && 'bg-[#F4F8FD]')} onClick={() => toggleExpand(it.co)}>
                <Td center>{isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}</Td>
                <Td className="font-mono">{it.co}</Td><Td>{it.de}</Td><Td>{it.ob ?? '—'}</Td>
                <Td center>{it.un}</Td><Td right className="font-mono">{fq(it.qt)}</Td>
                <Td right className="font-mono">{fn(it.pu)}</Td><Td right className="font-mono">{fn(it.tot)}</Td>
                <Td center>
                  <button onClick={(e) => { e.stopPropagation(); verEn3D(it.co); }} className="p-1 rounded bg-slate-100 hover:bg-slate-200" title="Ver elementos vinculados en 3D">
                    <Crosshair className="w-3.5 h-3.5 text-[#A00000]" />
                  </button>
                </Td>
              </tr>
              {isOpen && (
                <tr>
                  <td colSpan={9} className="bg-slate-50 px-3 py-2 border-b border-slate-200">
                    {loadingCodigo === it.co ? (
                      <div className="flex items-center gap-2 text-slate-400 text-[11px] py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando elementos…</div>
                    ) : !cache[it.co]?.length ? (
                      <div className="text-[11px] text-slate-400 italic py-2">Sin elementos vinculados a esta partida en el modelo todavía.</div>
                    ) : (
                      <ElementosSubtable elementos={cache[it.co]} cols={ELEMENT_COLUMNS.filter(col => visibleCols.has(col.key))} />
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );})}
        </tbody>
        <tfoot><tr className="bg-[#13386b] text-white font-bold">
          <td colSpan={7} className="text-right px-2.5 py-1.5">TOTAL {c.items.length} partidas</td>
          <td className="text-right px-2.5 py-1.5 font-mono">{fn(tot)}</td>
          <td />
        </tr></tfoot>
      </table>
    </div>
  );
}

function ElementosSubtable({ elementos, cols }: { elementos: ElementoLink[]; cols: { key: keyof ElementoLink; label: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10.5px]">
        <thead><tr className="text-slate-500 border-b border-slate-200">
          {cols.map(col => <th key={col.key} className="text-left px-2 py-1 font-semibold whitespace-nowrap">{col.label}</th>)}
        </tr></thead>
        <tbody>
          {elementos.map(el => (
            <tr key={el.sp3d_moniker} className="border-b border-slate-100 hover:bg-white">
              {cols.map(col => (
                <td key={col.key} className="px-2 py-1 max-w-[200px] truncate" title={String(el[col.key] ?? '')}>
                  {col.key === 'avance_pct' ? (el.avance_pct != null ? `${el.avance_pct}%` : '—') : (el[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-slate-400 mt-1.5">{elementos.length} elemento(s) vinculado(s)</div>
    </div>
  );
}

function PlanosTab({ c }: { c: MCwp }) {
  if (!c.planos.length) return <Empty text={`Sin planos cargados para este CWP (EWP ${c.ewp}).`} />;
  return (
    <>
      <p className="text-[11px] text-slate-400 mb-2.5">EWP asociado: <b>{c.ewp}</b></p>
      <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm text-[11.5px]">
        <thead><tr className="bg-[#1A1A1A] text-white text-[10.5px]"><Th>Documento</Th><Th>Descripción</Th><Th center>Tipo</Th></tr></thead>
        <tbody>
          {c.planos.map((p, i) => (
            <tr key={i} className={cn('border-b border-slate-100', i % 2 === 0 && 'bg-[#F4F8FD]')}>
              <Td className="font-mono">
                {p.tieneArchivo ? (
                  <a
                    href={`/api/mining-planos/file?codigo_documento=${encodeURIComponent(p.doc)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[#A00000] hover:underline inline-flex items-center gap-1"
                    title="Abrir PDF real desde la carpeta local de Aconex"
                  >
                    📄 {p.doc}
                  </a>
                ) : (
                  <span className="text-slate-500" title="No hay PDF disponible en la carpeta local de Aconex para este documento">{p.doc}</span>
                )}
              </Td>
              <Td>{p.de}</Td>
              <Td center><span className="text-[9.5px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 font-semibold">{p.ti || 'Plano'}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}


function Empty({ text }: { text: string }) {
  return <div className="bg-white rounded-lg shadow-sm p-9 text-center text-slate-400 italic text-[12px]">{text}</div>;
}

function Th({ children, center, right }: { children?: React.ReactNode; center?: boolean; right?: boolean }) {
  return <th className={cn('px-2.5 py-2 text-left font-semibold whitespace-nowrap', center && 'text-center', right && 'text-right')}>{children}</th>;
}
function Td({ children, center, right, className }: { children: React.ReactNode; center?: boolean; right?: boolean; className?: string }) {
  return <td className={cn('px-2.5 py-1.5', center && 'text-center', right && 'text-right', className)}>{children}</td>;
}
