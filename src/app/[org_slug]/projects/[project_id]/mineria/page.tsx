'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import BimConfigModal, { type BimConfig } from '@/components/modules/BimConfigModal';
import {
  Search, Box, Settings, Loader2, FileText, Calendar, Package, ListTree, X, ListChecks,
  CheckSquare, Square, ChevronDown, ChevronRight, Crosshair, Columns3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

// ─── Types ──────────────────────────────────────────────────────────────────
interface MItem { co: string; de: string; ob: string | null; un: string; qt: number; pu: number; tot: number; guid: string | null; }
interface MPlano { doc: string; de: string; ti: string; }
interface MTask { n: string; hh: number; s: string | null; e: string | null; code: string; }
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

type DetailTab = 'resumen' | 'itemizado' | 'planos' | 'programa';
const TABS: { id: DetailTab; label: string }[] = [
  { id: 'resumen',    label: 'Resumen' },
  { id: 'itemizado',  label: 'Itemizado y Cantidades' },
  { id: 'planos',     label: 'Planos' },
  { id: 'programa',   label: 'Programa' },
];

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const fmm = (v: number) => !v ? '—' : '$' + Math.round(v / 1e6).toLocaleString('es-CL') + ' MM';
const fn  = (v: number) => Math.round(v).toLocaleString('es-CL');
const fq  = (v: number) => v % 1 === 0 ? v.toLocaleString('es-CL') : v.toLocaleString('es-CL', { maximumFractionDigits: 1 });
const fd  = (s: string | null) => s ? s.slice(8, 10) + '-' + MESES[+s.slice(5, 7) - 1] + '-' + s.slice(2, 4) : '—';

function extractTags(c: MCwp): string[] {
  const txt = (c.alcance || '') + ' ' + c.items.map(i => (i.de || '') + ' ' + (i.ob || '')).join(' ');
  const re = /\b(\d{3})-([A-Z]{1,3})-(\d{3,4})((?:\/\d{3,4})*)\b/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) {
    const base = m[1] + '-' + m[2] + '-';
    set.add(base + m[3]);
    if (m[4]) m[4].split('/').filter(Boolean).forEach(n => set.add(base + n));
  }
  return [...set].sort();
}

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
  const [showViewer, setShowViewer] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerStatus, setViewerStatus] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [viewerWidth, setViewerWidth] = useState(440);
  const viewerRef = useRef<ForgeViewerHandle | null>(null);
  const resizingRef = useRef(false);

  // Propiedad nativa en el modelo (SmartPlant3D → Navisworks → Forge) que trae el código CWP por elemento
  const CWP_PROP = 'CWP';
  // Clave real de enlace al modelo: la pestaña/categoría "DATA_EIMISA" escrita por el plugin
  // DataTools trae la propiedad SP3D_MONIKER (no la genérica "SP3d Moniker" de SmartPlant).
  const MONIKER_PROP = 'SP3D_MONIKER';
  const [pendingMonikers, setPendingMonikers] = useState<string[] | null>(null);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = viewerWidth;
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
        if (d.cwp.length) setSelectedCwp(d.cwp[0].cwp);
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

  // Conjunto activo para el visor: si hay checkboxes marcados, manda esa selección múltiple;
  // si no, se sigue filtrando por el CWP único que está abierto en el panel de detalle.
  const activeFilterSet = useMemo(() => checked.size ? [...checked] : (selectedCwp ? [selectedCwp] : []), [checked, selectedCwp]);

  const filterByCwps = useCallback(async (cwpIds: string[]) => {
    if (!viewerRef.current || !cwpIds.length) return;
    setViewerStatus(cwpIds.length > 1 ? `Filtrando modelo por ${cwpIds.length} CWP…` : 'Filtrando modelo por CWP…');
    try {
      const dbIds = await viewerRef.current.resolveManyByProperty(CWP_PROP, cwpIds);
      setMatchCount(dbIds.length);
      if (!dbIds.length) return;
      viewerRef.current.isolate(dbIds);
      viewerRef.current.fitToView(dbIds);
    } finally {
      setViewerStatus(null);
    }
  }, []);

  const onVer3D = useCallback((c: MCwp) => {
    setShowViewer(true);
    if (viewerReady) filterByCwps(checked.size ? [...checked] : [c.cwp]);
  }, [viewerReady, filterByCwps, checked]);

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
      setViewerStatus(`Aislando ${monikers.length} elemento(s) del itemizado…`);
      try {
        const dbIds = await viewerRef.current!.resolveManyByProperty(MONIKER_PROP, monikers);
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

  return (
    <div className="h-full flex flex-col -m-6 bg-[#EEF2F7]">
      {/* Top bar */}
      <div className="bg-gradient-to-br from-[#08203F] to-[#1565C0] text-white px-6 py-3 flex items-center gap-5 shrink-0">
        <h1 className="text-[15px] font-extrabold">Explorador CWP</h1>
        <div className="flex gap-5 ml-auto flex-wrap">
          <Kpi value={fn(data.cwp.length)} label="CWP" />
          <Kpi value={fn(data.kpi.part)} label="suministros" />
          <Kpi value={fn(data.kpi.plan)} label="planos" />
          <Kpi value={fn(data.kpi.costo / 1e6)} label="MM CLP" />
          <Kpi value={fn(data.kpi.hh)} label="HH planner" />
        </div>
        <Link
          href={`/${org_slug}/projects/${project_id}/mineria/elementos`}
          className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0"
        >
          <ListChecks className="w-3.5 h-3.5" /> Editor de Elementos
        </Link>
        <button
          onClick={() => setShowPicker(true)}
          className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0"
        >
          <Settings className="w-3.5 h-3.5" /> Modelo 3D
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-[320px] bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar CWP, nombre o equipo…"
                className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-[12px] outline-none focus:border-blue-500"
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
            <div className="px-3 py-2 bg-[#08203F] text-white flex items-center gap-2 shrink-0">
              <span className="text-[10.5px] font-bold">{checked.size} CWP seleccionados</span>
              <button
                onClick={() => { setShowViewer(true); if (viewerReady) filterByCwps([...checked]); }}
                className="ml-auto inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-500 rounded px-2 py-1 text-[10px] font-bold"
              >
                <Box className="w-3 h-3" /> Ver en 3D
              </button>
              <button onClick={() => setChecked(new Set())} className="text-white/60 hover:text-white" title="Limpiar selección">
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

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <DetailPanel
              c={selected} cwaName={data.cwa.find(x => x.cwa === selected.cwa)?.name ?? ''}
              tab={tab} setTab={setTab} onVer3D={onVer3D} projectId={project_id}
              onIsolateMonikers={filterByMonikers}
            />
          ) : (
            <div className="p-10 text-center text-slate-400 italic">Selecciona un CWP de la lista.</div>
          )}
        </div>

        {/* Viewer drawer */}
        {showViewer && (
          <div className="flex shrink-0 relative" style={{ width: viewerWidth }}>
            <div
              onMouseDown={onResizeStart}
              className="absolute left-0 top-0 h-full w-1.5 -ml-[3px] cursor-col-resize z-20 hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors"
              title="Arrastra para redimensionar"
            />
            <div className="flex-1 border-l border-slate-200 bg-[#060d1f] flex flex-col min-w-0">
            <div className="px-3 py-2 flex items-center justify-between bg-[#0a1628] border-b border-white/5">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Visor 3D{matchCount != null && ` · ${matchCount} elementos`}
              </span>
              <button
                onClick={() => { setShowViewer(false); setViewerReady(false); setMatchCount(null); }}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 relative">
              {!bimUrn ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 px-6 text-center">
                  <Box className="w-10 h-10 opacity-20" />
                  <div className="text-xs">Configura el modelo BIM en Autodesk Platform Services para activar el visor.</div>
                  <button onClick={() => setShowPicker(true)} className="text-[11px] font-black text-indigo-400 hover:text-indigo-300">
                    Configurar modelo →
                  </button>
                </div>
              ) : (
                <ForgeViewer
                  ref={viewerRef} urn={bimUrn}
                  onReady={() => { setViewerReady(true); if (activeFilterSet.length) filterByCwps(activeFilterSet); }}
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
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-right">
      <b className="text-[15px] block leading-none">{value}</b>
      <span className="text-[9px] opacity-80 uppercase">{label}</span>
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
          'px-3 py-2 border-b border-slate-100 cursor-pointer flex items-center gap-2 hover:bg-blue-50',
          selectedCwp === c.cwp && 'bg-blue-100 shadow-[inset_3px_0_0_#1565C0]',
          checked.has(c.cwp) && 'bg-indigo-50'
        )}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCheck(c.cwp); }}
          title="Sumar a la selección múltiple para el visor 3D"
          className="shrink-0"
        >
          {checked.has(c.cwp)
            ? <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
            : <Square className="w-3.5 h-3.5 text-slate-300" />}
        </button>
        <span className="min-w-[26px] text-center rounded px-1.5 py-0.5 text-white text-[9.5px] font-extrabold shrink-0" style={{ background: c.color }}>
          {c.disc}
        </span>
        <div className="flex-1 overflow-hidden">
          <div className="font-mono font-extrabold text-[11px] text-[#08203F]">{c.cwp}</div>
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

