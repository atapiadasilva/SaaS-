'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Settings, Box, Loader2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import BimConfigModal, { type BimConfig } from '@/components/modules/BimConfigModal';
import Bim4DPlayer, { type SequenceActivity } from '@/components/awp/Bim4DPlayer';
import FourDGanttPanel from '@/components/awp/FourDGanttPanel';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

export default function FourDPage() {
  const params    = useParams<{ org_slug: string; project_id: string }>();
  const projectId = params.project_id;

  // BIM
  const viewerRef    = useRef<ForgeViewerHandle | null>(null);
  const [bimUrn, setBimUrn]         = useState<string | null>(null);
  const [bimConfig, setBimConfig]   = useState<BimConfig | null>(null);
  const [showBimModal, setShowBimModal] = useState(false);
  const [viewerReady, setViewerReady]  = useState(false);
  const [indexPct, setIndexPct]        = useState(0);

  // 4D Player
  const [activities, setActivities]  = useState<SequenceActivity[]>([]);
  const [playerActive, setPlayerActive] = useState(false);

  // Load BIM config
  useEffect(() => {
    if (!projectId) return;
    const sb = createClient() as any;
    sb.from('projects').select('module_config').eq('id', projectId).single()
      .then(({ data: d }: any) => {
        const bim = d?.module_config?.bim as BimConfig | undefined;
        if (bim?.urn) { setBimUrn(bim.urn); setBimConfig(bim); }
      });
  }, [projectId]);

  // Called by FourDGanttPanel when user clicks "Generar 4D"
  const handleGenerate = useCallback((acts: SequenceActivity[]) => {
    setActivities(acts);
    setPlayerActive(true);
  }, []);

  const handlePlayerClose = useCallback(() => {
    setPlayerActive(false);
    viewerRef.current?.showAll();
    viewerRef.current?.clearHighlights();
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#060d1a] -m-6 min-h-0">

      {/* ── Top bar ── */}
      <div className="shrink-0 h-11 px-4 flex items-center justify-between border-b border-white/8 bg-[#0a1628]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-indigo-500/20 flex items-center justify-center">
            <Box className="w-3 h-3 text-indigo-400" />
          </div>
          <span className="text-[11px] font-black text-white/70 uppercase tracking-widest">4D BIM</span>
        </div>

        <div className="flex items-center gap-2">
          {playerActive && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              {activities.length} actividades cargadas
            </div>
          )}
          <button
            onClick={() => setShowBimModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white text-[11px] transition"
          >
            <Settings className="w-3.5 h-3.5" />
            BIM Config
          </button>
        </div>
      </div>

      {/* ── Forge Viewer (flex-1, takes all remaining height minus Gantt panel) ── */}
      <div className="flex-1 relative min-h-0">
        {!bimUrn ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-500">
            <Box className="w-14 h-14 opacity-15" />
            <div className="text-center">
              <div className="text-[14px] font-bold text-white/30 mb-1">Sin modelo BIM</div>
              <div className="text-[12px] text-slate-600 mb-4">Configura el modelo para ver la vista 4D</div>
              <button onClick={() => setShowBimModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-bold rounded-lg transition">
                Configurar modelo BIM
              </button>
            </div>
          </div>
        ) : (
          <ForgeViewer
            ref={viewerRef}
            urn={bimUrn}
            onIndexProgress={setIndexPct}
            onReady={() => setViewerReady(true)}
          />
        )}

        {/* Loading overlay */}
        {bimUrn && !viewerReady && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0a1628]/90 border border-white/10 rounded-xl px-4 py-2 text-[11px] text-white flex items-center gap-2 pointer-events-none">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            Cargando modelo{indexPct > 0 ? ` ${indexPct}%` : '…'}
          </div>
        )}

      </div>

      {/* 4D Player — floating draggable window (fixed position, renders outside viewer div) */}
      {playerActive && activities.length > 0 && (
        <Bim4DPlayer
          activities={activities}
          viewerRef={viewerRef}
          onClose={handlePlayerClose}
        />
      )}

      {/* ── Gantt panel (collapsible bottom) ── */}
      <FourDGanttPanel
        projectId={projectId}
        onGenerate={handleGenerate}
        viewerRef={viewerRef}
        bimConfig={bimConfig}
      />

      {/* BIM modal */}
      {showBimModal && (
        <BimConfigModal
          projectId={projectId}
          current={bimConfig}
          onSave={cfg => {
            setBimUrn(cfg?.urn ?? null);
            setBimConfig(cfg);
            setShowBimModal(false);
          }}
          onClose={() => setShowBimModal(false)}
        />
      )}
    </div>
  );
}
