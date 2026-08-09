/**
 * Tipos y catálogos de columnas del editor de elementos.
 *
 * Vive aparte de la página porque lo comparten los tres paneles (revisión, árbol y tabla) y
 * porque son listas largas que no aportan nada al leer la lógica.
 */
import type { ExportColumnDef } from '@/components/awp/ExportDataModal';

export const PAGE_SIZE = 100;

export type Nivel = 'cwa' | 'cv' | 'cwp' | 'swp';
export const NIVEL_LABEL: Record<Nivel, string> = { cwa: 'CWA', cv: 'CV', cwp: 'CWP', swp: 'SWP' };
// CWP primero: es el nivel de trabajo del editor (y su pestaña por defecto). Solo ordena
// las pestañas del panel de Revisión — nadie más consume este arreglo.
export const NIVELES: Nivel[] = ['cwp', 'cwa', 'cv', 'swp'];

export interface PaintTarget { nivel: Nivel; codigo: string; r: number; g: number; b: number; a: number; }

export interface Elemento {
  sp3d_moniker: string; name: string | null; tag_equipo: string | null; disciplina: string | null; descripcion: string | null;
  tipo_elemento: string | null; sector: string | null; area_unidad: string | null; cwp_id: string | null;
  cwa_id: string | null; cv_id: string | null; swp_id: string | null;
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
  /** Línea del itemizado a la que pertenece la pieza: es lo que la hace cobrable. */
  item_itemizado: string | null;
}

export interface Bucket { cwpId: string | null; n: number; enCatalogo: boolean; }
export interface CatalogRow { cwp_id: string; cwp_nombre: string; disciplina_cod: string; }
export interface FiltroOpcion { valor: string; n: number; }
export type Filtros = Record<string, FiltroOpcion[]>;
export interface RevisionItem { codigo: string; nombre: string | null; nElementos: number; enCatalogo: boolean; esOficial: boolean; }

export interface FiltrosState {
  alcance: string; itemOAdicional: string; especialidad: string; categoria: string; sistema: string; obraTipo: string; estado: string;
  sitio: string; sector: string; areaUnidad: string; validado: string; motivoNoValido: string; disciplinaModelo: string;
  disciplinaArbol: string; obraTarget: string; cwpFuente: string; vinculoNivel: string; categoriaEnlace: string; codigoBmp: string;
}
export const EMPTY_FILTERS: FiltrosState = {
  alcance: '', itemOAdicional: '', especialidad: '', categoria: '', sistema: '', obraTipo: '', estado: '',
  sitio: '', sector: '', areaUnidad: '', validado: '', motivoNoValido: '', disciplinaModelo: '',
  disciplinaArbol: '', obraTarget: '', cwpFuente: '', vinculoNivel: '', categoriaEnlace: '', codigoBmp: '',
};

// Mantener en sync con SIMPLE_EQ_FIELDS de /api/mining-elementos/route.ts y con las columnas
// cubiertas por la función SQL mining_elementos_filtros().
export const FILTER_FIELDS: { key: keyof FiltrosState; columna: string; label: string }[] = [
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

// Columnas opcionales de la tabla (moniker + CWA/CV/CWP + reasignar son siempre visibles, no están aquí).
// "Por asignar"/SIN-* se detecta por contener "SIN-" en el valor — sirve tanto para los baldes globales
// (SIN-CWA, SIN-CWP.*) como para los placeholders anidados ("{padre}.SIN-CV", "{padre}.SIN-CWP").
export const COLUMN_DEFS: { key: string; label: string; get: (e: Elemento) => string | number | null }[] = [
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
  { key: 'tagUnificado', label: 'TAG', get: e => e.tag_unificado },
  { key: 'itemItemizado', label: 'Partida itemizado', get: e => e.item_itemizado },
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
export const DEFAULT_COLS = ['tagUnificado', 'itemItemizado', 'nombre', 'disciplina', 'categoria', 'sector'];
// v2: el TAG y la partida del itemizado pasaron a ser columnas de cabecera. Subir la versión es
// lo único que hace que un navegador con preferencia guardada vea las nuevas.
export const COLS_STORAGE_KEY = 'mineria-elementos-columnas-v2';

// Moniker/CWA/CV/CWP no están en COLUMN_DEFS porque se renderizan hardcodeados en la tabla (siempre
// visibles) — para el export se agregan como columnas "locked" (siempre incluidas, no se pueden destildar).
export const EXPORT_LOCKED_KEYS = ['moniker', 'cwa', 'cv', 'cwp'];
export const EXPORT_LOCKED_DEFS: ExportColumnDef[] = [
  { key: 'moniker', label: 'SP3D Moniker', get: e => e.sp3d_moniker },
  { key: 'cwa', label: 'CWA', get: e => e.cwa_id },
  { key: 'cv', label: 'CV', get: e => e.cv_id },
  { key: 'cwp', label: 'CWP', get: e => e.cwp_id },
];

// ── Árbol nativo del modelo ─────────────────────────────────────────────────
export type TreeNode = { dbId: number; name: string; childCount: number };
export type CoverageState = { vinculados: number; total: number } | 'loading' | 'too-big' | 'error';
export type TreeCoverageApi = { refresh: (dbId: number) => void; refreshAll: () => void };
