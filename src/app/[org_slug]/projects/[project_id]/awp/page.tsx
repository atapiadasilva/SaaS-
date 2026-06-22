'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import BimConfigModal, { type BimConfig } from '@/components/modules/BimConfigModal';
import {
  Zap, Building2, Activity, Package, Layers, ArrowUpRight,
  CheckCircle2, BarChart3, Grid3X3, Link2, Search, ChevronRight,
  Box, Cpu, ShieldCheck, Info, Eye, Filter, Calendar,
  Loader2, Monitor, Target, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── ForgeViewer lazy (no SSR) ────────────────────────────────────────────────
const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

// ─── Color helpers ────────────────────────────────────────────────────────────
function hslHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255);
  return '#' + [f(0), f(8), f(4)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface KPIs {
  totalElementos: number; totalCWPs: number; totalCWAs: number; totalTipos: number;
  porDisciplina: { Arquitectura: number; Electrico: number };
  cobertura: number; matchValidado: number;
  programaVinculado?: boolean; totalTareasMPP?: number; plazoMeses?: number; pisosMapeados?: number;
}
interface CWARow { cwa: string; nombre: string; total: number; arq: number; ele: number; cwps: number; }
interface CWPRow {
  id: string; ewp: string; pwp: string; cwa: string; nombreCWA: string;
  disciplina: string; partida: string; codPartida: string; total: number;
  tagDesde: string; tagHasta: string;
  fecha_inicio?: string | null; fecha_fin?: string | null; tipo_trabajo?: string | null;
}
interface ConexRow { cwa: string; nombre: string; arq: number; ele: number; ratio: string; densidad: number; }
interface Data {
  kpis: KPIs; cwaList: CWARow[];
  arqTipos: Record<string, number>; eleTipos: Record<string, number>;
  cwps: CWPRow[]; conexiones: ConexRow[]; topCWPs: CWPRow[];
}
interface HormigonPWP { id: string; cwa: string; nombreCWA: string; partida: string; nElem: number; m3: number; }
interface HormigonData { pwps: HormigonPWP[]; totalM3: number; totalElem: number; }

const DISC_COLORS: Record<string, string> = {
  'Arquitectura':         '#3B82F6',
  'Electrico':            '#F59E0B',
  'Estructura':           '#F97316',
  'Sanitario':            '#10B981',
  'Climatizacion (HVAC)': '#8B5CF6',
};

const DISC_ORDER: { key: string; short: string; color: string }[] = [
  { key: 'Arquitectura',         short: 'ARQ',  color: '#3B82F6' },
  { key: 'Electrico',            short: 'ELE',  color: '#F59E0B' },
  { key: 'Estructura',           short: 'EST',  color: '#F97316' },
  { key: 'Sanitario',            short: 'SAN',  color: '#10B981' },
  { key: 'Climatizacion (HVAC)', short: 'HVAC', color: '#8B5CF6' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('es-CL');
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

function BarH({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color, border }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; border: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-white border ${border} rounded-xl p-4 flex flex-col gap-2 shadow-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
      </div>
      <div>
        <span className="text-2xl font-black text-slate-900">{typeof value === 'number' ? fmt(value) : value}</span>
        {sub && <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
type Tab = '360' | 'pisos' | 'arq' | 'ele' | 'cwps' | 'conexiones' | 'og' | 'wbs';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: '360',        label: 'Vista 360°',   icon: BarChart3  },
  { id: 'pisos',      label: 'Por Piso',     icon: Building2  },
  { id: 'arq',        label: 'Arquitectura', icon: Box        },
  { id: 'ele',        label: 'Eléctrico',    icon: Zap        },
  { id: 'cwps',       label: 'Paquetes CWP', icon: Package    },
  { id: 'og',         label: 'Hormigones',   icon: Layers     },
  { id: 'wbs',        label: 'Disciplinas',  icon: Grid3X3    },
  { id: 'conexiones', label: 'Conexiones',   icon: Link2      },
];

// ─── Viewer panel view types ───────────────────────────────────────────────────
type ViewMode = 'disc' | 'arq' | 'ele' | 'cwa' | 'cwp' | 'est' | 'wbs';

// avance color helpers
const avanceColor = (pct: number) =>
  pct === 100 ? '#10B981' : pct >= 50 ? '#F59E0B' : pct > 0 ? '#F97316' : '#94A3B8';
const avanceBg = (pct: number) =>
  pct === 100 ? 'bg-emerald-100 text-emerald-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : pct > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500';

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CostaneraPage() {
  const params = useParams<{ org_slug: string; project_id: string }>();
  const project_id = params?.project_id ?? '';

  // ── Data ────────────────────────────────────────────────────────────────────
  const [data, setData]             = useState<Data | null>(null);
  const [tab, setTab]               = useState<Tab>('360');
  const [search, setSearch]         = useState('');
  const [discFilter, setDiscFilter] = useState<'all' | 'Arquitectura' | 'Electrico'>('all');
  const [selectedCWA, setSelectedCWA] = useState<string | null>(null);
  const [selectedCWP, setSelectedCWP] = useState<string | null>(null);

  // Hormigones
  const [hormData,      setHormData]      = useState<HormigonData | null>(null);
  const [avance,        setAvance]        = useState<Record<string, number>>({});
  const [editingPWP,    setEditingPWP]    = useState<string | null>(null);
  const [editVal,       setEditVal]       = useState('');
  const [savingPWP,     setSavingPWP]     = useState<string | null>(null);
  const [expandedCWAs,     setExpandedCWAs]     = useState<Set<string>>(new Set());
  const [selEstCwa,        setSelEstCwa]        = useState<string | null>(null);
  const [selEstPwp,        setSelEstPwp]        = useState<string | null>(null);

  // WBS Disciplinas
  const [wbsSelection,     setWbsSelection]     = useState<Set<string>>(new Set());
  const [expandedWbsCWAs,  setExpandedWbsCWAs]  = useState<Set<string>>(new Set());
  const [expandedWbsDiscs, setExpandedWbsDiscs] = useState<Set<string>>(new Set());
  const [contextDiscs,     setContextDiscs]     = useState<Set<string>>(new Set());
  const [wbsColorsEnabled, setWbsColorsEnabled] = useState(true);
  const [wbsGhostMode,     setWbsGhostMode]     = useState(true);

  useEffect(() => { fetch(`/costanera/data.json`).then(r => r.json()).then(setData).catch(() => console.warn('No data.json')); }, []);
  useEffect(() => { fetch(`/costanera/hormigones.json`).then(r => r.json()).then(setHormData).catch(() => console.warn('No hormigones.json')); }, []);

  const filteredCWPs = useMemo(() => {
    if (!data) return [];
    return data.cwps.filter(c => {
      const q = search.toLowerCase();
      const matchQ   = !q || c.id.toLowerCase().includes(q) || c.partida.toLowerCase().includes(q) || c.nombreCWA.toLowerCase().includes(q);
      const matchD   = discFilter === 'all' || c.disciplina === discFilter;
      const matchCWA = !selectedCWA || c.cwa === selectedCWA;
      return matchQ && matchD && matchCWA;
    });
  }, [data, search, discFilter, selectedCWA]);

  // WBS: merged CWA list (ARQ/ELE + Estructura CWAs), excluding non-floor entries
  const allWbsCwas = useMemo(() => {
    const validCwa = (cwa: string) => !!cwa && cwa !== 'CWA-NA' && /^CWA-[FPSR]/.test(cwa);
    const map = new Map<string, string>();
    for (const c of (data?.cwaList ?? [])) { if (validCwa(c.cwa)) map.set(c.cwa, c.nombre); }
    for (const p of (hormData?.pwps ?? [])) { if (validCwa(p.cwa) && !map.has(p.cwa)) map.set(p.cwa, p.nombreCWA); }
    return [...map.entries()].map(([cwa, nombre]) => ({ cwa, nombre })).sort((a, b) => a.cwa.localeCompare(b.cwa));
  }, [data, hormData]);

  // WBS: CWA → disc → unique CWPs (ARQ + ELE from data.cwps, excluding unassigned)
  const wbsDiscsCwps = useMemo(() => {
    if (!data) return {} as Record<string, Record<string, CWPRow[]>>;
    const result: Record<string, Record<string, CWPRow[]>> = {};
    for (const c of data.cwps) {
      if (!c.cwa || c.cwa === 'CWA-NA') continue;
      if (!result[c.cwa]) result[c.cwa] = {};
      if (!result[c.cwa][c.disciplina]) result[c.cwa][c.disciplina] = [];
      // Deduplicate by CWP id (data.cwps may have partida-level rows sharing same CWP id)
      if (!result[c.cwa][c.disciplina].some(x => x.id === c.id)) {
        result[c.cwa][c.disciplina].push(c);
      }
    }
    return result;
  }, [data]);

  // WBS: CWA → Estructura PWPs (from hormData, excluding unassigned)
  const wbsEstByCwa = useMemo(() => {
    if (!hormData) return {} as Record<string, HormigonPWP[]>;
    const result: Record<string, HormigonPWP[]> = {};
    for (const p of hormData.pwps) {
      if (!p.cwa || p.cwa === 'CWA-NA') continue;
      if (!result[p.cwa]) result[p.cwa] = [];
      result[p.cwa].push(p);
    }
    return result;
  }, [hormData]);

  // ── Viewer ──────────────────────────────────────────────────────────────────
  const [bimUrn,       setBimUrn]       = useState<string | null>(null);
  const [bimConfig,    setBimConfig]    = useState<BimConfig | null>(null);
  const [showPicker,   setShowPicker]   = useState(false);
  const [viewerReady,  setViewerReady]  = useState(false);
  const [viewMode,     setViewMode]     = useState<ViewMode>('disc');
  const [viewerStatus, setViewerStatus] = useState('');
  const viewerRef       = useRef<ForgeViewerHandle | null>(null);
  const propIndexRef    = useRef<Record<string, number> | null>(null);
  const guidCacheRef    = useRef<Record<string, Record<string, string[]>>>({});
  // kk.nwc losa subdivisions: CWA → leaf dbIds (built once from model tree)
  const losasTreeRef    = useRef<Record<string, number[]> | null>(null);

  // Floor name → CWA code (for kk.nwc tree mapping)
  // Aligned with the database shift: the lowest concrete level (FUNDACIONES) is actually Subte -3 (CWA-S03)
  const FLOOR_TO_CWA: Record<string, string> = {
    'FUNDACIONES': 'CWA-S03',
    '3°S': 'CWA-S02', '2°S': 'CWA-S01', '1°S': 'CWA-P01',
    '1°': 'CWA-P02',
    '2°': 'CWA-P03', '3°': 'CWA-P04', '4°': 'CWA-P05', '5°': 'CWA-P06',
    '6°': 'CWA-P07', '7°': 'CWA-P08', '8°': 'CWA-P09', '9°': 'CWA-P10',
    '10°': 'CWA-P11', '11°': 'CWA-P12', '12°': 'CWA-P13', '13°': 'CWA-P14',
    '14°': 'CWA-P15', '15°': 'CWA-P16', '16°': 'CWA-P17',
    'S.M.': 'CWA-SM',
  };

  // Load BIM URN + estructura_avance from Supabase
  useEffect(() => {
    if (!project_id) return;
    const supabase = createClient() as any;
    supabase.from('projects').select('module_config').eq('id', project_id).single()
      .then(({ data: d }: any) => {
        const bim = d?.module_config?.bim as BimConfig | undefined;
        if (bim?.urn) { setBimUrn(bim.urn); setBimConfig(bim); }
        const ea = d?.module_config?.estructura_avance as Record<string, number> | undefined;
        if (ea) setAvance(ea);
      });
  }, [project_id]);

  const saveAvance = useCallback(async (pwpId: string, pct: number) => {
    setSavingPWP(pwpId);
    const next = { ...avance, [pwpId]: pct };
    setAvance(next);
    const supabase = createClient() as any;
    const { data: row } = await supabase.from('projects').select('module_config').eq('id', project_id).single();
    const mc = row?.module_config ?? {};
    await supabase.from('projects').update({ module_config: { ...mc, estructura_avance: next } }).eq('id', project_id);
    setSavingPWP(null);
  }, [avance, project_id]);

  // ── Viewer helpers ──────────────────────────────────────────────────────────
  const loadGuidMap = useCallback(async (file: string): Promise<Record<string, string[]>> => {
    if (guidCacheRef.current[file]) return guidCacheRef.current[file];
    const res  = await fetch(`/costanera/${file}.json`);
    const json = await res.json() as Record<string, string[]>;
    guidCacheRef.current[file] = json;
    return json;
  }, []);

  const getGuidIndex = useCallback(async (): Promise<Record<string, number>> => {
    if (propIndexRef.current) return propIndexRef.current;
    if (!viewerRef.current) return {};
    const idx = await viewerRef.current.buildPropertyIndex('GUID');
    propIndexRef.current = idx;
    return idx;
  }, []);

  const applyView = useCallback(async (mode: ViewMode, filter?: string | null, avanceMap?: Record<string, number>) => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady) return;

    setViewerStatus('Aplicando vista...');
    const guidIndex = await getGuidIndex();
    if (Object.keys(guidIndex).length === 0) { setViewerStatus(''); return; }

    const guidToHex = new Map<string, string>();

    if (mode === 'est') {
      // Color Estructura elements per CWA based on average avance of its PWPs
      const discMap = await loadGuidMap('guid-by-disc');
      const cwaMap  = await loadGuidMap('guid-by-cwa');
      const estSet  = new Set<string>(discMap['Estructura'] ?? []);
      const av = avanceMap ?? {};
      // Build CWA → avg avance from hormData pwps
      const cwaAvg: Record<string, number> = {};
      if (hormData) {
        const byC: Record<string, number[]> = {};
        for (const p of hormData.pwps) {
          if (!byC[p.cwa]) byC[p.cwa] = [];
          byC[p.cwa].push(av[p.id] ?? 0);
        }
        for (const [c, vals] of Object.entries(byC)) {
          cwaAvg[c] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        }
      }
      for (const [cwa, guids] of Object.entries(cwaMap)) {
        const pct = cwaAvg[cwa] ?? 0;
        const hex = avanceColor(pct);
        for (const g of guids) { if (estSet.has(g)) guidToHex.set(g, hex); }
      }
    } else if (mode === 'disc') {
      const map = await loadGuidMap('guid-by-disc');
      for (const [disc, guids] of Object.entries(map)) {
        const hex = DISC_COLORS[disc];
        if (!hex) continue;
        for (const g of guids) guidToHex.set(g, hex);
      }
    } else if (mode === 'arq') {
      const map = await loadGuidMap('guid-by-disc');
      for (const g of (map['Arquitectura'] || [])) guidToHex.set(g, '#3B82F6');
    } else if (mode === 'ele') {
      const map = await loadGuidMap('guid-by-disc');
      for (const g of (map['Electrico'] || [])) guidToHex.set(g, '#F59E0B');
    } else if (mode === 'cwa') {
      const map = await loadGuidMap('guid-by-cwa');
      if (filter) {
        for (const g of (map[filter] || [])) guidToHex.set(g, '#6366F1');
      } else {
        const keys = Object.keys(map);
        keys.forEach((cwa, i) => {
          const hex = hslHex(Math.round((i / keys.length) * 330), 75, 52);
          for (const g of map[cwa]) guidToHex.set(g, hex);
        });
      }
    } else if (mode === 'cwp') {
      const map = await loadGuidMap('guid-by-cwp');
      if (filter) {
        for (const g of (map[filter] || [])) guidToHex.set(g, '#6366F1');
      } else {
        const keys = Object.keys(map);
        keys.forEach((cwp, i) => {
          const hex = hslHex(Math.round((i / keys.length) * 330), 75, 52);
          for (const g of map[cwp]) guidToHex.set(g, hex);
        });
      }
    }

    // GUID index → raw color map
    const rawMap = new Map<string, number[]>();
    for (const [guid, dbId] of Object.entries(guidIndex)) {
      const hex = guidToHex.get(guid);
      if (!hex) continue;
      const arr = rawMap.get(hex);
      if (arr) arr.push(dbId);
      else rawMap.set(hex, [dbId]);
    }

    // Expand to leaf nodes (required by applyThemingBatch)
    const colorMap = new Map<string, number[]>();
    for (const [hex, rawIds] of rawMap) {
      colorMap.set(hex, viewer.getLeafDbIds(rawIds));
    }

    viewer.clearHighlights();
    viewer.applyThemingBatch(colorMap);
    setViewMode(mode);
    setViewerStatus('');
  }, [viewerReady, loadGuidMap, getGuidIndex]);

  // ── Scan kk.nwc tree to get losa subdivisions per CWA ──────────────────────
  const buildLosasTree = useCallback((): Record<string, number[]> => {
    if (losasTreeRef.current) return losasTreeRef.current;
    const viewer = viewerRef.current;
    if (!viewer) return {};

    const result: Record<string, number[]> = {};
    const rootId = viewer.getRootId();
    if (rootId === null) return {};

    // BFS: find node whose name contains 'kk.nwc'
    const queue: number[] = [rootId];
    let kknwcId: number | null = null;
    while (queue.length && !kknwcId) {
      const id = queue.shift()!;
      const children = viewer.getChildren(id);
      for (const c of children) {
        if ((c.name ?? '').toLowerCase().includes('kk')) { kknwcId = c.dbId; break; }
        queue.push(c.dbId);
      }
    }
    if (kknwcId === null) { console.warn('[OG] kk.nwc node not found in tree'); return {}; }

    // Each direct child of kk.nwc is a floor group ("1°", "2°S", "FUNDACIONES", …)
    const floorGroups = viewer.getChildren(kknwcId);
    console.info('[OG] kk.nwc children:', floorGroups.map(c => c.name));
    for (const fg of floorGroups) {
      const cwa = FLOOR_TO_CWA[fg.name ?? ''];
      if (!cwa) { console.warn('[OG] unknown floor group:', fg.name); continue; }
      const leafIds = viewer.getLeafDbIds([fg.dbId]);
      result[cwa] = (result[cwa] ?? []).concat(leafIds);
    }

    losasTreeRef.current = result;
    console.info('[OG] losas tree:', Object.entries(result).map(([c,ids])=>`${c}:${ids.length}`).join(' '));
    return result;
  }, [viewerReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Estructura WBS selection highlight ─────────────────────────────────────
  const applyEstructuraHighlight = useCallback(async (
    selCwa: string | null,
    selPwp: string | null,
    av: Record<string, number>
  ) => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady || !hormData) return;
    setViewerStatus('Seleccionando...');
    const guidIndex = await getGuidIndex();
    const pwpMap   = await loadGuidMap('guid-by-estructura-pwp') as Record<string, string[]>;
    const losasTree = buildLosasTree(); // CWA → losa leaf dbIds from kk.nwc tree

    // ── Phase 1: GUID-based elements (muros, vigas, fundaciones, pilares) ──
    const colorRaw = new Map<string, number[]>();
    const targetRaw: number[] = [];

    for (const p of hormData.pwps) {
      const guids    = pwpMap[p.id] ?? [];
      const isTarget = selPwp ? p.id === selPwp : selCwa ? p.cwa === selCwa : false;
      const hex      = avanceColor(av[p.id] ?? 0);
      for (const g of guids) {
        const dbId = guidIndex[g];
        if (dbId === undefined) continue;
        const arr = colorRaw.get(hex);
        if (arr) arr.push(dbId); else colorRaw.set(hex, [dbId]);
        if (isTarget) targetRaw.push(dbId);
      }
    }

    // ── Phase 2: kk.nwc losa subdivisions (CWA-level coloring) ──
    // Compute average avance per CWA for losa color
    const cwaAvgAvance: Record<string, number> = {};
    if (hormData) {
      const byCwa: Record<string, number[]> = {};
      for (const p of hormData.pwps) {
        if (!byCwa[p.cwa]) byCwa[p.cwa] = [];
        byCwa[p.cwa].push(av[p.id] ?? 0);
      }
      for (const [c, vals] of Object.entries(byCwa)) {
        cwaAvgAvance[c] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      }
    }
    for (const [cwa, leafIds] of Object.entries(losasTree)) {
      const isTarget = selPwp ? false : selCwa ? cwa === selCwa : false;
      const hex      = avanceColor(cwaAvgAvance[cwa] ?? 0);
      const arr      = colorRaw.get(hex);
      if (arr) arr.push(...leafIds); else colorRaw.set(hex, [...leafIds]);
      if (isTarget) targetRaw.push(...leafIds);
    }

    // ── Apply ──
    const colorMap     = new Map<string, number[]>();
    // GUID-based: expand to leaf nodes; losa ids are already leaves
    for (const [hex, ids] of colorRaw) {
      colorMap.set(hex, viewer.getLeafDbIds(ids));
    }
    const targetLeafIds = viewer.getLeafDbIds(targetRaw);

    if (selCwa || selPwp) {
      viewer.isolate(targetLeafIds);
    } else {
      viewer.showAll();
    }
    viewer.clearHighlights();
    viewer.applyThemingBatch(colorMap);
    setViewMode('est');
    setViewerStatus('');
  }, [viewerReady, hormData, getGuidIndex, loadGuidMap, buildLosasTree]);

  // ── WBS Disciplinas selection highlight ────────────────────────────────────
  const applyWbsHighlight = useCallback(async (
    selection: Set<string>,
    ctxDiscs: Set<string>,
    colorsEnabled: boolean,
    ghostMode: boolean
  ) => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady) return;
    setViewerStatus('Seleccionando...');
    
    viewer.setGhosting(ghostMode);

    const guidIndex = await getGuidIndex();

    const guidsToLeafIds = (guids: string[]): number[] => {
      const raw = guids.map(g => guidIndex[g]).filter((id): id is number => id !== undefined);
      return viewer.getLeafDbIds(raw);
    };

    if (selection.size === 0) {
      if (!colorsEnabled) {
        viewer.showAll();
        viewer.clearHighlights();
        setViewMode('wbs');
        setViewerStatus('');
        return;
      }
      // No selection → show all, colored by discipline
      const discMap = await loadGuidMap('guid-by-disc');
      const colorMap = new Map<string, number[]>();
      for (const [disc, hex] of Object.entries(DISC_COLORS)) {
        const raw = (discMap[disc] ?? []).map(g => guidIndex[g]).filter((id): id is number => id !== undefined);
        if (raw.length > 0) colorMap.set(hex, viewer.getLeafDbIds(raw));
      }
      viewer.showAll();
      viewer.clearHighlights();
      viewer.applyThemingBatch(colorMap);
      setViewMode('wbs');
      setViewerStatus('');
      return;
    }

    const [discMap, cwaMap, cwpMap, pwpMap] = await Promise.all([
      loadGuidMap('guid-by-disc'), 
      loadGuidMap('guid-by-cwa'),
      loadGuidMap('guid-by-cwp'),
      loadGuidMap('guid-by-estructura-pwp') as Promise<Record<string, string[]>>
    ]);

    let primaryLeafIds: number[] = [];
    const colorMap = new Map<string, number[]>();

    const addColor = (hex: string, ids: number[]) => {
      if (ids.length === 0) return;
      const existing = colorMap.get(hex) ?? [];
      colorMap.set(hex, [...existing, ...ids]);
      primaryLeafIds.push(...ids);
    };

    const processCWA = (cwa: string) => {
      const cwaGuidsSet = new Set(cwaMap[cwa] ?? []);
      for (const { key, color } of DISC_ORDER) {
        if (key === 'Estructura') continue;
        const discGuids = (discMap[key] ?? []).filter(g => cwaGuidsSet.has(g));
        addColor(color, guidsToLeafIds(discGuids));
      }
      if (hormData) {
        const estPwps = hormData.pwps.filter(p => p.cwa === cwa);
        const estGuids = estPwps.flatMap(p => pwpMap[p.id] ?? []);
        const estIds = [...guidsToLeafIds(estGuids), ...(buildLosasTree()[cwa] ?? [])];
        addColor(DISC_COLORS['Estructura'] ?? '#6366F1', estIds);
      }
    };

    const processDisc = (cwa: string, disc: string) => {
      const cwaGuidsSet = new Set(cwaMap[cwa] ?? []);
      if (disc === 'Estructura') {
        const estPwps = hormData?.pwps.filter(p => p.cwa === cwa) ?? [];
        const estGuids = estPwps.flatMap(p => pwpMap[p.id] ?? []);
        const estIds = [...guidsToLeafIds(estGuids), ...(buildLosasTree()[cwa] ?? [])];
        addColor(DISC_COLORS['Estructura'] ?? '#6366F1', estIds);
      } else {
        const discGuids = (discMap[disc] ?? []).filter(g => cwaGuidsSet.has(g));
        addColor(DISC_COLORS[disc] ?? '#6366F1', guidsToLeafIds(discGuids));
      }
    };

    const processCWP = (id: string) => {
      const p = hormData?.pwps.find(x => x.id === id);
      if (p) {
        const estGuids = pwpMap[p.id] ?? [];
        addColor(DISC_COLORS['Estructura'] ?? '#6366F1', guidsToLeafIds(estGuids));
      } else {
        const c = data?.cwps.find(x => x.id === id);
        if (c) {
          const discColor = DISC_COLORS[c.disciplina] ?? '#6366F1';
          addColor(discColor, guidsToLeafIds(cwpMap[id] ?? []));
        }
      }
    };

    for (const item of selection) {
      if (item.startsWith('cwa:')) {
        processCWA(item.replace('cwa:', ''));
      } else if (item.startsWith('disc:')) {
        const parts = item.replace('disc:', '').split(':');
        if (parts.length === 2) processDisc(parts[0], parts[1]);
      } else if (item.startsWith('cwp:')) {
        processCWP(item.replace('cwp:', ''));
      }
    }

    const contextLeafIds: number[] = [];
    if (selection.size > 0 && ctxDiscs.size > 0) {
      const activeCWAs = new Set<string>();
      for (const item of selection) {
        if (item.startsWith('cwa:')) activeCWAs.add(item.replace('cwa:', ''));
        else if (item.startsWith('disc:')) activeCWAs.add(item.replace('disc:', '').split(':')[0]);
        else if (item.startsWith('cwp:')) {
          const id = item.replace('cwp:', '');
          const p = hormData?.pwps.find(x => x.id === id);
          if (p) activeCWAs.add(p.cwa);
          else {
            const c = data?.cwps.find(x => x.id === id);
            if (c) activeCWAs.add(c.cwa);
          }
        }
      }

      for (const ctxDisc of ctxDiscs) {
        for (const cwa of activeCWAs) {
          if (selection.has(`cwa:${cwa}`) || selection.has(`disc:${cwa}:${ctxDisc}`)) continue;
          
          let ctxIds: number[] = [];
          if (ctxDisc === 'Estructura') {
            const estPwps = hormData?.pwps.filter(p => p.cwa === cwa) ?? [];
            const guidList = estPwps.flatMap(p => pwpMap[p.id] ?? []);
            ctxIds = [...guidsToLeafIds(guidList), ...(buildLosasTree()[cwa] ?? [])];
          } else {
            const cwaGuidsSet = new Set(cwaMap[cwa] ?? []);
            const discGuids = (discMap[ctxDisc] ?? []).filter(g => cwaGuidsSet.has(g));
            ctxIds = guidsToLeafIds(discGuids);
          }
          contextLeafIds.push(...ctxIds);
        }
      }
    }

    const allVisible = [...primaryLeafIds, ...contextLeafIds];
    if (allVisible.length > 0) viewer.isolate(allVisible); else viewer.showAll();
    viewer.clearHighlights();
    if (colorsEnabled) {
      viewer.applyThemingBatch(colorMap);
    }
    setViewMode('wbs');
    setViewerStatus('');
  }, [viewerReady, data, hormData, getGuidIndex, loadGuidMap, buildLosasTree]);

  // ── Viewer ready callback ───────────────────────────────────────────────────
  const onViewerReady = useCallback(() => {
    setViewerReady(true);
    setViewerStatus('Indexando GUIDs...');
    viewerRef.current?.buildPropertyIndex('GUID').then(idx => {
      propIndexRef.current = idx;
      setViewerStatus('');
    }).catch(() => setViewerStatus(''));
  }, []);

  // ── Auto-apply view on tab/selection change ─────────────────────────────────
  useEffect(() => {
    if (!viewerReady) return;
    if (tab === '360' || tab === 'conexiones') {
      void applyView('disc');
    } else if (tab === 'arq') {
      void applyView('arq');
    } else if (tab === 'ele') {
      void applyView('ele');
    } else if (tab === 'pisos') {
      void applyView('cwa', selectedCWA);
    } else if (tab === 'cwps') {
      if (selectedCWP) void applyView('cwp', selectedCWP);
      else if (selectedCWA) void applyView('cwa', selectedCWA);
      else void applyView('disc');
    } else if (tab === 'og') {
      void applyEstructuraHighlight(selEstCwa, selEstPwp, avance);
    } else if (tab === 'wbs') {
      void applyWbsHighlight(wbsSelection, contextDiscs, wbsColorsEnabled, wbsGhostMode);
    }
  }, [tab, viewerReady, selectedCWA, selectedCWP, selEstCwa, selEstPwp, avance,
      wbsSelection, contextDiscs, wbsColorsEnabled, wbsGhostMode,
      applyView, applyEstructuraHighlight, applyWbsHighlight]);

  // ── Loading state ───────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-semibold">Cargando datos AWP...</span>
      </div>
    );
  }

  const { kpis, cwaList, arqTipos, eleTipos, cwps, conexiones } = data;
  const maxCWA = Math.max(...cwaList.map(c => c.total));
  const maxArq = Math.max(...Object.values(arqTipos));
  const maxEle = Math.max(...Object.values(eleTipos));

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
    {/* -m-6 escapes the layout's p-6 padding; h-[calc(100vh-56px)] fills below the header */}
    <div className="-m-6 flex overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>

      {/* ══ LEFT: Data Panel ══════════════════════════════════════════════════ */}
      <div className="flex flex-col bg-gray-50 overflow-y-auto border-r border-gray-200" style={{ width: '56%' }}>

        {/* ── Compact project header ── */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
                <Zap className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-500">AWP Costanera</div>
                <h1 className="text-base font-black text-slate-900 leading-tight">Soluciones Habitacionales</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[
                { val: fmt(kpis.totalElementos), label: 'elementos',   color: 'text-indigo-600' },
                { val: `${kpis.cobertura}%`,     label: 'cobertura',   color: 'text-emerald-600' },
                { val: String(kpis.totalCWPs),   label: 'CWPs',        color: 'text-blue-600' },
                { val: String(kpis.pisosMapeados ?? kpis.totalCWAs), label: 'pisos', color: 'text-violet-600' },
              ].map(m => (
                <div key={m.label} className="text-center bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                  <div className={`text-lg font-black ${m.color} leading-none`}>{m.val}</div>
                  <div className="text-[9px] text-slate-400 font-semibold mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-[10px] text-emerald-700 font-semibold">{fmt(kpis.matchValidado)} GUIDs · ARQ 100% · ELE 100% · Linkado al modelo 3D</span>
            </div>
            {kpis.programaVinculado && (
              <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
                <Calendar className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                <span className="text-[10px] text-violet-700 font-semibold">{kpis.totalTareasMPP?.toLocaleString()} tareas MPP vinculadas</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="bg-white border-b border-gray-200 px-6 py-2 shrink-0">
          <div className="flex gap-1">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => { setTab(t.id); setSelectedCWA(null); setSelectedCWP(null); setWbsSelection(new Set()); }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide transition',
                    tab === t.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-gray-100'
                  )}>
                  <Icon className="w-3 h-3" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 p-5">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>

              {/* ═══ VISTA 360° ═══ */}
              {tab === '360' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <KpiCard label="Total elementos" value={kpis.totalElementos} sub="ARQ + ELE · 100% tagueados" icon={Activity} color="bg-indigo-500" border="border-indigo-100" />
                    <KpiCard label="Arquitectura"    value={kpis.porDisciplina.Arquitectura} sub={`${((kpis.porDisciplina.Arquitectura/kpis.totalElementos)*100).toFixed(0)}% del total`} icon={Box} color="bg-blue-500" border="border-blue-100" />
                    <KpiCard label="Eléctrico"       value={kpis.porDisciplina.Electrico} sub={`${((kpis.porDisciplina.Electrico/kpis.totalElementos)*100).toFixed(0)}% del total`} icon={Zap} color="bg-amber-500" border="border-amber-100" />
                    <KpiCard label="Paquetes CWP"    value={kpis.totalCWPs} sub={`en ${kpis.totalCWAs} pisos/áreas`} icon={Package} color="bg-emerald-500" border="border-emerald-100" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Split por Disciplina</h3>
                      <div className="space-y-3">
                        {[
                          { disc: 'Arquitectura', val: kpis.porDisciplina.Arquitectura, color: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700' },
                          { disc: 'Eléctrico',    val: kpis.porDisciplina.Electrico,    color: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700' },
                        ].map(d => (
                          <div key={d.disc} className="space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-slate-700">{d.disc}</span>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${d.badge}`}>{fmt(d.val)}</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${d.color}`} style={{ width: `${(d.val/kpis.totalElementos)*100}%` }} />
                            </div>
                            <div className="text-[10px] text-slate-400 text-right">{((d.val/kpis.totalElementos)*100).toFixed(1)}%</div>
                          </div>
                        ))}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                          <div className="bg-slate-50 rounded-lg p-2 text-center">
                            <div className="text-base font-black text-slate-900">{kpis.totalCWAs}</div>
                            <div className="text-[9px] text-slate-400 font-semibold">pisos/áreas</div>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-2 text-center">
                            <div className="text-base font-black text-slate-900">{kpis.totalTipos}</div>
                            <div className="text-[9px] text-slate-400 font-semibold">tipos elem.</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Por Piso (Top 12)</h3>
                      <div className="space-y-1.5">
                        {cwaList.filter(c => c.total > 0).slice(0, 12).map(c => (
                          <div key={c.cwa} className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 w-24 shrink-0 truncate">{c.nombre}</span>
                            <div className="flex-1 flex items-center gap-0.5">
                              <div className="h-2 rounded-full bg-blue-500" style={{ width: `${(c.arq/maxCWA)*100*0.5}%`, minWidth: c.arq>0?2:0 }} />
                              <div className="h-2 rounded-full bg-amber-400" style={{ width: `${(c.ele/maxCWA)*100*0.5}%`, minWidth: c.ele>0?2:0 }} />
                            </div>
                            <span className="text-[11px] font-black text-slate-700 w-10 text-right shrink-0">{fmt(c.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'GUID validados vs modelo', value: `${fmt(kpis.matchValidado)} / ${fmt(kpis.matchValidado)}`, bar: 'bg-emerald-500', color: 'text-emerald-700', desc: 'Match perfecto ARQ+ELE' },
                      { label: 'Cobertura AWP',            value: `${kpis.totalCWPs} CWPs activos`,                          bar: 'bg-blue-500',    color: 'text-blue-700',    desc: '331 paquetes definidos' },
                      { label: 'Trazabilidad CWP→EWP→PWP', value: '3 niveles AWP',                                          bar: 'bg-indigo-500',  color: 'text-indigo-700',  desc: 'Cadena completa' },
                    ].map(m => (
                      <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{m.label}</span>
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                        <div className={`text-sm font-black ${m.color} mb-1`}>{m.value}</div>
                        <div className="h-1.5 bg-slate-100 rounded-full">
                          <div className={`h-full ${m.bar} rounded-full w-full`} />
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">{m.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ═══ POR PISO ═══ */}
              {tab === 'pisos' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black text-slate-900">Distribución por Piso / CWA</h2>
                    <span className="text-[11px] text-slate-400 font-semibold">{cwaList.filter(c=>c.total>0).length} áreas · clic para resaltar en modelo</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {cwaList.filter(c => c.total > 0).map((c, i) => {
                      const pctArq = c.total > 0 ? (c.arq/c.total)*100 : 0;
                      const pctEle = c.total > 0 ? (c.ele/c.total)*100 : 0;
                      const isSelected = selectedCWA === c.cwa;
                      return (
                        <motion.div key={c.cwa} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i*0.015 }}
                          className={cn(
                            'bg-white border rounded-xl p-3.5 cursor-pointer transition-all',
                            isSelected ? 'border-indigo-400 shadow-md shadow-indigo-100 ring-1 ring-indigo-300' : 'border-gray-200 hover:border-indigo-200 hover:shadow-sm'
                          )}
                          onClick={() => {
                            const next = isSelected ? null : c.cwa;
                            setSelectedCWA(next);
                          }}>
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{c.cwa}</div>
                              <div className="text-sm font-black text-slate-900">{c.nombre}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-black text-slate-900">{fmt(c.total)}</div>
                              <div className="text-[9px] text-slate-400">{c.cwps} CWPs</div>
                            </div>
                          </div>
                          <div className="h-2.5 rounded-full overflow-hidden flex gap-0.5">
                            <div className="bg-blue-500 rounded-full" style={{ width: `${pctArq}%` }} />
                            <div className="bg-amber-400 rounded-full" style={{ width: `${pctEle}%` }} />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[10px] text-blue-600 font-bold">{fmt(c.arq)} ARQ</span>
                            <span className="text-[10px] text-amber-600 font-bold">{fmt(c.ele)} ELE</span>
                          </div>
                          {isSelected && (
                            <div className="mt-2 flex items-center gap-1 text-[10px] text-indigo-600 font-black">
                              <Monitor className="w-3 h-3" />
                              Resaltado en modelo →
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ═══ ARQUITECTURA ═══ */}
              {tab === 'arq' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    <KpiCard label="Total ARQ"         value={kpis.porDisciplina.Arquitectura} sub="100% validados" icon={Box}     color="bg-blue-500" border="border-blue-100" />
                    <KpiCard label="CWPs Arquitectura" value={cwps.filter(c=>c.disciplina==='Arquitectura').length} sub="paquetes" icon={Package} color="bg-blue-400" border="border-blue-100" />
                    <KpiCard label="Tipos elemento"    value={Object.keys(arqTipos).length} sub="categorías"       icon={Layers}  color="bg-blue-600" border="border-blue-100" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Elementos por Tipo</h3>
                      <div className="space-y-2">
                        {Object.entries(arqTipos).sort((a,b)=>b[1]-a[1]).map(([tipo, count]) => (
                          <div key={tipo} className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-slate-600 w-36 shrink-0 truncate">{tipo}</span>
                            <BarH value={count} max={maxArq} color="bg-blue-500" />
                            <span className="text-xs font-black text-slate-700 w-10 text-right shrink-0">{fmt(count)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">ARQ por Piso (Top 15)</h3>
                      <div className="space-y-1.5">
                        {cwaList.filter(c=>c.arq>0).slice(0,15).map(c => (
                          <div key={c.cwa} className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 w-24 shrink-0 truncate">{c.nombre}</span>
                            <BarH value={c.arq} max={Math.max(...cwaList.map(x=>x.arq))} color="bg-blue-500" />
                            <span className="text-xs font-black text-blue-700 w-10 text-right shrink-0">{fmt(c.arq)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-4 pt-4 pb-1"><h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Top CWPs · Arquitectura</h3></div>
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="border-b border-gray-200">
                            {['CWP ID','EWP','Piso','Partida','Elem.','Inicio','Fin'].map(h => (
                              <th key={h} className="text-left text-[10px] font-black uppercase tracking-wide text-slate-400 py-2 px-4">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cwps.filter(c=>c.disciplina==='Arquitectura').sort((a,b)=>b.total-a.total).slice(0,20).map((c, i) => (
                            <tr key={c.id} onClick={() => setSelectedCWP(selectedCWP===c.id ? null : c.id)}
                              className={cn('border-b border-gray-50 cursor-pointer transition',
                                selectedCWP===c.id ? 'bg-indigo-50' : i%2===0 ? 'hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100/50')}>
                              <td className="py-1.5 px-4 font-black text-blue-700">{c.id}</td>
                              <td className="py-1.5 px-4 text-[10px] text-slate-400 font-mono">{c.ewp}</td>
                              <td className="py-1.5 px-4 text-slate-600 font-semibold">{c.nombreCWA}</td>
                              <td className="py-1.5 px-4 text-slate-600 max-w-[120px] truncate">{c.partida}</td>
                              <td className="py-1.5 px-4 font-black text-slate-900 text-right">{fmt(c.total)}</td>
                              <td className="py-1.5 px-4 text-[10px] text-slate-400">{fmtDate(c.fecha_inicio)}</td>
                              <td className="py-1.5 px-4 text-[10px] text-slate-400">{fmtDate(c.fecha_fin)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ ELÉCTRICO ═══ */}
              {tab === 'ele' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    <KpiCard label="Total Eléctrico"  value={kpis.porDisciplina.Electrico} sub="100% validados" icon={Zap}     color="bg-amber-500" border="border-amber-100" />
                    <KpiCard label="CWPs Eléctrico"   value={cwps.filter(c=>c.disciplina==='Electrico').length} sub="paquetes" icon={Package} color="bg-amber-400" border="border-amber-100" />
                    <KpiCard label="Tipos elemento"   value={Object.keys(eleTipos).length} sub="categorías"    icon={Cpu}     color="bg-amber-600" border="border-amber-100" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Elementos por Tipo</h3>
                      <div className="space-y-2">
                        {Object.entries(eleTipos).sort((a,b)=>b[1]-a[1]).map(([tipo, count]) => (
                          <div key={tipo} className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-slate-600 w-36 shrink-0 truncate">{tipo}</span>
                            <BarH value={count} max={maxEle} color="bg-amber-400" />
                            <span className="text-xs font-black text-slate-700 w-10 text-right shrink-0">{fmt(count)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">ELE por Piso (Top 15)</h3>
                      <div className="space-y-1.5">
                        {cwaList.filter(c=>c.ele>0).slice(0,15).map(c => (
                          <div key={c.cwa} className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 w-24 shrink-0 truncate">{c.nombre}</span>
                            <BarH value={c.ele} max={Math.max(...cwaList.map(x=>x.ele))} color="bg-amber-400" />
                            <span className="text-xs font-black text-amber-700 w-10 text-right shrink-0">{fmt(c.ele)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-4 pt-4 pb-1"><h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Top CWPs · Eléctrico</h3></div>
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="border-b border-gray-200">
                            {['CWP ID','EWP','Piso','Partida','Elem.','Inicio','Fin'].map(h => (
                              <th key={h} className="text-left text-[10px] font-black uppercase tracking-wide text-slate-400 py-2 px-4">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cwps.filter(c=>c.disciplina==='Electrico').sort((a,b)=>b.total-a.total).slice(0,20).map((c, i) => (
                            <tr key={c.id} onClick={() => setSelectedCWP(selectedCWP===c.id ? null : c.id)}
                              className={cn('border-b border-gray-50 cursor-pointer transition',
                                selectedCWP===c.id ? 'bg-indigo-50' : i%2===0 ? 'hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100/50')}>
                              <td className="py-1.5 px-4 font-black text-amber-700">{c.id}</td>
                              <td className="py-1.5 px-4 text-[10px] text-slate-400 font-mono">{c.ewp}</td>
                              <td className="py-1.5 px-4 text-slate-600 font-semibold">{c.nombreCWA}</td>
                              <td className="py-1.5 px-4 text-slate-600 max-w-[120px] truncate">{c.partida}</td>
                              <td className="py-1.5 px-4 font-black text-slate-900 text-right">{fmt(c.total)}</td>
                              <td className="py-1.5 px-4 text-[10px] text-slate-400">{fmtDate(c.fecha_inicio)}</td>
                              <td className="py-1.5 px-4 text-[10px] text-slate-400">{fmtDate(c.fecha_fin)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ PAQUETES CWP ═══ */}
              {tab === 'cwps' && (
                <div className="space-y-3">
                  <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap gap-2 items-center shadow-sm">
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex-1 min-w-48">
                      <Search className="w-3.5 h-3.5 text-slate-400" />
                      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar CWP, partida, piso..."
                        className="bg-transparent text-xs outline-none flex-1 text-slate-700 placeholder:text-slate-400" />
                    </div>
                    <div className="flex gap-1">
                      {(['all', 'Arquitectura', 'Electrico'] as const).map(d => (
                        <button key={d} onClick={() => setDiscFilter(d)}
                          className={cn('px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide transition',
                            discFilter===d ? (d==='Arquitectura'?'bg-blue-500 text-white':d==='Electrico'?'bg-amber-500 text-white':'bg-slate-800 text-white')
                              : 'bg-gray-100 text-slate-500 hover:bg-gray-200')}>
                          {d==='all'?'Todas':d}
                        </button>
                      ))}
                    </div>
                    {selectedCWA && (
                      <button onClick={() => setSelectedCWA(null)}
                        className="flex items-center gap-1 px-2 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-[11px] font-black text-indigo-700">
                        <Filter className="w-3 h-3" />
                        {cwaList.find(c=>c.cwa===selectedCWA)?.nombre}
                        <span className="text-indigo-400">×</span>
                      </button>
                    )}
                    <span className="text-[11px] text-slate-400 font-semibold ml-auto">{fmt(filteredCWPs.length)} paq.</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50 z-10">
                          <tr className="border-b border-gray-200">
                            {['CWP ID','EWP','Piso','Disc.','Partida','Elem.','Inicio','Fin','Tipo'].map(h => (
                              <th key={h} className="text-left text-[10px] font-black uppercase tracking-wide text-slate-400 py-2 px-3 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCWPs.map((c, i) => (
                            <tr key={c.id} onClick={() => setSelectedCWP(selectedCWP===c.id ? null : c.id)}
                              className={cn('border-b border-gray-50 cursor-pointer transition',
                                selectedCWP===c.id ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : i%2===0?'hover:bg-slate-50':'bg-slate-50/50 hover:bg-slate-100/50')}>
                              <td className="py-1.5 px-3">
                                <span className={cn('font-black', c.disciplina==='Arquitectura'?'text-blue-700':'text-amber-700')}>{c.id}</span>
                              </td>
                              <td className="py-1.5 px-3 text-[10px] text-slate-400 font-mono">{c.ewp}</td>
                              <td className="py-1.5 px-3 text-slate-700 font-semibold whitespace-nowrap text-[11px]">{c.nombreCWA}</td>
                              <td className="py-1.5 px-3">
                                <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded-full',
                                  c.disciplina==='Arquitectura'?'bg-blue-50 text-blue-700':'bg-amber-50 text-amber-700')}>
                                  {c.disciplina==='Arquitectura'?'ARQ':'ELE'}
                                </span>
                              </td>
                              <td className="py-1.5 px-3 text-slate-600 max-w-[100px] truncate">{c.partida}</td>
                              <td className="py-1.5 px-3 font-black text-slate-900 text-right">{fmt(c.total)}</td>
                              <td className="py-1.5 px-3 text-[10px] text-slate-400 whitespace-nowrap">{fmtDate(c.fecha_inicio)}</td>
                              <td className="py-1.5 px-3 text-[10px] text-slate-400 whitespace-nowrap">{fmtDate(c.fecha_fin)}</td>
                              <td className="py-1.5 px-3">
                                {c.tipo_trabajo && (
                                  <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded-full whitespace-nowrap',
                                    c.tipo_trabajo==='OBRA GRUESA'?'bg-orange-50 text-orange-700':
                                    c.tipo_trabajo==='TERMINACIONES'?'bg-indigo-50 text-indigo-700':'bg-emerald-50 text-emerald-700')}>
                                    {c.tipo_trabajo}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {selectedCWP && (
                    <div className="flex items-center gap-2 text-[11px] text-indigo-600 font-black bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                      <Monitor className="w-3.5 h-3.5" />
                      CWP <span className="font-mono">{selectedCWP}</span> resaltado en el modelo →
                      <button onClick={() => setSelectedCWP(null)} className="ml-auto text-indigo-400 hover:text-indigo-700">×</button>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ HORMIGONES / OG — WBS Tree ═══ */}
              {tab === 'og' && (
                <div className="space-y-3">
                  {/* Summary KPIs */}
                  {hormData && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm text-center">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Total m³</div>
                        <div className="text-xl font-black text-orange-600">{hormData.totalM3.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm text-center">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Elementos</div>
                        <div className="text-xl font-black text-slate-900">{hormData.totalElem.toLocaleString('es-CL')}</div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm text-center">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Completados</div>
                        <div className="text-xl font-black text-emerald-600">
                          {hormData.pwps.filter(p => (avance[p.id] ?? 0) === 100).length}
                          <span className="text-sm text-slate-400">/{hormData.pwps.length}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Legend + hint */}
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm flex items-center gap-3 flex-wrap">
                    {[
                      { label: 'Pendiente', pct: 0 },
                      { label: 'Progreso', pct: 30 },
                      { label: '≥50%', pct: 60 },
                      { label: '100%', pct: 100 },
                      { label: 'Selección', color: '#6366F1' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'color' in s ? s.color : avanceColor(s.pct ?? 0) }} />
                        <span className="text-[10px] text-slate-600">{s.label}</span>
                      </div>
                    ))}
                    {selEstCwa && (
                      <button onClick={() => { setSelEstCwa(null); setSelEstPwp(null); void applyEstructuraHighlight(null, null, avance); }}
                        className="ml-auto text-[9px] text-indigo-500 font-black hover:text-indigo-700 flex items-center gap-1">
                        ✕ Limpiar selección
                      </button>
                    )}
                  </div>

                  {/* WBS Tree */}
                  {hormData && (() => {
                    const byCwa: Record<string, HormigonPWP[]> = {};
                    for (const p of hormData.pwps) {
                      if (!byCwa[p.cwa]) byCwa[p.cwa] = [];
                      byCwa[p.cwa].push(p);
                    }
                    return Object.entries(byCwa).sort(([a],[b]) => a.localeCompare(b)).map(([cwa, pwps]) => {
                      const avgPct  = Math.round(pwps.reduce((s, p) => s + (avance[p.id] ?? 0), 0) / pwps.length);
                      const totalM3 = pwps.reduce((s, p) => s + p.m3, 0);
                      const isExpanded  = expandedCWAs.has(cwa);
                      const isCwaSelected = selEstCwa === cwa;

                      return (
                        <div key={cwa} className={cn('bg-white border rounded-xl shadow-sm overflow-hidden transition',
                          isCwaSelected ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-200')}>

                          {/* ── CWA row (clickable: expand + select in viewer) ── */}
                          <button className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 transition text-left"
                            onClick={() => {
                              const newCwa = isCwaSelected && !selEstPwp ? null : cwa;
                              const newExpanded = new Set(expandedCWAs);
                              if (!isExpanded || !isCwaSelected) newExpanded.add(cwa);
                              else if (!selEstPwp) newExpanded.delete(cwa);
                              setExpandedCWAs(newExpanded);
                              setSelEstCwa(newCwa);
                              setSelEstPwp(null);
                              void applyEstructuraHighlight(newCwa, null, avance);
                            }}>
                            {/* Expand chevron */}
                            <ChevronRight className={cn('w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                            {/* Status dot */}
                            <div className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ background: isCwaSelected ? '#6366F1' : avanceColor(avgPct) }} />
                            {/* Labels */}
                            <div className="flex-1 min-w-0">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{cwa}</span>
                              <span className="ml-2 text-[11px] font-black text-slate-800">{pwps[0].nombreCWA}</span>
                            </div>
                            {/* Stats */}
                            <span className="text-[10px] text-slate-400 shrink-0">{totalM3.toLocaleString('es-CL', { maximumFractionDigits: 0 })} m³</span>
                            <span className="text-[10px] text-slate-400 shrink-0">{pwps.reduce((s,p)=>s+p.nElem,0)} elem</span>
                            <span className={cn('text-[9px] font-black px-2 py-0.5 rounded-full shrink-0', avanceBg(avgPct))}>{avgPct}%</span>
                          </button>

                          {/* ── PWP rows (expanded) ── */}
                          {isExpanded && (
                            <div className="border-t border-gray-100 divide-y divide-gray-50">
                              {pwps.map(p => {
                                const pct       = avance[p.id] ?? 0;
                                const isEditing = editingPWP === p.id;
                                const isSaving  = savingPWP  === p.id;
                                const isPwpSel  = selEstPwp  === p.id;

                                return (
                                  <div key={p.id}
                                    className={cn('flex items-center gap-2 pl-8 pr-3 py-2 transition',
                                      isPwpSel ? 'bg-indigo-50' : 'hover:bg-gray-50')}>
                                    {/* Status dot */}
                                    <div className="w-2 h-2 rounded-sm shrink-0"
                                      style={{ background: isPwpSel ? '#6366F1' : avanceColor(pct) }} />
                                    {/* Partida info — clickable to select in viewer */}
                                    <button className="flex-1 min-w-0 text-left"
                                      onClick={() => {
                                        const newPwp = isPwpSel ? null : p.id;
                                        const newCwa = newPwp ? cwa : null;
                                        setSelEstCwa(newCwa ?? cwa);
                                        setSelEstPwp(newPwp);
                                        void applyEstructuraHighlight(cwa, newPwp, avance);
                                      }}>
                                      <div className="text-[10px] text-slate-700 font-semibold truncate">{p.partida}</div>
                                      <div className="text-[9px] text-slate-400">{p.id} · {p.nElem} elem · {p.m3.toLocaleString('es-CL', { maximumFractionDigits: 1 })} m³</div>
                                    </button>
                                    {/* Mini progress bar */}
                                    <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
                                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: avanceColor(pct) }} />
                                    </div>
                                    {/* Avance badge / editor */}
                                    {isEditing ? (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <input type="number" min={0} max={100} value={editVal}
                                          onChange={e => setEditVal(e.target.value)}
                                          className="w-11 text-[11px] text-center border border-indigo-300 rounded px-1 py-0.5 font-black outline-none focus:ring-1 focus:ring-indigo-400"
                                          autoFocus
                                          onKeyDown={async e => {
                                            if (e.key === 'Enter') {
                                              const v = Math.min(100, Math.max(0, parseInt(editVal) || 0));
                                              setEditingPWP(null);
                                              await saveAvance(p.id, v);
                                              void applyEstructuraHighlight(selEstCwa, selEstPwp, { ...avance, [p.id]: v });
                                            } else if (e.key === 'Escape') {
                                              setEditingPWP(null);
                                            }
                                          }}
                                        />
                                        <button className="text-[9px] text-indigo-600 font-black"
                                          onClick={async () => {
                                            const v = Math.min(100, Math.max(0, parseInt(editVal) || 0));
                                            setEditingPWP(null);
                                            await saveAvance(p.id, v);
                                            void applyEstructuraHighlight(selEstCwa, selEstPwp, { ...avance, [p.id]: v });
                                          }}>OK</button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={e => { e.stopPropagation(); setEditingPWP(p.id); setEditVal(String(pct)); }}
                                        className={cn('text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 transition hover:ring-1 hover:ring-offset-1 hover:ring-indigo-300', avanceBg(pct), isSaving && 'opacity-50')}>
                                        {isSaving ? '…' : `${pct}%`}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* ═══ DISCIPLINAS WBS ═══ */}
              {tab === 'wbs' && (
                <div className="space-y-3">

                  {/* Context discipline chips */}
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm space-y-2.5">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 shrink-0">Visualización:</span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                          checked={wbsColorsEnabled}
                          onChange={e => setWbsColorsEnabled(e.target.checked)} />
                        <span className="text-[10px] font-semibold text-slate-600">Colorear por disciplina</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                          checked={wbsGhostMode}
                          onChange={e => setWbsGhostMode(e.target.checked)} />
                        <span className="text-[10px] font-semibold text-slate-600">Modo Fantasma (mostrar resto transparente)</span>
                      </label>
                    </div>
                    <div className="h-px bg-gray-100" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 shrink-0">Contexto:</span>
                      {DISC_ORDER.map(d => {
                        const active = contextDiscs.has(d.key);
                        return (
                          <button key={d.key}
                            title={`Mostrar ${d.key} como contexto junto a la selección principal`}
                            onClick={() => {
                              const s = new Set(contextDiscs);
                              if (s.has(d.key)) s.delete(d.key); else s.add(d.key);
                              setContextDiscs(s);
                              if (wbsSelection.size > 0)
                                void applyWbsHighlight(wbsSelection, s, wbsColorsEnabled, wbsGhostMode);
                            }}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black transition border',
                              active
                                ? 'text-white border-transparent'
                                : 'bg-white border-gray-200 text-slate-500 hover:border-gray-300'
                            )}
                            style={active ? { background: d.color, borderColor: d.color } : undefined}>
                            <div className="w-1.5 h-1.5 rounded-sm" style={{ background: active ? 'white' : d.color }} />
                            {d.short}
                          </button>
                        );
                      })}
                      {(wbsSelection.size > 0) && (
                        <button className="ml-auto text-[9px] text-indigo-500 font-black hover:text-indigo-700 flex items-center gap-1"
                          onClick={() => {
                            setWbsSelection(new Set());
                          }}>
                          ✕ Limpiar
                        </button>
                      )}
                    </div>
                    {contextDiscs.size > 0 && wbsSelection.size > 0 && (
                      <p className="text-[9px] text-slate-400 mt-1.5">
                        Contexto activo: {[...contextDiscs].map(d => DISC_ORDER.find(x => x.key === d)?.short).filter(Boolean).join(', ')} · aparecen en gris junto a la selección
                      </p>
                    )}
                  </div>

                  {/* WBS Tree */}
                  {allWbsCwas.map(({ cwa, nombre }) => {
                    const cwpsForCwa = wbsDiscsCwps[cwa] ?? {};
                    const estPwps    = wbsEstByCwa[cwa] ?? [];
                    const isExpanded    = expandedWbsCWAs.has(cwa);

                    // Use data.cwaList total (all disciplines) when available
                    const cwaRowData = data?.cwaList.find(c => c.cwa === cwa);
                    const totalElemCwa = cwaRowData?.total
                      ?? (Object.values(cwpsForCwa).flat().reduce((s, c) => s + c.total, 0)
                         + estPwps.reduce((s, p) => s + p.nElem, 0));

                    return (
                      <div key={cwa} className={cn('bg-white border rounded-xl shadow-sm overflow-hidden transition',
                        wbsSelection.has(`cwa:${cwa}`) ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-200')}>

                        {/* ── CWA header ── */}
                        <div className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 transition text-left">
                          <button className="shrink-0 p-1" onClick={() => {
                            const newExp = new Set(expandedWbsCWAs);
                            if (newExp.has(cwa)) newExp.delete(cwa); else newExp.add(cwa);
                            setExpandedWbsCWAs(newExp);
                          }}>
                            <ChevronRight className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', isExpanded && 'rotate-90')} />
                          </button>
                          
                          <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                            checked={wbsSelection.has(`cwa:${cwa}`)}
                            onChange={(e) => {
                              const s = new Set(wbsSelection);
                              if (e.target.checked) s.add(`cwa:${cwa}`); else s.delete(`cwa:${cwa}`);
                              setWbsSelection(s);
                            }}
                          />
                          {/* Discipline dots */}
                          <div className="flex -space-x-0.5 shrink-0">
                            {DISC_ORDER.filter(d =>
                              (d.key === 'Estructura' && estPwps.length > 0) ||
                              (d.key !== 'Estructura' && (cwpsForCwa[d.key]?.length ?? 0) > 0) ||
                              (d.key === 'Sanitario' || d.key === 'Climatizacion (HVAC)')
                            ).map(d => (
                              <div key={d.key} className="w-2 h-2 rounded-sm ring-1 ring-white" style={{ background: d.color }} />
                            ))}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{cwa}</span>
                            <span className="ml-2 text-[11px] font-black text-slate-800">{nombre}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0">{totalElemCwa.toLocaleString('es-CL')} elem</span>
                        </div>

                        {/* ── Discipline rows ── */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 divide-y divide-gray-50">
                            {DISC_ORDER.map(disc => {
                              const cwps         = cwpsForCwa[disc.key] ?? [];
                              const estPwpsDisc  = disc.key === 'Estructura' ? estPwps : [];
                              const isEstOnly    = disc.key === 'Estructura';
                              const isSanHvac    = disc.key === 'Sanitario' || disc.key === 'Climatizacion (HVAC)';
                              const hasCwpData   = cwps.length > 0 || estPwpsDisc.length > 0;
                              if (!hasCwpData && !isSanHvac) return null;

                              const discKey        = `${cwa}:${disc.key}`;
                              const isDiscExpanded = expandedWbsDiscs.has(discKey);
                              const elemCount      = isEstOnly
                                ? estPwpsDisc.reduce((s, p) => s + p.nElem, 0)
                                : cwps.reduce((s, c) => s + c.total, 0);
                              const m3Total        = isEstOnly ? estPwpsDisc.reduce((s, p) => s + p.m3, 0) : 0;
                              const pkgCount       = isEstOnly ? estPwpsDisc.length : cwps.length;

                              return (
                                <div key={disc.key}>
                                  {/* Discipline row */}
                                  <div className={cn('flex items-center gap-2 pl-6 pr-3 py-2 transition hover:bg-gray-50',
                                    wbsSelection.has(`disc:${cwa}:${disc.key}`) ? 'bg-indigo-50' : '')}>

                                    {/* Expand chevron (only if has sub-items) */}
                                    <button className="shrink-0 w-4 flex items-center justify-center"
                                      onClick={() => {
                                        if (!hasCwpData) return;
                                        const s = new Set(expandedWbsDiscs);
                                        if (s.has(discKey)) s.delete(discKey); else s.add(discKey);
                                        setExpandedWbsDiscs(s);
                                      }}>
                                      {hasCwpData && (
                                        <ChevronRight className={cn('w-3 h-3 text-slate-400 transition-transform', isDiscExpanded && 'rotate-90')} />
                                      )}
                                    </button>

                                    <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                                      checked={wbsSelection.has(`disc:${cwa}:${disc.key}`)}
                                      onChange={(e) => {
                                        const s = new Set(wbsSelection);
                                        const item = `disc:${cwa}:${disc.key}`;
                                        if (e.target.checked) s.add(item); else s.delete(item);
                                        setWbsSelection(s);
                                      }}
                                    />

                                    {/* Color dot */}
                                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: disc.color }} />

                                    {/* Discipline label */}
                                    <div className="flex-1 min-w-0 text-left">
                                      <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: disc.color }}>{disc.short}</span>
                                      <span className="ml-1.5 text-[11px] font-semibold text-slate-700">
                                        {disc.key === 'Climatizacion (HVAC)' ? 'Climatización (HVAC)' : disc.key}
                                      </span>
                                    </div>

                                    {/* Stats */}
                                    {hasCwpData ? (
                                      <div className="flex items-center gap-2 shrink-0 text-[9px] text-slate-400">
                                        {isEstOnly && m3Total > 0 && (
                                          <span>{m3Total.toLocaleString('es-CL', { maximumFractionDigits: 0 })} m³</span>
                                        )}
                                        <span className="text-[10px] text-slate-500 font-semibold">{elemCount.toLocaleString('es-CL')} elem</span>
                                        <span className="text-[9px] bg-gray-100 rounded px-1">{pkgCount} {isEstOnly ? 'PWP' : 'CWP'}</span>
                                      </div>
                                    ) : (
                                      <span className="text-[9px] text-slate-300 shrink-0 italic">ver en modelo</span>
                                    )}
                                  </div>

                                  {/* CWP / PWP sub-rows */}
                                  {isDiscExpanded && hasCwpData && (
                                    <div className="border-t border-gray-50 divide-y divide-gray-50">
                                      {isEstOnly ? estPwpsDisc.map(p => {
                                        return (
                                          <div key={p.id}
                                            className={cn('w-full flex items-center gap-2 pl-12 pr-3 py-1.5 text-left transition hover:bg-gray-50',
                                              wbsSelection.has(`cwp:${p.id}`) ? 'bg-indigo-50' : '')}>
                                            <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 shrink-0 cursor-pointer"
                                              checked={wbsSelection.has(`cwp:${p.id}`)}
                                              onChange={(e) => {
                                                const s = new Set(wbsSelection);
                                                if (e.target.checked) s.add(`cwp:${p.id}`); else s.delete(`cwp:${p.id}`);
                                                setWbsSelection(s);
                                              }}
                                            />
                                            <div className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: disc.color }} />
                                            <div className="flex-1 min-w-0 py-0.5">
                                              <div className="text-[10px] font-semibold text-slate-700 truncate">{p.partida}</div>
                                              <div className="text-[9px] text-slate-400 font-mono mt-0.5">ID: {p.id}</div>
                                              <div className="text-[9px] text-slate-500 font-medium">{p.nElem} elementos · <span className="font-bold text-slate-700">{p.m3.toLocaleString('es-CL', { maximumFractionDigits: 1 })} m³</span></div>
                                            </div>
                                          </div>
                                        );
                                      }) : cwps.map(cwp => {
                                        return (
                                          <div key={cwp.id}
                                            className={cn('w-full flex items-center gap-2 pl-12 pr-3 py-1.5 text-left transition hover:bg-gray-50',
                                              wbsSelection.has(`cwp:${cwp.id}`) ? 'bg-indigo-50' : '')}>
                                            <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 shrink-0 cursor-pointer"
                                              checked={wbsSelection.has(`cwp:${cwp.id}`)}
                                              onChange={(e) => {
                                                const s = new Set(wbsSelection);
                                                if (e.target.checked) s.add(`cwp:${cwp.id}`); else s.delete(`cwp:${cwp.id}`);
                                                setWbsSelection(s);
                                              }}
                                            />
                                            <div className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: disc.color }} />
                                            <div className="flex-1 min-w-0 py-0.5">
                                              <div className="text-[10px] font-semibold text-slate-700 truncate">{cwp.partida}</div>
                                              <div className="text-[9px] text-slate-400 font-mono mt-0.5">ID: {cwp.id}</div>
                                              <div className="text-[9px] text-slate-500 font-medium">Tags: <span className="text-slate-600">{cwp.tagDesde}</span> al <span className="text-slate-600">{cwp.tagHasta}</span></div>
                                            </div>
                                            <span className="text-[9px] text-slate-400 font-semibold bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{cwp.total} elem</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ═══ CONEXIONES ═══ */}
              {tab === 'conexiones' && (
                <div className="space-y-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Link2 className="w-4 h-4 text-indigo-500" />
                      <h3 className="text-sm font-black text-slate-900">Conexiones ARQ ↔ ELE por Piso</h3>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">Relación entre elementos arquitectónicos y eléctricos por CWA.</p>
                    <div className="space-y-2.5">
                      {conexiones.map((c, i) => (
                        <motion.div key={c.cwa} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i*0.025 }}
                          className="border border-gray-200 rounded-lg p-3 hover:border-indigo-200 hover:shadow-sm transition">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{c.cwa}</span>
                              <div className="text-sm font-black text-slate-900">{c.nombre}</div>
                            </div>
                            <div className="flex gap-3 text-right">
                              <div className="text-center">
                                <div className="text-base font-black text-indigo-600">{c.ratio}x</div>
                                <div className="text-[9px] text-slate-400">ratio ELE/ARQ</div>
                              </div>
                              <div className="text-center">
                                <div className="text-base font-black text-slate-700">{c.densidad}</div>
                                <div className="text-[9px] text-slate-400">elem/CWP</div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-blue-50 border border-blue-100 rounded-lg p-2 text-center">
                              <div className="text-[9px] font-black text-blue-500 uppercase">ARQ</div>
                              <div className="text-sm font-black text-blue-700">{fmt(c.arq)}</div>
                            </div>
                            <div className="flex flex-col items-center"><ArrowUpRight className="w-3 h-3 text-indigo-300 rotate-90" /><ArrowUpRight className="w-3 h-3 text-indigo-300 -rotate-90" /></div>
                            <div className="flex-1 bg-amber-50 border border-amber-100 rounded-lg p-2 text-center">
                              <div className="text-[9px] font-black text-amber-500 uppercase">ELE</div>
                              <div className="text-sm font-black text-amber-700">{fmt(c.ele)}</div>
                            </div>
                            <div className="w-px h-8 bg-gray-200 mx-1" />
                            <div className="flex-1 bg-indigo-50 border border-indigo-100 rounded-lg p-2 text-center">
                              <div className="text-[9px] font-black text-indigo-500 uppercase">Total</div>
                              <div className="text-sm font-black text-indigo-700">{fmt(c.arq+c.ele)}</div>
                            </div>
                          </div>
                          <div className="mt-2 h-2 rounded-full overflow-hidden flex">
                            <div className="bg-blue-500" style={{ width: `${(c.arq/(c.arq+c.ele))*100}%` }} />
                            <div className="bg-amber-400" style={{ width: `${(c.ele/(c.arq+c.ele))*100}%` }} />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Cadena AWP · Trazabilidad completa</h3>
                    <div className="flex items-center gap-0 overflow-x-auto pb-1">
                      {[
                        { nivel: 'CWA',      desc: 'Piso / Área',          count: kpis.totalCWAs,      color: 'bg-slate-800 text-white',   ex: 'CWA-P12'         },
                        { nivel: 'CWP',      desc: 'Paquete construcción', count: kpis.totalCWPs,      color: 'bg-indigo-600 text-white',  ex: 'CWP-P12-EL-01'  },
                        { nivel: 'EWP',      desc: 'Paquete ingeniería',   count: kpis.totalCWPs,      color: 'bg-blue-600 text-white',    ex: 'EWP-P12-EL-01'  },
                        { nivel: 'PWP',      desc: 'Paquete adquisición',  count: kpis.totalCWPs,      color: 'bg-emerald-600 text-white', ex: 'PWP-P12-EL-01'  },
                        { nivel: 'ELEMENTO', desc: 'Elemento BIM',         count: kpis.totalElementos, color: 'bg-amber-500 text-white',   ex: 'P12-EL01-CN-0001' },
                      ].map((n, i) => (
                        <div key={n.nivel} className="flex items-center shrink-0">
                          {i > 0 && <ChevronRight className="w-4 h-4 text-slate-300 mx-0.5 shrink-0" />}
                          <div className={`rounded-xl p-2.5 text-center min-w-[90px] ${n.color}`}>
                            <div className="text-[9px] font-black uppercase tracking-widest opacity-70">{n.nivel}</div>
                            <div className="text-base font-black">{fmt(n.count)}</div>
                            <div className="text-[9px] opacity-70">{n.desc}</div>
                            <div className="text-[8px] mt-0.5 font-mono opacity-60">{n.ex}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ══ RIGHT: Forge Viewer Panel ══════════════════════════════════════════ */}
      <div className="flex flex-col bg-[#0d1117] relative" style={{ width: '44%' }}>

        {/* Viewer title bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a0f1a] border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-indigo-400" />
            <span className="text-[11px] font-black text-white uppercase tracking-wide">Modelo 3D · Costanera</span>
            {viewerReady && (
              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5 font-black">LISTO</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Quick view mode buttons */}
            {[
              { mode: 'disc' as ViewMode, label: 'DISC', title: 'Por disciplina' },
              { mode: 'cwa'  as ViewMode, label: 'PISO', title: 'Por piso/CWA' },
              { mode: 'cwp'  as ViewMode, label: 'CWP',  title: 'Por paquete' },
              { mode: 'est'  as ViewMode, label: 'OG',   title: 'Hormigones por avance' },
            ].map(btn => (
              <button key={btn.mode} title={btn.title}
                onClick={() => { setViewMode(btn.mode); void applyView(btn.mode, null, btn.mode === 'est' ? avance : undefined); }}
                disabled={!viewerReady}
                className={cn(
                  'px-2 py-1 rounded text-[9px] font-black uppercase tracking-wide transition disabled:opacity-40',
                  viewMode === btn.mode
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                )}>
                {btn.label}
              </button>
            ))}
            <div className="w-px h-4 bg-white/10 mx-1" />
            <button onClick={() => setShowPicker(true)} title="Seleccionar modelo BIM"
              className="px-2 py-1 rounded bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white text-[9px] font-black uppercase tracking-wide transition flex items-center gap-1">
              <Settings className="w-3 h-3" />
              Modelo
            </button>
          </div>
        </div>

        {/* Reactive context hint */}
        <div className="px-4 py-1.5 bg-[#0a0f1a]/80 border-b border-white/5 shrink-0">
          <span className="text-[10px] text-slate-500">
            {tab === '360' || tab === 'conexiones' ? '↦ Vista por disciplina · ARQ azul · ELE ámbar' :
             tab === 'arq' ? '↦ Arquitectura resaltada en azul' :
             tab === 'ele' ? '↦ Eléctrico resaltado en ámbar' :
             tab === 'pisos' ? selectedCWA ? `↦ Piso ${selectedCWA} seleccionado · clic otro para cambiar` : '↦ Rainbow por piso · clic una tarjeta para aislar' :
             tab === 'cwps' ? selectedCWP ? `↦ CWP ${selectedCWP} resaltado · clic fila para cambiar` : '↦ Clic una fila para resaltar ese paquete' :
             tab === 'og' ? '↦ Estructura coloreada por avance · gris=0% · naranja=progreso · verde=100%' :
             tab === 'wbs' ? (
               wbsSelection.size > 0 ? `↦ Selección múltiple activa (${wbsSelection.size} elementos)` :
               '↦ Todos los pisos · marca las casillas para aislar · activa chips de contexto'
             ) : ''}
          </span>
        </div>

        {/* Viewer area */}
        <div className="flex-1 relative">
          {!bimUrn ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
              <Box className="w-12 h-12 opacity-20" />
              <div className="text-center">
                <div className="text-sm font-black text-slate-400">Modelo 3D</div>
                <div className="text-xs text-slate-600 mt-1">Configura el modelo BIM en Autodesk Platform Services</div>
              </div>
            </div>
          ) : (
            <ForgeViewer
              ref={viewerRef}
              urn={bimUrn}
              onReady={onViewerReady}
            />
          )}
          {/* Status overlay */}
          {viewerStatus && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 text-white text-[11px] font-semibold px-4 py-2 rounded-full backdrop-blur-sm">
              <Loader2 className="w-3 h-3 animate-spin" />
              {viewerStatus}
            </div>
          )}
        </div>

        {/* Color legend */}
        {viewerReady && (
          <div className="px-4 py-2.5 bg-[#0a0f1a] border-t border-white/5 shrink-0">
            {viewMode === 'disc' && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(DISC_COLORS).map(([disc, hex]) => (
                  <div key={disc} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: hex }} />
                    <span className="text-[10px] text-slate-400">{disc.length > 14 ? disc.slice(0,14)+'…' : disc}</span>
                  </div>
                ))}
              </div>
            )}
            {(viewMode === 'cwa' || viewMode === 'cwp') && (
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5 h-2.5 flex-1 rounded overflow-hidden">
                  {Array.from({length: 12}).map((_,i) => (
                    <div key={i} className="flex-1" style={{ background: hslHex(Math.round((i/12)*330), 75, 52) }} />
                  ))}
                </div>
                <span className="text-[10px] text-slate-500">{viewMode === 'cwa' ? '26 pisos/CWAs' : '531 CWPs'}</span>
              </div>
            )}
            {(viewMode === 'arq') && (
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                <span className="text-[10px] text-slate-400">Arquitectura · {fmt(kpis.porDisciplina.Arquitectura)} elementos</span>
              </div>
            )}
            {(viewMode === 'ele') && (
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
                <span className="text-[10px] text-slate-400">Eléctrico · {fmt(kpis.porDisciplina.Electrico)} elementos</span>
              </div>
            )}
            {(viewMode === 'est') && (
              <div className="flex items-center gap-4 flex-wrap">
                {[
                  { label: 'Pendiente', color: '#94A3B8' },
                  { label: 'En progreso (<50%)', color: '#F97316' },
                  { label: '≥50%', color: '#F59E0B' },
                  { label: '100% completo', color: '#10B981' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                    <span className="text-[10px] text-slate-400">{s.label}</span>
                  </div>
                ))}
              </div>
            )}
            {(viewMode === 'wbs') && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {DISC_ORDER.map(d => (
                  <div key={d.key} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                    <span className="text-[10px] text-slate-400">{d.short}</span>
                  </div>
                ))}
                {contextDiscs.size > 0 && wbsSelection.size > 0 && (
                  <span className="text-[10px] text-slate-500 ml-2">· contexto en gris/modelo</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {showPicker && (
      <BimConfigModal
        projectId={project_id as string}
        current={bimConfig}
        onSave={(cfg: BimConfig | null) => {
          if (cfg?.urn) {
            setBimUrn(cfg.urn);
            setBimConfig(cfg);
            setViewerReady(false);
            propIndexRef.current = null;
            losasTreeRef.current = null;
          }
          setShowPicker(false);
        }}
        onClose={() => setShowPicker(false)}
        returnPath={typeof window !== 'undefined' ? window.location.pathname : undefined}
      />
    )}
    </>
  );
}
