'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import SortableSequenceList from '@/components/awp/SortableSequenceList';
import { createClient } from '@/lib/supabase/client';
import { CalendarDays, Monitor, Settings2, Loader2, GripHorizontal, Link2, Layers, GitCompare } from 'lucide-react';
import Link from 'next/link';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });
const BimProgramLinker = dynamic(() => import('@/components/awp/BimProgramLinker'), { ssr: false });
const PlanComparator = dynamic(() => import('@/components/awp/PlanComparator'), { ssr: false });

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function FourDPage({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { org_slug, project_id } = use(params);

  const [modelUrn,    setModelUrn]    = useState<string | null>(null);
  const [modelName,   setModelName]   = useState<string | null>(null);
  const [loadingCfg,  setLoadingCfg]  = useState(true);
  const [viewerReady, setViewerReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'sequencer' | 'program' | 'compare'>('program');

  // Resizable split — viewer height as percentage (20%–85%)
  const [splitPct, setSplitPct]     = useState(58);
  const containerRef                = useRef<HTMLDivElement>(null);
  const draggingRef                 = useRef(false);

  const viewerRef = useRef<ForgeViewerHandle>(null);

  // ── Leer modelo desde module_config.bim ──────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const sb = createClient() as any;
        const { data } = await sb
          .from('projects')
          .select('module_config')
          .eq('id', project_id)
          .single();
        const bim = (data?.module_config as any)?.bim;
        if (bim?.urn) {
          setModelUrn(bim.urn);
          setModelName(bim.modelName ?? null);
        }
      } catch {}
      setLoadingCfg(false);
    })();
  }, [project_id]);

  // ── Draggable divider ─────────────────────────────────────────────────────
  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct  = Math.min(85, Math.max(15, ((ev.clientY - rect.top) / rect.height) * 100));
      setSplitPct(pct);
    };

    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col overflow-hidden bg-slate-50 -mx-8 -my-8 h-[calc(100vh-65px)]">

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-4">

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#0C1E4F] flex items-center justify-center">
            <CalendarDays size={15} className="text-white" />
          </div>
          <div>
            <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest leading-none">
              Secuenciador 4D
            </p>
            <p className="text-[9px] text-slate-400 font-bold">
              {modelName ?? 'Sin modelo configurado'}
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-slate-100 rounded-xl p-0.5 mx-4">
          <button onClick={() => setActiveTab('program')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition ${activeTab === 'program' ? 'bg-white shadow-sm text-[#0C1E4F]' : 'text-slate-400 hover:text-slate-600'}`}>
            <Link2 size={12} /> Programa 4D
          </button>
          <button onClick={() => setActiveTab('sequencer')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition ${activeTab === 'sequencer' ? 'bg-white shadow-sm text-[#0C1E4F]' : 'text-slate-400 hover:text-slate-600'}`}>
            <Layers size={12} /> Secuenciador
          </button>
          <button onClick={() => setActiveTab('compare')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition ${activeTab === 'compare' ? 'bg-white shadow-sm text-[#0C1E4F]' : 'text-slate-400 hover:text-slate-600'}`}>
            <GitCompare size={12} /> Importador de Planificación
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {viewerReady && activeTab !== 'compare' && (
            <>
              <button
                onClick={() => viewerRef.current?.removeAllTransparency()}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-500 hover:bg-slate-50 transition"
              >
                Quitar Transparencia
              </button>
              <button
                onClick={() => { viewerRef.current?.showAll(); viewerRef.current?.clearHighlights(); }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-500 hover:bg-slate-50 transition"
              >
                Mostrar todo
              </button>
              <button
                onClick={() => viewerRef.current?.fitToView()}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-500 hover:bg-slate-50 transition"
              >
                Encuadrar
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Compare mode: full-height dual viewer ─────────────────────────── */}
      {activeTab === 'compare' && (
        <div className="flex-1 overflow-hidden min-h-0">
          <PlanComparator
            projectId={project_id}
            modelUrn={modelUrn}
            modelName={modelName}
            loadingModel={loadingCfg}
          />
        </div>
      )}

      {/* ── Normal mode: split viewer + bottom panel ──────────────────────── */}
      {activeTab !== 'compare' && (
        <div ref={containerRef} className="flex flex-col flex-1 overflow-hidden select-none">

          {/* ─── Top: 3D Viewer ──────────────────────────────────────────── */}
          <div className="flex flex-col overflow-hidden relative shrink-0" style={{ height: `${splitPct}%` }}>

            {loadingCfg ? (
              <div className="flex-1 flex items-center justify-center bg-slate-50 gap-3">
                <Loader2 size={20} className="animate-spin text-slate-300" />
                <span className="text-[11px] text-slate-400 font-bold">Cargando modelo del proyecto…</span>
              </div>

            ) : modelUrn ? (
              <>
                <div className="shrink-0 px-4 py-2 bg-[#0C1E4F] flex items-center gap-3">
                  <Monitor size={12} className="text-blue-300 shrink-0" />
                  <span className="text-[10px] font-black text-white truncate flex-1">
                    {modelName ?? 'Modelo 3D'}
                  </span>
                  {!viewerReady && (
                    <span className="text-[9px] text-blue-300 font-bold animate-pulse shrink-0">
                      Cargando modelo…
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-hidden">
                  <ForgeViewer
                    ref={viewerRef}
                    urn={modelUrn}
                    onReady={() => setViewerReady(true)}
                  />
                </div>
              </>

            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 bg-slate-50">
                <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                  <Monitor size={28} className="text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Sin modelo configurado</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Configura el modelo 3D desde el <strong>Visor BIM</strong> y se usará aquí automáticamente.
                  </p>
                </div>
                <Link
                  href={`/${org_slug}/projects/${project_id}/bim`}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#0C1E4F] text-white rounded-xl text-[11px] font-black hover:bg-blue-700 transition"
                >
                  <Settings2 size={13} /> Ir al Visor BIM
                </Link>
              </div>
            )}
          </div>

          {/* ─── Draggable Divider ────────────────────────────────────────── */}
          <div
            onMouseDown={onDividerMouseDown}
            className="shrink-0 h-2 bg-slate-200 hover:bg-[#0C1E4F]/30 cursor-row-resize flex items-center justify-center group transition-colors z-10"
          >
            <div className="flex items-center gap-1 px-3 py-0.5 rounded-full bg-white border border-slate-200 shadow-sm group-hover:border-[#0C1E4F]/30 group-hover:bg-[#0C1E4F]/5 transition-colors">
              <GripHorizontal size={10} className="text-slate-400 group-hover:text-[#0C1E4F]/60" />
            </div>
          </div>

          {/* ─── Bottom: Tab Content ─────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden min-h-0">
            {activeTab === 'program' && (
              <BimProgramLinker
                projectId={project_id}
                viewerRef={viewerRef}
                viewerReady={viewerReady}
              />
            )}
            {activeTab === 'sequencer' && (
              <SortableSequenceList
                projectId={project_id}
                viewerRef={viewerRef}
                viewerReady={viewerReady}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
