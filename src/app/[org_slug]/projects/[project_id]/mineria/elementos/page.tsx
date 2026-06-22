'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import BimConfigModal, { type BimConfig } from '@/components/modules/BimConfigModal';
import {
  Search, Box, Settings, Loader2, X, ArrowLeft, ChevronLeft, ChevronRight, ChevronDown,
  CheckSquare, Square, ArrowRightCircle, Crosshair, Palette, ListTree, Layers,
  Paintbrush, Ghost, Eye, MousePointerClick, StopCircle, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

const CWP_PROP = 'CWP';
// Clave real de enlace al modelo: la pestaña/categoría "DATA_EIMISA" escrita por el plugin
// DataTools trae la propiedad SP3D_MONIKER (no la genérica "SP3d Moniker" de SmartPlant).
const MONIKER_PROP = 'SP3D_MONIKER';
const PAGE_SIZE = 100;

type Nivel = 'cwa' | 'cv' | 'cwp';
const NIVEL_LABEL: Record<Nivel, string> = { cwa: 'CWA', cv: 'CV', cwp: 'CWP' };
// Paleta cíclica para distinguir grupos al colorear (rota cada ~16 valores)
const COLOR_PAL = [
  [21,101,192],[230,81,0],[0,105,92],[173,20,87],[94,53,177],[201,161,0],[46,125,50],[141,110,99],
  [197,17,98],[0,131,143],[40,53,147],[251,140,0],[97,97,97],[156,39,176],[33,150,243],[121,85,72],
];
function colorForIndex(i: number): { r: number; g: number; b: number } {
  const [r, g, b] = COLOR_PAL[i % COLOR_PAL.length];
  return { r: r / 255, g: g / 255, b: b / 255 };
}
interface PaintTarget { nivel: Nivel; codigo: string; r: number; g: number; b: number; }

interface Elemento {
  sp3d_moniker: string; name: string | null; tag_equipo: string | null; disciplina: string | null; descripcion: string | null;
  tipo_elemento: string | null; sector: string | null; area_unidad: string | null; cwp_id: string | null;
  cwa_id: string | null; cv_id: string | null;
  especialidad_cod: string | null; especialidad_nombre: string | null; categoria_constructiva: string | null;
  sitio: string | null; sistema_servicio: string | null; obra_tipo: string | null; obra_target: string | null;
  cwp_fuente: string | null; categoria_enlace: string | null; avance_pct: number | null; estado: string | null;
  alcance: string | null; item_o_adicional: string | null; vinculo_nivel: string | null;
}
interface Bucket { cwpId: string | null; n: number; enCatalogo: boolean; }
interface CatalogRow { cwp_id: string; cwp_nombre: string; disciplina_cod: string; }
interface FiltroOpcion { valor: string; n: number; }
type Filtros = Record<string, FiltroOpcion[]>;

// Mantener en sync con SIMPLE_EQ_FIELDS de /api/mining-elementos/route.ts y con las columnas
// cubiertas por la función SQL mining_elementos_filtros().
const FILTER_FIELDS: { key: keyof FiltrosState; columna: string; label: string }[] = [
  { key: 'alcance', columna: 'alcance', label: 'Alcance' },
  { key: 'itemOAdicional', columna: 'item_o_adicional', label: 'Item/Adicional' },
  { key: 'especialidad', columna: 'especialidad_cod', label: 'Especialidad' },
  { key: 'categoria', columna: 'categoria_constructiva', label: 'Categoría' },
  { key: 'sistema', columna: 'sistema_servicio', label: 'Sistema' },
  { key: 'obraTipo', columna: 'obra_tipo', label: 'Obra' },
  { key: 'estado', columna: 'estado', label: 'Estado' },
  { key: 'sitio', columna: 'sitio', label: 'Sitio' },
  { key: 'sector', columna: 'sector', label: 'Sector' },
  { key: 'areaUnidad', columna: 'area_unidad', label: 'Unidad' },
  { key: 'validado', columna: 'validado', label: 'Validado' },
  { key: 'motivoNoValido', columna: 'motivo_no_valido', label: 'Motivo no válido' },
  { key: 'disciplinaModelo', columna: 'disciplina_modelo', label: 'Disciplina modelo' },
  { key: 'disciplinaArbol', columna: 'disciplina_arbol', label: 'Disciplina árbol' },
  { key: 'obraTarget', columna: 'obra_target', label: 'Obra target' },
  { key: 'cwpFuente', columna: 'cwp_fuente', label: 'CWP fuente' },
  { key: 'vinculoNivel', columna: 'vinculo_nivel', label: 'Vínculo nivel' },
  { key: 'categoriaEnlace', columna: 'categoria_enlace', label: 'Categoría enlace' },
  { key: 'codigoBmp', columna: 'codigo_bmp', label: 'Código BMP' },
];
interface FiltrosState {
  alcance: string; itemOAdicional: string; especialidad: string; categoria: string; sistema: string; obraTipo: string; estado: string;
  sitio: string; sector: string; areaUnidad: string; validado: string; motivoNoValido: string; disciplinaModelo: string;
  disciplinaArbol: string; obraTarget: string; cwpFuente: string; vinculoNivel: string; categoriaEnlace: string; codigoBmp: string;
}
const EMPTY_FILTERS: FiltrosState = {
  alcance: '', itemOAdicional: '', especialidad: '', categoria: '', sistema: '', obraTipo: '', estado: '',
  sitio: '', sector: '', areaUnidad: '', validado: '', motivoNoValido: '', disciplinaModelo: '',
  disciplinaArbol: '', obraTarget: '', cwpFuente: '', vinculoNivel: '', categoriaEnlace: '', codigoBmp: '',
};

export default function ElementosEditorPage() {
  const { org_slug, project_id } = useParams<{ org_slug: string; project_id: string }>();

  const [rows, setRows] = useState<Elemento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [cwaCatalog, setCwaCatalog] = useState<{ codigo: string; nombre: string | null }[]>([]);
  const [cvCatalog, setCvCatalog] = useState<{ codigo: string; nombre: string | null }[]>([]);
  const [activeBucket, setActiveBucket] = useState<string | null | '__ALL__'>('__ALL__');
  const [search, setSearch] = useState('');
  const [exactMonikers, setExactMonikers] = useState<string[] | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({});
  const [activeFilters, setActiveFilters] = useState<FiltrosState>(EMPTY_FILTERS);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState('');
  const [applying, setApplying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [bimUrn, setBimUrn] = useState<string | null>(null);
  const [bimConfig, setBimConfig] = useState<BimConfig | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showViewer, setShowViewer] = useState(true);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerStatus, setViewerStatus] = useState<string | null>(null);
  const [viewerWidth, setViewerWidth] = useState(560);
  const viewerRef = useRef<ForgeViewerHandle | null>(null);
  const resizingRef = useRef(false);
  // En modo multi-selección, Forge dispara el evento de selección con el acumulado COMPLETO en cada
  // click — sin este filtro, cada click re-pinta/re-envía TODO lo ya pintado en esta sesión de pintura,
  // creciendo el PATCH hasta que algún click grande termina devolviendo 400 (Bad Request).
  const paintedDbIdsRef = useRef<Set<number>>(new Set());
  // Cache de sp3d_moniker por nivel (CWA/CV/CWP) — "Colorear modelo por X" / "Ver seleccionados" se
  // llaman repetido al prender/apagar grupos; sin cachear, cada click reconsulta TODO el nivel a Supabase.
  const monikerCacheRef = useRef<Map<Nivel, Record<string, string[]>>>(new Map());

  const [panelMode, setPanelMode] = useState<'grupos' | 'revision'>('grupos');
  const [ghostMode, setGhostMode] = useState(true);
  const [autoZoom, setAutoZoom] = useState(true);
  const [multiSelectOn, setMultiSelectOn] = useState(false);
  const [paintTarget, setPaintTarget] = useState<PaintTarget | null>(null);
  const [paintCount, setPaintCount] = useState(0);

  // El modo fantasma/aislado se aplica en el momento de cada acción de aislar (showOnly),
  // no de forma retroactiva — este toggle solo define el modo para la próxima vez.
  const toggleGhostMode = useCallback(() => setGhostMode(prev => !prev), []);

  const toggleMultiSelect = useCallback(() => {
    setMultiSelectOn(prev => {
      const next = !prev;
      viewerRef.current?.setMultiSelect(next);
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

  const loadBuckets = useCallback(() => {
    if (!project_id) return;
    // loadBuckets se llama tras cada reasignación — el cache de monikers por nivel queda obsoleto.
    monikerCacheRef.current.clear();
    fetch(`/api/mining-elementos/buckets?project_id=${project_id}`).then(r => r.json()).then(d => setBuckets(d.buckets ?? []));
  }, [project_id]);

  useEffect(() => {
    if (!project_id) return;
    loadBuckets();
    fetch(`/api/mining-cwp-catalog?project_id=${project_id}`).then(r => r.json()).then(d => setCatalog(d.catalog ?? []));
    fetch(`/api/mining-elementos/filtros?project_id=${project_id}`).then(r => r.json()).then(d => setFiltros(d.filtros ?? {}));
    fetch(`/api/mining-revision?project_id=${project_id}&nivel=cwa`).then(r => r.json()).then(d =>
      setCwaCatalog((d.items ?? []).map((it: any) => ({ codigo: it.codigo, nombre: it.nombre }))));
    fetch(`/api/mining-revision?project_id=${project_id}&nivel=cv`).then(r => r.json()).then(d =>
      setCvCatalog((d.items ?? []).map((it: any) => ({ codigo: it.codigo, nombre: it.nombre }))));
  }, [project_id, loadBuckets]);

  useEffect(() => {
    if (!project_id) return;
    const supabase = createClient() as any;
    supabase.from('projects').select('module_config').eq('id', project_id).single()
      .then(({ data: d }: any) => {
        const bim = d?.module_config?.bim as BimConfig | undefined;
        if (bim?.urn) { setBimUrn(bim.urn); setBimConfig(bim); }
      });
  }, [project_id]);

  const fetchRows = useCallback(() => {
    if (!project_id) return;
    setLoading(true);
    const params = new URLSearchParams({ project_id, page: String(page), pageSize: String(PAGE_SIZE) });
    if (exactMonikers?.length) params.set('monikers', exactMonikers.join(','));
    else {
      if (activeBucket !== '__ALL__') params.set('cwp', activeBucket === null ? '__empty__' : activeBucket);
      if (search.trim()) params.set('search', search.trim());
      for (const f of FILTER_FIELDS) {
        const v = activeFilters[f.key];
        if (v) params.set(f.key, v);
      }
    }
    fetch(`/api/mining-elementos?${params}`).then(r => r.json()).then(d => {
      setRows(d.rows ?? []);
      setTotal(d.total ?? 0);
    }).finally(() => setLoading(false));
  }, [project_id, page, activeBucket, search, exactMonikers, activeFilters]);

  const onFilterChange = useCallback((key: keyof FiltrosState, value: string) => {
    setExactMonikers(null);
    setActiveFilters(prev => ({ ...prev, [key]: value }));
    setPage(0);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const totalSinCwp = useMemo(() => buckets.find(b => b.cwpId === null)?.n ?? 0, [buckets]);
  const totalElementos = useMemo(() => buckets.reduce((s, b) => s + b.n, 0), [buckets]);

  const selectBucket = useCallback((key: string | null | '__ALL__') => {
    setExactMonikers(null);
    setActiveBucket(key);
    setSearch('');
    setPage(0);
  }, []);

  const onSearchChange = useCallback((v: string) => {
    setExactMonikers(null);
    setSearch(v);
    setPage(0);
  }, []);

  const toggleRow = useCallback((moniker: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(moniker) ? next.delete(moniker) : next.add(moniker);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelected(prev => {
      const allChecked = rows.every(r => prev.has(r.sp3d_moniker));
      const next = new Set(prev);
      if (allChecked) rows.forEach(r => next.delete(r.sp3d_moniker));
      else rows.forEach(r => next.add(r.sp3d_moniker));
      return next;
    });
  }, [rows]);

  const applyToSelection = useCallback(async () => {
    if (!bulkTarget.trim() || !selected.size) return;
    setApplying(true);
    try {
      const res = await fetch('/api/mining-elementos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, newCwpId: bulkTarget.trim(), monikers: [...selected] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Error');
      setToast(`${d.updated} elemento(s) reasignado(s) a ${bulkTarget.trim()}`);
      setSelected(new Set());
      fetchRows();
      loadBuckets();
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setApplying(false);
    }
  }, [bulkTarget, selected, project_id, fetchRows, loadBuckets]);

  // Filtro activo en la tabla (búsqueda + dropdowns + bucket) expresado como `match` para el PATCH
  // server-side — permite reasignar TODOS los resultados que coinciden (no solo los 100 de la página).
  const hasActiveFilter = activeBucket !== '__ALL__' || !!search.trim() || Object.values(activeFilters).some(Boolean);
  const currentMatch = useCallback((): Record<string, string> | null => {
    if (exactMonikers?.length || !hasActiveFilter) return null;
    const match: Record<string, string> = {};
    if (activeBucket !== '__ALL__') match.cwp = activeBucket === null ? '__empty__' : activeBucket;
    if (search.trim()) match.search = search.trim();
    for (const f of FILTER_FIELDS) {
      const v = activeFilters[f.key];
      if (v) match[f.key] = v;
    }
    return match;
  }, [exactMonikers, hasActiveFilter, activeBucket, search, activeFilters]);

  const [bulkAllNivel, setBulkAllNivel] = useState<Nivel>('cwp');
  const [bulkAllTarget, setBulkAllTarget] = useState('');

  const applyToAllMatching = useCallback(async () => {
    const match = currentMatch();
    if (!match || !bulkAllTarget.trim()) return;
    setApplying(true);
    try {
      const res = await fetch('/api/mining-elementos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, nivel: bulkAllNivel, newValue: bulkAllTarget.trim(), match, origen: 'bulk_filtro_tabla' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Error');
      setToast(`${d.updated} elemento(s) reasignado(s) a ${NIVEL_LABEL[bulkAllNivel]} ${bulkAllTarget.trim()}`);
      setBulkAllTarget('');
      fetchRows();
      loadBuckets();
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setApplying(false);
    }
  }, [currentMatch, bulkAllTarget, bulkAllNivel, project_id, fetchRows, loadBuckets]);

  const applyToBucket = useCallback(async (bucketKey: string | null, target: string) => {
    if (!target.trim()) return;
    setApplying(true);
    try {
      const res = await fetch('/api/mining-elementos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, newCwpId: target.trim(), match: { cwp: bucketKey } }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Error');
      setToast(`${d.updated} elemento(s) reasignado(s) a ${target.trim()}`);
      fetchRows();
      loadBuckets();
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setApplying(false);
    }
  }, [project_id, fetchRows, loadBuckets]);

  const applyToRow = useCallback(async (moniker: string, target: string) => {
    if (!target.trim()) return;
    setApplying(true);
    try {
      const res = await fetch('/api/mining-elementos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, newCwpId: target.trim(), monikers: [moniker] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Error');
      setToast(`Reasignado a ${target.trim()}`);
      fetchRows();
      loadBuckets();
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setApplying(false);
    }
  }, [project_id, fetchRows, loadBuckets]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const isolateInViewer = useCallback(async (monikers: string[]) => {
    if (!viewerRef.current || !monikers.length) return;
    setShowViewer(true);
    if (!viewerReady) return; // se aplicará en onReady si corresponde, o el usuario reintenta
    setViewerStatus('Aislando elementos…');
    try {
      const dbIds = await viewerRef.current.resolveManyByProperty(MONIKER_PROP, monikers);
      if (dbIds.length) { viewerRef.current.showOnly(dbIds, ghostMode); viewerRef.current.fitToView(dbIds); }
      else setToast('No se encontraron esos elementos en el modelo (revisa el nombre de propiedad SP3D_MONIKER en DATA_EIMISA).');
    } finally {
      setViewerStatus(null);
    }
  }, [viewerReady, ghostMode]);

  // Trae sp3d_moniker agrupados por valor de CWA/CV/CWP desde la BD (no depende de que el modelo
  // tenga una propiedad nativa "CWA"/"CV" — solo necesita "SP3d Moniker", que sí es confiable).
  // Siempre pide el NIVEL COMPLETO (sin filtrar por codigos) para poder cachearlo y reusarlo en los
  // siguientes prendido/apagado de grupos sin volver a golpear la BD cada vez.
  const fetchMonikerGroups = useCallback(async (nivel: Nivel, codigos?: string[]) => {
    let groups = monikerCacheRef.current.get(nivel);
    if (!groups) {
      const params = new URLSearchParams({ project_id, nivel });
      const r = await fetch(`/api/mining-elementos/monikers-by-nivel?${params}`);
      const d = await r.json();
      groups = (d.groups ?? {}) as Record<string, string[]>;
      monikerCacheRef.current.set(nivel, groups);
    }
    if (!codigos?.length) return groups;
    const subset: Record<string, string[]> = {};
    for (const c of codigos) if (groups[c]) subset[c] = groups[c];
    return subset;
  }, [project_id]);

  // Colorea TODO el modelo por nivel (CWA/CV/CWP) — cada grupo en SU color, y todo lo no
  // clasificado en ese nivel queda atenuado (fantasma), para ver limpio el límite entre áreas.
  const colorByLevel = useCallback(async (nivel: Nivel, codigos: string[]) => {
    if (!viewerRef.current || !viewerReady) return;
    setViewerStatus(`Coloreando modelo por ${NIVEL_LABEL[nivel]}…`);
    try {
      viewerRef.current.restoreAll();
      const groups = await fetchMonikerGroups(nivel, codigos);
      const perGroupDbIds: number[][] = [];
      const allDbIds: number[] = [];
      let matched = 0, esperados = 0;
      for (let i = 0; i < codigos.length; i++) {
        const monikers = groups[codigos[i]];
        if (!monikers?.length) { perGroupDbIds.push([]); continue; }
        esperados += monikers.length;
        const dbIds = await viewerRef.current.resolveManyByProperty(MONIKER_PROP, monikers);
        perGroupDbIds.push(dbIds);
        allDbIds.push(...dbIds);
        matched += dbIds.length;
      }
      if (!matched) { setToast(`No se encontraron elementos de ${NIVEL_LABEL[nivel]} en el modelo.`); return; }
      // Aísla con fantasma TODO lo clasificado vs. lo que no tiene este nivel asignado,
      // y recién después pinta cada grupo — así el color queda sobre fondo neutro, no sobre
      // los colores nativos del CAD (que hacían parecer "confeti" la vista anterior).
      viewerRef.current.showOnly(allDbIds, true);
      for (let i = 0; i < codigos.length; i++) {
        const dbIds = perGroupDbIds[i];
        if (!dbIds.length) continue;
        const { r, g, b } = colorForIndex(i);
        viewerRef.current.colorDbIds(dbIds, r, g, b, 1);
      }
      // Reencuadra solo si el auto-zoom está activo — si el usuario lo desactivó, respeta su cámara actual.
      if (autoZoom) viewerRef.current.fitToView(allDbIds);
      if (matched < esperados * 0.9) setToast(`⚠ Coloreados ${matched.toLocaleString('es-CL')} de ${esperados.toLocaleString('es-CL')} esperados — puede que falten elementos en el modelo.`);
      else setToast(`Coloreados ${matched.toLocaleString('es-CL')} elementos por ${NIVEL_LABEL[nivel]}. Lo gris/atenuado no tiene ${NIVEL_LABEL[nivel]} asignado.`);
    } finally {
      setViewerStatus(null);
    }
  }, [viewerReady, fetchMonikerGroups, autoZoom]);

  // Enfoca la cámara en un código sin aislar — mantiene el modelo coloreado completo visible para ver el límite
  const focusOnCodigo = useCallback(async (nivel: Nivel, codigo: string) => {
    if (!viewerRef.current || !viewerReady) return;
    setViewerStatus('Ubicando…');
    try {
      const groups = await fetchMonikerGroups(nivel, [codigo]);
      const monikers = groups[codigo] ?? [];
      if (!monikers.length) { setToast(`Sin elementos para ${codigo} en el modelo.`); return; }
      const dbIds = await viewerRef.current.resolveManyByProperty(MONIKER_PROP, monikers);
      if (dbIds.length) viewerRef.current.fitToView(dbIds);
      else setToast(`Sin elementos para ${codigo} en el modelo.`);
    } finally {
      setViewerStatus(null);
    }
  }, [viewerReady, fetchMonikerGroups]);

  // Aísla, COLOREA (cada grupo con su color de la lista) y enfoca varios códigos a la vez
  const viewSelectedInViewer = useCallback(async (nivel: Nivel, selections: { codigo: string; r: number; g: number; b: number }[]) => {
    if (!viewerRef.current || !viewerReady || !selections.length) return;
    setViewerStatus(`Aislando ${selections.length} grupo(s)…`);
    try {
      const groups = await fetchMonikerGroups(nivel, selections.map(s => s.codigo));
      const allDbIds: number[] = [];
      let esperados = 0;
      for (const sel of selections) {
        const monikers = groups[sel.codigo] ?? [];
        esperados += monikers.length;
        if (!monikers.length) continue;
        const dbIds = await viewerRef.current.resolveManyByProperty(MONIKER_PROP, monikers);
        allDbIds.push(...dbIds);
      }
      if (!allDbIds.length) { setToast('No se encontraron esos elementos en el modelo.'); return; }
      viewerRef.current.showOnly(allDbIds, ghostMode);
      for (const sel of selections) {
        const monikers = groups[sel.codigo] ?? [];
        if (!monikers.length) continue;
        const dbIds = await viewerRef.current.resolveManyByProperty(MONIKER_PROP, monikers);
        if (dbIds.length) viewerRef.current.colorDbIds(dbIds, sel.r, sel.g, sel.b, 1);
      }
      if (autoZoom) viewerRef.current.fitToView(allDbIds);
      if (allDbIds.length < esperados * 0.9) {
        setToast(`⚠ Se ubicaron ${allDbIds.length.toLocaleString('es-CL')} de ${esperados.toLocaleString('es-CL')} elementos esperados.`);
      } else {
        setToast(`Aislados y coloreados ${allDbIds.length.toLocaleString('es-CL')} elementos.`);
      }
    } finally {
      setViewerStatus(null);
    }
  }, [viewerReady, fetchMonikerGroups, ghostMode, autoZoom]);

  const armPaint = useCallback((nivel: Nivel, codigo: string, r: number, g: number, b: number) => {
    setShowViewer(true);
    setPaintCount(0);
    paintedDbIdsRef.current = new Set();
    setPaintTarget({ nivel, codigo, r, g, b });
  }, []);

  const stopPaint = useCallback(() => { setPaintTarget(null); paintedDbIdsRef.current = new Set(); }, []);

  const onViewerSelectionChange = useCallback(async (dbIds: number[]) => {
    if (!viewerRef.current || !dbIds.length) return;

    if (paintTarget) {
      // Filtra a solo lo NUEVO: en multi-selección, Forge reporta el acumulado completo en cada click.
      const newDbIds = dbIds.filter(id => !paintedDbIdsRef.current.has(id));
      if (!newDbIds.length) return;
      setViewerStatus(`Asignando a ${NIVEL_LABEL[paintTarget.nivel]} ${paintTarget.codigo}…`);
      try {
        const props = await viewerRef.current.loadBulkElementProps(newDbIds, [MONIKER_PROP]);
        const monikers = props.map(p => p.props[MONIKER_PROP]).filter(Boolean);
        if (!monikers.length) { setToast('El elemento no tiene la propiedad SP3D_MONIKER (DATA_EIMISA).'); return; }
        let updated = 0;
        const CHUNK = 500;
        for (let i = 0; i < monikers.length; i += CHUNK) {
          const chunk = monikers.slice(i, i + CHUNK);
          const res = await fetch('/api/mining-elementos', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_id, nivel: paintTarget.nivel, newValue: paintTarget.codigo, monikers: chunk,
              origen: `pintura_3d_${paintTarget.nivel}`,
            }),
          });
          const text = await res.text();
          let d: any = {}; try { d = JSON.parse(text); } catch { /* respuesta no-JSON (ej. error de infraestructura) */ }
          if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
          updated += d.updated ?? chunk.length;
        }
        for (const id of newDbIds) paintedDbIdsRef.current.add(id);
        viewerRef.current.colorDbIds(newDbIds, paintTarget.r, paintTarget.g, paintTarget.b, 1);
        setPaintCount(c => c + updated);
        loadBuckets();
      } catch (e: any) {
        setToast(`Error: ${e.message}`);
      } finally {
        setViewerStatus(null);
      }
      return;
    }

    setViewerStatus('Buscando elemento…');
    try {
      const props = await viewerRef.current.loadBulkElementProps(dbIds, [MONIKER_PROP]);
      const monikers = props.map(p => p.props[MONIKER_PROP]).filter(Boolean);
      if (!monikers.length) { setToast('El elemento seleccionado no tiene la propiedad SP3D_MONIKER (DATA_EIMISA).'); return; }
      setExactMonikers(monikers);
      setPage(0);
    } finally {
      setViewerStatus(null);
    }
  }, [paintTarget, project_id, loadBuckets]);

  const cwpBadge = (cwpId: string | null, fuente?: string | null, categoriaEnlace?: string | null) => {
    if (!cwpId) {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-red-100 text-red-700" title={categoriaEnlace ?? undefined}>
          Sin CWP{categoriaEnlace ? ` · ${categoriaEnlace}` : ''}
        </span>
      );
    }
    const inCatalog = catalog.some(c => c.cwp_id === cwpId);
    return (
      <span
        className={cn('px-1.5 py-0.5 rounded text-[9.5px] font-bold font-mono',
          inCatalog ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}
        title={fuente ? `Origen: ${fuente}` : undefined}
      >
        {cwpId}
      </span>
    );
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="h-full flex flex-col -m-6 bg-[#EEF2F7]">
      <div className="bg-gradient-to-br from-[#08203F] to-[#1565C0] text-white px-6 py-3 flex items-center gap-4 shrink-0">
        <Link href={`/${org_slug}/projects/${project_id}/mineria`} className="text-white/70 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-[15px] font-extrabold">Editor de Elementos · Asignación CWP</h1>
        <div className="flex gap-5 ml-auto text-right">
          <div><div className="text-[15px] font-black">{totalElementos.toLocaleString('es-CL')}</div><div className="text-[9px] uppercase opacity-70">elementos</div></div>
          <div><div className="text-[15px] font-black text-amber-300">{totalSinCwp.toLocaleString('es-CL')}</div><div className="text-[9px] uppercase opacity-70">sin CWP</div></div>
        </div>
        <a
          href={`/api/mining-cambios-log?project_id=${project_id}&format=csv`}
          className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0"
          title="Exportar trazabilidad de cambios CWA/CV/CWP (CSV) para corregir en DataTools"
        >
          <Download className="w-3.5 h-3.5" /> Exportar cambios
        </a>
        <button onClick={() => setShowPicker(true)} className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0">
          <Settings className="w-3.5 h-3.5" /> Modelo 3D
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-[320px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden">
          <div className="flex border-b border-slate-200 shrink-0">
            <button
              onClick={() => setPanelMode('grupos')}
              className={cn('flex-1 py-2 text-[10.5px] font-black uppercase tracking-wide flex items-center justify-center gap-1.5',
                panelMode === 'grupos' ? 'text-[#0D47A1] border-b-2 border-[#0D47A1]' : 'text-slate-400 hover:text-slate-600')}
            >
              <Layers className="w-3.5 h-3.5" /> Grupos CWP
            </button>
            <button
              onClick={() => setPanelMode('revision')}
              className={cn('flex-1 py-2 text-[10.5px] font-black uppercase tracking-wide flex items-center justify-center gap-1.5',
                panelMode === 'revision' ? 'text-[#0D47A1] border-b-2 border-[#0D47A1]' : 'text-slate-400 hover:text-slate-600')}
            >
              <ListTree className="w-3.5 h-3.5" /> Revisión de límites
            </button>
          </div>
          {panelMode === 'grupos' ? (
            <div className="flex-1 overflow-y-auto">
              <div
                onClick={() => selectBucket('__ALL__')}
                className={cn('px-3 py-2 border-b border-slate-100 cursor-pointer text-[11px] font-bold hover:bg-blue-50',
                  activeBucket === '__ALL__' && !exactMonikers && 'bg-blue-100')}
              >
                Todos los elementos <span className="text-slate-400 font-mono">({totalElementos.toLocaleString('es-CL')})</span>
              </div>
              {buckets.map(b => (
                <BucketRow
                  key={b.cwpId ?? '__empty__'} bucket={b} catalog={catalog}
                  active={activeBucket === b.cwpId && !exactMonikers}
                  onSelect={() => selectBucket(b.cwpId)}
                  onApply={(target) => applyToBucket(b.cwpId, target)}
                  applying={applying}
                />
              ))}
            </div>
          ) : (
            <RevisionPanel
              projectId={project_id} viewerReady={viewerReady}
              onColorByLevel={colorByLevel} onFocus={focusOnCodigo}
              onViewSelected={viewSelectedInViewer}
              paintTarget={paintTarget} onArmPaint={armPaint} onStopPaint={stopPaint}
            />
          )}
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search} onChange={e => onSearchChange(e.target.value)}
                placeholder="Buscar por moniker, nombre, descripción…"
                className="w-full pl-8 pr-3 py-1.5 text-[11.5px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            {exactMonikers && (
              <button onClick={() => { setExactMonikers(null); setPage(0); }} className="text-[10.5px] font-bold text-blue-600 flex items-center gap-1">
                <X className="w-3 h-3" /> Filtro por selección 3D ({exactMonikers.length})
              </button>
            )}
            <div className="text-[10.5px] text-slate-400 ml-auto">{total.toLocaleString('es-CL')} resultados</div>
            <div className="flex items-center gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-[10.5px] font-mono text-slate-500">{page + 1}/{pageCount}</span>
              <button disabled={page >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 flex-wrap">
            {FILTER_FIELDS.map(f => (
              <select
                key={f.key}
                value={activeFilters[f.key]}
                onChange={e => onFilterChange(f.key, e.target.value)}
                className="text-[10.5px] border border-slate-200 rounded-md px-1.5 py-1 bg-slate-50 text-slate-600 max-w-[160px]"
              >
                <option value="">{f.label}: todos</option>
                {(filtros[f.columna] ?? []).map(o => (
                  <option key={o.valor} value={o.valor}>{o.valor} ({o.n.toLocaleString('es-CL')})</option>
                ))}
              </select>
            ))}
            {Object.values(activeFilters).some(Boolean) && (
              <button onClick={() => { setActiveFilters(EMPTY_FILTERS); setPage(0); }} className="text-[10px] font-bold text-blue-600 flex items-center gap-1">
                <X className="w-3 h-3" /> Limpiar filtros
              </button>
            )}
          </div>

          {/* Reasignar TODOS los resultados que coinciden con el filtro/búsqueda actual (no solo la página visible) */}
          {hasActiveFilter && total > 0 && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold text-amber-800">{total.toLocaleString('es-CL')} resultado(s) coinciden con este filtro</span>
              <select
                value={bulkAllNivel} onChange={e => setBulkAllNivel(e.target.value as Nivel)}
                className="px-1.5 py-1 rounded text-[10.5px] border border-amber-300 bg-white text-amber-900"
              >
                {(['cwa', 'cv', 'cwp'] as Nivel[]).map(n => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}
              </select>
              <input
                list={bulkAllNivel === 'cwa' ? 'cwa-catalog-options' : bulkAllNivel === 'cv' ? 'cv-catalog-options' : 'cwp-catalog-options'}
                value={bulkAllTarget} onChange={e => setBulkAllTarget(e.target.value)}
                placeholder={`Nuevo ${NIVEL_LABEL[bulkAllNivel]}…`} className="px-2 py-1 rounded text-[11px] border border-amber-300 w-44"
              />
              <button
                onClick={applyToAllMatching} disabled={applying || !bulkAllTarget.trim()}
                className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded px-3 py-1 text-[11px] font-bold"
              >
                <ArrowRightCircle className="w-3.5 h-3.5" /> Reasignar TODOS ({total.toLocaleString('es-CL')})
              </button>
            </div>
          )}

          {/* Selection toolbar */}
          {selected.size > 0 && (
            <div className="bg-[#08203F] text-white px-4 py-2 flex items-center gap-3 shrink-0">
              <span className="text-[11px] font-bold">{selected.size} seleccionados</span>
              <input
                list="cwp-catalog-options" value={bulkTarget} onChange={e => setBulkTarget(e.target.value)}
                placeholder="Nuevo CWP…" className="px-2 py-1 rounded text-[11px] text-[#08203F] w-44"
              />
              <button onClick={applyToSelection} disabled={applying || !bulkTarget.trim()} className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded px-3 py-1 text-[11px] font-bold">
                <ArrowRightCircle className="w-3.5 h-3.5" /> Reasignar
              </button>
              <button onClick={() => isolateInViewer([...selected])} className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 rounded px-3 py-1 text-[11px] font-bold">
                <Crosshair className="w-3.5 h-3.5" /> Aislar en 3D
              </button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-[10.5px] text-white/60 hover:text-white">Limpiar selección</button>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full text-slate-400 gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-500 text-[9.5px] uppercase">
                  <tr>
                    <th className="px-2 py-2 text-left w-7">
                      <button onClick={toggleAllVisible}>
                        {rows.length && rows.every(r => selected.has(r.sp3d_moniker)) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-left">Moniker</th>
                    <th className="px-2 py-2 text-left">Nombre</th>
                    <th className="px-2 py-2 text-left">Disciplina</th>
                    <th className="px-2 py-2 text-left">Categoría</th>
                    <th className="px-2 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-left">Sector</th>
                    <th className="px-2 py-2 text-left">Obra</th>
                    <th className="px-2 py-2 text-left">Avance</th>
                    <th className="px-2 py-2 text-left">CWP actual</th>
                    <th className="px-2 py-2 text-left">Reasignar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <RowItem
                      key={r.sp3d_moniker} r={r} checked={selected.has(r.sp3d_moniker)}
                      onToggle={() => toggleRow(r.sp3d_moniker)}
                      onApply={(target) => applyToRow(r.sp3d_moniker, target)}
                      onIsolate={() => isolateInViewer([r.sp3d_moniker])}
                      badge={cwpBadge(r.cwp_id, r.cwp_fuente, r.categoria_enlace)}
                      applying={applying}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Viewer drawer */}
        {showViewer && (
          <div className="flex shrink-0 relative" style={{ width: viewerWidth }}>
            <div onMouseDown={onResizeStart} className="absolute left-0 top-0 h-full w-1.5 -ml-[3px] cursor-col-resize z-20 hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors" title="Arrastra para redimensionar" />
            <div className="flex-1 border-l border-slate-200 bg-[#060d1f] flex flex-col min-w-0">
              <div className="px-3 py-2 flex items-center justify-between bg-[#0a1628] border-b border-white/5 gap-2">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400 truncate">
                  {paintTarget ? 'Click en un elemento para asignarlo' : 'Click en un elemento para ubicarlo en la tabla'}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setAutoZoom(z => !z)}
                    title={autoZoom
                      ? 'Auto-zoom activo: colorear/ver seleccionados reencuadra la cámara. Click para dejar la cámara fija'
                      : 'Auto-zoom desactivado: la cámara no se mueve sola al colorear/ver seleccionados. Click para reactivar'}
                    className={cn('p-1.5 rounded flex items-center gap-1', autoZoom ? 'bg-white/10 text-slate-300' : 'bg-amber-500/30 text-amber-300')}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-bold uppercase">{autoZoom ? 'Auto-zoom' : 'Cámara fija'}</span>
                  </button>
                  <button
                    onClick={toggleGhostMode}
                    title={ghostMode
                      ? 'Modo FANTASMA: al aislar, lo no resaltado queda transparente. Click para cambiar a Aislado (próxima vez que aísles)'
                      : 'Modo AISLADO: al aislar, lo no resaltado se oculta del todo. Click para cambiar a Fantasma (próxima vez que aísles)'}
                    className={cn('p-1.5 rounded flex items-center gap-1', ghostMode ? 'bg-white/10 text-slate-300' : 'bg-indigo-500/30 text-indigo-300')}
                  >
                    {ghostMode ? <Ghost className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span className="text-[9px] font-bold uppercase">{ghostMode ? 'Fantasma' : 'Aislado'}</span>
                  </button>
                  <button
                    onClick={toggleMultiSelect}
                    title={multiSelectOn ? 'Multi-selección activa — cada click se suma. Click para desactivar' : 'Activar multi-selección (cada click suma elementos sin Ctrl)'}
                    className={cn('p-1.5 rounded', multiSelectOn ? 'bg-emerald-500/30 text-emerald-300' : 'bg-white/10 text-slate-300')}
                  >
                    <MousePointerClick className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setShowViewer(false); setViewerReady(false); }} className="text-slate-500 hover:text-white p-1.5"><X className="w-4 h-4" /></button>
                </div>
              </div>
              {paintTarget && (
                <div className="px-3 py-1.5 bg-amber-500/15 border-b border-amber-400/20 flex items-center gap-2 text-amber-200">
                  <Paintbrush className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[10.5px] font-bold truncate">
                    Pintura activa → {NIVEL_LABEL[paintTarget.nivel]} {paintTarget.codigo} · {paintCount} asignado(s)
                  </span>
                  <button onClick={stopPaint} className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 rounded px-2 py-1 shrink-0">
                    <StopCircle className="w-3 h-3" /> Detener
                  </button>
                </div>
              )}
              <div className="flex-1 relative">
                {!bimUrn ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 px-6 text-center">
                    <Box className="w-10 h-10 opacity-20" />
                    <div className="text-xs">Configura el modelo BIM para activar el visor.</div>
                    <button onClick={() => setShowPicker(true)} className="text-[11px] font-black text-indigo-400 hover:text-indigo-300">Configurar modelo →</button>
                  </div>
                ) : (
                  <ForgeViewer
                    ref={viewerRef} urn={bimUrn}
                    onReady={() => {
                      viewerRef.current?.setMultiSelect(multiSelectOn);
                      setViewerReady(true);
                    }}
                    onSelectionChange={onViewerSelectionChange}
                  />
                )}
                {viewerStatus && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full">
                    <Loader2 className="w-3 h-3 animate-spin" /> {viewerStatus}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <datalist id="cwp-catalog-options">
        {catalog.map(c => <option key={c.cwp_id} value={c.cwp_id}>{c.cwp_nombre}</option>)}
      </datalist>
      <datalist id="cwa-catalog-options">
        {cwaCatalog.map(c => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
      </datalist>
      <datalist id="cv-catalog-options">
        {cvCatalog.map(c => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
      </datalist>

      {toast && (
        <div className="fixed bottom-5 right-5 bg-[#08203F] text-white text-[11.5px] font-semibold px-4 py-2.5 rounded-lg shadow-xl z-50">{toast}</div>
      )}

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

function BucketRow({ bucket, catalog, active, onSelect, onApply, applying }: {
  bucket: Bucket; catalog: CatalogRow[]; active: boolean; onSelect: () => void; onApply: (target: string) => void; applying: boolean;
}) {
  const [target, setTarget] = useState('');
  const label = bucket.cwpId ?? 'Sin CWP';
  const name = catalog.find(c => c.cwp_id === bucket.cwpId)?.cwp_nombre;
  return (
    <div className={cn('px-3 py-2 border-b border-slate-100 hover:bg-blue-50/60', active && 'bg-blue-100')}>
      <div onClick={onSelect} className="cursor-pointer flex items-center gap-2">
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0',
          bucket.cwpId === null ? 'bg-red-500' : bucket.enCatalogo ? 'bg-emerald-500' : 'bg-amber-500')} />
        <span className="font-mono text-[11px] font-bold text-[#08203F] truncate">{label}</span>
        <span className="text-[10px] text-slate-400 ml-auto font-mono shrink-0">{bucket.n.toLocaleString('es-CL')}</span>
      </div>
      {name && <div className="text-[9.5px] text-slate-400 truncate pl-3.5">{name}</div>}
      <div className="flex items-center gap-1 mt-1 pl-3.5">
        <input
          list="cwp-catalog-options" value={target} onChange={e => setTarget(e.target.value)}
          placeholder="Mover grupo a CWP…" className="flex-1 min-w-0 px-1.5 py-0.5 text-[10px] border border-slate-200 rounded"
        />
        <button
          disabled={applying || !target.trim()}
          onClick={() => { onApply(target); setTarget(''); }}
          className="shrink-0 px-1.5 py-0.5 rounded bg-[#0D47A1] hover:bg-[#1565C0] disabled:opacity-30 text-white"
          title={`Reasignar los ${bucket.n} elementos de este grupo`}
        >
          <ArrowRightCircle className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function RowItem({ r, checked, onToggle, onApply, onIsolate, badge, applying }: {
  r: Elemento; checked: boolean; onToggle: () => void; onApply: (target: string) => void; onIsolate: () => void;
  badge: React.ReactNode; applying: boolean;
}) {
  const [target, setTarget] = useState('');
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      <td className="px-2 py-1.5"><button onClick={onToggle}>{checked ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5 text-slate-300" />}</button></td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500 max-w-[160px] truncate" title={r.sp3d_moniker}>{r.sp3d_moniker}</td>
      <td className="px-2 py-1.5 max-w-[160px] truncate">{r.name}</td>
      <td className="px-2 py-1.5" title={r.especialidad_cod ?? undefined}>{r.disciplina}</td>
      <td className="px-2 py-1.5 max-w-[140px] truncate">{r.categoria_constructiva}</td>
      <td className="px-2 py-1.5 max-w-[260px] truncate" title={r.descripcion ?? ''}>{r.descripcion}</td>
      <td className="px-2 py-1.5">{r.sector}</td>
      <td className="px-2 py-1.5 max-w-[120px] truncate" title={r.obra_target ?? undefined}>{r.obra_tipo}</td>
      <td className="px-2 py-1.5">{r.avance_pct != null ? `${r.avance_pct}%` : '—'}</td>
      <td className="px-2 py-1.5">
        <div className="flex flex-col gap-0.5">
          {badge}
          {r.item_o_adicional === 'ADICIONAL' && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 w-fit" title="Trabajo adicional, no contratado en el itemizado original">
              ADICIONAL
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <input list="cwp-catalog-options" value={target} onChange={e => setTarget(e.target.value)} placeholder="CWP…" className="w-24 px-1.5 py-0.5 text-[10px] border border-slate-200 rounded" />
          <button disabled={applying || !target.trim()} onClick={() => { onApply(target); setTarget(''); }} className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30" title="Reasignar"><ArrowRightCircle className="w-3.5 h-3.5 text-[#0D47A1]" /></button>
          <button onClick={onIsolate} className="p-1 rounded bg-slate-100 hover:bg-slate-200" title="Ver en 3D"><Crosshair className="w-3.5 h-3.5 text-slate-500" /></button>
        </div>
      </td>
    </tr>
  );
}

interface RevisionItem {
  codigo: string; nombre: string | null; nElementos: number; enCatalogo: boolean;
}

// CWP_ID = {CV}.{DISC}{NNN} (ej. 312101.D001) → CV = "312101" → CWA = CV[:4] = "3121"
// (misma convención que deriveCwaCv en /api/mining-elementos) — usado para armar el árbol CWA→CV→CWP.
function deriveCwaCvFromCwp(cwpId: string): { cwa: string | null; cv: string | null } {
  const m = cwpId.match(/^(\d{6})\.[A-Za-z]+\d+/);
  if (!m) return { cwa: null, cv: null };
  const cv = m[1];
  return { cwa: cv.slice(0, 4), cv };
}

function GroupCheckbox({ state }: { state: 'all' | 'some' | 'none' }) {
  if (state === 'all') return <CheckSquare className="w-3.5 h-3.5 text-blue-600" />;
  if (state === 'some') return (
    <div className="w-3.5 h-3.5 rounded-sm border-2 border-blue-600 flex items-center justify-center shrink-0">
      <div className="w-1.5 h-0.5 bg-blue-600" />
    </div>
  );
  return <Square className="w-3.5 h-3.5 text-slate-300" />;
}

function RevisionPanel({ projectId, viewerReady, onColorByLevel, onFocus, onViewSelected, paintTarget, onArmPaint, onStopPaint }: {
  projectId: string; viewerReady: boolean;
  onColorByLevel: (nivel: Nivel, codigos: string[]) => void;
  onFocus: (nivel: Nivel, codigo: string) => void;
  onViewSelected: (nivel: Nivel, selections: { codigo: string; r: number; g: number; b: number }[]) => void;
  paintTarget: PaintTarget | null;
  onArmPaint: (nivel: Nivel, codigo: string, r: number, g: number, b: number) => void;
  onStopPaint: () => void;
}) {
  const [nivel, setNivel] = useState<Nivel>('cwa');
  const nivelRef = useRef(nivel);
  nivelRef.current = nivel;
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expandedCwa, setExpandedCwa] = useState<Set<string>>(new Set());
  const [expandedCv, setExpandedCv] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    const nivelPedido = nivel;
    fetch(`/api/mining-revision?project_id=${projectId}&nivel=${nivelPedido}`).then(r => r.json()).then(d => {
      // Si el usuario ya cambió de pestaña mientras esta respuesta viajaba, descártala —
      // sin este guard, una respuesta vieja (ej. CWA) puede llegar después y pisar los items de la pestaña actual (CV).
      if (nivelPedido !== nivelRef.current) return;
      setItems(d.items ?? []);
    }).finally(() => { if (nivelPedido === nivelRef.current) setLoading(false); });
  }, [projectId, nivel]);

  useEffect(() => { load(); setChecked(new Set()); }, [load]);

  // Árbol CWA → CV → CWP solo para el nivel CWP (los SIN-CWP.* sin patrón derivable quedan sueltos al final).
  const cwpTree = useMemo(() => {
    if (nivel !== 'cwp') return null;
    const byCwa = new Map<string, Map<string, RevisionItem[]>>();
    const sueltos: RevisionItem[] = [];
    for (const it of items) {
      const { cwa, cv } = deriveCwaCvFromCwp(it.codigo);
      if (!cwa || !cv) { sueltos.push(it); continue; }
      if (!byCwa.has(cwa)) byCwa.set(cwa, new Map());
      const cvMap = byCwa.get(cwa)!;
      if (!cvMap.has(cv)) cvMap.set(cv, []);
      cvMap.get(cv)!.push(it);
    }
    return { byCwa, sueltos };
  }, [items, nivel]);

  // Por defecto el árbol queda totalmente expandido (son pocos CWA/CV).
  useEffect(() => {
    if (!cwpTree) return;
    setExpandedCwa(new Set(cwpTree.byCwa.keys()));
    setExpandedCv(new Set([...cwpTree.byCwa.values()].flatMap(m => [...m.keys()])));
  }, [cwpTree]);

  const colorIndexByCodigo = useMemo(() => new Map(items.map((it, i) => [it.codigo, i])), [items]);
  const colorOf = (codigo: string) => colorForIndex(colorIndexByCodigo.get(codigo) ?? 0);

  const toggleChecked = useCallback((codigo: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(codigo) ? next.delete(codigo) : next.add(codigo);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((codes: string[]) => {
    setChecked(prev => {
      const next = new Set(prev);
      const allOn = codes.length > 0 && codes.every(c => next.has(c));
      for (const c of codes) allOn ? next.delete(c) : next.add(c);
      return next;
    });
  }, []);

  const groupState = (codes: string[]): 'all' | 'some' | 'none' => {
    if (!codes.length) return 'none';
    const n = codes.filter(c => checked.has(c)).length;
    return n === 0 ? 'none' : n === codes.length ? 'all' : 'some';
  };

  const allCodes = useMemo(() => items.map(i => i.codigo), [items]);
  const selectAllState = groupState(allCodes);

  // Un solo botón: si hay marcados, colorea/aísla solo esos; si no hay nada marcado, colorea el nivel completo.
  const handleColorear = () => {
    if (checked.size > 0) {
      onViewSelected(nivel, items.map(it => ({ codigo: it.codigo, ...colorOf(it.codigo) })).filter(s => checked.has(s.codigo)));
    } else {
      onColorByLevel(nivel, items.map(i => i.codigo));
    }
  };

  const renderItem = (it: RevisionItem) => {
    const armed = paintTarget?.nivel === nivel && paintTarget.codigo === it.codigo;
    const { r, g, b } = colorOf(it.codigo);
    return (
      <div key={it.codigo} className={cn('px-3 py-2 border-b border-slate-100 hover:bg-blue-50 flex items-center gap-2', armed && 'bg-amber-50')}>
        <button onClick={() => toggleChecked(it.codigo)} className="shrink-0">
          {checked.has(it.codigo) ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5 text-slate-300" />}
        </button>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})` }} />
        <div onClick={() => onFocus(nivel, it.codigo)} className="flex-1 overflow-hidden cursor-pointer">
          <div className="font-mono text-[11px] font-bold text-[#08203F]">{it.codigo}</div>
          {it.nombre && <div className="text-[10px] text-slate-400 truncate">{it.nombre}</div>}
        </div>
        <span className="text-[10px] text-slate-400 font-mono shrink-0">{it.nElementos.toLocaleString('es-CL')}</span>
        <button
          onClick={() => armed ? onStopPaint() : onArmPaint(nivel, it.codigo, r, g, b)}
          title={armed ? 'Detener: dejar de mover elementos aquí' : `Mover elementos aquí: click en 🖌️, luego click en los elementos del modelo`}
          className={cn('p-1 rounded shrink-0', armed ? 'bg-amber-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500')}
        >
          {armed ? <StopCircle className="w-3.5 h-3.5" /> : <Paintbrush className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 space-y-2 shrink-0">
        <div className="flex gap-1">
          {(['cwa', 'cv', 'cwp'] as Nivel[]).map(n => (
            <button
              key={n} onClick={() => setNivel(n)}
              className={cn('flex-1 py-1 rounded text-[10.5px] font-bold uppercase',
                nivel === n ? 'bg-[#0D47A1] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}
            >
              {NIVEL_LABEL[n]}
            </button>
          ))}
        </div>
        <button
          onClick={handleColorear}
          disabled={!viewerReady || loading}
          className="w-full inline-flex items-center justify-center gap-1.5 bg-[#0D47A1] hover:bg-[#1565C0] disabled:opacity-40 text-white rounded px-2 py-1.5 text-[10.5px] font-bold"
          title={!viewerReady ? 'Abre el modelo 3D primero' : undefined}
        >
          {checked.size > 0
            ? <><Crosshair className="w-3.5 h-3.5" /> Colorear {checked.size} marcado(s)</>
            : <><Palette className="w-3.5 h-3.5" /> Colorear modelo por {NIVEL_LABEL[nivel]}</>}
        </button>
        <p className="text-[9.5px] text-slate-400 leading-snug">
          Cada {NIVEL_LABEL[nivel]} queda con un color. Click en uno para ubicarlo en el visor. Si ves elementos
          del color equivocado, click en 🖌️ del {NIVEL_LABEL[nivel]} correcto y luego click en esos elementos en el modelo para moverlos ahí.
        </p>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => toggleGroup(allCodes)}
            disabled={!allCodes.length}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 disabled:opacity-40"
          >
            <GroupCheckbox state={selectAllState} /> {selectAllState === 'all' ? 'Deseleccionar todos' : 'Seleccionar todos'}
          </button>
          {checked.size > 0 && <span className="text-[10px] text-slate-400">{checked.size} marcado(s)</span>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400 gap-2 text-[11px]"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
        ) : !items.length ? (
          <div className="p-6 text-center text-[11px] text-slate-400 italic">Sin {NIVEL_LABEL[nivel]} para este proyecto.</div>
        ) : nivel !== 'cwp' || !cwpTree ? (
          items.map(renderItem)
        ) : (
          <>
            {[...cwpTree.byCwa.entries()].map(([cwa, cvMap]) => {
              const cwaCodes = [...cvMap.values()].flat().map(i => i.codigo);
              const cwaOpen = expandedCwa.has(cwa);
              return (
                <div key={cwa}>
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-100 border-b border-slate-200">
                    <button onClick={() => toggleGroup(cwaCodes)} className="shrink-0"><GroupCheckbox state={groupState(cwaCodes)} /></button>
                    <button
                      onClick={() => setExpandedCwa(prev => { const n = new Set(prev); n.has(cwa) ? n.delete(cwa) : n.add(cwa); return n; })}
                      className="flex items-center gap-1 flex-1 text-left"
                    >
                      {cwaOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                      <span className="font-mono text-[11px] font-black text-[#08203F]">CWA {cwa}</span>
                      <span className="text-[9px] text-slate-400">({cwaCodes.length} CWP)</span>
                    </button>
                  </div>
                  {cwaOpen && [...cvMap.entries()].map(([cv, cvItems]) => {
                    const cvCodes = cvItems.map(i => i.codigo);
                    const cvOpen = expandedCv.has(cv);
                    return (
                      <div key={cv}>
                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border-b border-slate-100">
                          <button onClick={() => toggleGroup(cvCodes)} className="shrink-0"><GroupCheckbox state={groupState(cvCodes)} /></button>
                          <button
                            onClick={() => setExpandedCv(prev => { const n = new Set(prev); n.has(cv) ? n.delete(cv) : n.add(cv); return n; })}
                            className="flex items-center gap-1 flex-1 text-left"
                          >
                            {cvOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                            <span className="font-mono text-[10.5px] font-bold text-slate-600">CV {cv}</span>
                            <span className="text-[9px] text-slate-400">({cvCodes.length})</span>
                          </button>
                        </div>
                        {cvOpen && cvItems.map(renderItem)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {cwpTree.sueltos.length > 0 && (
              <div>
                <div className="px-2 py-1.5 bg-slate-100 border-b border-slate-200">
                  <span className="text-[10px] font-black uppercase text-slate-500">Sin clasificar / fuera de los 69 CWP</span>
                </div>
                {cwpTree.sueltos.map(renderItem)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
