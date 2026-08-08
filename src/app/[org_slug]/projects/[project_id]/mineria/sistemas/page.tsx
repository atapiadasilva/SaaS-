'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import BimConfigModal, { type BimConfig } from '@/components/modules/BimConfigModal';
import {
  ArrowLeft, Search, Box, Settings, Loader2, Layers, ChevronDown, ChevronRight, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

interface Subsistema {
  swp_id: string; nombre_swp: string | null;
  n_lineas: number; n_equipos: number; n_elementos_modelo: number; pids: string[];
}
interface Sistema { sistema: string; nombre_sistema: string | null; subsistemas: Subsistema[]; }

interface LineaRow {
  codigo: string; area: string | null; servicio: string | null; cwa_codigo: string | null; cwp_codigo: string | null;
  pid_codigo: string | null; pid_valido: boolean | null; sistema: string | null;
  n_isometricos: number; n_spools: number; n_elementos: number; nps: string | null;
  peso_kg: number | null; longitud_m: number | null;
  n_eq_mecanicos: number; n_eq_electricos: number; n_instrumentos: number; n_canalizaciones: number;
}
interface EquipoRow {
  tag: string; tag_base: string | null; area: string | null; disciplina_codigo: string | null;
  tipo_cod: string | null; tipo_desc_ref: string | null; cwa_codigo: string | null; cwp_codigo: string | null;
  pid_codigo: string | null; pid_valido: boolean | null; sistema: string | null;
  descripcion: string | null; espec_tecnica: string | null; n_monikers: number; n_lineas_mismo_pid: number;
}
interface Detalle { lineas: LineaRow[]; equipos: EquipoRow[]; n_elementos_modelo: number; monikers: string[]; }

type Tab = 'resumen' | 'lineas' | 'equipos';
const fn = (v: number) => Math.round(v).toLocaleString('es-CL');

export default function SistemasPage() {
  const params = useParams();
  const project_id = params.project_id as string;
  const org_slug = params.org_slug as string;

  const [sistemas, setSistemas] = useState<Sistema[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedSistemas, setExpandedSistemas] = useState<Set<string>>(new Set());
  const [selectedSwp, setSelectedSwp] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('resumen');
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

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

  useEffect(() => {
    if (!project_id) return;
    setLoading(true);
    fetch(`/api/mining-sistemas?project_id=${project_id}`)
      .then(r => r.json())
      .then(d => {
        setSistemas(d.sistemas ?? []);
        if (d.sistemas?.length) {
          setExpandedSistemas(new Set([d.sistemas[0].sistema]));
          if (d.sistemas[0].subsistemas?.length) setSelectedSwp(d.sistemas[0].subsistemas[0].swp_id);
        }
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

  useEffect(() => {
    if (!selectedSwp || !project_id) { setDetalle(null); return; }
    setLoadingDetalle(true);
    fetch(`/api/mining-sistemas/detalle?project_id=${project_id}&swp_id=${encodeURIComponent(selectedSwp)}`)
      .then(r => r.json())
      .then(d => setDetalle(d))
      .finally(() => setLoadingDetalle(false));
  }, [selectedSwp, project_id]);

  const toggleSistema = useCallback((s: string) => {
    setExpandedSistemas(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }, []);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = viewerWidth;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      setViewerWidth(Math.min(1100, Math.max(280, startWidth - (ev.clientX - startX))));
    };
    const onUp = () => {
      resizingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [viewerWidth]);

  const isolateMonikers = useCallback(async (monikers: string[]) => {
    if (!viewerRef.current || !monikers.length) { setMatchCount(0); return; }
    setViewerStatus(`Aislando ${monikers.length} elemento(s)…`);
    try {
      const dbIds = await viewerRef.current.resolveMonikers(monikers);
      setMatchCount(dbIds.length);
      if (dbIds.length) { viewerRef.current.isolate(dbIds); viewerRef.current.fitToView(dbIds); }
    } finally {
      setViewerStatus(null);
    }
  }, []);

  const verEn3D = useCallback(() => {
    setShowViewer(true);
    if (viewerReady && detalle) isolateMonikers(detalle.monikers);
  }, [viewerReady, detalle, isolateMonikers]);

  useEffect(() => {
    if (showViewer && viewerReady && detalle) isolateMonikers(detalle.monikers);
  }, [selectedSwp]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = useMemo(() => {
    if (!sistemas) return { nSistemas: 0, nSubsistemas: 0, nElementos: 0 };
    let nSubsistemas = 0, nElementos = 0;
    for (const s of sistemas) { nSubsistemas += s.subsistemas.length; for (const sub of s.subsistemas) nElementos += sub.n_elementos_modelo; }
    return { nSistemas: sistemas.length, nSubsistemas, nElementos };
  }, [sistemas]);

  const filteredSistemas = useMemo(() => {
    if (!sistemas) return [];
    const q = search.toLowerCase();
    if (!q) return sistemas;
    return sistemas
      .map(s => ({ ...s, subsistemas: s.subsistemas.filter(sub => (sub.swp_id + ' ' + (sub.nombre_swp ?? '')).toLowerCase().includes(q)) }))
      .filter(s => s.subsistemas.length || s.sistema.toLowerCase().includes(q));
  }, [sistemas, search]);

  const selectedSub = useMemo(() => {
    for (const s of sistemas ?? []) { const sub = s.subsistemas.find(x => x.swp_id === selectedSwp); if (sub) return { sub, sistema: s }; }
    return null;
  }, [sistemas, selectedSwp]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando sistemas y subsistemas…
      </div>
    );
  }

  if (!sistemas || !sistemas.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
        <Layers className="w-10 h-10 opacity-30" />
        <p className="text-sm font-semibold">Sin catálogo de Sistemas/Subsistemas cargado para este proyecto.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col -m-6 bg-white">
      <div className="bg-white border-b border-[#EEEEEE] text-[#1A1A1A] px-6 py-3 flex items-center gap-4 shrink-0">
        <Link
          href={`/${org_slug}/projects/${project_id}/mineria`}
          title="Volver a Explorador CWP"
          className="p-1.5 rounded-full text-[#757575] hover:text-[#A00000] hover:bg-red-50 transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="font-display text-[17px] font-bold">Sistemas y <span className="text-[#FF0000]">Subsistemas</span></h1>
        <div className="flex gap-6 ml-auto text-right">
          <Kpi value={fn(kpis.nSistemas)} label="sistemas" />
          <Kpi value={fn(kpis.nSubsistemas)} label="subsistemas" />
          <Kpi value={fn(kpis.nElementos)} label="elementos clasificados" />
        </div>
        <Link
          href={`/${org_slug}/projects/${project_id}/mineria/elementos`}
          className="px-3 py-1.5 rounded-full border border-[#EEEEEE] bg-white hover:border-[#FF0000]/50 hover:text-[#A00000] text-[#757575] text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0"
        >
          Editor de Elementos
        </Link>
        <button
          onClick={() => setShowPicker(true)}
          className="px-3 py-1.5 rounded-full border border-[#EEEEEE] bg-white hover:border-[#FF0000]/50 hover:text-[#A00000] text-[#757575] text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0"
        >
          <Settings className="w-3.5 h-3.5" /> Modelo 3D
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: árbol Sistema → Subsistema */}
        <div className="w-[320px] bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar sistema o subsistema…"
                className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-[12px] outline-none focus:border-red-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredSistemas.map(s => {
              const isOpen = expandedSistemas.has(s.sistema) || !!search;
              return (
                <div key={s.sistema}>
                  <button
                    onClick={() => toggleSistema(s.sistema)}
                    className="w-full flex items-center gap-1.5 text-[10px] font-extrabold text-[#1A1A1A] bg-[#F6F6F6] border-b border-[#EEEEEE] px-3 py-1.5 sticky top-0 uppercase tracking-wide"
                  >
                    {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Sistema {s.sistema} {s.nombre_sistema ? `· ${s.nombre_sistema}` : ''}
                    <span className="ml-auto opacity-70">{s.subsistemas.length}</span>
                  </button>
                  {isOpen && s.subsistemas.map(sub => (
                    <div
                      key={sub.swp_id} onClick={() => { setSelectedSwp(sub.swp_id); setTab('resumen'); }}
                      className={cn(
                        'px-3 py-2 border-b border-slate-100 cursor-pointer hover:bg-red-50 flex items-center gap-2',
                        selectedSwp === sub.swp_id && 'bg-red-50 shadow-[inset_3px_0_0_#FF0000]'
                      )}
                    >
                      <div className="flex-1 overflow-hidden">
                        <div className="font-mono font-extrabold text-[11px] text-[#1A1A1A]">{sub.swp_id}</div>
                        <div className="text-[10px] text-slate-400 truncate">{sub.nombre_swp}</div>
                      </div>
                      <span title={sub.n_elementos_modelo > 0 ? `${sub.n_elementos_modelo} elementos en el modelo` : 'Sin elementos en el modelo todavía'}>
                        <Box className={cn('w-3 h-3 shrink-0', sub.n_elementos_modelo > 0 ? 'text-emerald-500' : 'text-slate-300')} />
                      </span>
                      <div className="text-[9px] text-slate-400 text-right font-mono shrink-0">
                        {sub.n_lineas}L · {sub.n_equipos}E
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto">
          {selectedSub ? (
            <FichaSubsistema
              sub={selectedSub.sub} sistema={selectedSub.sistema} tab={tab} setTab={setTab}
              detalle={detalle} loadingDetalle={loadingDetalle} onVer3D={verEn3D}
              onIsolateMonikers={isolateMonikers}
            />
          ) : (
            <div className="p-10 text-center text-slate-400 italic">Selecciona un subsistema de la lista.</div>
          )}
        </div>

        {/* Viewer drawer */}
        {showViewer && (
          <div className="flex shrink-0 relative" style={{ width: viewerWidth }}>
            <div
              onMouseDown={onResizeStart}
              className="absolute left-0 top-0 h-full w-1.5 -ml-[3px] cursor-col-resize z-20 hover:bg-[#FF0000]/40 active:bg-[#FF0000]/60 transition-colors"
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
                    onReady={() => { setViewerReady(true); if (detalle) isolateMonikers(detalle.monikers); }}
                  />
                )}
                {viewerStatus && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full">
                    <Loader2 className="w-3 h-3 animate-spin" /> {viewerStatus}
                  </div>
                )}
                {!viewerStatus && matchCount === 0 && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-amber-500/90 text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-lg">
                    Sin coincidencias: este subsistema no tiene elementos clasificados en el modelo todavía
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

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'lineas', label: 'Líneas' },
  { id: 'equipos', label: 'Equipos' },
];

function FichaSubsistema({ sub, sistema, tab, setTab, detalle, loadingDetalle, onVer3D, onIsolateMonikers }: {
  sub: Subsistema; sistema: Sistema; tab: Tab; setTab: (t: Tab) => void;
  detalle: Detalle | null; loadingDetalle: boolean; onVer3D: () => void;
  onIsolateMonikers: (monikers: string[]) => void;
}) {
  return (
    <div>
      <div className="bg-white px-6 py-4 border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-[20px] font-extrabold text-[#1A1A1A]">{sub.swp_id}</span>
          <span className="text-[14px] text-slate-600">{sub.nombre_swp}</span>
          <button
            onClick={onVer3D} disabled={sub.n_elementos_modelo === 0}
            title={sub.n_elementos_modelo === 0 ? 'Este subsistema todavía no tiene elementos clasificados en el modelo 3D' : undefined}
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[11.5px] font-bold shadow-sm transition',
              sub.n_elementos_modelo === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-[#FF0000] hover:bg-[#A00000] text-white'
            )}
          >
            <Box className="w-3.5 h-3.5" /> Ver en 3D {sub.n_elementos_modelo > 0 && `(${sub.n_elementos_modelo})`}
          </button>
        </div>
        <div className="text-[10.5px] text-slate-400 font-mono mt-1">
          Sistema {sistema.sistema} {sistema.nombre_sistema ? sistema.nombre_sistema : ''} · P&IDs: {sub.pids.join(', ') || '—'}
        </div>
        <div className="flex gap-6 mt-3 flex-wrap">
          <DK label="Líneas de piping" value={fn(sub.n_lineas)} />
          <DK label="Equipos/instrumentos" value={fn(sub.n_equipos)} />
          <DK label="Elementos en el modelo" value={fn(sub.n_elementos_modelo)} color="text-emerald-700" />
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
            {t.id === 'lineas' && <Badge n={sub.n_lineas} active={tab === t.id} />}
            {t.id === 'equipos' && <Badge n={sub.n_equipos} active={tab === t.id} />}
          </button>
        ))}
      </div>
      <div className="px-6 py-5 pb-12">
        {loadingDetalle ? (
          <div className="flex items-center gap-2 text-slate-400 text-[12px] py-6"><Loader2 className="w-4 h-4 animate-spin" /> Cargando ficha…</div>
        ) : (
          <>
            {tab === 'resumen' && <ResumenTab sub={sub} detalle={detalle} />}
            {tab === 'lineas' && <LineasTab lineas={detalle?.lineas ?? []} />}
            {tab === 'equipos' && <EquiposTab equipos={detalle?.equipos ?? []} />}
          </>
        )}
      </div>
    </div>
  );
}

function ResumenTab({ sub, detalle }: { sub: Subsistema; detalle: Detalle | null }) {
  const lineas = detalle?.lineas ?? [];
  const equipos = detalle?.equipos ?? [];
  const discCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of equipos) { const k = e.disciplina_codigo ?? 'Otros'; m[k] = (m[k] ?? 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [equipos]);

  if (!lineas.length && !equipos.length) return <Empty text="Sin líneas ni equipos asociados a este subsistema todavía." />;

  return (
    <div className="flex gap-6 flex-wrap">
      <div className="flex-[2] min-w-[330px] space-y-4">
        <div className="bg-[#FFF5F5] border-l-4 border-[#FF0000] rounded-r-lg px-4 py-3 text-[12.5px] text-[#4A4A4A] leading-relaxed">
          <b>P&IDs asociados:</b> {sub.pids.join(', ') || '—'}
        </div>
        {discCount.length > 0 && (
          <div>
            <div className="text-[12px] font-bold text-[#13386b] mb-2">Equipos por disciplina</div>
            <div className="flex flex-wrap gap-1.5">
              {discCount.map(([k, v]) => (
                <span key={k} className="font-mono text-[11px] font-bold bg-[#F6F6F6] text-[#4A4A4A] border border-[#EEEEEE] rounded-md px-2 py-0.5">{k} · {v}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LineasTab({ lineas }: { lineas: LineaRow[] }) {
  if (!lineas.length) return <Empty text="Sin líneas de piping asociadas a este subsistema." />;
  return (
    <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm text-[11.5px]">
      <thead><tr className="bg-[#1A1A1A] text-white text-[10.5px]">
        <Th>Línea</Th><Th>Servicio</Th><Th>P&ID</Th><Th>NPS</Th><Th right>Isométricos</Th><Th right>Spools</Th><Th right>Elementos</Th>
      </tr></thead>
      <tbody>
        {lineas.map((l, i) => (
          <tr key={l.codigo} className={cn('border-b border-slate-100', i % 2 === 0 && 'bg-[#FFF5F5]')}>
            <Td className="font-mono font-bold">{l.codigo}</Td><Td>{l.servicio ?? '—'}</Td>
            <Td className="font-mono text-[10px]">{l.pid_codigo ?? '—'}</Td><Td>{l.nps ?? '—'}</Td>
            <Td right className="font-mono">{fn(l.n_isometricos)}</Td><Td right className="font-mono">{fn(l.n_spools)}</Td>
            <Td right className="font-mono">{fn(l.n_elementos)}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EquiposTab({ equipos }: { equipos: EquipoRow[] }) {
  if (!equipos.length) return <Empty text="Sin equipos/instrumentos asociados a este subsistema." />;
  return (
    <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm text-[11.5px]">
      <thead><tr className="bg-[#1A1A1A] text-white text-[10.5px]">
        <Th>Tag</Th><Th>Disc.</Th><Th>Descripción</Th><Th>P&ID</Th><Th right>Monikers</Th>
      </tr></thead>
      <tbody>
        {equipos.map((e, i) => (
          <tr key={e.tag} className={cn('border-b border-slate-100', i % 2 === 0 && 'bg-[#FFF5F5]')}>
            <Td className="font-mono font-bold">{e.tag}</Td><Td>{e.disciplina_codigo ?? '—'}</Td>
            <Td className="max-w-[280px] truncate" title={e.descripcion ?? ''}>{e.descripcion ?? '—'}</Td>
            <Td className="font-mono text-[10px]">{e.pid_codigo ?? '—'}</Td>
            <Td right className="font-mono">{fn(e.n_monikers)}</Td>
          </tr>
        ))}
      </tbody>
    </table>
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
function Empty({ text }: { text: string }) {
  return <div className="bg-white rounded-lg shadow-sm p-9 text-center text-slate-400 italic text-[12px]">{text}</div>;
}
function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={cn('px-2.5 py-2 text-left font-semibold whitespace-nowrap', right && 'text-right')}>{children}</th>;
}
function Td({ children, right, className, title }: { children: React.ReactNode; right?: boolean; className?: string; title?: string }) {
  return <td className={cn('px-2.5 py-1.5', right && 'text-right', className)} title={title}>{children}</td>;
}