function DetailPanel({ c, cwaName, tab, setTab, onVer3D, projectId, onIsolateMonikers }: {
  c: MCwp; cwaName: string; tab: DetailTab; setTab: (t: DetailTab) => void; onVer3D: (c: MCwp) => void; projectId: string;
  onIsolateMonikers: (monikers: string[]) => void;
}) {
  return (
    <div>
      <div className="bg-white px-6 py-4 border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="min-w-[34px] text-center rounded-md px-2.5 py-1 text-white text-[13px] font-extrabold" style={{ background: c.color }}>{c.disc}</span>
          <span className="font-mono text-[20px] font-extrabold text-[#08203F]">{c.cwp}</span>
          <span className="text-[14px] text-slate-600">{c.nombre}</span>
          <button
            onClick={() => onVer3D(c)} disabled={c.nElementos === 0}
            title={c.nElementos === 0 ? 'Este CWP todavía no tiene elementos vinculados en el modelo 3D' : undefined}
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[11.5px] font-bold shadow-sm transition',
              c.nElementos === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-[#0D47A1] hover:bg-[#1565C0] text-white'
            )}
          >
            <Box className="w-3.5 h-3.5" /> Ver en 3D {c.nElementos > 0 && `(${c.nElementos})`}
          </button>
        </div>
        <div className="text-[10.5px] text-slate-400 font-mono mt-1">
          CWA {c.cwa} {cwaName} · CV {c.cv} {c.cvName} · EWP {c.ewp} · {c.dn}
        </div>
        <div className="flex gap-6 mt-3 flex-wrap">
          <DK label="Costo oferta" value={fmm(c.costo)} color="text-green-700" />
          <DK label="Suministros" value={String(c.items.length)} />
          <DK label="Planos" value={String(c.planos.length)} />
          <DK label="HH planner" value={c.prog ? fn(c.prog.hh) : '—'} color="text-orange-600" />
        </div>
      </div>
      <div className="flex gap-1 px-6 bg-white border-b-2 border-slate-200 flex-wrap sticky top-[97px] z-10">
        {TABS.map(t => (
          <button
            key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2.5 text-[12px] font-bold border-b-[3px] -mb-[2px] transition flex items-center gap-1.5',
              tab === t.id ? 'text-[#08203F] border-[#1565C0]' : 'text-slate-400 border-transparent hover:text-blue-600'
            )}
          >
            {t.label}
            {t.id === 'itemizado' && <Badge n={c.items.length} active={tab === t.id} />}
            {t.id === 'planos' && <Badge n={c.planos.length} active={tab === t.id} />}
            {t.id === 'programa' && <Badge n={c.prog?.acts ?? 0} active={tab === t.id} />}
          </button>
        ))}
      </div>
      <div className="px-6 py-5 pb-12">
        {tab === 'resumen' && <ResumenTab c={c} onVer3D={onVer3D} projectId={projectId} />}
        {tab === 'itemizado' && <ItemizadoTab c={c} projectId={projectId} onIsolateMonikers={onIsolateMonikers} />}
        {tab === 'planos' && <PlanosTab c={c} />}
        {tab === 'programa' && <ProgramaTab c={c} />}
      </div>
    </div>
  );
}

