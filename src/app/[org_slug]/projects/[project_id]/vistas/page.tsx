'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import type { BimConfig } from '@/components/modules/BimConfigModal';
import {
  Layers, Zap, Box, Calendar, Target, Clock, RotateCcw,
  Upload, Link2, AlertCircle, Loader2, CheckCircle2,
  ChevronRight, ChevronLeft, Eye, Info, Building2, Package,
  Monitor, Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── ForgeViewer (client-only) ────────────────────────────────────────────────
const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

// ─── Colores AWP ──────────────────────────────────────────────────────────────

const DISC_COLORS: Record<string, { hex: string; label: string; r: number; g: number; b: number }> = {
  'Arquitectura':          { hex: '#3B82F6', label: 'ARQ',  r: 59,  g: 130, b: 246 },
  'Electrico':             { hex: '#F59E0B', label: 'ELE',  r: 245, g: 158, b: 11  },
  'Estructura':            { hex: '#F97316', label: 'EST',  r: 249, g: 115, b: 22  },
  'Sanitario':             { hex: '#10B981', label: 'SAN',  r: 16,  g: 185, b: 129 },
  'Climatizacion (HVAC)':  { hex: '#8B5CF6', label: 'HVAC', r: 139, g: 92,  b: 246 },
};

function hslToRgb(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0)*255), g: Math.round(f(8)*255), b: Math.round(f(4)*255) };
}
function hslHex(h: number, s: number, l: number) {
  const { r, g, b } = hslToRgb(h, s, l);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// ─── Preset Views ─────────────────────────────────────────────────────────────

type PresetId = 'disciplina' | 'piso' | 'lookahead' | 'tipo' | 'cwp';

interface Preset {
  id:     PresetId;
  label:  string;
  sub:    string;
  icon:   React.ElementType;
  color:  string;
  file:   string;  // which guid-by-*.json to load
}

const PRESETS: Preset[] = [
  { id: 'disciplina', label: 'Disciplina',   sub: '5 disciplinas · ARQ ELE EST SAN HVAC',  icon: Layers,    color: 'text-blue-400 border-blue-500/40 bg-blue-500/10',    file: 'guid-by-disc' },
  { id: 'piso',       label: 'Por Piso',     sub: '26 áreas CWA · colores por nivel',       icon: Building2, color: 'text-violet-400 border-violet-500/40 bg-violet-500/10', file: 'guid-by-cwa'  },
  { id: 'tipo',       label: 'Tipo Trabajo', sub: 'Obra Gruesa · Terminaciones · Inst.',    icon: Package,   color: 'text-orange-400 border-orange-500/40 bg-orange-500/10',  file: 'guid-by-cwp'  },
  { id: 'lookahead',  label: 'Lookahead 6s', sub: 'Activo · Próximo · Futuro · Pasado',     icon: Target,    color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10', file: 'guid-by-cwp' },
  { id: 'cwp',        label: 'Por CWP',      sub: '531 paquetes · arcoíris por secuencia',  icon: Zap,       color: 'text-amber-400 border-amber-500/40 bg-amber-500/10',      file: 'guid-by-cwp'  },
];

// Dates for lookahead calculation (Costanera reference)
const REF_DATE = new Date('2026-01-26');

// ─── Legend item ──────────────────────────────────────────────────────────────

function LegendItem({ color, label, count }: { color: string; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
      <span className="text-[10px] text-slate-300 flex-1 truncate">{label}</span>
      {count != null && <span className="text-[9px] text-slate-500 font-mono">{count.toLocaleString()}</span>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VistasPage({ params }: { params: Promise<{ org_slug: string; project_id: string }> }) {
  const { project_id } = use(params);

  const [config,       setConfig]       = useState<BimConfig | null>(null);
  const [loadingCfg,   setLoadingCfg]   = useState(true);
  const [viewerReady,  setViewerReady]  = useState(false);
  const [activePreset, setActivePreset] = useState<PresetId | null>(null);
  const [applying,     setApplying]     = useState(false);
  const [applyPct,     setApplyPct]     = useState(0);
  const [matched,      setMatched]      = useState<number | null>(null);
  const [legend,       setLegend]       = useState<{ color: string; label: string; count: number }[]>([]);
  const [sideOpen,     setSideOpen]     = useState(true);
  const [statusMsg,    setStatusMsg]    = useState('');
  const [showUpload,   setShowUpload]   = useState(false);

  // Cached GUID maps, AWP data, and property index
  const guidCacheRef   = useRef<Record<string, Record<string, string[]>>>({});
  const awpDataRef     = useRef<{ cwps: any[] } | null>(null);
  const viewerRef      = useRef<ForgeViewerHandle | null>(null);
  const propIndexRef   = useRef<Record<string, number> | null>(null); // GUID prop value → dbId

  // ── Load BimConfig from Supabase ─────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient() as any;
    supabase.from('projects').select('module_config').eq('id', project_id).single()
      .then(({ data }: any) => {
        const bim = data?.module_config?.bim as BimConfig | undefined;
        if (bim?.urn) setConfig(bim);
        setLoadingCfg(false);
      });
  }, [project_id]);

  // ── Load AWP data.json ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/costanera/data.json`).then(r => r.json()).then(d => { awpDataRef.current = d; }).catch(() => console.warn('No data.json'));
  }, []);

  // ── Handle viewer ready ───────────────────────────────────────────────────────
  const onViewerReady = useCallback(() => {
    setViewerReady(true);
    setStatusMsg('Indexando GUIDs...');
    // Build GUID property index in background (auto-cached by ForgeViewer)
    viewerRef.current?.buildPropertyIndex('GUID').then(idx => {
      propIndexRef.current = idx;
      setStatusMsg('');
    }).catch(() => setStatusMsg(''));
  }, []);

  // ── Load guid map file (lazy, cached) ────────────────────────────────────────
  const loadGuidMap = useCallback(async (file: string): Promise<Record<string, string[]>> => {
    if (guidCacheRef.current[file]) return guidCacheRef.current[file];
    const res = await fetch(`/costanera/${file}.json`);
    const data = await res.json() as Record<string, string[]>;
    guidCacheRef.current[file] = data;
    return data;
  }, []);

  // ── Get/cache GUID property index (buildPropertyIndex caches internally too) ──
  const getGuidIndex = useCallback(async (): Promise<Record<string, number>> => {
    if (propIndexRef.current) return propIndexRef.current;
    if (!viewerRef.current) return {};
    setStatusMsg('Construyendo índice GUID...');
    const idx = await viewerRef.current.buildPropertyIndex('GUID');
    propIndexRef.current = idx;
    setStatusMsg('');
    return idx;
  }, []);

  // ── Apply preset ──────────────────────────────────────────────────────────────
  const applyPreset = useCallback(async (preset: Preset) => {
    if (!viewerRef.current || applying) return;

    // Toggle off → reset
    if (activePreset === preset.id) {
      viewerRef.current.clearHighlights();
      viewerRef.current.showAll();
      viewerRef.current.applyThemingBatch(new Map());
      setActivePreset(null);
      setMatched(null);
      setLegend([]);
      return;
    }

    setApplying(true);
    setApplyPct(5);
    setActivePreset(preset.id);
    setStatusMsg('Cargando datos...');

    try {
      const viewer = viewerRef.current;

      // Step 1: Load guid map JSON (lazy, cached per file)
      const guidMap = await loadGuidMap(preset.file);
      setApplyPct(15);

      // Step 2: Get GUID property index ONCE (buildPropertyIndex caches internally)
      const guidIndex = await getGuidIndex();
      setApplyPct(40);
      setStatusMsg('Calculando colores...');

      // Step 3: Build guid → hex map from preset logic
      const guidToHex = new Map<string, string>();
      const hexToLabel = new Map<string, string>();

      if (preset.id === 'disciplina') {
        for (const [disc, guids] of Object.entries(guidMap)) {
          const c = DISC_COLORS[disc];
          if (!c) continue;
          for (const g of guids as string[]) guidToHex.set(g, c.hex);
          hexToLabel.set(c.hex, `${c.label} — ${disc}`);
        }

      } else if (preset.id === 'piso') {
        const cwaKeys = Object.keys(guidMap).sort();
        cwaKeys.forEach((cwa, i) => {
          const hex = hslHex((i / cwaKeys.length) * 300, 80, 55);
          for (const g of (guidMap[cwa] as string[])) guidToHex.set(g, hex);
          hexToLabel.set(hex, cwa);
        });

      } else if (preset.id === 'tipo') {
        const awpData = awpDataRef.current;
        if (!awpData) throw new Error('Sin datos AWP');
        const tipoColors = {
          'OBRA GRUESA':   { hex: '#F97316', label: 'Obra Gruesa'   },
          'TERMINACIONES': { hex: '#6366F1', label: 'Terminaciones'  },
          'INSTALACIONES': { hex: '#10B981', label: 'Instalaciones'  },
          'SIN_FECHA':     { hex: '#475569', label: 'Sin clasificar' },
        } as Record<string, { hex: string; label: string }>;
        const cwpTipo: Record<string, string> = {};
        for (const cwp of awpData.cwps) cwpTipo[(cwp as any).id] = (cwp as any).tipo_trabajo || 'SIN_FECHA';
        for (const [cwpId, guids] of Object.entries(guidMap)) {
          const c = tipoColors[cwpTipo[cwpId] || 'SIN_FECHA'] || tipoColors['SIN_FECHA'];
          for (const g of guids as string[]) guidToHex.set(g, c.hex);
          hexToLabel.set(c.hex, c.label);
        }

      } else if (preset.id === 'lookahead') {
        const awpData = awpDataRef.current;
        if (!awpData) throw new Error('Sin datos AWP');
        const end6w  = new Date(REF_DATE); end6w.setDate(end6w.getDate() + 42);
        const end12w = new Date(REF_DATE); end12w.setDate(end12w.getDate() + 84);
        const lookColors = {
          active:  { hex: '#10B981', label: 'Activo ahora'    },
          next6w:  { hex: '#F59E0B', label: 'Próx. 6 semanas' },
          next12w: { hex: '#3B82F6', label: 'Próx. 6-12 sem.' },
          future:  { hex: '#1D4ED8', label: 'Futuro'          },
          past:    { hex: '#475569', label: 'Completado'      },
          none:    { hex: '#1E293B', label: 'Sin fecha'       },
        };
        const cwpCat: Record<string, keyof typeof lookColors> = {};
        for (const cwp of awpData.cwps) {
          const c = cwp as any;
          if (!c.fecha_inicio || !c.fecha_fin) { cwpCat[c.id] = 'none'; continue; }
          const ini = new Date(c.fecha_inicio), fin = new Date(c.fecha_fin);
          if (fin < REF_DATE)       cwpCat[c.id] = 'past';
          else if (ini <= REF_DATE) cwpCat[c.id] = 'active';
          else if (ini <= end6w)    cwpCat[c.id] = 'next6w';
          else if (ini <= end12w)   cwpCat[c.id] = 'next12w';
          else                      cwpCat[c.id] = 'future';
        }
        for (const [cwpId, guids] of Object.entries(guidMap)) {
          const cat = cwpCat[cwpId] || 'none';
          const c = lookColors[cat];
          for (const g of guids as string[]) guidToHex.set(g, c.hex);
          hexToLabel.set(c.hex, c.label);
        }

      } else if (preset.id === 'cwp') {
        const cwpKeys = Object.keys(guidMap).sort();
        cwpKeys.forEach((cwp, i) => {
          const hex = hslHex((i / cwpKeys.length) * 360, 85, 50);
          for (const g of (guidMap[cwp] as string[])) guidToHex.set(g, hex);
        });
      }

      setApplyPct(60);
      setStatusMsg('Resolviendo dbIds...');

      // Step 4: ONE pass over GUID index → build raw colorMap
      // guidIndex: {guidValue → dbId} from buildPropertyIndex('GUID')
      const rawColorMap = new Map<string, number[]>();
      let totalMatched = 0;
      for (const [guid, dbId] of Object.entries(guidIndex)) {
        const hex = guidToHex.get(guid);
        if (!hex) continue;
        const arr = rawColorMap.get(hex);
        if (arr) arr.push(dbId);
        else rawColorMap.set(hex, [dbId]);
        totalMatched++;
      }

      setApplyPct(75);
      setStatusMsg('Expandiendo nodos hoja...');

      // Step 4b: Expand raw dbIds → leaf nodes (required by applyThemingBatch recursive=false)
      const colorMap = new Map<string, number[]>();
      for (const [hex, rawIds] of rawColorMap) {
        const leafIds = viewer.getLeafDbIds(rawIds);
        colorMap.set(hex, leafIds);
      }

      setApplyPct(85);
      setStatusMsg('Aplicando colores...');

      // Step 5: Apply to viewer
      viewer.clearHighlights();
      viewer.applyThemingBatch(colorMap);

      // Build legend
      let newLegend: { color: string; label: string; count: number }[];
      if (preset.id === 'cwp') {
        newLegend = [
          { color: '#3B82F6', label: 'ARQ — Arquitectura', count: 0 },
          { color: '#F59E0B', label: 'ELE — Eléctrico',    count: 0 },
          { color: '#F97316', label: 'EST — Estructura',   count: 0 },
          { color: '#10B981', label: 'SAN — Sanitario',    count: 0 },
          { color: '#8B5CF6', label: 'HVAC — Climatización', count: 0 },
        ];
      } else {
        newLegend = [...colorMap.entries()]
          .map(([hex, dbIds]) => ({ color: hex, label: hexToLabel.get(hex) || hex, count: dbIds.length }))
          .sort((a, b) => b.count - a.count);
      }

      setApplyPct(100);
      setMatched(totalMatched);
      setLegend(newLegend);
      setStatusMsg('');

    } catch (e: any) {
      console.error('applyPreset error', e);
      setStatusMsg(`Error: ${e.message}`);
    } finally {
      setApplying(false);
      setTimeout(() => setApplyPct(0), 600);
    }
  }, [activePreset, applying, loadGuidMap, getGuidIndex]);

  // ── Reset all coloring ────────────────────────────────────────────────────────
  const resetView = useCallback(() => {
    viewerRef.current?.clearHighlights();
    viewerRef.current?.showAll();
    viewerRef.current?.applyThemingBatch(new Map());
    setActivePreset(null);
    setMatched(null);
    setLegend([]);
  }, []);

  // ─── No model state ────────────────────────────────────────────────────────────
  if (!loadingCfg && !config?.urn) {
    return (
      <div className="h-[calc(100vh-8rem)] bg-[#060d1f] rounded-2xl flex flex-col items-center justify-center gap-6 text-white">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Monitor className="w-8 h-8 text-slate-500" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black text-white mb-1">Sin modelo 3D configurado</h2>
          <p className="text-sm text-slate-400 max-w-md">
            Sube tu archivo Revit (.rvt), Navisworks (.nwd) o IFC (.ifc) para ver los{' '}
            <span className="text-amber-400 font-bold">104,495 elementos AWP</span> sobre el modelo 3D.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
          <button
            onClick={() => setShowUpload(true)}
            className="flex flex-col items-center gap-2 p-4 bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/30 rounded-xl transition"
          >
            <Upload className="w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-wide">Subir archivo</span>
            <span className="text-[9px] text-indigo-300">.rvt / .nwd / .ifc</span>
          </button>
          <a
            href={`/api/autodesk/auth?return=${encodeURIComponent(`/${project_id}/vistas`)}`}
            className="flex flex-col items-center gap-2 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition"
          >
            <Link2 className="w-5 h-5 text-blue-400" />
            <span className="text-xs font-black uppercase tracking-wide">Conectar ACC</span>
            <span className="text-[9px] text-slate-400">Autodesk Construction Cloud</span>
          </a>
        </div>

        {/* Upload modal */}
        {showUpload && <UploadModal projectId={project_id} onClose={() => setShowUpload(false)} onDone={(cfg) => { setConfig(cfg); setShowUpload(false); }} />}

        {/* Info sobre los datos AWP disponibles */}
        <div className="mt-2 grid grid-cols-5 gap-2 max-w-2xl w-full px-4">
          {Object.entries(DISC_COLORS).map(([disc, c]) => (
            <div key={disc} className="flex flex-col items-center gap-1 p-3 bg-white/3 border border-white/5 rounded-xl">
              <div className="w-3 h-3 rounded-full" style={{ background: c.hex }} />
              <span className="text-[9px] font-black text-white">{c.label}</span>
              <span className="text-[8px] text-slate-500">{disc === 'Arquitectura' ? '16,079' : disc === 'Electrico' ? '41,862' : disc === 'Estructura' ? '2,982' : disc === 'Sanitario' ? '38,946' : '4,626'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadingCfg) {
    return (
      <div className="h-[calc(100vh-8rem)] bg-[#060d1f] rounded-2xl flex items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-semibold">Cargando configuración...</span>
      </div>
    );
  }

  // ─── Main viewer layout ────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-7rem)] bg-[#060d1f] rounded-2xl overflow-hidden flex flex-col">

      {/* ── Top bar ── */}
      <div className="shrink-0 bg-[#0a1628] border-b border-white/5 px-4 py-2 flex items-center gap-3">
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Eye className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <div className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Vistas AWP</div>
            <div className="text-[8px] text-slate-500 leading-none">{config?.modelName ?? 'Costanera'}</div>
          </div>
        </div>

        <div className="w-px h-8 bg-white/5 mx-1 shrink-0" />

        {/* Preset buttons */}
        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
          {PRESETS.map(p => {
            const Icon = p.icon;
            const isActive = activePreset === p.id;
            const isLoading = applying && activePreset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                disabled={!viewerReady || applying}
                title={p.sub}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wide transition shrink-0',
                  isActive
                    ? p.color + ' opacity-100'
                    : 'text-slate-400 border-white/5 bg-white/3 hover:bg-white/8 hover:text-white',
                  (!viewerReady || applying) && 'opacity-40 cursor-not-allowed'
                )}
              >
                {isLoading
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Icon className="w-3 h-3" />
                }
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Status / index indicator */}
        <div className="shrink-0 flex items-center gap-2">
          {!viewerReady && (
            <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Cargando viewer...
            </div>
          )}
          {viewerReady && !activePreset && (
            <div className="flex items-center gap-1.5 text-[9px] text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              Listo
            </div>
          )}
          {activePreset && (
            <button onClick={resetView} title="Restablecer vista"
              className="flex items-center gap-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] text-slate-400 hover:text-white transition">
              <RotateCcw className="w-2.5 h-2.5" />
              Reset
            </button>
          )}
          {/* Panel toggle */}
          <button onClick={() => setSideOpen(s => !s)}
            className="w-6 h-6 rounded border border-white/10 bg-white/3 flex items-center justify-center text-slate-500 hover:text-white transition">
            {sideOpen ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {applying && applyPct > 0 && (
        <div className="shrink-0 h-0.5 bg-white/5">
          <div className="h-full bg-indigo-500 transition-all duration-200" style={{ width: `${applyPct}%` }} />
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Viewer */}
        <div className="flex-1 relative">
          <ForgeViewer
            ref={viewerRef}
            urn={config!.urn}
            onReady={onViewerReady}
          />

          {/* Status overlay */}
          {statusMsg && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-black/70 backdrop-blur-sm border border-white/10 rounded-full text-[10px] text-white font-semibold">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
              {statusMsg}
            </div>
          )}

          {/* Matched badge */}
          {matched != null && !applying && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 bg-black/60 backdrop-blur-sm border border-emerald-500/30 rounded-full text-[10px] text-emerald-300 font-black">
              <CheckCircle2 className="w-3 h-3" />
              {matched.toLocaleString()} elementos coloreados
            </div>
          )}
        </div>

        {/* Right panel */}
        {sideOpen && (
          <div className="w-60 bg-[#0a1628] border-l border-white/5 flex flex-col shrink-0 overflow-y-auto">

            {/* AWP Stats */}
            <div className="p-3 border-b border-white/5">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Datos AWP Costanera</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { val: '104,495', label: 'elementos', color: 'text-white' },
                  { val: '531',     label: 'CWPs',       color: 'text-violet-400' },
                  { val: '26',      label: 'pisos/CWAs', color: 'text-blue-400' },
                  { val: '5',       label: 'disciplinas',color: 'text-amber-400' },
                ].map(s => (
                  <div key={s.label} className="bg-white/3 border border-white/5 rounded-lg p-2 text-center">
                    <div className={`text-sm font-black ${s.color}`}>{s.val}</div>
                    <div className="text-[8px] text-slate-500">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Current preset info */}
            {activePreset && (
              <div className="p-3 border-b border-white/5">
                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                  Vista activa · {PRESETS.find(p => p.id === activePreset)?.label}
                </div>
                {applying ? (
                  <div className="flex items-center gap-1.5 text-[10px] text-indigo-300">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Aplicando {applyPct.toFixed(0)}%...
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {legend.map((l, i) => (
                      <LegendItem key={i} color={l.color} label={l.label} count={l.count > 0 ? l.count : undefined} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Disciplines always visible */}
            <div className="p-3 border-b border-white/5">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Disciplinas</div>
              <div className="space-y-1.5">
                <LegendItem color="#3B82F6" label="Arquitectura" count={16079} />
                <LegendItem color="#F59E0B" label="Eléctrico" count={41862} />
                <LegendItem color="#10B981" label="Sanitario" count={38946} />
                <LegendItem color="#8B5CF6" label="Climatización HVAC" count={4626} />
                <LegendItem color="#F97316" label="Estructura" count={2982} />
              </div>
            </div>

            {/* Presets quick reference */}
            <div className="p-3">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Vistas disponibles</div>
              <div className="space-y-1">
                {PRESETS.map(p => {
                  const Icon = p.icon;
                  return (
                    <button key={p.id} onClick={() => applyPreset(p)} disabled={!viewerReady || applying}
                      className={cn(
                        'w-full flex items-start gap-2 p-2 rounded-lg text-left transition',
                        activePreset === p.id ? 'bg-white/10' : 'hover:bg-white/5',
                        (!viewerReady || applying) && 'opacity-30 pointer-events-none'
                      )}>
                      <Icon className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
                      <div>
                        <div className="text-[10px] font-black text-white">{p.label}</div>
                        <div className="text-[8px] text-slate-500 leading-tight">{p.sub}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Info */}
            <div className="mt-auto p-3 border-t border-white/5">
              <div className="flex items-start gap-1.5 text-[9px] text-slate-600">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                <span>GUIDs validados 100% contra modelo BIM. El índice se cachea en IndexedDB para recargas rápidas.</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({ projectId, onClose, onDone }: {
  projectId: string;
  onClose: () => void;
  onDone: (cfg: BimConfig) => void;
}) {
  const [file,       setFile]       = useState<File | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [progress,   setProgress]   = useState('');
  const [error,      setError]      = useState('');

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      setProgress('Subiendo archivo a APS OSS...');
      const fd = new FormData();
      fd.append('model-file', file);
      const res = await fetch(`/api/autodesk/oss/models?projectId=${projectId}`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setProgress('Guardando configuración...');
      const cfg: BimConfig = { urn: data.urn, modelName: data.name, configuredAt: new Date().toISOString() };
      const { setModuleConfigKey } = await import('@/lib/supabase/projectConfig');
      await setModuleConfigKey(projectId, 'bim', cfg);

      setProgress('¡Listo! El modelo se está traduciendo a SVF2. Esto puede tardar 5–20 min.');
      setTimeout(() => onDone(cfg), 3000);
    } catch (e: any) {
      setError(e.message);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f1e3d] border border-white/10 rounded-2xl p-6 w-full max-w-md text-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black">Subir Modelo 3D</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Sube tu archivo Revit, Navisworks o IFC. Se subirá a Autodesk OSS y se iniciará la traducción SVF2 automáticamente.
        </p>
        <div className="space-y-3">
          <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-indigo-500/40 transition">
            <Upload className="w-6 h-6 text-slate-500" />
            <span className="text-xs text-slate-400">{file ? file.name : 'Selecciona .rvt, .nwd o .ifc'}</span>
            <span className="text-[9px] text-slate-600">Máx. recomendado: 500 MB (archivos mayores → usar ACC)</span>
            <input type="file" accept=".rvt,.nwd,.ifc,.nwc" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
          {progress && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              {progress}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {error}
            </div>
          )}
          <button onClick={handleUpload} disabled={!file || uploading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-black uppercase tracking-wide transition flex items-center justify-center gap-2">
            {uploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo...</> : <><Upload className="w-3.5 h-3.5" /> Subir y Traducir</>}
          </button>
        </div>
      </div>
    </div>
  );
}
