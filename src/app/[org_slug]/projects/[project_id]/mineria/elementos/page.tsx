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
  CheckSquare, Square, ArrowRightCircle, Crosshair, Palette, ListTree, SlidersHorizontal, Columns3, Eraser, Save, Plus, GitBranch,
  Paintbrush, Ghost, Eye, MousePointerClick, StopCircle, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ForgeViewer = dynamic(() => import('@/components/awp/ForgeViewer'), { ssr: false });

const CWP_PROP = 'CWP';
// Clave real de enlace al modelo: la pestaña/categoría "DATA_EIMISA" escrita por el plugin
// DataTools trae la propiedad SP3D_MONIKER (no la genérica "SP3d Moniker" de SmartPlant).
const MONIKER_PROP = 'SP3D_MONIKER';
const PAGE_SIZE = 100;

// Reintenta solo fallas de RED transitorias (fetch() lanzando, ej. "TypeError: fetch failed" por un
// hiccup de conexión o un hot-reload del dev server) — las respuestas HTTP de error (4xx/5xx) NO
// reintentan aquí, esas ya se manejan en el código que llama según res.ok.
async function fetchWithRetry(url: string, init: RequestInit = {}, retries = 2, delayMs = 350): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// Lee el body UNA vez y lo intenta parsear como JSON. Si la respuesta no fue ok, lanza con el mensaje
// más informativo posible — el `error` de nuestra API si vino, o status+body crudo si la respuesta
// no es de nuestro código (ej. un 400 genérico de infraestructura/dev-server) — así un toast nunca
// muestra solo "Bad Request" sin ninguna pista de qué lo causó.
async function parseJsonOrThrow(res: Response): Promise<any> {
  const text = await res.text();
  let d: any = {};
  try { d = JSON.parse(text); } catch { /* respuesta no-JSON */ }
  if (!res.ok) throw new Error(d?.error ?? `HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`);
  return d;
}

// Supabase/PostgREST codifica los filtros `.in('col', [...])` en el QUERY STRING de la URL (no en el
// body) — con monikers que llevan caracteres especiales (=, !, #) cada uno se expande a %XX al
// codificarlo. Una lista de varios cientos de monikers fácilmente supera el límite de largo de URL
// del proxy/gateway y la request falla en silencio con 400/500 sin ningún detalle útil — la causa real
// de los "Bad Request" intermitentes al pintar/reasignar. Por eso agrupamos por PRESUPUESTO DE
// CARACTERES YA CODIFICADOS, no por una cantidad fija de elementos (que no protege si los monikers son largos).
function chunkMonikersForUrl(monikers: string[], maxEncodedChars = 6000): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let len = 0;
  for (const m of monikers) {
    const encLen = encodeURIComponent(m).length + 1;
    if (current.length && len + encLen > maxEncodedChars) {
      chunks.push(current);
      current = [];
      len = 0;
    }
    current.push(m);
    len += encLen;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

// Corre `fn` sobre `items` con un máximo de `limit` en vuelo a la vez — los PATCH por chunk son
// independientes entre sí (cada uno toca un subconjunto de monikers distinto), así que lanzarlos en
// paralelo (en vez de uno por uno, esperando cada respuesta antes de mandar la siguiente) reduce mucho
// el tiempo total en ramas grandes, sin abrir una conexión por cada chunk a la vez (saturaría Supabase).
async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

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
// Códigos "sin asignar"/contexto (SIN-CWA, SIN-CV, y los placeholders anidados "{padre}.SIN-CV"/".SIN-CWP")
// no se pintan con un color de la paleta: se pintan con alpha=0 (sin tinte) para RESTAURAR el color nativo
// del CAD — así "mover un elemento a Sin asignar" se ve y se siente como "sacarlo de la categoría", no
// como pintarlo de otro color más.
function isSinAsignar(codigo: string): boolean {
  return codigo.includes('SIN-');
}
// `colorearCreadas=false` deja las categorías NO oficiales (creadas desde la app, fuera del
// itemizado/DevPack original) con su color nativo del CAD (alpha=0) en vez de un color de la
// paleta — así se distinguen visualmente las áreas nuevas de las oficiales sin tener que adivinar.
function paintColorFor(codigo: string, idx: number, esOficial = true, colorearCreadas = true): { r: number; g: number; b: number; a: number } {
  if (isSinAsignar(codigo)) return { r: 0.6, g: 0.6, b: 0.6, a: 0 };
  if (!esOficial && !colorearCreadas) return { r: 0.6, g: 0.6, b: 0.6, a: 0 };
  return { ...colorForIndex(idx), a: 1 };
}
// Color único, casi negro, para "Vista de contraste": todo lo que NO es oficial (creadas + sin
// asignar) queda con este mismo tono para que las categorías oficiales (con su color de paleta)
// resalten con máximo contraste — pensado para revisar visualmente el límite de batería AWP.
const CONTRASTE_COLOR = { r: 0.04, g: 0.04, b: 0.04, a: 1 };
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}
interface PaintTarget { nivel: Nivel; codigo: string; r: number; g: number; b: number; a: number; }

