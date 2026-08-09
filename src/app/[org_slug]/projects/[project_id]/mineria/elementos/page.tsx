'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { ForgeViewerHandle } from '@/components/awp/ForgeViewer';
import BimConfigModal, { type BimConfig } from '@/components/modules/BimConfigModal';
import ExportDataModal from '@/components/awp/ExportDataModal';
import {
  Search, Box, Settings, Loader2, X, ArrowLeft, ChevronLeft, ChevronRight,
  CheckSquare, Square, ArrowRightCircle, Crosshair, ListTree, SlidersHorizontal, Columns3, Eraser, Save, GitBranch,
  Paintbrush, Ghost, Eye, MousePointerClick, StopCircle, Download, RotateCcw, Layers, SquareDashedMousePointer, Tag,
  ClipboardCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { llavesDelProyecto, valorDeLlave } from '@/lib/llaves-modelo';

import RevisionPanel from './RevisionPanel';
import ModelTreePanel from './ModelTreePanel';
import RowItem from './RowItem';
import TagLoteBar, { type PartidaItemizado } from './TagLoteBar';
import { chunkMonikersForUrl, fetchWithRetry, parseJsonOrThrow, runWithConcurrency } from './elementos-red';
import {
  COLS_STORAGE_KEY, COLUMN_DEFS, DEFAULT_COLS, EMPTY_FILTERS, EXPORT_LOCKED_DEFS, EXPORT_LOCKED_KEYS,
  FILTER_FIELDS, NIVELES, NIVEL_LABEL, PAGE_SIZE,
  type Bucket, type CatalogRow, type Elemento, type Filtros, type FiltrosState, type Nivel,
  type PaintTarget, type TreeCoverageApi,
} from './elementos-tipos';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

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
  const [swpCatalog, setSwpCatalog] = useState<{ codigo: string; nombre: string | null }[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tableCollapsed, setTableCollapsed] = useState(false);
  const [treeBranch, setTreeBranch] = useState<{ dbId: number; name: string; leafDbIds: number[]; monikers: string[] | null; sinMoniker: { dbId: number; name: string }[] } | null>(null);
  const [treeBranchNivel, setTreeBranchNivel] = useState<Nivel>('cwp');
  const [treeBranchTarget, setTreeBranchTarget] = useState('');
  const [treeBranchBusy, setTreeBranchBusy] = useState(false);
  const [treeBranchError, setTreeBranchError] = useState<string | null>(null);
  const [treeBranchProgress, setTreeBranchProgress] = useState<{ done: number; total: number } | null>(null);
  const [treeRevealDbId, setTreeRevealDbId] = useState<{ dbId: number; ts: number } | null>(null);
  // Nivel activo (pestaña CWA/CV/CWP/SWP) reportado por RevisionPanel — lo usa el panel "Árbol del
  // modelo" para calcular el % de cobertura de cada rama relativo a ese mismo nivel.
  const [activeRevisionNivel, setActiveRevisionNivel] = useState<Nivel>('cwa');
  // Se incrementa cada vez que una reasignación (pintura 3D, árbol, fila o bulk) escribe en la BD —
  // RevisionPanel lo mira para recargar sus conteos (nElementos por CWA/CV/CWP) sin que el usuario
  // tenga que cambiar de pestaña o recargar la página para verlos actualizados.
  const [revisionRefreshSignal, setRevisionRefreshSignal] = useState(0);
  const bumpRevisionRefresh = useCallback(() => setRevisionRefreshSignal(s => s + 1), []);
  // Puente hacia las funciones de refresco de cobertura que vive dentro de ModelTreePanel — se llena
  // solo (vía useEffect) apenas el panel monta; confirmTreeBranchAssign lo usa para refrescar el %
  // de la rama recién clasificada sin esperar a que el usuario apriete "Actualizar %".
  const treeCoverageApiRef = useRef<TreeCoverageApi | null>(null);
  const [search, setSearch] = useState('');
  const [exactMonikers, setExactMonikers] = useState<string[] | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({});
  const [activeFilters, setActiveFilters] = useState<FiltrosState>(EMPTY_FILTERS);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showColsPanel, setShowColsPanel] = useState(false);
  // Mismo motivo que nivel/mostrarFiltro en RevisionPanel: el default debe ser igual en
  // server y cliente para no romper la hidratación — la preferencia guardada se aplica en el
  // useEffect de abajo, que solo corre en el cliente.
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => new Set(DEFAULT_COLS));
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COLS_STORAGE_KEY);
      if (saved) setVisibleCols(new Set(JSON.parse(saved)));
    } catch {}
  }, []);
  const toggleCol = useCallback((key: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      try { window.localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState('');
  const [applying, setApplying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [bimUrn, setBimUrn] = useState<string | null>(null);
  const [bimConfig, setBimConfig] = useState<BimConfig | null>(null);
  // Espejo en ref: los callbacks del visor se crean una vez y no deben re-suscribirse solo
  // porque llegó la configuración del modelo.
  const bimConfigRef = useRef<BimConfig | null>(null);
  useEffect(() => { bimConfigRef.current = bimConfig; }, [bimConfig]);
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

  const [ghostMode, setGhostMode] = useState(true);
  const [autoZoom, setAutoZoom] = useState(true);
  const [multiSelectOn, setMultiSelectOn] = useState(false);
  // Barrido por cuadro: arrastrar un rectángulo sobre el modelo selecciona TODA la geometría que
  // cae dentro. Es la herramienta del límite de batería — un paquete se define por dónde termina en
  // el espacio, y a clic por elemento un área de miles de piezas no se alcanza a recorrer nunca.
  const [sweepOn, setSweepOn] = useState(false);
  const [paintTarget, setPaintTarget] = useState<PaintTarget | null>(null);
  const [paintCount, setPaintCount] = useState(0);

  // Asignación rápida: clic en el modelo → popup con CWP destino →
  // guardado inmediato en lote por GUID del modelo (sin armar pintura). Con "seguir asignando" activo,
  // cada click siguiente asigna directo al mismo CWP — encadena elementos con un click cada uno.
  const [quickAssign, setQuickAssign] = useState<{ items: { guid: string; name: string; dbId: number }[] } | null>(null);
  const [quickCodigo, setQuickCodigo] = useState('');
  const [quickSticky, setQuickSticky] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);

  // dbIds que quedaron visibles tras el último showOnly (aislar/colorear) — permite que el toggle
  // Fantasma/Aislado reaplique de inmediato sobre lo que ya está en pantalla, en vez de quedar
  // "pendiente" hasta la próxima acción de aislar (eso era lo que obligaba a aislar varias veces).
  const lastIsolatedDbIdsRef = useRef<number[]>([]);
  const toggleGhostMode = useCallback(() => {
    setGhostMode(prev => {
      const next = !prev;
      if (viewerRef.current && lastIsolatedDbIdsRef.current.length) {
        viewerRef.current.showOnly(lastIsolatedDbIdsRef.current, next);
      }
      return next;
    });
  }, []);

  const toggleMultiSelect = useCallback(() => {
    setMultiSelectOn(prev => {
      const next = !prev;
      viewerRef.current?.setMultiSelect(next);
      return next;
    });
  }, []);

  // El barrido suma sobre lo ya seleccionado, así que se enciende junto con la multi-selección:
  // sin eso, cada rectángulo nuevo reemplazaba al anterior y no se podía armar un área en varias pasadas.
  const toggleSweep = useCallback(() => {
    setSweepOn(prev => {
      const next = !prev;
      viewerRef.current?.setDeepSelection(next);
      if (next && !multiSelectOn) {
        setMultiSelectOn(true);
        viewerRef.current?.setMultiSelect(true);
      }
      return next;
    });
  }, [multiSelectOn]);

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
    fetch(`/api/mining-elementos/buckets?project_id=${project_id}`).then(parseJsonOrThrow).then(d => setBuckets(d.buckets ?? [])).catch(() => {});
  }, [project_id]);

  // Los conteos por categoría de enlace (los chips de "qué falta y por qué") salen del mismo endpoint
  // de filtros, así que hay que recargarlo después de reasignar o los chips quedan con cifras viejas.
  const loadFiltros = useCallback(() => {
    if (!project_id) return;
    fetch(`/api/mining-elementos/filtros?project_id=${project_id}`).then(parseJsonOrThrow).then(d => setFiltros(d.filtros ?? {})).catch(() => {});
  }, [project_id]);

  /**
   * Ajusta los contadores en pantalla sin esperar al servidor.
   * Recontar 23.000 elementos toma su tiempo y, mientras tanto, la cifra quedaba en el valor
   * viejo y parecía que no se había guardado nada. Se corrige de inmediato y el fetch real
   * llega después a confirmar.
   */
  const ajustarConteoLocal = useCallback((codigoDestino: string, cuantos: number, codigoOrigen?: string | null) => {
    if (!cuantos) return;
    setBuckets(prev => {
      const copia = prev.map(b => ({ ...b }));
      const destino = copia.find(b => b.cwpId === codigoDestino);
      if (destino) destino.n += cuantos;
      else copia.push({ cwpId: codigoDestino, n: cuantos, enCatalogo: true });
      if (codigoOrigen) {
        const origen = copia.find(b => b.cwpId === codigoOrigen);
        if (origen) origen.n = Math.max(0, origen.n - cuantos);
      }
      return copia;
    });
  }, []);

  // Catálogos usados por los datalists/selects de "reasignar a…" (CWA/CV/CWP) en toda la página —
  // se refrescan tras crear una categoría nueva para que aparezca de inmediato como opción elegible.
  const loadCatalogs = useCallback(() => {
    if (!project_id) return;
    fetch(`/api/mining-cwp-catalog?project_id=${project_id}`).then(parseJsonOrThrow).then(d => setCatalog(d.catalog ?? [])).catch(() => {});
    fetch(`/api/mining-revision?project_id=${project_id}&nivel=cwa`).then(parseJsonOrThrow).then(d =>
      setCwaCatalog((d.items ?? []).map((it: any) => ({ codigo: it.codigo, nombre: it.nombre })))).catch(() => {});
    fetch(`/api/mining-revision?project_id=${project_id}&nivel=cv`).then(parseJsonOrThrow).then(d =>
      setCvCatalog((d.items ?? []).map((it: any) => ({ codigo: it.codigo, nombre: it.nombre })))).catch(() => {});
    fetch(`/api/mining-revision?project_id=${project_id}&nivel=swp`).then(parseJsonOrThrow).then(d =>
      setSwpCatalog((d.items ?? []).map((it: any) => ({ codigo: it.codigo, nombre: it.nombre })))).catch(() => {});
  }, [project_id]);

  useEffect(() => {
    if (!project_id) return;
    loadBuckets();
    loadCatalogs();
    loadFiltros();
  }, [project_id, loadBuckets, loadCatalogs, loadFiltros]);

  useEffect(() => {
    if (!project_id) return;
    const supabase = createClient() as any;
    supabase.from('projects').select('module_config').eq('id', project_id).single()
      .then(({ data: d }: any) => {
        const bim = d?.module_config?.bim as BimConfig | undefined;
        if (bim?.urn) { setBimUrn(bim.urn); setBimConfig(bim); }
      });
  }, [project_id]);

  // Partidas del itemizado para el tageo masivo. Se paginan con `order` porque sin él PostgREST
  // repite filas entre páginas y se salta otras (ver CLAUDE.md).
  const [partidas, setPartidas] = useState<PartidaItemizado[]>([]);
  useEffect(() => {
    if (!project_id) return;
    const supabase = createClient() as any;
    (async () => {
      const todas: PartidaItemizado[] = [];
      for (let p = 0; ; p++) {
        const { data, error } = await supabase.from('mining_itemizado')
          .select('item, descripcion, cwp_id, unidad, cantidad')
          .eq('project_id', project_id).order('item').range(p * 1000, p * 1000 + 999);
        if (error) break;
        todas.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) break;
      }
      setPartidas(todas);
    })();
  }, [project_id]);

  const fetchRows = useCallback(() => {
    if (!project_id) return;
    setLoading(true);
    const params = new URLSearchParams({ project_id, page: String(page), pageSize: String(PAGE_SIZE) });
    if (exactMonikers?.length) params.set('monikers', exactMonikers.join(','));
    else {
      if (search.trim()) params.set('search', search.trim());
      for (const f of FILTER_FIELDS) {
        const v = activeFilters[f.key];
        if (v) params.set(f.key, v);
      }
    }
    fetch(`/api/mining-elementos?${params}`).then(parseJsonOrThrow).then(d => {
      setRows(d.rows ?? []);
      setTotal(d.total ?? 0);
    }).catch(e => setToast(`Error al cargar elementos: ${e.message}`)).finally(() => setLoading(false));
  }, [project_id, page, search, exactMonikers, activeFilters]);

  const onFilterChange = useCallback((key: keyof FiltrosState, value: string) => {
    setExactMonikers(null);
    setActiveFilters(prev => ({ ...prev, [key]: value }));
    setPage(0);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const totalSinCwp = useMemo(() => buckets.find(b => b.cwpId === null)?.n ?? 0, [buckets]);
  const totalElementos = useMemo(() => buckets.reduce((s, b) => s + b.n, 0), [buckets]);

  // ── Chips "qué falta y por qué" ───────────────────────────────────────────
  // El estado del vínculo ya viene guardado por elemento (categoria_enlace) y el motivo también
  // (motivo_no_valido), pero hasta ahora vivían escondidos en el desplegable de filtros y en una
  // columna apagada por defecto. Sacarlos a la cabecera convierte "5.583 sin CWP" —un número muerto—
  // en la cola de trabajo del día, con un click para filtrar la tabla y aislar en 3D.
  const chipsEnlace = useMemo(
    () => [...(filtros['categoria_enlace'] ?? [])].sort((a, b) => b.n - a.n),
    [filtros],
  );
  const chipsMotivo = useMemo(
    () => [...(filtros['motivo_no_valido'] ?? [])].sort((a, b) => b.n - a.n).slice(0, 6),
    [filtros],
  );
  // Estado y motivo son EXCLUYENTES entre sí: elegir uno suelta el otro. Los conteos que muestran
  // los chips salen de mining_elementos_filtros(), que cuenta sobre todo el proyecto y no sabe de
  // filtros — así que al combinarlos se puede pedir un cruce que no existe (ej. un motivo del área
  // 0044 junto a "fuera de catálogo") y la tabla queda vacía sin explicar por qué.
  const toggleChip = useCallback((key: 'categoriaEnlace' | 'motivoNoValido', valor: string) => {
    setExactMonikers(null);
    setActiveFilters(prev => ({
      ...prev,
      categoriaEnlace: key === 'categoriaEnlace' && prev.categoriaEnlace !== valor ? valor : '',
      motivoNoValido: key === 'motivoNoValido' && prev.motivoNoValido !== valor ? valor : '',
    }));
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
      let updated = 0;
      for (const chunk of chunkMonikersForUrl([...selected])) {
        const res = await fetchWithRetry('/api/mining-elementos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id, newCwpId: bulkTarget.trim(), monikers: chunk }),
        });
        const d = await parseJsonOrThrow(res);
        updated += d.updated ?? chunk.length;
      }
      setToast(`${updated} elemento(s) reasignado(s) a ${bulkTarget.trim()}`);
      setSelected(new Set());
      fetchRows();
      loadBuckets();
      loadFiltros();
      bumpRevisionRefresh();
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setApplying(false);
    }
  }, [bulkTarget, selected, project_id, fetchRows, loadBuckets, loadFiltros, bumpRevisionRefresh]);

  // Filtro activo en la tabla (búsqueda + dropdowns) expresado como `match` para el PATCH
  // server-side — permite reasignar TODOS los resultados que coinciden (no solo los 100 de la página).
  const hasActiveFilter = !!search.trim() || Object.values(activeFilters).some(Boolean);
  const currentMatch = useCallback((): Record<string, string> | null => {
    if (exactMonikers?.length || !hasActiveFilter) return null;
    const match: Record<string, string> = {};
    if (search.trim()) match.search = search.trim();
    for (const f of FILTER_FIELDS) {
      const v = activeFilters[f.key];
      if (v) match[f.key] = v;
    }
    return match;
  }, [exactMonikers, hasActiveFilter, search, activeFilters]);

  const [bulkAllNivel, setBulkAllNivel] = useState<Nivel>('cwp');
  const [bulkAllTarget, setBulkAllTarget] = useState('');
  const [isolatingAll, setIsolatingAll] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportRows, setExportRows] = useState<Elemento[] | null>(null);
  const [exportProgress, setExportProgress] = useState<{ loaded: number; total: number } | null>(null);

  const applyToAllMatching = useCallback(async () => {
    const match = currentMatch();
    if (!match || !bulkAllTarget.trim()) return;
    setApplying(true);
    try {
      const res = await fetchWithRetry('/api/mining-elementos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, nivel: bulkAllNivel, newValue: bulkAllTarget.trim(), match, origen: 'bulk_filtro_tabla' }),
      });
      const d = await parseJsonOrThrow(res);
      setToast(`${d.updated} elemento(s) reasignado(s) a ${NIVEL_LABEL[bulkAllNivel]} ${bulkAllTarget.trim()}`);
      setBulkAllTarget('');
      fetchRows();
      loadBuckets();
      loadFiltros();
      bumpRevisionRefresh();
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setApplying(false);
    }
  }, [currentMatch, bulkAllTarget, bulkAllNivel, project_id, fetchRows, loadBuckets, loadFiltros, bumpRevisionRefresh]);

  const applyToRow = useCallback(async (moniker: string, target: string) => {
    if (!target.trim()) return;
    setApplying(true);
    try {
      const res = await fetchWithRetry('/api/mining-elementos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, newCwpId: target.trim(), monikers: [moniker] }),
      });
      await parseJsonOrThrow(res);
      setToast(`Reasignado a ${target.trim()}`);
      fetchRows();
      loadBuckets();
      loadFiltros();
      bumpRevisionRefresh();
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setApplying(false);
    }
  }, [project_id, fetchRows, loadBuckets, loadFiltros, bumpRevisionRefresh]);

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
      const itemProp = llavesDelProyecto(bimConfigRef.current).join(',');
      const dbIds = await viewerRef.current.resolveMonikers(monikers, itemProp);
      if (dbIds.length) {
        lastIsolatedDbIdsRef.current = dbIds;
        viewerRef.current.showOnly(dbIds, ghostMode);
        viewerRef.current.fitToView(dbIds);
      } else setToast('No se encontraron esos elementos en el modelo. Revisa las llaves configuradas del proyecto en Setup.');
    } finally {
      setViewerStatus(null);
    }
  }, [viewerReady, ghostMode]);

  // Aísla en el visor TODOS los resultados que coinciden con el filtro/búsqueda actual (no solo
  // la página visible de la tabla, que está topada a PAGE_SIZE) — pagina hasta el máximo del
  // servidor (PAGE_SIZE_MAX) juntando solo los monikers, sin pedir la fila completa de cada página.
  const isolateAllMatching = useCallback(async () => {
    const match = currentMatch();
    if (!match) return;
    setIsolatingAll(true);
    try {
      const monikers: string[] = [];
      const pageSize = 500;
      for (let p = 0; ; p++) {
        const params = new URLSearchParams({ project_id, page: String(p), pageSize: String(pageSize) });
        for (const [k, v] of Object.entries(match)) params.set(k, v);
        const res = await fetchWithRetry(`/api/mining-elementos?${params}`);
        const d = await parseJsonOrThrow(res);
        const page: { sp3d_moniker: string }[] = d.rows ?? [];
        for (const r of page) monikers.push(r.sp3d_moniker);
        if (page.length < pageSize) break;
      }
      await isolateInViewer(monikers);
    } catch (e: any) {
      setToast(`Error al aislar: ${e.message}`);
    } finally {
      setIsolatingAll(false);
    }
  }, [currentMatch, project_id, isolateInViewer]);

  // Pasa TODOS los resultados del filtro a la selección, para poder taguearlos de una vez. La
  // barra de tageo trabaja sobre `selected`, así que este es el puente entre "filtré 400 durmientes"
  // y "quiero ponerles DUR-001 a DUR-400".
  const [seleccionandoTodos, setSeleccionandoTodos] = useState(false);
  const seleccionarTodosLosQueCoinciden = useCallback(async () => {
    const match = currentMatch();
    if (!match) return;
    setSeleccionandoTodos(true);
    try {
      const monikers: string[] = [];
      const pageSize = 500;
      for (let p = 0; ; p++) {
        const params = new URLSearchParams({ project_id, page: String(p), pageSize: String(pageSize) });
        for (const [k, v] of Object.entries(match)) params.set(k, v);
        const res = await fetchWithRetry(`/api/mining-elementos?${params}`);
        const d = await parseJsonOrThrow(res);
        const pagina: { sp3d_moniker: string }[] = d.rows ?? [];
        for (const r of pagina) monikers.push(r.sp3d_moniker);
        if (pagina.length < pageSize) break;
      }
      setSelected(new Set(monikers));
      setToast(`${monikers.length.toLocaleString('es-CL')} elemento(s) seleccionados — listos para taguear.`);
    } catch (e: any) {
      setToast(`Error al seleccionar: ${e.message}`);
    } finally {
      setSeleccionandoTodos(false);
    }
  }, [currentMatch, project_id]);

  // Trae TODAS las filas completas que coinciden con el filtro/búsqueda actual (no solo la página
  // visible) para el modal de exportar — mismo patrón de paginado por chunks que isolateAllMatching,
  // pero sin el `if (!match) return` porque exportar "todo el proyecto" sin filtro también es válido.
  const openExportModal = useCallback(async () => {
    setShowExportModal(true);
    setExportRows(null);
    setExportProgress({ loaded: 0, total: total || 0 });
    try {
      const match = currentMatch();
      const pageSize = 500;
      const all: Elemento[] = [];
      for (let p = 0; ; p++) {
        const params = new URLSearchParams({ project_id, page: String(p), pageSize: String(pageSize) });
        if (match) for (const [k, v] of Object.entries(match)) params.set(k, v);
        const res = await fetchWithRetry(`/api/mining-elementos?${params}`);
        const d = await parseJsonOrThrow(res);
        const page: Elemento[] = d.rows ?? [];
        all.push(...page);
        setExportProgress({ loaded: all.length, total: d.total ?? total ?? all.length });
        if (page.length < pageSize) break;
      }
      setExportRows(all);
    } catch (e: any) {
      setToast(`Error al cargar datos para exportar: ${e.message}`);
      setShowExportModal(false);
    }
  }, [currentMatch, project_id, total]);

  // Trae sp3d_moniker agrupados por valor de CWA/CV/CWP desde la BD (no depende de que el modelo
  // tenga una propiedad nativa "CWA"/"CV" — solo necesita "SP3d Moniker", que sí es confiable).
  // Siempre pide el NIVEL COMPLETO (sin filtrar por codigos) para poder cachearlo y reusarlo en los
  // siguientes prendido/apagado de grupos sin volver a golpear la BD cada vez.
  const fetchMonikerGroups = useCallback(async (nivel: Nivel, codigos?: string[]) => {
    let groups = monikerCacheRef.current.get(nivel);
    if (!groups) {
      const params = new URLSearchParams({ project_id, nivel });
      const r = await fetchWithRetry(`/api/mining-elementos/monikers-by-nivel?${params}`);
      const d = await r.json();
      groups = (d.groups ?? {}) as Record<string, string[]>;
      monikerCacheRef.current.set(nivel, groups);
    }
    if (!codigos?.length) return groups;
    const subset: Record<string, string[]> = {};
    for (const c of codigos) if (groups[c]) subset[c] = groups[c];
    return subset;
  }, [project_id]);

  // Colorea por nivel (CWA/CV/CWP/SWP) — cada grupo en SU color, y todo lo no clasificado en ese
  // nivel queda atenuado (fantasma), para ver limpio el límite entre áreas.
  // Si hay una rama del árbol del modelo activa (treeBranch, ej. "...ELECTRICIDAD.vue"), el
  // coloreo queda RESTRINGIDO a esa rama — así se puede ver, ej., "solo lo eléctrico" desglosado
  // por sus distintos CWP, en vez de colorear el modelo completo.
  const colorByLevel = useCallback(async (nivel: Nivel, selections: { codigo: string; r: number; g: number; b: number; a: number }[], opts?: { silencioso?: boolean }): Promise<number> => {
    if (!viewerRef.current || !viewerReady) return 0;
    const codigos = selections.map(s => s.codigo);
    const restrictSet = treeBranch ? new Set(treeBranch.leafDbIds) : null;
    setViewerStatus(`Coloreando${restrictSet ? ` "${treeBranch!.name}"` : ' modelo'} por ${NIVEL_LABEL[nivel]}…`);
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
        const itemProp = llavesDelProyecto(bimConfigRef.current).join(',');
        let dbIds = await viewerRef.current.resolveMonikers(monikers, itemProp);
        // resolveManyByProperty puede devolver dbIds de ENSAMBLAJE (donde vive la llave),
        // mientras que treeBranch.leafDbIds son dbIds HOJA — sin expandir a hojas antes de intersectar,
        // el restrictSet nunca calzaba y la restricción quedaba sin efecto (coloreaba todo el modelo).
        if (restrictSet) dbIds = viewerRef.current.getLeafDbIds(dbIds).filter(id => restrictSet.has(id));
        perGroupDbIds.push(dbIds);
        allDbIds.push(...dbIds);
        matched += dbIds.length;
      }
      // El "no se pudo colorear" tiene dos causas MUY distintas y el aviso debe decir cuál es:
      // (a) la base no tiene elementos vinculados a este nivel → falta clasificar, se pinta;
      // (b) la base SÍ los tiene pero ninguno existe en el modelo abierto → el NWD publicado
      //     no calza con los datos cargados (el caso SCPY: el mandante publicó otra tajada de
      //     la planta). Pintar no lo arregla — hay que pedir el modelo del alcance correcto.
      // En ambos casos, los colores que quedan a la vista son los propios del CAD.
      if (!matched) {
        // En modo silencioso (el coloreo automático de entrada) no se molesta al usuario: el
        // índice de llaves del visor puede no estar listo todavía y el panel reintenta solo.
        if (!opts?.silencioso) {
          setToast(esperados > 0
            ? `Los ${esperados.toLocaleString('es-CL')} elementos con ${NIVEL_LABEL[nivel]} de la base no están en este modelo 3D${restrictSet ? ' (en la rama seleccionada)' : ''}. El modelo publicado no calza con los datos cargados — los colores que ves son los del CAD, no la clasificación.`
            : `Ningún ${NIVEL_LABEL[nivel]} tiene elementos vinculados todavía. Usa 🖌️ en un ${NIVEL_LABEL[nivel]} de la lista y pinta elementos en el modelo para empezar.`);
        }
        return 0;
      }
      // Aísla con fantasma TODO lo clasificado vs. lo que no tiene este nivel asignado,
      // y recién después pinta cada grupo — así el color queda sobre fondo neutro, no sobre
      // los colores nativos del CAD (que hacían parecer "confeti" la vista anterior).
      viewerRef.current.showOnly(allDbIds, true);
      for (let i = 0; i < codigos.length; i++) {
        const dbIds = perGroupDbIds[i];
        if (!dbIds.length) continue;
        const { r, g, b, a } = selections[i];
        viewerRef.current.colorDbIds(dbIds, r, g, b, a);
      }
      // Reencuadra solo si el auto-zoom está activo — si el usuario lo desactivó, respeta su cámara actual.
      if (autoZoom) viewerRef.current.fitToView(allDbIds);
      if (restrictSet) setToast(`Coloreados ${matched.toLocaleString('es-CL')} elemento(s) de "${treeBranch!.name}" por ${NIVEL_LABEL[nivel]}.`);
      else if (matched < esperados * 0.9) setToast(`⚠ Coloreados ${matched.toLocaleString('es-CL')} de ${esperados.toLocaleString('es-CL')} esperados — puede que falten elementos en el modelo.`);
      else setToast(`Coloreados ${matched.toLocaleString('es-CL')} elementos por ${NIVEL_LABEL[nivel]}. Lo que se ve con su color nativo del CAD (sin tinte) no tiene ${NIVEL_LABEL[nivel]} asignado.`);
      return matched;
    } finally {
      setViewerStatus(null);
    }
  }, [viewerReady, fetchMonikerGroups, autoZoom, treeBranch]);

  // Enfoca la cámara en un código sin aislar — mantiene el modelo coloreado completo visible para ver el límite
  const focusOnCodigo = useCallback(async (nivel: Nivel, codigo: string) => {
    if (!viewerRef.current || !viewerReady) return;
    setViewerStatus('Ubicando…');
    try {
      const groups = await fetchMonikerGroups(nivel, [codigo]);
      const monikers = groups[codigo] ?? [];
      if (!monikers.length) { setToast(`Sin elementos para ${codigo} en el modelo.`); return; }
      const itemProp = llavesDelProyecto(bimConfigRef.current).join(',');
      const dbIds = await viewerRef.current.resolveMonikers(monikers, itemProp);
      if (dbIds.length) viewerRef.current.fitToView(dbIds);
      else setToast(`Sin elementos para ${codigo} en el modelo.`);
    } finally {
      setViewerStatus(null);
    }
  }, [viewerReady, fetchMonikerGroups]);

  /**
   * Aísla en el visor la geometría que todavía no pertenece a ningún paquete.
   * Es la pregunta que importa al cerrar un CWP: "¿qué me falta?". Se calcula contra el
   * modelo, no contra la tabla: los elementos que nunca se clasificaron no tienen fila.
   */
  const verSinAsignar = useCallback(async (nivel: Nivel) => {
    if (!viewerRef.current || !viewerReady) return;
    setViewerStatus('Buscando geometría sin asignar…');
    try {
      const mapping = await viewerRef.current.getExternalIdMapping();
      const entradas = Object.entries(mapping) as [string, number][];
      if (!entradas.length) { setToast('No se pudo leer la geometría del modelo.'); return; }

      // Solo la geometría cuenta: el mapping incluye también los nodos padre del árbol
      // (ensamblajes, categorías), que no se asignan a ningún paquete y aparecerían siempre
      // como "faltantes".
      const hojas = new Set(viewerRef.current.getLeafDbIds(entradas.map(([, dbId]) => dbId)));
      const conGeometria = entradas.filter(([, dbId]) => hojas.has(dbId));
      const universo = conGeometria.length ? conGeometria : entradas;

      const groups = await fetchMonikerGroups(nivel);
      const asignados = new Set(Object.values(groups).flat().map(m => String(m).trim()));

      // Primer descarte, directo y sin costo: cuando el identificador guardado ES el GUID del
      // modelo basta comparar strings. Evita construir un índice por cada llave sobre 114.000
      // elementos — que además, si todavía se está construyendo, no resuelve nada y haría
      // aparecer el modelo entero como sin asignar.
      const pendientes = universo.filter(([extId]) => !asignados.has(extId));

      // Lo que quede se resuelve por propiedad, pero solo con los identificadores que NO son
      // GUID (proyectos donde la llave es un TAG o un moniker).
      const porPropiedad = [...asignados].filter(m => !(m in mapping));
      let faltan = pendientes.map(([, dbId]) => dbId);
      if (porPropiedad.length) {
        const dbIdsProp = await viewerRef.current.resolveMonikers(porPropiedad, llavesDelProyecto(bimConfigRef.current).join(','));
        const yaEstan = new Set(dbIdsProp);
        faltan = faltan.filter(id => !yaEstan.has(id));
      }
      console.info(
        `[BIM][SIN-ASIGNAR] modelo: ${entradas.length} nodos → ${universo.length} con geometría | ` +
        `asignados en BD: ${asignados.size} (${asignados.size - porPropiedad.length} por GUID, ${porPropiedad.length} por propiedad) | ` +
        `faltan: ${faltan.length}`
      );
      if (!faltan.length) { setToast('Todo el modelo está asignado a un paquete.'); return; }

      lastIsolatedDbIdsRef.current = faltan;
      viewerRef.current.showOnly(faltan, ghostMode);
      viewerRef.current.colorDbIds(faltan, 1, 0.25, 0.25, 1);
      if (autoZoom) viewerRef.current.fitToView(faltan);
      const pct = ((faltan.length / universo.length) * 100).toFixed(0);
      setToast(`${faltan.length.toLocaleString('es-CL')} elementos sin ${NIVEL_LABEL[nivel]} (${pct}% del modelo) — en rojo.`);
    } finally {
      setViewerStatus(null);
    }
  }, [viewerReady, ghostMode, autoZoom, fetchMonikerGroups]);

  // Aísla, COLOREA (cada grupo con su color de la lista) y enfoca varios códigos a la vez
  const viewSelectedInViewer = useCallback(async (nivel: Nivel, selections: { codigo: string; r: number; g: number; b: number; a: number }[]) => {
    if (!viewerRef.current || !viewerReady || !selections.length) return;
    setViewerStatus(`Aislando ${selections.length} grupo(s)…`);
    try {
      const groups = await fetchMonikerGroups(nivel, selections.map(s => s.codigo));
      const allDbIds: number[] = [];
      const perSelDbIds: number[][] = [];
      let esperados = 0;
      for (const sel of selections) {
        const monikers = groups[sel.codigo] ?? [];
        esperados += monikers.length;
        if (!monikers.length) { perSelDbIds.push([]); continue; }
        const itemProp = llavesDelProyecto(bimConfigRef.current).join(',');
        const dbIds = await viewerRef.current.resolveMonikers(monikers, itemProp);
        perSelDbIds.push(dbIds);
        allDbIds.push(...dbIds);
      }
      if (!allDbIds.length) { setToast('No se encontraron esos elementos en el modelo.'); return; }
      lastIsolatedDbIdsRef.current = allDbIds;
      viewerRef.current.showOnly(allDbIds, ghostMode);
      for (let i = 0; i < selections.length; i++) {
        const dbIds = perSelDbIds[i];
        if (dbIds.length) viewerRef.current.colorDbIds(dbIds, selections[i].r, selections[i].g, selections[i].b, selections[i].a);
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

  const armPaint = useCallback((nivel: Nivel, codigo: string, r: number, g: number, b: number, a: number) => {
    setShowViewer(true);
    // La selección en curso NO se descarta al cambiar de paquete destino: se repinta con el
    // color nuevo y queda lista para guardarse ahí. Así se puede seleccionar una vez y repartir
    // entre varios CWP sin volver a elegir los elementos.
    const pendientes = [...paintedDbIdsRef.current];
    if (pendientes.length && viewerRef.current) viewerRef.current.colorDbIds(pendientes, r, g, b, a);
    setPaintTarget({ nivel, codigo, r, g, b, a });
  }, []);

  // Detener DEVUELVE el color original a lo pintado sin guardar. Antes solo olvidaba la
  // sesión y el color local quedaba en el visor: parecía guardado (o parecía que había que
  // reiniciar para soltarlo). Si no se guardó, no debe quedar rastro.
  const stopPaint = useCallback(() => {
    if (viewerRef.current && paintedDbIdsRef.current.size) {
      viewerRef.current.clearThemingForDbIds([...paintedDbIdsRef.current]);
    }
    setPaintTarget(null); setPaintCount(0); paintedDbIdsRef.current = new Set();
  }, []);

  // Quita el color de TODO lo seleccionado en esta sesión de pintura (todavía sin guardar) — para
  // corregirse antes de confirmar sin tener que "Detener" y rearmar la pintura desde cero.
  const resetPaintSelection = useCallback(() => {
    if (!viewerRef.current || !paintedDbIdsRef.current.size) return;
    viewerRef.current.clearThemingForDbIds([...paintedDbIdsRef.current]);
    paintedDbIdsRef.current = new Set();
    setPaintCount(0);
  }, []);

  // Guarda en la BD todo lo pintado en esta sesión — hasta este punto cada click solo coloreaba
  // LOCALMENTE (sin escribir nada), así se puede revisar la selección completa antes de confirmar.
  const savePaint = useCallback(async () => {
    if (!viewerRef.current || !paintTarget || !paintedDbIdsRef.current.size) return;
    const dbIds = [...paintedDbIdsRef.current];
    setViewerStatus(`Guardando ${dbIds.length} elemento(s) en ${NIVEL_LABEL[paintTarget.nivel]} ${paintTarget.codigo}…`);
    try {
      // La llave que identifica un elemento depende de la herramienta que lo originó: moniker
      // en SmartPlant, posición de ensamblaje en Tekla, ElementId en Revit, TAG en AutoCAD.
      // Se prueban en orden y, si el elemento no publica ninguna, se usa su GUID nativo, que
      // existe siempre. Todo va por el mismo camino y en lote: tratar el GUID como excepción
      // obligaba a una petición por elemento y no terminaba nunca en modelos grandes.
      const llaves = llavesDelProyecto(bimConfigRef.current);
      const props = await viewerRef.current.loadBulkElementProps(dbIds, llaves);

      const monikers: string[] = [];
      const monikerNames: Record<string, string> = {};
      const sinLlave: { dbId: number; name: string }[] = [];

      for (const p of props) {
        const v = valorDeLlave(p.props as Record<string, string>, llaves);
        if (v) { monikers.push(v); monikerNames[v] = p.name; }
        else sinLlave.push({ dbId: p.dbId, name: p.name });
      }

      let porGuid = 0;
      if (sinLlave.length) {
        const extMap = await viewerRef.current.getExternalIdMapping();
        const guidPorDbId = new Map<number, string>();
        for (const [ext, id] of Object.entries(extMap)) guidPorDbId.set(id as number, ext);
        for (const p of sinLlave) {
          const guid = guidPorDbId.get(p.dbId);
          if (!guid) continue;
          monikers.push(guid);
          monikerNames[guid] = p.name;
          porGuid++;
        }
      }

      if (!monikers.length) { setToast('No se pudo identificar ningún elemento del modelo.'); return; }

      const results = await runWithConcurrency(chunkMonikersForUrl(monikers), 6, async chunk => {
        const res = await fetchWithRetry('/api/mining-elementos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id, nivel: paintTarget.nivel, newValue: paintTarget.codigo, monikers: chunk,
            origen: `pintura_3d_${paintTarget.nivel}`, monikerNames,
          }),
        });
        const d = await parseJsonOrThrow(res);
        return { updated: d.updated ?? chunk.length, created: d.created ?? 0 };
      });
      const updated = results.reduce((a, r) => a + r.updated, 0);
      const creados = results.reduce((a, r) => a + r.created, 0);

      ajustarConteoLocal(paintTarget.codigo, updated + creados);
      // Un elemento pertenece a un solo CWP: se deja pintado con el color del destino para que
      // la vista coincida con lo guardado, sin esperar a recargar. El modo pintura sigue
      // activo, así se puede cambiar de paquete y seguir asignando sin rearmar nada.
      viewerRef.current.colorDbIds(dbIds, paintTarget.r, paintTarget.g, paintTarget.b, paintTarget.a);
      setToast(`✓ ${(updated + creados).toLocaleString('es-CL')} en ${paintTarget.codigo}`
        + (porGuid ? ` · ${porGuid.toLocaleString('es-CL')} por GUID` : '')
        + ' — elige otro CWP en la lista para seguir.');
      paintedDbIdsRef.current = new Set();
      setPaintCount(0);
      loadBuckets();
      loadFiltros();
      fetchRows();
      bumpRevisionRefresh();
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setViewerStatus(null);
    }
  }, [paintTarget, project_id, loadBuckets, loadFiltros, fetchRows, bumpRevisionRefresh, ajustarConteoLocal]);

  // Clasifica por GUID del modelo los elementos que no publican ninguna llave. Va en lote por
  // el endpoint general: una petición por elemento tardaba ~1 s cada una, así que una
  // selección de miles de piezas no llegaba a terminar.
  const assignSinMoniker = useCallback(async (items: { guid: string; name: string; dbId: number }[], codigo: string) => {
    if (!items.length) return 0;
    const nombres: Record<string, string> = {};
    for (const it of items) nombres[it.guid] = it.name;

    let ok = 0;
    try {
      const results = await runWithConcurrency(chunkMonikersForUrl(items.map(i => i.guid)), 6, async chunk => {
        const res = await fetchWithRetry('/api/mining-elementos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id, nivel: 'cwp', newValue: codigo, monikers: chunk,
            origen: 'clic_3d_guid', monikerNames: nombres,
          }),
        });
        const d = await parseJsonOrThrow(res);
        return (d.updated ?? 0) + (d.created ?? chunk.length);
      });
      ok = results.reduce((a, b) => a + b, 0);
      if (ok) viewerRef.current?.colorDbIds(items.map(i => i.dbId), 0.13, 0.59, 0.95, 1);
    } catch (e: any) {
      setToast(`Error al clasificar: ${e.message}`);
      return 0;
    }

    ajustarConteoLocal(codigo, ok);
    setToast(ok
      ? `✓ ${ok.toLocaleString('es-CL')} elemento(s) clasificado(s) en ${codigo} por GUID del modelo.`
      : 'No se pudo agregar — revisa que el CWP exista.');
    if (ok) { loadBuckets(); loadFiltros(); fetchRows(); bumpRevisionRefresh(); }
    return ok;
  }, [project_id, loadBuckets, loadFiltros, fetchRows, bumpRevisionRefresh, ajustarConteoLocal]);

  const onViewerSelectionChange = useCallback(async (dbIds: number[]) => {
    if (!viewerRef.current || !dbIds.length) return;

    if (paintTarget) {
      // Filtra a solo lo NUEVO: en multi-selección, Forge reporta el acumulado completo en cada click.
      // Solo COLOREA localmente acá — no escribe en la BD hasta que se apriete "Guardar" (savePaint).
      const newDbIds = dbIds.filter(id => !paintedDbIdsRef.current.has(id));
      if (!newDbIds.length) return;
      for (const id of newDbIds) paintedDbIdsRef.current.add(id);
      viewerRef.current.colorDbIds(newDbIds, paintTarget.r, paintTarget.g, paintTarget.b, paintTarget.a);
      setPaintCount(paintedDbIdsRef.current.size);
      return;
    }

    setTreeRevealDbId({ dbId: dbIds[0], ts: Date.now() });

    setViewerStatus('Buscando elemento…');
    try {
      const llavesClic = llavesDelProyecto(bimConfigRef.current);
      const props = await viewerRef.current.loadBulkElementProps(dbIds, llavesClic);
      const monikers = props.map(p => valorDeLlave(p.props as Record<string, string>, llavesClic)).filter(Boolean) as string[];
      if (!monikers.length) {
        // El elemento no publica ninguna llave conocida: se clasifica por su GUID del modelo.
        const extMap = await viewerRef.current.getExternalIdMapping();
        const dbIdToGuid = new Map<number, string>();
        for (const [ext, id] of Object.entries(extMap)) dbIdToGuid.set(id as number, ext);
        const items = props
          .filter(p => !valorDeLlave(p.props as Record<string, string>, llavesClic) && dbIdToGuid.get(p.dbId))
          .map(p => ({ guid: dbIdToGuid.get(p.dbId)!, name: p.name, dbId: p.dbId }));
        if (!items.length) {
          setToast('Este elemento no publica ninguna llave conocida ni GUID en el modelo — no se puede clasificar.');
          return;
        }
        if (quickSticky && quickCodigo) {
          await assignSinMoniker(items, quickCodigo);
          return;
        }
        setQuickAssign({ items });
        return;
      }
      setExactMonikers(monikers);
      setPage(0);
    } finally {
      setViewerStatus(null);
    }
  }, [paintTarget, quickSticky, quickCodigo, assignSinMoniker]);

  // Selecciona una rama del árbol nativo del modelo, la expande a dbIds HOJA (nunca el dbId de
  // ensamblaje crudo) y la aísla/colorea de previsualización — TODAVÍA no asigna nada en la BD.
  // Salvaguarda explícita pedida tras un bug de versiones anteriores que "pintaba todo el modelo
  // de un color": nunca se opera sobre la raíz del árbol, y SIEMPRE se exige confirmar viendo el
  // conteo real de elementos antes de escribir en mining_elementos.
  const previewTreeBranch = useCallback((dbId: number, name: string) => {
    if (!viewerRef.current || !viewerReady) return;
    const rootId = viewerRef.current.getRootId();
    if (dbId === rootId) {
      setToast('Esa es la raíz del modelo completo — abre la rama y elige un grupo más específico, no el modelo entero.');
      return;
    }
    setViewerStatus('Resolviendo rama…');
    try {
      const leafDbIds = viewerRef.current.getLeafDbIds([dbId]);
      if (!leafDbIds.length) { setToast('Esta rama no tiene elementos con geometría.'); return; }
      lastIsolatedDbIdsRef.current = leafDbIds;
      viewerRef.current.showOnly(leafDbIds, ghostMode);
      viewerRef.current.colorDbIds(leafDbIds, 0.13, 0.59, 0.95, 1);
      if (autoZoom) viewerRef.current.fitToView(leafDbIds);
      setTreeBranchTarget('');
      setTreeBranchError(null);
      setTreeBranch({ dbId, name, leafDbIds, monikers: null, sinMoniker: [] });
      // Resuelve los monikers EN SEGUIDA (no solo al guardar) para poder avisar de inmediato si la
      // rama no tiene SP3D_MONIKER (ej. geometría de referencia) — esto es lo que antes pasaba
      // desapercibido: el banner quedaba "pegado" sin avisar por qué no se guardó nada. Los que no
      // tienen moniker NO se descartan: se guardan con nombre+dbId para poder darlos de alta por GUID.
      const v = viewerRef.current;
      (async () => {
        const PROP_CHUNK = 2000;
        const llaves = llavesDelProyecto(bimConfigRef.current);
        const monikers: string[] = [];
        const sinMoniker: { dbId: number; name: string }[] = [];
        for (let i = 0; i < leafDbIds.length; i += PROP_CHUNK) {
          const chunk = leafDbIds.slice(i, i + PROP_CHUNK);
          const props = await v.loadBulkElementProps(chunk, llaves);
          for (const p of props) {
            const mk = valorDeLlave(p.props as Record<string, string>, llaves);
            if (mk) monikers.push(mk); else sinMoniker.push({ dbId: p.dbId, name: p.name });
          }
        }
        setTreeBranch(prev => (prev && prev.dbId === dbId ? { ...prev, monikers, sinMoniker } : prev));
      })();
    } finally {
      setViewerStatus(null);
    }
  }, [viewerReady, ghostMode, autoZoom]);

  const cancelTreeBranch = useCallback(() => {
    setTreeBranch(null);
    setTreeBranchError(null);
    lastIsolatedDbIdsRef.current = [];
    viewerRef.current?.showAll();
  }, []);

  const confirmTreeBranchAssign = useCallback(async () => {
    if (!treeBranch || treeBranch.monikers === null || !treeBranchTarget.trim()) return;
    const codigo = treeBranchTarget.trim();
    const chunks = chunkMonikersForUrl(treeBranch.monikers);
    const sinMoniker = treeBranch.sinMoniker;
    if (!chunks.length && !sinMoniker.length) return;
    setTreeBranchBusy(true);
    setTreeBranchError(null);
    setTreeBranchProgress(null);
    try {
      const totalSteps = chunks.length + (sinMoniker.length ? 1 : 0);
      let done = 0;
      setTreeBranchProgress({ done: 0, total: totalSteps });

      let updated = 0;
      if (chunks.length) {
        const results = await runWithConcurrency(chunks, 6, async chunk => {
          const res = await fetchWithRetry('/api/mining-elementos', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id, nivel: treeBranchNivel, newValue: codigo, monikers: chunk, origen: 'arbol_modelo' }),
          });
          const d = await parseJsonOrThrow(res);
          done += 1;
          setTreeBranchProgress({ done, total: totalSteps });
          return d.updated ?? chunk.length;
        });
        updated = results.reduce((a, b) => a + b, 0);
      }

      // Elementos que no publican ninguna llave: se clasifican por su GUID del modelo, que es
      // estable entre traducciones. Van por el MISMO endpoint en lote — una petición por
      // elemento hacía que una rama de 5.000 piezas no terminara nunca.
      let agregados = 0;
      if (sinMoniker.length && viewerRef.current) {
        const extMap = await viewerRef.current.getExternalIdMapping();
        const dbIdToGuid = new Map<number, string>();
        for (const [ext, id] of Object.entries(extMap)) dbIdToGuid.set(id as number, ext);

        const guids: string[] = [];
        const nombresPorGuid: Record<string, string> = {};
        for (const { dbId, name } of sinMoniker) {
          const guid = dbIdToGuid.get(dbId);
          if (!guid) continue;
          guids.push(guid);
          nombresPorGuid[guid] = name;
        }

        if (guids.length) {
          const results = await runWithConcurrency(chunkMonikersForUrl(guids), 6, async chunk => {
            const res = await fetchWithRetry('/api/mining-elementos', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                project_id, nivel: treeBranchNivel, newValue: codigo, monikers: chunk,
                origen: 'arbol_modelo_guid', monikerNames: nombresPorGuid,
              }),
            });
            const d = await parseJsonOrThrow(res);
            return (d.updated ?? 0) + (d.created ?? chunk.length);
          });
          agregados = results.reduce((a, b) => a + b, 0);
        }
        done += 1;
        setTreeBranchProgress({ done, total: totalSteps });
      }

      ajustarConteoLocal(codigo, updated + agregados);
      const partes: string[] = [];
      if (updated) partes.push(`${updated.toLocaleString('es-CL')} reasignado(s)`);
      if (agregados) partes.push(`${agregados.toLocaleString("es-CL")} clasificado(s) por GUID del modelo`);
      setToast(`${partes.join(' · ')} de "${treeBranch.name}" → ${codigo}.`);
      treeCoverageApiRef.current?.refresh(treeBranch.dbId);
      setTreeBranch(null);
      loadBuckets();
      loadFiltros();
      fetchRows();
      bumpRevisionRefresh();
    } catch (e: any) {
      setTreeBranchError(e.message);
    } finally {
      setTreeBranchBusy(false);
      setTreeBranchProgress(null);
    }
  }, [treeBranch, treeBranchTarget, treeBranchNivel, project_id, loadBuckets, loadFiltros, fetchRows, bumpRevisionRefresh, ajustarConteoLocal]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="h-full flex flex-col -m-6 bg-white">
      <div className="bg-white border-b border-[#EEEEEE] text-[#1A1A1A] px-6 py-3 flex items-center gap-4 shrink-0">
        <Link href={`/${org_slug}/projects/${project_id}/mineria`} className="text-white/70 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-[15px] font-extrabold">Editor de Elementos · Asignación CWP</h1>
        <div className="flex gap-5 ml-auto text-right">
          <div><div className="text-[15px] font-black">{totalElementos.toLocaleString('es-CL')}</div><div className="text-[9px] uppercase opacity-70">elementos</div></div>
          <div><div className="text-[15px] font-black text-amber-300">{totalSinCwp.toLocaleString('es-CL')}</div><div className="text-[9px] uppercase opacity-70">sin CWP</div></div>
        </div>
        <button
          onClick={openExportModal}
          className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0"
          title="Elegir columnas, previsualizar y exportar los elementos (respeta el filtro/búsqueda activo)"
        >
          <Download className="w-3.5 h-3.5" /> Exportar datos
        </button>
        <a
          href={`/api/mining-cambios-log?project_id=${project_id}&format=csv`}
          className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0"
          title="Exportar trazabilidad de cambios CWA/CV/CWP (CSV) para corregir en DataTools"
        >
          <Download className="w-3.5 h-3.5" /> Exportar cambios
        </a>
        <Link
          href={`/${org_slug}/projects/${project_id}/mineria/sistemas`}
          className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0"
        >
          <Layers className="w-3.5 h-3.5" /> Sistemas
        </Link>
        <Link
          href={`/${org_slug}/projects/${project_id}/mineria/atributos`}
          className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0"
          title="Qué atributos del Anexo 7 exige la etapa y cuántos elementos los traen"
        >
          <ClipboardCheck className="w-3.5 h-3.5" /> Anexo 7
        </Link>
        <button onClick={() => setShowPicker(true)} className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0">
          <Settings className="w-3.5 h-3.5" /> Modelo 3D
        </button>
      </div>

      {/* Qué falta y por qué — el estado del vínculo de cada elemento, a un click de filtrar y aislar */}
      {chipsEnlace.length > 0 && (
        <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-1.5 flex-wrap shrink-0">
          <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400 mr-1">Estado del vínculo</span>
          {chipsEnlace.map(c => {
            const activo = activeFilters.categoriaEnlace === c.valor;
            return (
              <button
                key={c.valor}
                onClick={() => toggleChip('categoriaEnlace', c.valor)}
                title={activo ? 'Quitar este filtro' : `Filtrar la tabla por ${c.valor} — después puedes aislarlos todos en 3D`}
                className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border transition',
                  activo ? 'bg-[#FF0000] text-white border-[#FF0000]' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100')}
              >
                {c.valor}
                <span className={cn('font-mono', activo ? 'text-white/80' : 'text-slate-400')}>{c.n.toLocaleString('es-CL')}</span>
              </button>
            );
          })}
          {chipsMotivo.length > 0 && (
            <>
              <span className="text-[9.5px] font-black uppercase tracking-wide text-slate-400 mx-1">o por motivo</span>
              {chipsMotivo.map(m => {
                const activo = activeFilters.motivoNoValido === m.valor;
                return (
                  <button
                    key={m.valor}
                    onClick={() => toggleChip('motivoNoValido', m.valor)}
                    title={m.valor}
                    className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium border transition max-w-[280px]',
                      activo ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100')}
                  >
                    <span className="truncate">{m.valor}</span>
                    <span className={cn('font-mono shrink-0', activo ? 'text-white/80' : 'text-amber-500')}>{m.n.toLocaleString('es-CL')}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar — colapsable para dejarle más espacio horizontal a la tabla */}
        {sidebarCollapsed ? (
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="Mostrar revisión de límites"
            className="w-7 bg-white border-r border-slate-200 shrink-0 flex flex-col items-center pt-3 hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4 text-slate-400" />
            <ListTree className="w-3.5 h-3.5 text-slate-400 mt-2" />
          </button>
        ) : (
          <div className="w-[480px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden">
            <div className="flex items-center justify-end border-b border-slate-200 shrink-0">
              <button onClick={() => setSidebarCollapsed(true)} title="Ocultar panel" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 shrink-0 mr-1 my-0.5">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-[3] min-h-0 flex flex-col overflow-hidden border-b border-slate-200">
              <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-200 shrink-0 flex items-center gap-1.5">
                <ListTree className="w-3.5 h-3.5 text-[#FF0000]" />
                <span className="text-[10.5px] font-black uppercase tracking-wide text-[#FF0000]">Revisión</span>
              </div>
              <RevisionPanel
                projectId={project_id} viewerReady={viewerReady}
                onColorByLevel={colorByLevel} onFocus={focusOnCodigo} onVerSinAsignar={verSinAsignar}
                onViewSelected={viewSelectedInViewer}
                paintTarget={paintTarget} onArmPaint={armPaint} onStopPaint={stopPaint}
                onCatalogChanged={loadCatalogs}
                onNivelChange={setActiveRevisionNivel}
                refreshSignal={revisionRefreshSignal}
              />
            </div>
            <div className="flex-[2] min-h-0 flex flex-col overflow-hidden">
              <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-200 shrink-0 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-[#FF0000]" />
                <span className="text-[10.5px] font-black uppercase tracking-wide text-[#FF0000]">Árbol del modelo</span>
              </div>
              <ModelTreePanel
                viewerRef={viewerRef} viewerReady={viewerReady} onPreviewBranch={previewTreeBranch} revealDbId={treeRevealDbId}
                projectId={project_id} activeNivel={activeRevisionNivel} coverageApiRef={treeCoverageApiRef}
                llaves={llavesDelProyecto(bimConfig)}
              />
            </div>
          </div>
        )}

        {/* Main — colapsable para dejarle todo el espacio horizontal al modelo 3D */}
        {tableCollapsed ? (
          <button
            onClick={() => setTableCollapsed(false)}
            title="Mostrar tabla"
            className="w-7 bg-white border-r border-slate-200 shrink-0 flex flex-col items-center pt-3 hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4 text-slate-400" />
            <ListTree className="w-3.5 h-3.5 text-slate-400 mt-2" />
          </button>
        ) : (
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-3">
            <button onClick={() => setTableCollapsed(true)} title="Ocultar tabla" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>
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
            <div className="relative">
              <button
                onClick={() => { setShowFiltersPanel(v => !v); setShowColsPanel(false); }}
                className={cn('inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-1.5 rounded-lg border',
                  Object.values(activeFilters).some(Boolean) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Filtros
                {Object.values(activeFilters).some(Boolean) && (
                  <span className="bg-blue-600 text-white rounded-full px-1.5 text-[9px]">{Object.values(activeFilters).filter(Boolean).length}</span>
                )}
              </button>
              {showFiltersPanel && (
                <div className="absolute z-30 top-full left-0 mt-1 w-[480px] max-h-[420px] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-3 flex flex-wrap gap-2">
                  {FILTER_FIELDS.map(f => (
                    <select
                      key={f.key}
                      value={activeFilters[f.key]}
                      onChange={e => onFilterChange(f.key, e.target.value)}
                      className="text-[10.5px] border border-slate-200 rounded-md px-1.5 py-1 bg-slate-50 text-slate-600 max-w-[150px]"
                    >
                      <option value="">{f.label}: todos</option>
                      {(filtros[f.columna] ?? []).map(o => (
                        <option key={o.valor} value={o.valor}>{o.valor} ({o.n.toLocaleString('es-CL')})</option>
                      ))}
                    </select>
                  ))}
                  {Object.values(activeFilters).some(Boolean) && (
                    <button onClick={() => { setActiveFilters(EMPTY_FILTERS); setPage(0); }} className="text-[10px] font-bold text-blue-600 flex items-center gap-1 w-full justify-center pt-1 border-t border-slate-100">
                      <X className="w-3 h-3" /> Limpiar filtros
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => { setShowColsPanel(v => !v); setShowFiltersPanel(false); }}
                className="inline-flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <Columns3 className="w-3.5 h-3.5" /> Columnas
              </button>
              {showColsPanel && (
                <div className="absolute z-30 top-full left-0 mt-1 w-64 max-h-[420px] overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-2">
                  <p className="text-[9.5px] text-slate-400 px-1.5 pb-1">Moniker, CWA, CV, CWP y Reasignar siempre están visibles.</p>
                  {COLUMN_DEFS.map(c => (
                    <label key={c.key} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer text-[11px]">
                      <input type="checkbox" checked={visibleCols.has(c.key)} onChange={() => toggleCol(c.key)} className="accent-blue-600" />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="text-[10.5px] text-slate-400 ml-auto">{total.toLocaleString('es-CL')} resultados</div>
            <div className="flex items-center gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-[10.5px] font-mono text-slate-500">{page + 1}/{pageCount}</span>
              <button disabled={page >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Reasignar TODOS los resultados que coinciden con el filtro/búsqueda actual (no solo la página visible) */}
          {hasActiveFilter && total > 0 && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold text-amber-800">{total.toLocaleString('es-CL')} resultado(s) coinciden con este filtro</span>
              <select
                value={bulkAllNivel} onChange={e => setBulkAllNivel(e.target.value as Nivel)}
                className="px-1.5 py-1 rounded text-[10.5px] border border-amber-300 bg-white text-amber-900"
              >
                {NIVELES.map(n => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}
              </select>
              <input
                list={bulkAllNivel === 'cwa' ? 'cwa-catalog-options' : bulkAllNivel === 'cv' ? 'cv-catalog-options' : bulkAllNivel === 'swp' ? 'swp-catalog-options' : 'cwp-catalog-options'}
                value={bulkAllTarget} onChange={e => setBulkAllTarget(e.target.value)}
                placeholder={`Nuevo ${NIVEL_LABEL[bulkAllNivel]}…`} className="px-2 py-1 rounded text-[11px] border border-amber-300 w-44"
              />
              <button
                onClick={applyToAllMatching} disabled={applying || !bulkAllTarget.trim()}
                className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded px-3 py-1 text-[11px] font-bold"
              >
                <ArrowRightCircle className="w-3.5 h-3.5" /> Reasignar TODOS ({total.toLocaleString('es-CL')})
              </button>
              <button
                onClick={isolateAllMatching} disabled={isolatingAll}
                className="inline-flex items-center gap-1.5 bg-amber-900/80 hover:bg-amber-900 disabled:opacity-40 text-white rounded px-3 py-1 text-[11px] font-bold"
              >
                {isolatingAll
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Aislando…</>
                  : <><Crosshair className="w-3.5 h-3.5" /> Aislar TODOS ({total.toLocaleString('es-CL')}) en 3D</>}
              </button>
              <button
                onClick={seleccionarTodosLosQueCoinciden} disabled={seleccionandoTodos}
                title="Pasa los resultados del filtro a la selección para poder taguearlos de una vez"
                className="inline-flex items-center gap-1.5 bg-[#FF0000] hover:bg-[#A00000] disabled:opacity-40 text-white rounded px-3 py-1 text-[11px] font-bold"
              >
                {seleccionandoTodos
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Seleccionando…</>
                  : <><Tag className="w-3.5 h-3.5" /> Seleccionar TODOS para taguear</>}
              </button>
            </div>
          )}

          {/* Selection toolbar */}
          {selected.size > 0 && (
            <div className="bg-[#1A1A1A] text-white px-4 py-2 flex items-center gap-3 shrink-0">
              <span className="text-[11px] font-bold">{selected.size} seleccionados</span>
              <input
                list="cwp-catalog-options" value={bulkTarget} onChange={e => setBulkTarget(e.target.value)}
                placeholder="Nuevo CWP…" className="px-2 py-1 rounded text-[11px] text-[#1A1A1A] w-44"
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

          {/* Tageo del grupo: nombre de terreno + línea de cobro, en una sola pasada */}
          {selected.size > 0 && (
            <TagLoteBar
              projectId={project_id}
              monikers={[...selected]}
              partidas={partidas}
              cwpsDeLaSeleccion={[...new Set(rows.filter(r => selected.has(r.sp3d_moniker)).map(r => r.cwp_id).filter(Boolean) as string[])]}
              onListo={(msg) => { setToast(msg); setSelected(new Set()); fetchRows(); loadFiltros(); }}
            />
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
                    <th className="px-2 py-2 text-left">CWA</th>
                    <th className="px-2 py-2 text-left">CV</th>
                    <th className="px-2 py-2 text-left">CWP</th>
                    <th className="px-2 py-2 text-left">SWP</th>
                    <th className="px-2 py-2 text-left">Moniker</th>
                    {COLUMN_DEFS.filter(c => visibleCols.has(c.key)).map(c => (
                      <th key={c.key} className="px-2 py-2 text-left">{c.label}</th>
                    ))}
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
                      visibleCols={visibleCols}
                      applying={applying}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        )}

        {/* Viewer drawer — toma todo el ancho disponible cuando la tabla está oculta */}
        {showViewer && (
          <div className={cn('flex shrink-0 relative', tableCollapsed && 'flex-1')} style={tableCollapsed ? undefined : { width: viewerWidth }}>
            {!tableCollapsed && (
              <div onMouseDown={onResizeStart} className="absolute left-0 top-0 h-full w-1.5 -ml-[3px] cursor-col-resize z-20 hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors" title="Arrastra para redimensionar" />
            )}
            <div className="flex-1 border-l border-slate-200 bg-[#060d1f] flex flex-col min-w-0">
              <div className="px-3 py-2 flex items-center justify-between bg-[#0a1628] border-b border-white/5 gap-2">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400 truncate">
                  {sweepOn
                    ? (paintTarget
                      ? `Arrastra un rectángulo para asignar todo lo que caiga dentro a ${paintTarget.codigo}`
                      : 'Arrastra un rectángulo sobre el modelo para barrer todo lo que caiga dentro')
                    : paintTarget
                      ? 'Click en un elemento para asignarlo'
                      : 'Click en un elemento para ubicarlo en el árbol y en la tabla'}
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
                    onClick={toggleSweep}
                    title={sweepOn
                      ? 'Barrido por cuadro ACTIVO: arrastra un rectángulo y se selecciona todo lo que cae dentro (también lo chico y lo tapado). Click para volver a girar la cámara con el arrastre'
                      : 'Barrido por cuadro: arrastra un rectángulo para seleccionar de una vez toda la geometría de un área — la forma rápida de marcar un límite de batería'}
                    className={cn('p-1.5 rounded flex items-center gap-1', sweepOn ? 'bg-[#FF0000]/80 text-white' : 'bg-white/10 text-slate-300')}
                  >
                    <SquareDashedMousePointer className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-bold uppercase">Barrido</span>
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
                  {paintTarget.a === 0 ? <Eraser className="w-3.5 h-3.5 shrink-0" /> : <Paintbrush className="w-3.5 h-3.5 shrink-0" />}
                  <span className="text-[10.5px] font-bold truncate">
                    {paintTarget.a === 0
                      ? `Restaurando color original → sacando de ${NIVEL_LABEL[paintTarget.nivel]} · ${paintCount} seleccionado(s) sin guardar`
                      : `Asignando a ${paintTarget.codigo} · ${paintCount} seleccionado(s) sin guardar — clic en otro CWP de la lista para cambiar de destino`}
                  </span>
                  <button
                    onClick={resetPaintSelection} disabled={!paintCount}
                    className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 rounded px-2 py-1 shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" /> Restablecer selección
                  </button>
                  <button
                    onClick={savePaint} disabled={!paintCount}
                    className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/25 hover:bg-emerald-500/35 disabled:opacity-40 rounded px-2 py-1 shrink-0"
                  >
                    <Save className="w-3 h-3" /> Guardar {paintCount > 0 ? `(${paintCount})` : ''}
                  </button>
                  <button onClick={stopPaint} className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 rounded px-2 py-1 shrink-0">
                    <StopCircle className="w-3 h-3" /> Detener
                  </button>
                </div>
              )}
              {treeBranch && (
                <div className="px-3 py-2 bg-blue-500/15 border-b border-blue-400/20 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-blue-200">
                    <GitBranch className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[10.5px] font-bold truncate">
                      Rama &quot;{treeBranch.name}&quot; · {treeBranch.leafDbIds.length.toLocaleString('es-CL')} elemento(s) aislado(s) — revisa el visor antes de confirmar
                    </span>
                    <button onClick={cancelTreeBranch} className="ml-auto text-slate-400 hover:text-white shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  {treeBranch.monikers === null ? (
                    <p className="text-[10.5px] text-blue-200 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Verificando cuántos elementos se pueden clasificar…</p>
                  ) : treeBranch.monikers.length === 0 && treeBranch.sinMoniker.length === 0 ? (
                    <p className="text-[10.5px] text-red-300 font-bold">Esta rama no tiene geometría clasificable.</p>
                  ) : (
                    <>
                      {treeBranch.monikers.length === 0 ? (
                        <p className="text-[10.5px] text-amber-300 font-bold">
                          Ninguno de los {treeBranch.leafDbIds.length.toLocaleString('es-CL')} elementos publica una llave de las configuradas ({llavesDelProyecto(bimConfig).slice(0, 3).join(', ')}…). Se clasifican por su GUID del modelo, que es estable entre versiones.
                        </p>
                      ) : treeBranch.sinMoniker.length > 0 && (
                        <p className="text-[10.5px] text-amber-300 font-bold">
                          {treeBranch.monikers.length.toLocaleString('es-CL')} se identifican por su llave · {treeBranch.sinMoniker.length.toLocaleString('es-CL')} por GUID del modelo.
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={treeBranchNivel}
                          onChange={e => { setTreeBranchNivel(e.target.value as Nivel); setTreeBranchTarget(''); }}
                          className="shrink-0 px-1.5 py-1 rounded text-[10.5px] border border-[#EEEEEE] bg-white text-[#1A1A1A]"
                        >
                          {NIVELES.map(n => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}
                        </select>
                        <select
                          value={treeBranchTarget} onChange={e => setTreeBranchTarget(e.target.value)}
                          className="min-w-0 flex-1 px-2 py-1 rounded text-[11px] text-[#1A1A1A] border border-[#EEEEEE] bg-white"
                        >
                          <option value="">— Elegir {NIVEL_LABEL[treeBranchNivel]} existente —</option>
                          {(treeBranchNivel === 'cwa' ? cwaCatalog.map(c => ({ codigo: c.codigo, label: c.nombre ? `${c.codigo} · ${c.nombre}` : c.codigo }))
                            : treeBranchNivel === 'cv' ? cvCatalog.map(c => ({ codigo: c.codigo, label: c.nombre ? `${c.codigo} · ${c.nombre}` : c.codigo }))
                            : treeBranchNivel === 'swp' ? swpCatalog.map(c => ({ codigo: c.codigo, label: c.nombre ? `${c.codigo} · ${c.nombre}` : c.codigo }))
                            : catalog.map(c => ({ codigo: c.cwp_id, label: c.cwp_nombre ? `${c.cwp_id} · ${c.cwp_nombre}` : c.cwp_id }))
                          ).map(o => <option key={o.codigo} value={o.codigo}>{o.label}</option>)}
                        </select>
                        <button
                          onClick={confirmTreeBranchAssign} disabled={treeBranchBusy || !treeBranchTarget.trim()}
                          className="shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded px-3 py-1 text-[11px] font-bold"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {treeBranchBusy
                            ? (treeBranchProgress ? `Guardando… ${treeBranchProgress.done}/${treeBranchProgress.total}` : 'Guardando…')
                            : `Guardar ${(treeBranch.monikers.length + treeBranch.sinMoniker.length).toLocaleString('es-CL')}`}
                        </button>
                      </div>
                    </>
                  )}
                  {treeBranchError && (
                    <p className="text-[10.5px] text-red-300 font-bold">Error al guardar: {treeBranchError}</p>
                  )}
                </div>
              )}
              {/* Asignación por clic: va en la franja del visor, no en un popup flotante — antes
                  salía sobre el modelo y tapaba la barra de herramientas justo cuando hay que mirar
                  la pieza que se está clasificando. */}
              {quickAssign && (
                <div className="px-3 py-2 bg-indigo-500/15 border-b border-indigo-400/20 flex items-center gap-2 flex-wrap">
                  <MousePointerClick className="w-3.5 h-3.5 shrink-0 text-indigo-200" />
                  <span className="text-[10.5px] font-bold text-indigo-200 truncate max-w-[220px]" title={quickAssign.items.map(i => i.name).join(', ')}>
                    {quickAssign.items.length === 1
                      ? (quickAssign.items[0].name || 'sin nombre')
                      : `${quickAssign.items.length.toLocaleString('es-CL')} elementos`}
                  </span>
                  <select
                    value={quickCodigo} onChange={e => setQuickCodigo(e.target.value)} autoFocus
                    className="min-w-0 flex-1 px-2 py-1 rounded text-[11px] text-[#1A1A1A] border border-[#EEEEEE] bg-white"
                  >
                    <option value="">— Elegir CWP destino —</option>
                    {catalog.map(c => (
                      <option key={c.cwp_id} value={c.cwp_id}>{c.cwp_nombre ? `${c.cwp_id} · ${c.cwp_nombre}` : c.cwp_id}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-[10px] text-indigo-200 cursor-pointer shrink-0">
                    <input type="checkbox" checked={quickSticky} onChange={e => setQuickSticky(e.target.checked)} className="accent-[#FF0000]" />
                    Seguir con cada clic
                  </label>
                  <button
                    disabled={quickSaving || !quickCodigo}
                    onClick={async () => {
                      setQuickSaving(true);
                      try { await assignSinMoniker(quickAssign.items, quickCodigo); setQuickAssign(null); }
                      finally { setQuickSaving(false); }
                    }}
                    className="shrink-0 inline-flex items-center gap-1.5 bg-[#FF0000] hover:bg-[#D00000] disabled:opacity-40 text-white rounded px-3 py-1 text-[11px] font-bold"
                  >
                    <Save className="w-3.5 h-3.5" /> {quickSaving ? 'Guardando…' : 'Asignar'}
                  </button>
                  <button onClick={() => setQuickAssign(null)} className="shrink-0 text-slate-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
              {quickSticky && quickCodigo && !quickAssign && (
                <div className="px-3 py-1.5 bg-indigo-500/15 border-b border-indigo-400/20 flex items-center gap-2 text-indigo-200">
                  <MousePointerClick className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[10.5px] font-bold truncate">Asignando a <span className="font-mono">{quickCodigo}</span> · haz clic en el modelo</span>
                  <button onClick={() => setQuickSticky(false)} className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold bg-indigo-500/20 hover:bg-indigo-500/30 rounded px-2 py-1 shrink-0">
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
                      viewerRef.current?.setDeepSelection(sweepOn);
                      setViewerReady(true);
                      // Precarga el índice de la llave principal del proyecto apenas el modelo
                      // está listo, en vez de esperar al primer clic en "Colorear": así el primer
                      // uso no se siente lento. Espera 1,5 s para no competir con el resto del
                      // onReady (árbol, paneles) mientras se pinta.
                      setTimeout(() => {
                        const principal = llavesDelProyecto(bimConfigRef.current)[0];
                        if (principal) viewerRef.current?.buildPropertyMultiIndex(principal).catch(() => {});
                      }, 1500);
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
      <datalist id="swp-catalog-options">
        {swpCatalog.map(c => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
      </datalist>

      {toast && (
        <div className="fixed bottom-5 right-5 bg-[#1A1A1A] text-white text-[11.5px] font-semibold px-4 py-2.5 rounded-lg shadow-xl z-50">{toast}</div>
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
      <ExportDataModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        columns={[...EXPORT_LOCKED_DEFS, ...COLUMN_DEFS]}
        lockedKeys={EXPORT_LOCKED_KEYS}
        rows={exportRows}
        loadingProgress={exportProgress}
        filename={`elementos_${project_id}.xlsx`}
      />
    </div>
  );
}