function Badge({ n, active }: { n: number; active: boolean }) {
  return <span className={cn('rounded-full px-1.5 text-[9.5px] ml-1', active ? 'bg-[#1565C0] text-white' : 'bg-slate-200 text-slate-500')}>{n}</span>;
}

function DK({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <b className={cn('text-[18px] font-extrabold text-[#08203F] block', color)}>{value}</b>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}

const PAL = ['#1565C0', '#00695C', '#E65100', '#6A1B9A', '#AD1457', '#5E35B1', '#2E7D32', '#8D6E63', '#C9A100', '#00838F'];

function ResumenTab({ c, onVer3D, projectId }: { c: MCwp; onVer3D: (c: MCwp) => void; projectId: string }) {
  const tags = useMemo(() => extractTags(c), [c]);
  const [modelTags, setModelTags] = useState<string[] | null>(null);
  const [modelTagsTotal, setModelTagsTotal] = useState(0);

  useEffect(() => {
    setModelTags(null);
    fetch(`/api/mining-elementos/tags?project_id=${projectId}&cwp=${encodeURIComponent(c.cwp)}`)
      .then(r => r.json())
      .then(d => { setModelTags(d.tags ?? []); setModelTagsTotal(d.total ?? 0); });
  }, [c.cwp, projectId]);

  const cc = useMemo(() => {
    const m: Record<string, number> = {};
    c.items.forEach(i => { const k = i.ob ?? 'Otros'; m[k] = (m[k] ?? 0) + i.tot; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [c]);
  const tot = cc.reduce((s, x) => s + x[1], 0) || 1;

  return (
    <div className="flex gap-6 flex-wrap">
      <div className="flex-[2] min-w-[330px] space-y-4">
        <div className="bg-[#F4F8FD] border-l-4 border-[#1565C0] rounded-r-lg px-4 py-3 text-[12.5px] text-[#3A4D63] leading-relaxed">
          <b>Alcance (Diccionario AWP):</b> {c.alcance ?? '—'}
        </div>
        <div>
          <div className="text-[12px] font-bold text-[#13386b] mb-2">🏷️ Equipos / Tags del paquete</div>
          <div className="flex flex-wrap gap-1.5">
            {tags.length ? tags.map(t => (
              <span key={t} className="font-mono text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-md px-2 py-0.5">{t}</span>
            )) : <span className="text-[10.5px] text-slate-400 italic">Sin tags de equipos detectados en el alcance.</span>}
          </div>
        </div>
        <div>
          <div className="text-[12px] font-bold text-[#13386b] mb-2">
            🧩 Tags de elementos del modelo {modelTagsTotal > 0 && `(${fn(modelTagsTotal)})`}
          </div>
          {modelTags === null ? (
            <span className="text-[10.5px] text-slate-400 italic">Cargando…</span>
          ) : modelTags.length ? (
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {modelTags.map(t => (
                <span key={t} className="font-mono text-[10.5px] font-semibold bg-slate-50 text-slate-600 border border-slate-200 rounded-md px-1.5 py-0.5">{t}</span>
              ))}
            </div>
          ) : (
            <span className="text-[10.5px] text-slate-400 italic">Este CWP todavía no tiene elementos vinculados en el modelo.</span>
          )}
        </div>
        {cc.length > 0 && (
          <div>
            <div className="text-[12px] font-bold text-[#13386b] mb-2">📊 Composición por obra/ítem (costo de oferta)</div>
            <div className="flex h-6 rounded-md overflow-hidden shadow-sm">
              {cc.map(([k, v], i) => (
                <div key={k} title={`${k}: ${fmm(v)}`} style={{ width: `${v / tot * 100}%`, background: PAL[i % PAL.length] }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {cc.slice(0, 8).map(([k, v], i) => (
                <span key={k} className="text-[10.5px] text-slate-600 flex items-center gap-1.5">
                  <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: PAL[i % PAL.length] }} /> {k} · {fmm(v)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-[220px]">
        {c.nElementos > 0 ? (
          <button onClick={() => onVer3D(c)} className="w-full justify-center mb-4 inline-flex items-center gap-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-lg px-3 py-3 text-[12.5px] font-bold transition">
            <Box className="w-4 h-4" /> Ver modelo 3D del CWP ({c.nElementos})
          </button>
        ) : (
          <div className="w-full mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-3 text-[11.5px]">
            <Box className="w-4 h-4 shrink-0" /> Este CWP todavía no tiene elementos vinculados en el modelo 3D.
          </div>
        )}
      </div>
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
              <b className="font-mono text-[#08203F]">{fq(v)}</b> {u}
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
        <thead><tr className="bg-[#08203F] text-white text-[10.5px]">
          <Th></Th><Th>Código</Th><Th>Descripción</Th><Th>Obra</Th><Th center>Un.</Th><Th right>Cant.</Th><Th right>PU CLP</Th><Th right>Total CLP</Th><Th center>3D</Th>
        </tr></thead>
        <tbody>
          {c.items.map((it, i) => { tot += it.tot; const isOpen = expanded.has(it.co); return (
            <Fragment key={it.co + i}>
              <tr className={cn('border-b border-slate-100 cursor-pointer hover:bg-blue-50', i % 2 === 0 && 'bg-[#F4F8FD]')} onClick={() => toggleExpand(it.co)}>
                <Td center>{isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}</Td>
                <Td className="font-mono">{it.co}</Td><Td>{it.de}</Td><Td>{it.ob ?? '—'}</Td>
                <Td center>{it.un}</Td><Td right className="font-mono">{fq(it.qt)}</Td>
                <Td right className="font-mono">{fn(it.pu)}</Td><Td right className="font-mono">{fn(it.tot)}</Td>
                <Td center>
                  <button onClick={(e) => { e.stopPropagation(); verEn3D(it.co); }} className="p-1 rounded bg-slate-100 hover:bg-slate-200" title="Ver elementos vinculados en 3D">
                    <Crosshair className="w-3.5 h-3.5 text-[#0D47A1]" />
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
        <thead><tr className="bg-[#08203F] text-white text-[10.5px]"><Th>Documento</Th><Th>Descripción</Th><Th center>Tipo</Th></tr></thead>
        <tbody>
          {c.planos.map((p, i) => (
            <tr key={i} className={cn('border-b border-slate-100', i % 2 === 0 && 'bg-[#F4F8FD]')}>
              <Td className="font-mono">{p.doc}</Td><Td>{p.de}</Td>
              <Td center><span className="text-[9.5px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 font-semibold">{p.ti || 'Plano'}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ProgramaTab({ c }: { c: MCwp }) {
  if (!c.prog) return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-[11.5px]">
      ⚠ Este CWP no tiene actividades en el programa del planner todavía.
    </div>
  );
  const p = c.prog;
  const s0 = p.start ? +new Date(p.start) : 0;
  const e0 = p.end ? +new Date(p.end) : 0;
  const span = (e0 - s0) || 1;
  return (
    <>
      <div className="flex gap-6 bg-[#FFF7EF] border border-[#F2D2AE] rounded-lg px-4 py-3.5 mb-4 flex-wrap">
        <ProgKpi v={fn(p.hh)} l="HH totales" />
        <ProgKpi v={String(p.acts)} l="actividades" />
        <ProgKpi v={fd(p.start)} l="inicio" />
        <ProgKpi v={fd(p.end)} l="fin" />
      </div>
      <h4 className="text-[12px] text-[#13386b] mb-2.5 font-bold">Actividades del programa</h4>
      <div className="space-y-1">
        {p.tasks.filter(t => t.s).map((t, i) => {
          const l = ((+new Date(t.s!)) - s0) / span * 100;
          const w = Math.max(3, ((+new Date(t.e!)) - (+new Date(t.s!))) / span * 100);
          return (
            <div key={i} className="flex items-center gap-2.5">
              <div className="w-[46%] text-[11px] text-[#33475B] truncate" title={t.n}>{t.n}</div>
              <div className="flex-1 bg-[#EFE3D5] rounded h-[17px] relative">
                <div className="absolute h-full rounded bg-[#E68A2E] flex items-center px-1.5" style={{ left: `${l}%`, width: `${w}%` }}>
                  <span className="text-[9px] text-white font-bold whitespace-nowrap">{fn(t.hh)} HH</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ProgKpi({ v, l }: { v: string; l: string }) {
  return (
    <div>
      <span className="text-[17px] font-extrabold text-[#C2630A] font-mono block">{v}</span>
      <span className="text-[10px] text-[#7A5A33]">{l}</span>
    </div>
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