interface Elemento {
  sp3d_moniker: string; name: string | null; tag_equipo: string | null; disciplina: string | null; descripcion: string | null;
  tipo_elemento: string | null; sector: string | null; area_unidad: string | null; cwp_id: string | null;
  cwa_id: string | null; cv_id: string | null;
  especialidad_cod: string | null; especialidad_nombre: string | null; categoria_constructiva: string | null;
  sitio: string | null; sistema_servicio: string | null; obra_tipo: string | null; obra_target: string | null;
  cwp_fuente: string | null; categoria_enlace: string | null; avance_pct: number | null; estado: string | null;
  alcance: string | null; item_o_adicional: string | null; vinculo_nivel: string | null;
  validado: string | null; motivo_no_valido: string | null; disciplina_modelo: string | null;
  disciplina_arbol: string | null; codigo_bmp: string | null; bmp_nombre: string | null; material: string | null;
  tag_unificado: string | null; iwp_id: string | null; ewp_id: string | null; comwp_id: string | null; wbs: string | null;
  pwp_elemento: string | null; obra_raw: string | null; cwp_arbol: string | null; vinculo_fuente: string | null;
  diametro_in: number | null; longitud_m: number | null; peso_kg: number | null; volumen_m3: number | null;
  especificacion: string | null; pipeline_linea: string | null; spool: string | null; pid: string | null; isometrico: string | null;
  este: number | null; norte: number | null; elevacion: number | null; valid_espacial: string | null;
  tiene_itemizado: string | null; tiene_bmp: string | null;
  requiere_alta_sp3d: boolean; guid_modelo: string | null;
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

// Columnas opcionales de la tabla (moniker + CWA/CV/CWP + reasignar son siempre visibles, no están aquí).
// "Por asignar"/SIN-* se detecta por contener "SIN-" en el valor — sirve tanto para los baldes globales
// (SIN-CWA, SIN-CWP.*) como para los placeholders anidados ("{padre}.SIN-CV", "{padre}.SIN-CWP").
const COLUMN_DEFS: { key: string; label: string; get: (e: Elemento) => string | number | null }[] = [
  { key: 'nombre', label: 'Nombre', get: e => e.name },
  { key: 'disciplina', label: 'Disciplina', get: e => e.disciplina },
  { key: 'categoria', label: 'Categoría', get: e => e.categoria_constructiva },
  { key: 'descripcion', label: 'Descripción', get: e => e.descripcion },
  { key: 'sector', label: 'Sector', get: e => e.sector },
  { key: 'obra', label: 'Obra', get: e => e.obra_tipo },
  { key: 'avance', label: 'Avance', get: e => e.avance_pct != null ? `${e.avance_pct}%` : '—' },
  { key: 'tagEquipo', label: 'Tag equipo', get: e => e.tag_equipo },
  { key: 'tipoElemento', label: 'Tipo elemento', get: e => e.tipo_elemento },
  { key: 'especialidad', label: 'Especialidad', get: e => e.especialidad_nombre ?? e.especialidad_cod },
  { key: 'sitio', label: 'Sitio', get: e => e.sitio },
  { key: 'areaUnidad', label: 'Unidad', get: e => e.area_unidad },
  { key: 'sistema', label: 'Sistema', get: e => e.sistema_servicio },
  { key: 'obraTarget', label: 'Obra target', get: e => e.obra_target },
  { key: 'estado', label: 'Estado', get: e => e.estado },
  { key: 'alcance', label: 'Alcance', get: e => e.alcance },
  { key: 'itemOAdicional', label: 'Item/Adicional', get: e => e.item_o_adicional },
  { key: 'validado', label: 'Validado', get: e => e.validado },
  { key: 'motivoNoValido', label: 'Motivo no válido', get: e => e.motivo_no_valido },
  { key: 'disciplinaModelo', label: 'Disciplina modelo', get: e => e.disciplina_modelo },
  { key: 'disciplinaArbol', label: 'Disciplina árbol', get: e => e.disciplina_arbol },
  { key: 'cwpFuente', label: 'CWP fuente', get: e => e.cwp_fuente },
  { key: 'vinculoNivel', label: 'Vínculo nivel', get: e => e.vinculo_nivel },
  { key: 'categoriaEnlace', label: 'Categoría enlace', get: e => e.categoria_enlace },
  { key: 'codigoBmp', label: 'Código BMP', get: e => e.codigo_bmp },
  { key: 'bmpNombre', label: 'BMP nombre', get: e => e.bmp_nombre },
  { key: 'material', label: 'Material', get: e => e.material },
  { key: 'tagUnificado', label: 'Tag (BD_DataTools)', get: e => e.tag_unificado },
  { key: 'iwpId', label: 'IWP', get: e => e.iwp_id },
  { key: 'ewpId', label: 'EWP', get: e => e.ewp_id },
  { key: 'comwpId', label: 'COMWP', get: e => e.comwp_id },
  { key: 'wbs', label: 'WBS', get: e => e.wbs },
  { key: 'pwpElemento', label: 'PWP', get: e => e.pwp_elemento },
  { key: 'obraRaw', label: 'Obra (raw)', get: e => e.obra_raw },
  { key: 'cwpArbol', label: 'CWP árbol', get: e => e.cwp_arbol },
  { key: 'vinculoFuente', label: 'Vínculo fuente', get: e => e.vinculo_fuente },
  { key: 'tieneItemizado', label: 'Tiene itemizado', get: e => e.tiene_itemizado },
  { key: 'tieneBmp', label: 'Tiene BMP', get: e => e.tiene_bmp },
  { key: 'especificacion', label: 'Especificación', get: e => e.especificacion },
  { key: 'pipelineLinea', label: 'Línea', get: e => e.pipeline_linea },
  { key: 'spool', label: 'Spool', get: e => e.spool },
  { key: 'pid', label: 'P&ID', get: e => e.pid },
  { key: 'isometrico', label: 'Isométrico', get: e => e.isometrico },
  { key: 'diametroIn', label: 'Diámetro (in)', get: e => e.diametro_in },
  { key: 'longitudM', label: 'Longitud (m)', get: e => e.longitud_m },
  { key: 'pesoKg', label: 'Peso (kg)', get: e => e.peso_kg },
  { key: 'volumenM3', label: 'Volumen (m³)', get: e => e.volumen_m3 },
  { key: 'este', label: 'Este', get: e => e.este },
  { key: 'norte', label: 'Norte', get: e => e.norte },
  { key: 'elevacion', label: 'Elevación', get: e => e.elevacion },
  { key: 'validEspacial', label: 'Válido espacial', get: e => e.valid_espacial },
  { key: 'requiereAltaSp3d', label: 'Requiere alta SmartPlant', get: e => e.requiere_alta_sp3d ? 'SI' : 'NO' },
  { key: 'guidModelo', label: 'GUID modelo', get: e => e.guid_modelo },
];
const DEFAULT_COLS = ['nombre', 'disciplina', 'categoria', 'descripcion', 'sector', 'obra', 'avance'];
const COLS_STORAGE_KEY = 'mineria-elementos-columnas-v1';

// Preferencias del panel de Revisión (pestaña CWA/CV/CWP, filtro oficiales/creadas, etc.) — se
// guardan por proyecto para no tener que reconfigurarlas cada vez que se entra a la página.
interface RevisionPrefs {
  nivel: Nivel;
  mostrarFiltro: 'todas' | 'oficiales' | 'creadas';
  colorearCreadas: boolean;
  sidebarTab: 'revision' | 'arbol';
}
function revisionPrefsKey(projectId: string): string { return `mineria-revision-prefs-v1:${projectId}`; }
function loadRevisionPrefs(projectId: string): Partial<RevisionPrefs> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(revisionPrefsKey(projectId)) ?? '{}'); } catch { return {}; }
}
// Lee-combina-escribe: el panel de Revisión y la página principal guardan campos distintos del mismo
// objeto de preferencias — un overwrite directo haría que uno le pisara los campos al otro.
function saveRevisionPrefs(projectId: string, partial: Partial<RevisionPrefs>) {
  if (typeof window === 'undefined') return;
  const current = loadRevisionPrefs(projectId);
  window.localStorage.setItem(revisionPrefsKey(projectId), JSON.stringify({ ...current, ...partial }));
}

function levelBadge(value: string | null): { texto: string; cls: string } {
  if (!value) return { texto: '—', cls: 'bg-red-50 text-red-500' };
  if (value.includes('SIN-')) return { texto: value, cls: 'bg-amber-50 text-amber-700' };
  return { texto: value, cls: 'bg-emerald-50 text-emerald-700' };
}

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'revision' | 'arbol'>(
    () => (loadRevisionPrefs(project_id).sidebarTab as 'revision' | 'arbol' | undefined) ?? 'revision');
  useEffect(() => { if (project_id) saveRevisionPrefs(project_id, { sidebarTab }); }, [project_id, sidebarTab]);
  const [treeBranch, setTreeBranch] = useState<{ dbId: number; name: string; leafDbIds: number[]; monikers: string[] | null; sinMoniker: { dbId: number; name: string }[] } | null>(null);
  const [treeBranchNivel, setTreeBranchNivel] = useState<Nivel>('cwp');
  const [treeBranchTarget, setTreeBranchTarget] = useState('');
  const [treeBranchBusy, setTreeBranchBusy] = useState(false);
  const [treeBranchError, setTreeBranchError] = useState<string | null>(null);
  const [treeBranchProgress, setTreeBranchProgress] = useState<{ done: number; total: number } | null>(null);
  const [treeRevealDbId, setTreeRevealDbId] = useState<{ dbId: number; ts: number } | null>(null);
  const [search, setSearch] = useState('');
  const [exactMonikers, setExactMonikers] = useState<string[] | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({});
  const [activeFilters, setActiveFilters] = useState<FiltrosState>(EMPTY_FILTERS);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showColsPanel, setShowColsPanel] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set(DEFAULT_COLS);
    try {
      const saved = window.localStorage.getItem(COLS_STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set(DEFAULT_COLS);
    } catch { return new Set(DEFAULT_COLS); }
  });
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
  const [paintTarget, setPaintTarget] = useState<PaintTarget | null>(null);
  const [paintCount, setPaintCount] = useState(0);

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

  // Catálogos usados por los datalists/selects de "reasignar a…" (CWA/CV/CWP) en toda la página —
  // se refrescan tras crear una categoría nueva para que aparezca de inmediato como opción elegible.
  const loadCatalogs = useCallback(() => {
    if (!project_id) return;
    fetch(`/api/mining-cwp-catalog?project_id=${project_id}`).then(parseJsonOrThrow).then(d => setCatalog(d.catalog ?? [])).catch(() => {});
    fetch(`/api/mining-revision?project_id=${project_id}&nivel=cwa`).then(parseJsonOrThrow).then(d =>
      setCwaCatalog((d.items ?? []).map((it: any) => ({ codigo: it.codigo, nombre: it.nombre })))).catch(() => {});
    fetch(`/api/mining-revision?project_id=${project_id}&nivel=cv`).then(parseJsonOrThrow).then(d =>
      setCvCatalog((d.items ?? []).map((it: any) => ({ codigo: it.codigo, nombre: it.nombre })))).catch(() => {});
  }, [project_id]);

  useEffect(() => {
    if (!project_id) return;
    loadBuckets();
    loadCatalogs();
    fetch(`/api/mining-elementos/filtros?project_id=${project_id}`).then(parseJsonOrThrow).then(d => setFiltros(d.filtros ?? {})).catch(() => {});
  }, [project_id, loadBuckets, loadCatalogs]);

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
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setApplying(false);
    }
  }, [bulkTarget, selected, project_id, fetchRows, loadBuckets]);

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
    } catch (e: any) {
      setToast(`Error: ${e.message}`);
    } finally {
      setApplying(false);
    }
  }, [currentMatch, bulkAllTarget, bulkAllNivel, project_id, fetchRows, loadBuckets]);

  const applyToRow = useCallback(async (moniker: string, target: string) => {
    if (!target.trim()) return;
    setApplying(true);
    try {
      const res = await fetchWithRetry('/api/mining-elementos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, newCwpId: target.trim(), monikers: [moniker] }),
      });
      const d = await parseJsonOrThrow(res);
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
      if (dbIds.length) {
        lastIsolatedDbIdsRef.current = dbIds;
        viewerRef.current.showOnly(dbIds, ghostMode);
        viewerRef.current.fitToView(dbIds);
      } else setToast('No se encontraron esos elementos en el modelo (revisa el nombre de propiedad SP3D_MONIKER en DATA_EIMISA).');
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

  // Colorea TODO el modelo por nivel (CWA/CV/CWP) — cada grupo en SU color, y todo lo no
  // clasificado en ese nivel queda atenuado (fantasma), para ver limpio el límite entre áreas.
  const colorByLevel = useCallback(async (nivel: Nivel, selections: { codigo: string; r: number; g: number; b: number; a: number }[]) => {
    if (!viewerRef.current || !viewerReady) return;
    const codigos = selections.map(s => s.codigo);
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
        const { r, g, b, a } = selections[i];
        viewerRef.current.colorDbIds(dbIds, r, g, b, a);
      }
      // Reencuadra solo si el auto-zoom está activo — si el usuario lo desactivó, respeta su cámara actual.
      if (autoZoom) viewerRef.current.fitToView(allDbIds);
      if (matched < esperados * 0.9) setToast(`⚠ Coloreados ${matched.toLocaleString('es-CL')} de ${esperados.toLocaleString('es-CL')} esperados — puede que falten elementos en el modelo.`);
      else setToast(`Coloreados ${matched.toLocaleString('es-CL')} elementos por ${NIVEL_LABEL[nivel]}. Lo que se ve con su color nativo del CAD (sin tinte) no tiene ${NIVEL_LABEL[nivel]} asignado.`);
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
        const dbIds = await viewerRef.current.resolveManyByProperty(MONIKER_PROP, monikers);
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
    setPaintCount(0);
    paintedDbIdsRef.current = new Set();
    setPaintTarget({ nivel, codigo, r, g, b, a });
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
        const monikers = props.filter(p => p.props[MONIKER_PROP]).map(p => p.props[MONIKER_PROP]);
        const sinMoniker = props.filter(p => !p.props[MONIKER_PROP]);
        if (!monikers.length && !sinMoniker.length) { setToast('No se pudo leer el elemento.'); return; }

        let updated = 0;
        if (monikers.length) {
          const results = await runWithConcurrency(chunkMonikersForUrl(monikers), 6, async chunk => {
            const res = await fetchWithRetry('/api/mining-elementos', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                project_id, nivel: paintTarget.nivel, newValue: paintTarget.codigo, monikers: chunk,
                origen: `pintura_3d_${paintTarget.nivel}`,
              }),
            });
            const d = await parseJsonOrThrow(res);
            return d.updated ?? chunk.length;
          });
          updated = results.reduce((a, b) => a + b, 0);
        }

        // Elementos sin SP3D_MONIKER (nunca se exportaron bien desde SmartPlant 3D): en vez de bloquear,
        // se agregan con un moniker sintético basado en su GUID nativo del modelo y quedan marcados
        // `requiere_alta_sp3d=true` — aparecerán en "Exportar cambios" para darlos de alta en SmartPlant.
        let agregados = 0;
        if (sinMoniker.length) {
          const extMap = await viewerRef.current.getExternalIdMapping();
          const dbIdToGuid = new Map<number, string>();
          for (const [ext, id] of Object.entries(extMap)) dbIdToGuid.set(id, ext);
          for (const p of sinMoniker) {
            const guid = dbIdToGuid.get(p.dbId);
            if (!guid) continue;
            try {
              const res = await fetchWithRetry('/api/mining-elementos/agregar-sin-moniker', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_id, nivel: paintTarget.nivel, codigo: paintTarget.codigo, guid, name: p.name }),
              });
              await parseJsonOrThrow(res);
              agregados++;
            } catch { /* sigue con el resto aunque uno falle */ }
          }
        }

        for (const id of newDbIds) paintedDbIdsRef.current.add(id);
        viewerRef.current.colorDbIds(newDbIds, paintTarget.r, paintTarget.g, paintTarget.b, paintTarget.a);
        setPaintCount(c => c + updated + agregados);
        if (agregados) {
          setToast(`${updated} reasignado(s) · ${agregados} agregado(s) SIN SP3D_MONIKER — quedan marcados para dar de alta en SmartPlant 3D (revisa "Exportar cambios").`);
        }
        loadBuckets();
      } catch (e: any) {
        setToast(`Error: ${e.message}`);
      } finally {
        setViewerStatus(null);
      }
      return;
    }

    if (sidebarTab === 'arbol') setTreeRevealDbId({ dbId: dbIds[0], ts: Date.now() });

    setViewerStatus('Buscando elemento…');
    try {
      const props = await viewerRef.current.loadBulkElementProps(dbIds, [MONIKER_PROP]);
      const monikers = props.map(p => p.props[MONIKER_PROP]).filter(Boolean);
      if (!monikers.length) {
        setToast('Este elemento no tiene SP3D_MONIKER — no se puede ubicar en la tabla. Si quieres clasificarlo igual, arma pintura (🖌️) en un CWA/CV/CWP y haz click en él de nuevo: quedará marcado para dar de alta en SmartPlant 3D.');
        return;
      }
      setExactMonikers(monikers);
      setPage(0);
    } finally {
      setViewerStatus(null);
    }
  }, [paintTarget, project_id, loadBuckets, sidebarTab]);

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
        const monikers: string[] = [];
        const sinMoniker: { dbId: number; name: string }[] = [];
        for (let i = 0; i < leafDbIds.length; i += PROP_CHUNK) {
          const chunk = leafDbIds.slice(i, i + PROP_CHUNK);
          const props = await v.loadBulkElementProps(chunk, [MONIKER_PROP]);
          for (const p of props) {
            const mk = p.props[MONIKER_PROP];
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

      // Elementos sin SP3D_MONIKER en esta rama: se agregan con un moniker sintético basado en su
      // GUID nativo del modelo y quedan marcados requiere_alta_sp3d=true para "Exportar cambios".
      let agregados = 0;
      if (sinMoniker.length && viewerRef.current) {
        const extMap = await viewerRef.current.getExternalIdMapping();
        const dbIdToGuid = new Map<number, string>();
        for (const [ext, id] of Object.entries(extMap)) dbIdToGuid.set(id, ext);
        const results = await runWithConcurrency(sinMoniker, 6, async ({ dbId, name }): Promise<number> => {
          const guid = dbIdToGuid.get(dbId);
          if (!guid) return 0;
          const res = await fetchWithRetry('/api/mining-elementos/agregar-sin-moniker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id, nivel: treeBranchNivel, codigo, guid, name }),
          });
          await parseJsonOrThrow(res);
          return 1;
        });
        agregados = results.reduce((a, b) => a + b, 0);
        done += 1;
        setTreeBranchProgress({ done, total: totalSteps });
      }

      const partes: string[] = [];
      if (updated) partes.push(`${updated.toLocaleString('es-CL')} reasignado(s)`);
      if (agregados) partes.push(`${agregados.toLocaleString('es-CL')} agregado(s) sin SP3D_MONIKER (quedan para dar de alta en SmartPlant 3D)`);
      setToast(`${partes.join(' · ')} de "${treeBranch.name}" → ${codigo}.`);
      setTreeBranch(null);
      loadBuckets();
      fetchRows();
    } catch (e: any) {
      setTreeBranchError(e.message);
    } finally {
      setTreeBranchBusy(false);
      setTreeBranchProgress(null);
    }
  }, [treeBranch, treeBranchTarget, treeBranchNivel, project_id, loadBuckets, fetchRows]);

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
          <div className="w-[320px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden">
            <div className="flex items-center border-b border-slate-200 shrink-0">
              <button
                onClick={() => setSidebarTab('revision')}
                className={cn('flex-1 py-2 text-[10.5px] font-black uppercase tracking-wide flex items-center justify-center gap-1.5',
                  sidebarTab === 'revision' ? 'text-[#0D47A1] border-b-2 border-[#0D47A1]' : 'text-slate-400 hover:text-slate-600')}
              >
                <ListTree className="w-3.5 h-3.5" /> Revisión
              </button>
              <button
                onClick={() => setSidebarTab('arbol')}
                className={cn('flex-1 py-2 text-[10.5px] font-black uppercase tracking-wide flex items-center justify-center gap-1.5',
                  sidebarTab === 'arbol' ? 'text-[#0D47A1] border-b-2 border-[#0D47A1]' : 'text-slate-400 hover:text-slate-600')}
              >
                <GitBranch className="w-3.5 h-3.5" /> Árbol modelo
              </button>
              <button onClick={() => setSidebarCollapsed(true)} title="Ocultar panel" className="p-1.5 rounded hover:bg-slate-100 text-slate-400 shrink-0 mr-1">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            {sidebarTab === 'revision' ? (
              <RevisionPanel
                projectId={project_id} viewerReady={viewerReady}
                onColorByLevel={colorByLevel} onFocus={focusOnCodigo}
                onViewSelected={viewSelectedInViewer}
                paintTarget={paintTarget} onArmPaint={armPaint} onStopPaint={stopPaint}
                onCatalogChanged={loadCatalogs}
              />
            ) : (
              <ModelTreePanel viewerRef={viewerRef} viewerReady={viewerReady} onPreviewBranch={previewTreeBranch} revealDbId={treeRevealDbId} />
            )}
          </div>
        )}

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
              <button
                onClick={isolateAllMatching} disabled={isolatingAll}
                className="inline-flex items-center gap-1.5 bg-amber-900/80 hover:bg-amber-900 disabled:opacity-40 text-white rounded px-3 py-1 text-[11px] font-bold"
              >
                {isolatingAll
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Aislando…</>
                  : <><Crosshair className="w-3.5 h-3.5" /> Aislar TODOS ({total.toLocaleString('es-CL')}) en 3D</>}
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
                    <th className="px-2 py-2 text-left">CWA</th>
                    <th className="px-2 py-2 text-left">CV</th>
                    <th className="px-2 py-2 text-left">CWP</th>
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

        {/* Viewer drawer */}
        {showViewer && (
          <div className="flex shrink-0 relative" style={{ width: viewerWidth }}>
            <div onMouseDown={onResizeStart} className="absolute left-0 top-0 h-full w-1.5 -ml-[3px] cursor-col-resize z-20 hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors" title="Arrastra para redimensionar" />
            <div className="flex-1 border-l border-slate-200 bg-[#060d1f] flex flex-col min-w-0">
              <div className="px-3 py-2 flex items-center justify-between bg-[#0a1628] border-b border-white/5 gap-2">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400 truncate">
                  {paintTarget
                    ? 'Click en un elemento para asignarlo'
                    : sidebarTab === 'arbol'
                      ? 'Click en un elemento para ubicarlo en el árbol y en la tabla'
                      : 'Click en un elemento para ubicarlo en la tabla'}
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
                  {paintTarget.a === 0 ? <Eraser className="w-3.5 h-3.5 shrink-0" /> : <Paintbrush className="w-3.5 h-3.5 shrink-0" />}
                  <span className="text-[10.5px] font-bold truncate">
                    {paintTarget.a === 0
                      ? `Restaurando color original → sacando de ${NIVEL_LABEL[paintTarget.nivel]} · ${paintCount} restaurado(s)`
                      : `Pintura activa → ${NIVEL_LABEL[paintTarget.nivel]} ${paintTarget.codigo} · ${paintCount} asignado(s)`}
                  </span>
                  <button onClick={stopPaint} className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 rounded px-2 py-1 shrink-0">
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
                    <p className="text-[10.5px] text-blue-200 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Verificando cuántos elementos se pueden clasificar (SP3D_MONIKER)…</p>
                  ) : treeBranch.monikers.length === 0 && treeBranch.sinMoniker.length === 0 ? (
                    <p className="text-[10.5px] text-red-300 font-bold">Esta rama no tiene geometría clasificable.</p>
                  ) : (
                    <>
                      {treeBranch.monikers.length === 0 ? (
                        <p className="text-[10.5px] text-amber-300 font-bold">
                          0 de {treeBranch.leafDbIds.length.toLocaleString('es-CL')} elementos tienen SP3D_MONIKER (DATA_EIMISA) — probablemente nunca se exportaron bien desde SmartPlant 3D. Se agregarán igual usando su GUID del modelo; quedarán marcados para dar de alta en SmartPlant 3D al exportar.
                        </p>
                      ) : treeBranch.sinMoniker.length > 0 && (
                        <p className="text-[10.5px] text-amber-300 font-bold">
                          {treeBranch.monikers.length.toLocaleString('es-CL')} con SP3D_MONIKER se reasignarán normal · {treeBranch.sinMoniker.length.toLocaleString('es-CL')} sin SP3D_MONIKER se agregarán por GUID (dar de alta en SmartPlant 3D).
                        </p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={treeBranchNivel}
                          onChange={e => { setTreeBranchNivel(e.target.value as Nivel); setTreeBranchTarget(''); }}
                          className="shrink-0 px-1.5 py-1 rounded text-[10.5px] border border-blue-300/40 bg-white text-[#08203F]"
                        >
                          {(['cwa', 'cv', 'cwp'] as Nivel[]).map(n => <option key={n} value={n}>{NIVEL_LABEL[n]}</option>)}
                        </select>
                        <select
                          value={treeBranchTarget} onChange={e => setTreeBranchTarget(e.target.value)}
                          className="min-w-0 flex-1 px-2 py-1 rounded text-[11px] text-[#08203F] border border-blue-300/40 bg-white"
                        >
                          <option value="">— Elegir {NIVEL_LABEL[treeBranchNivel]} existente —</option>
                          {(treeBranchNivel === 'cwa' ? cwaCatalog.map(c => ({ codigo: c.codigo, label: c.nombre ? `${c.codigo} · ${c.nombre}` : c.codigo }))
                            : treeBranchNivel === 'cv' ? cvCatalog.map(c => ({ codigo: c.codigo, label: c.nombre ? `${c.codigo} · ${c.nombre}` : c.codigo }))
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

function LevelCell({ value }: { value: string | null }) {
  const { texto, cls } = levelBadge(value);
  return (
    <td className="px-2 py-1.5">
      <span className={cn('px-1.5 py-0.5 rounded text-[9.5px] font-bold font-mono inline-block max-w-[140px] truncate', cls)} title={texto}>
        {texto}
      </span>
    </td>
  );
}

function RowItem({ r, checked, onToggle, onApply, onIsolate, visibleCols, applying }: {
  r: Elemento; checked: boolean; onToggle: () => void; onApply: (target: string) => void; onIsolate: () => void;
  visibleCols: Set<string>; applying: boolean;
}) {
  const [target, setTarget] = useState('');
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      <td className="px-2 py-1.5"><button onClick={onToggle}>{checked ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5 text-slate-300" />}</button></td>
      <LevelCell value={r.cwa_id} />
      <LevelCell value={r.cv_id} />
      <LevelCell value={r.cwp_id} />
      <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500 max-w-[160px] truncate">
        <span className="truncate" title={r.sp3d_moniker}>{r.sp3d_moniker}</span>
        {r.requiere_alta_sp3d && (
          <span className="ml-1 px-1 py-0 rounded text-[8px] font-black uppercase bg-red-100 text-red-600" title={`Sin SP3D_MONIKER real — dar de alta en SmartPlant 3D (GUID: ${r.guid_modelo ?? '—'})`}>
            Dar de alta
          </span>
        )}
      </td>
      {COLUMN_DEFS.filter(c => visibleCols.has(c.key)).map(c => (
        <td key={c.key} className="px-2 py-1.5 max-w-[200px] truncate" title={String(c.get(r) ?? '')}>{c.get(r)}</td>
      ))}
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
  codigo: string; nombre: string | null; nElementos: number; enCatalogo: boolean; esOficial: boolean;
}

// CWP_ID = {CV}.{DISC}{NNN} (ej. 312101.D001) → CV = "312101" → CWA = CV[:4] = "3121"
// (misma convención que deriveCwaCv en /api/mining-elementos) — usado para armar el árbol CWA→CV→CWP.
function deriveCwaCvFromCwp(cwpId: string): { cwa: string | null; cv: string | null } {
  const m = cwpId.match(/^(\d{6})\.[A-Za-z]+\d+/);
  if (m) { const cv = m[1]; return { cwa: cv.slice(0, 4), cv }; }
  // "{CV}.SIN-CWP" → un CWP se asignó al revés (CV sin CWP todavía): anidar bajo su CV/CWA real.
  const mCv = cwpId.match(/^(\d{6})\.SIN-CWP$/);
  if (mCv) { const cv = mCv[1]; return { cwa: cv.slice(0, 4), cv }; }
  // "{CWA}.SIN-CV.SIN-CWP" → un elemento solo tiene CWA asignado: anidar bajo un CV sintético "por asignar".
  const mCwa = cwpId.match(/^(\d{4})\.SIN-CV\.SIN-CWP$/);
  if (mCwa) return { cwa: mCwa[1], cv: `${mCwa[1]}.SIN-CV` };
  return { cwa: null, cv: null };
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

type TreeNode = { dbId: number; name: string; childCount: number };

// Navega el árbol NATIVO del modelo (assemblies/grupos tal como vienen del CAD) cargando hijos a demanda
// con getChildren — nunca carga todo el árbol de una sola vez. Cada rama solo se RESUELVE a dbIds reales
// (y se pide confirmación con el conteo) cuando el usuario hace click en el botón de "usar esta rama";
// este componente nunca escribe nada en la BD por sí mismo.
function ModelTreePanel({ viewerRef, viewerReady, onPreviewBranch, revealDbId }: {
  viewerRef: { current: ForgeViewerHandle | null };
  viewerReady: boolean;
  onPreviewBranch: (dbId: number, name: string) => void;
  revealDbId: { dbId: number; ts: number } | null;
}) {
  const [rootId, setRootId] = useState<number | null>(null);
  const [childrenCache, setChildrenCache] = useState<Map<number, TreeNode[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [highlightDbId, setHighlightDbId] = useState<number | null>(null);

  const ensureChildren = useCallback((dbId: number) => {
    setChildrenCache(prev => {
      if (prev.has(dbId) || !viewerRef.current) return prev;
      const kids = viewerRef.current.getChildren(dbId);
      const next = new Map(prev);
      next.set(dbId, kids);
      return next;
    });
  }, [viewerRef]);

  useEffect(() => {
    if (!viewerReady || !viewerRef.current) return;
    const r = viewerRef.current.getRootId();
    setRootId(r);
    if (r != null) ensureChildren(r);
  }, [viewerReady, viewerRef, ensureChildren]);

  // Click en el visor (rama "árbol del modelo" activa) → expande todos los ancestros del dbId
  // clickeado para revelarlo en el árbol, hace scroll hasta él y lo resalta.
  useEffect(() => {
    if (!revealDbId || !viewerRef.current) return;
    const info = viewerRef.current.getNodeInfo(revealDbId.dbId);
    if (!info) return;
    setExpanded(prev => {
      const next = new Set(prev);
      for (const a of info.ancestors) next.add(a.dbId);
      return next;
    });
    for (const a of info.ancestors) ensureChildren(a.dbId);
    setHighlightDbId(revealDbId.dbId);
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.getElementById(`tree-node-${revealDbId.dbId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    });
  }, [revealDbId, viewerRef, ensureChildren]);

  const toggle = (dbId: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(dbId)) next.delete(dbId);
      else { next.add(dbId); ensureChildren(dbId); }
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isOpen = expanded.has(node.dbId);
    const kids = childrenCache.get(node.dbId);
    const isHighlighted = highlightDbId === node.dbId;
    return (
      <div key={node.dbId}>
        <div
          id={`tree-node-${node.dbId}`}
          className={cn('flex items-center gap-1 py-1 hover:bg-blue-50 rounded', isHighlighted && 'bg-amber-100 ring-1 ring-amber-400')}
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          {node.childCount > 0 ? (
            <button onClick={() => toggle(node.dbId)} className="shrink-0 p-0.5">
              {isOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
            </button>
          ) : <span className="w-4 shrink-0" />}
          <span className="text-[11px] text-slate-700 truncate flex-1" title={node.name}>{node.name || `#${node.dbId}`}</span>
          {node.childCount > 0 && <span className="text-[9px] text-slate-400 font-mono shrink-0">{node.childCount}</span>}
          <button
            onClick={() => onPreviewBranch(node.dbId, node.name || `#${node.dbId}`)}
            title="Aislar esta rama y ver cuántos elementos tiene, antes de clasificarla"
            className="shrink-0 p-1 rounded bg-slate-100 hover:bg-blue-100 text-blue-600"
          >
            <Crosshair className="w-3 h-3" />
          </button>
        </div>
        {isOpen && kids?.map(k => renderNode(k, depth + 1))}
      </div>
    );
  };

  if (!viewerReady) return <div className="p-4 text-center text-[11px] text-slate-400 italic">Abre el modelo 3D primero.</div>;
  if (rootId == null) return <div className="p-4 text-center text-[11px] text-slate-400 italic">Cargando árbol…</div>;
  const rootKids = childrenCache.get(rootId) ?? [];
  return (
    <div className="flex-1 overflow-y-auto p-2">
      <p className="text-[9.5px] text-slate-400 px-1 pb-2 leading-snug">
        Navega el árbol nativo del modelo. Click en <Crosshair className="w-2.5 h-2.5 inline" /> de una rama para aislarla
        y ver cuántos elementos tiene — nunca se asigna nada hasta que confirmes en el banner del visor.
        Click en un elemento del visor para ubicarlo aquí.
      </p>
      {rootKids.length ? rootKids.map(k => renderNode(k, 0)) : (
        <p className="text-[10.5px] text-slate-400 italic px-1">Esta rama no tiene hijos.</p>
      )}
    </div>
  );
}

function RevisionPanel({ projectId, viewerReady, onColorByLevel, onFocus, onViewSelected, paintTarget, onArmPaint, onStopPaint, onCatalogChanged }: {
  projectId: string; viewerReady: boolean;
  onColorByLevel: (nivel: Nivel, selections: { codigo: string; r: number; g: number; b: number; a: number }[]) => void;
  onFocus: (nivel: Nivel, codigo: string) => void;
  onViewSelected: (nivel: Nivel, selections: { codigo: string; r: number; g: number; b: number; a: number }[]) => void;
  paintTarget: PaintTarget | null;
  onArmPaint: (nivel: Nivel, codigo: string, r: number, g: number, b: number, a: number) => void;
  onStopPaint: () => void;
  onCatalogChanged: () => void;
}) {
  const initialPrefs = useMemo(() => loadRevisionPrefs(projectId), [projectId]);
  const [nivel, setNivel] = useState<Nivel>(initialPrefs.nivel ?? 'cwa');
  const nivelRef = useRef(nivel);
  nivelRef.current = nivel;
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expandedCwa, setExpandedCwa] = useState<Set<string>>(new Set());
  const [expandedCv, setExpandedCv] = useState<Set<string>>(new Set());
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});
  const [pendingOverrides, setPendingOverrides] = useState<Record<string, string>>({});
  const [savingColors, setSavingColors] = useState(false);
  const [colorError, setColorError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [mostrarFiltro, setMostrarFiltro] = useState<'todas' | 'oficiales' | 'creadas'>(initialPrefs.mostrarFiltro ?? 'todas');
  const [colorearCreadas, setColorearCreadas] = useState(initialPrefs.colorearCreadas ?? true);

  useEffect(() => {
    saveRevisionPrefs(projectId, { nivel, mostrarFiltro, colorearCreadas });
  }, [projectId, nivel, mostrarFiltro, colorearCreadas]);
  const [newCodigo, setNewCodigo] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const nivelPedido = nivel;
    Promise.all([
      fetch(`/api/mining-revision?project_id=${projectId}&nivel=${nivelPedido}`).then(parseJsonOrThrow),
      fetch(`/api/mining-colores?project_id=${projectId}&nivel=${nivelPedido}`).then(parseJsonOrThrow),
    ]).then(([rev, col]) => {
      // Si el usuario ya cambió de pestaña mientras esta respuesta viajaba, descártala —
      // sin este guard, una respuesta vieja (ej. CWA) puede llegar después y pisar los items de la pestaña actual (CV).
      if (nivelPedido !== nivelRef.current) return;
      setItems(rev.items ?? []);
      setColorOverrides(col.colores ?? {});
      setPendingOverrides({});
    }).catch(() => {}).finally(() => { if (nivelPedido === nivelRef.current) setLoading(false); });
  }, [projectId, nivel]);

  const saveColors = useCallback(async () => {
    if (!Object.keys(pendingOverrides).length) return;
    setSavingColors(true);
    setColorError(null);
    try {
      const res = await fetch('/api/mining-colores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, nivel, colores: pendingOverrides }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? 'Error al guardar colores');
      setColorOverrides(prev => ({ ...prev, ...pendingOverrides }));
      setPendingOverrides({});
    } catch (e: any) {
      setColorError(e.message);
    } finally {
      setSavingColors(false);
    }
  }, [pendingOverrides, projectId, nivel]);

  const createCategoria = useCallback(async () => {
    const codigo = newCodigo.trim();
    if (!codigo) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/mining-catalogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, nivel, codigo, nombre: newNombre.trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? 'Error al crear la categoría');
      setNewCodigo('');
      setNewNombre('');
      setShowNewForm(false);
      load();
      onCatalogChanged();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  }, [newCodigo, newNombre, projectId, nivel, load, onCatalogChanged]);

  useEffect(() => { load(); setChecked(new Set()); }, [load]);

  // "Oficiales" = vienen del itemizado/DevPack original (catálogo importado). "Creadas" = se agregaron
  // después desde esta misma página (botón "+ Nueva categoría") o son placeholders "por asignar".
  const itemsFiltrados = useMemo(() => {
    if (mostrarFiltro === 'todas') return items;
    // "Sin asignar" siempre queda visible — no es ni oficial ni creada, es la bandeja de pendientes.
    return items.filter(it => isSinAsignar(it.codigo) || (mostrarFiltro === 'oficiales' ? it.esOficial : !it.esOficial));
  }, [items, mostrarFiltro]);

  // Árbol CWA → CV → CWP solo para el nivel CWP (los SIN-CWP.* sin patrón derivable quedan sueltos al final).
  const cwpTree = useMemo(() => {
    if (nivel !== 'cwp') return null;
    const byCwa = new Map<string, Map<string, RevisionItem[]>>();
    const sueltos: RevisionItem[] = [];
    for (const it of itemsFiltrados) {
      const { cwa, cv } = deriveCwaCvFromCwp(it.codigo);
      if (!cwa || !cv) { sueltos.push(it); continue; }
      if (!byCwa.has(cwa)) byCwa.set(cwa, new Map());
      const cvMap = byCwa.get(cwa)!;
      if (!cvMap.has(cv)) cvMap.set(cv, []);
      cvMap.get(cv)!.push(it);
    }
    return { byCwa, sueltos };
  }, [itemsFiltrados, nivel]);

  // Por defecto el árbol queda totalmente expandido (son pocos CWA/CV).
  useEffect(() => {
    if (!cwpTree) return;
    setExpandedCwa(new Set(cwpTree.byCwa.keys()));
    setExpandedCv(new Set([...cwpTree.byCwa.values()].flatMap(m => [...m.keys()])));
  }, [cwpTree]);

  const colorIndexByCodigo = useMemo(() => new Map(items.map((it, i) => [it.codigo, i])), [items]);
  const esOficialPorCodigo = useMemo(() => new Map(items.map(it => [it.codigo, it.esOficial])), [items]);
  const colorOf = (codigo: string): { r: number; g: number; b: number; a: number } => {
    if (!isSinAsignar(codigo)) {
      const hex = pendingOverrides[codigo] ?? colorOverrides[codigo];
      if (hex) return { ...hexToRgb(hex), a: 1 };
    }
    return paintColorFor(codigo, colorIndexByCodigo.get(codigo) ?? 0, esOficialPorCodigo.get(codigo) ?? true, colorearCreadas);
  };

  // Marcar un checkbox aísla/colorea de inmediato esos elementos en el visor — no hace falta
  // apretar un botón "Colorear marcados" aparte, el check ES la acción.
  const viewCodes = (codes: Set<string>) => {
    if (!codes.size) return;
    onViewSelected(nivel, itemsFiltrados.filter(it => codes.has(it.codigo)).map(it => ({ codigo: it.codigo, ...colorOf(it.codigo) })));
  };

  const toggleChecked = (codigo: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(codigo) ? next.delete(codigo) : next.add(codigo);
      viewCodes(next);
      return next;
    });
  };

  const toggleGroup = (codes: string[]) => {
    setChecked(prev => {
      const next = new Set(prev);
      const allOn = codes.length > 0 && codes.every(c => next.has(c));
      for (const c of codes) allOn ? next.delete(c) : next.add(c);
      viewCodes(next);
      return next;
    });
  };

  const groupState = (codes: string[]): 'all' | 'some' | 'none' => {
    if (!codes.length) return 'none';
    const n = codes.filter(c => checked.has(c)).length;
    return n === 0 ? 'none' : n === codes.length ? 'all' : 'some';
  };

  const allCodes = useMemo(() => itemsFiltrados.map(i => i.codigo), [itemsFiltrados]);
  const selectAllState = groupState(allCodes);

  // Marcar un checkbox ya aísla/colorea esos elementos al instante (ver viewCodes) — este botón
  // colorea TODO el nivel filtrado de una vez (respeta el filtro Oficiales/Creadas).
  const handleColorear = () => {
    onColorByLevel(nivel, itemsFiltrados.map(it => ({ codigo: it.codigo, ...colorOf(it.codigo) })));
  };

  // Vista de contraste: ignora el filtro Oficiales/Creadas (necesita ver AMBOS lados a la vez) —
  // los oficiales quedan con su color de paleta normal, todo lo demás (creadas + sin asignar) queda
  // con un único color casi negro, para que el límite de batería AWP resalte de inmediato.
  const handleVistaContraste = () => {
    onColorByLevel(nivel, items.map(it => ({
      codigo: it.codigo,
      ...(it.esOficial && !isSinAsignar(it.codigo) ? { ...colorOf(it.codigo) } : CONTRASTE_COLOR),
    })));
  };

  const renderItem = (it: RevisionItem) => {
    const armed = paintTarget?.nivel === nivel && paintTarget.codigo === it.codigo;
    const sinAsignar = isSinAsignar(it.codigo);
    const { r, g, b, a } = colorOf(it.codigo);
    return (
      <div key={it.codigo} className={cn('px-3 py-2 border-b border-slate-100 hover:bg-blue-50 flex items-center gap-2', armed && 'bg-amber-50')}>
        <button onClick={() => toggleChecked(it.codigo)} className="shrink-0">
          {checked.has(it.codigo) ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5 text-slate-300" />}
        </button>
        {sinAsignar ? (
          <span className="w-3 h-3 rounded-full shrink-0 border-2 border-dashed border-slate-400 bg-white" title="Sin asignar — restaura el color nativo del CAD" />
        ) : (
          <input
            type="color"
            value={rgbToHex(r, g, b)}
            onClick={e => e.stopPropagation()}
            onChange={e => setPendingOverrides(prev => ({ ...prev, [it.codigo]: e.target.value }))}
            title="Elegir un color personalizado para este código (recuerda Guardar)"
            className="w-3.5 h-3.5 shrink-0 rounded-full border-0 p-0 cursor-pointer appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border [&::-webkit-color-swatch]:border-slate-300"
          />
        )}
        <div onClick={() => onFocus(nivel, it.codigo)} className="flex-1 overflow-hidden cursor-pointer">
          <div className="font-mono text-[11px] font-bold text-[#08203F] flex items-center gap-1.5">
            {it.codigo}
            {!sinAsignar && !it.esOficial && (
              <span className="px-1 py-0 rounded text-[8px] font-black uppercase bg-violet-100 text-violet-600 shrink-0">Nueva</span>
            )}
          </div>
          {it.nombre && <div className="text-[10px] text-slate-400 truncate">{it.nombre}</div>}
        </div>
        <span className="text-[10px] text-slate-400 font-mono shrink-0">{it.nElementos.toLocaleString('es-CL')}</span>
        <button
          onClick={() => armed ? onStopPaint() : onArmPaint(nivel, it.codigo, r, g, b, a)}
          title={armed
            ? 'Detener: dejar de mover elementos aquí'
            : sinAsignar
              ? 'Sacar de la categoría: click en 🖌️, luego click en los elementos mal pintados para restaurar su color original y quitarlos de este nivel'
              : 'Mover elementos aquí: click en 🖌️, luego click en los elementos del modelo'}
          className={cn('p-1 rounded shrink-0', armed ? 'bg-amber-500 text-white' : sinAsignar ? 'bg-slate-100 hover:bg-slate-200 text-slate-500 ring-1 ring-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-500')}
        >
          {armed ? <StopCircle className="w-3.5 h-3.5" /> : sinAsignar ? <Eraser className="w-3.5 h-3.5" /> : <Paintbrush className="w-3.5 h-3.5" />}
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
        {showNewForm ? (
          <div className="border border-blue-200 bg-blue-50 rounded p-2 space-y-1.5">
            <input
              autoFocus value={newCodigo} onChange={e => setNewCodigo(e.target.value)}
              placeholder={`Código del nuevo ${NIVEL_LABEL[nivel]}…`}
              className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded"
            />
            <input
              value={newNombre} onChange={e => setNewNombre(e.target.value)}
              placeholder="Nombre (opcional)"
              className="w-full px-2 py-1 text-[11px] border border-slate-200 rounded"
            />
            {createError && <p className="text-[9.5px] text-red-600 font-bold">{createError}</p>}
            <div className="flex gap-1.5">
              <button
                onClick={createCategoria} disabled={creating || !newCodigo.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1 bg-[#0D47A1] hover:bg-[#1565C0] disabled:opacity-40 text-white rounded px-2 py-1 text-[10.5px] font-bold"
              >
                {creating ? 'Creando…' : 'Crear'}
              </button>
              <button
                onClick={() => { setShowNewForm(false); setNewCodigo(''); setNewNombre(''); setCreateError(null); }}
                className="px-2 py-1 text-[10.5px] font-bold text-slate-500 hover:text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNewForm(true)}
            className="w-full inline-flex items-center justify-center gap-1.5 border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded px-2 py-1.5 text-[10.5px] font-bold"
          >
            <Plus className="w-3.5 h-3.5" /> Nueva categoría {NIVEL_LABEL[nivel]}
          </button>
        )}
        {Object.keys(pendingOverrides).length > 0 && (
          <button
            onClick={saveColors} disabled={savingColors}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded px-2 py-1.5 text-[10.5px] font-bold"
          >
            <Save className="w-3.5 h-3.5" /> {savingColors ? 'Guardando…' : `Guardar ${Object.keys(pendingOverrides).length} color(es)`}
          </button>
        )}
        {colorError && <p className="text-[9.5px] text-red-600 font-bold">{colorError}</p>}
        <div className="flex items-center gap-1">
          {(['todas', 'oficiales', 'creadas'] as const).map(f => (
            <button
              key={f} onClick={() => setMostrarFiltro(f)}
              className={cn('flex-1 py-1 rounded text-[9.5px] font-bold uppercase',
                mostrarFiltro === f ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}
            >
              {f === 'todas' ? 'Todas' : f === 'oficiales' ? 'Oficiales' : 'Creadas'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[9.5px] text-slate-500 font-bold cursor-pointer">
          <input type="checkbox" checked={colorearCreadas} onChange={e => setColorearCreadas(e.target.checked)} className="accent-blue-600" />
          Colorear las &quot;Nuevas&quot; con su propio color (si no, quedan con el color normal del CAD)
        </label>
        <button
          onClick={handleColorear}
          disabled={!viewerReady || loading}
          className="w-full inline-flex items-center justify-center gap-1.5 bg-[#0D47A1] hover:bg-[#1565C0] disabled:opacity-40 text-white rounded px-2 py-1.5 text-[10.5px] font-bold"
          title={!viewerReady ? 'Abre el modelo 3D primero' : undefined}
        >
          <Palette className="w-3.5 h-3.5" /> Colorear modelo por {NIVEL_LABEL[nivel]}
        </button>
        {checked.size > 0 && (
          <p className="text-[9.5px] text-blue-600 font-bold text-center">{checked.size} marcado(s) — ya aislado(s) en el visor al marcarlos</p>
        )}
        <button
          onClick={handleVistaContraste}
          disabled={!viewerReady || loading}
          className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-black disabled:opacity-40 text-white rounded px-2 py-1.5 text-[10.5px] font-bold"
          title="Oficiales con su color de paleta, todo lo demás (creadas + sin asignar) en negro — para revisar el límite de batería AWP"
        >
          <Eye className="w-3.5 h-3.5" /> Vista de contraste (límite de batería)
        </button>
        <p className="text-[9.5px] text-slate-400 leading-snug">
          Cada {NIVEL_LABEL[nivel]} queda con un color. Click en uno para ubicarlo en el visor. Si ves elementos
          del color equivocado, click en 🖌️ del {NIVEL_LABEL[nivel]} correcto y luego click en esos elementos en el modelo para moverlos ahí.
          Si te equivocaste de color al pintar, usa el botón <Eraser className="w-2.5 h-2.5 inline" /> de &quot;Sin {NIVEL_LABEL[nivel]} asignado&quot; (círculo punteado) y click en el elemento: lo saca de la categoría y le restaura su color original del CAD.
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
        ) : !itemsFiltrados.length ? (
          <div className="p-6 text-center text-[11px] text-slate-400 italic">
            {items.length ? 'Nada que mostrar con este filtro.' : `Sin ${NIVEL_LABEL[nivel]} para este proyecto.`}
          </div>
        ) : nivel !== 'cwp' || !cwpTree ? (
          mostrarFiltro !== 'todas' ? itemsFiltrados.map(renderItem) : (
            <>
              {itemsFiltrados.some(it => it.esOficial || isSinAsignar(it.codigo)) && (
                <div className="px-2 py-1 bg-slate-100 border-b border-slate-200">
                  <span className="text-[9.5px] font-black uppercase text-slate-500">Oficiales</span>
                </div>
              )}
              {itemsFiltrados.filter(it => it.esOficial || isSinAsignar(it.codigo)).map(renderItem)}
              {itemsFiltrados.some(it => !it.esOficial && !isSinAsignar(it.codigo)) && (
                <div className="px-2 py-1 bg-violet-50 border-b border-violet-100">
                  <span className="text-[9.5px] font-black uppercase text-violet-600">Creadas en la app</span>
                </div>
              )}
              {itemsFiltrados.filter(it => !it.esOficial && !isSinAsignar(it.codigo)).map(renderItem)}
            </>
          )
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
