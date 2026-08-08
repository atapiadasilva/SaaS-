// Tipos y catálogo de columnas de la Mesa de Trabajo.
//
// El grid de la mesa muestra dos cosas en la misma tabla: los paquetes del borrador que se
// está armando y los IWP ya publicados del mismo CWP. Se ven juntos a propósito — el
// planificador necesita ver el CWP completo para decidir dónde meter lo que falta, no sólo
// el pedazo nuevo. `tipo` es lo que los distingue, y lo que decide qué se puede editar.

import type { PartidaAsignada } from '@/lib/iwp-apertura';
import type { EstadoIwp } from '@/lib/iwp-estado';

export interface Fila {
  /** id del borrador, o iwp_id si ya está publicado. */
  id: string;
  tipo: 'borrador' | 'publicado';
  secuencia: number;
  nombre: string;
  grupo: string | null;
  limites_bateria: string | null;
  cuadrilla_id: string | null;
  fecha_inicio_plan: string | null;
  fecha_fin_plan: string | null;
  dias: number | null;
  hh: number;
  partidas: PartidaAsignada[];
  /** Sólo borradores: lo tocó una persona, así que el recálculo lo respeta. */
  editado?: boolean;
  /** Sólo publicados. */
  status?: EstadoIwp;
  avance_fisico_pct?: number;
  constraints?: { total: number; pendientes: number };
}

export interface Cuadrilla {
  id: string; codigo: string; nombre: string | null; disciplina_cod: string | null;
  n_personas: number; factor_productividad: number; turno_id: string | null;
}

export interface Turno {
  id: string; codigo: string; nombre: string | null;
  dias_trabajo: number; dias_descanso: number; horas_dia: number; es_default: boolean;
}

export interface FilaBancoMesa {
  clave: string; item: string; partida_bmp: string | null;
  descripcion: string | null; unidad: string | null; commodity: string | null;
  cantidad_total: number; cantidad_asignada: number; cantidad_saldo: number;
  cantidad_en_borrador: number; cantidad_libre: number;
  hh_unidad: number | null; hh_total: number; hh_asignadas: number; hh_saldo: number;
  hh_en_borrador: number;
}

export interface Dimension {
  clave: string; label: string;
  zonas: { clave: string; nombre: string; peso: number; n: number }[];
}

// ─── Columnas ────────────────────────────────────────────────────────────────

export type ColumnaId =
  | 'secuencia' | 'nombre' | 'estado' | 'hh' | 'dias' | 'inicio' | 'fin' | 'semana'
  | 'cuadrilla' | 'personas' | 'partidas' | 'cantidad' | 'grupo' | 'limites'
  | 'avance' | 'restricciones';

export interface ColumnaDef {
  id: ColumnaId;
  label: string;
  /** Ancho en px. El grid es de ancho fijo por columna, como una planilla. */
  ancho: number;
  alineacion?: 'left' | 'right' | 'center';
  /** Se puede editar en la celda (sólo en filas de borrador). */
  editable?: boolean;
  /** Va en la vista por defecto. */
  base?: boolean;
  ayuda?: string;
}

/**
 * El catálogo completo. La vista por defecto son las columnas `base`; el resto se agregan
 * desde el selector, como el "Columns" de Primavera.
 */
export const COLUMNAS: ColumnaDef[] = [
  { id: 'secuencia',     label: '#',            ancho: 44,  alineacion: 'right', base: true },
  { id: 'nombre',        label: 'Paquete',      ancho: 330, editable: true, base: true },
  { id: 'estado',        label: 'Estado',       ancho: 110, base: true, ayuda: 'Borrador, o el estado del IWP publicado' },
  { id: 'hh',            label: 'HH',           ancho: 70,  alineacion: 'right', base: true },
  { id: 'dias',          label: 'Días',         ancho: 56,  alineacion: 'right', editable: true, base: true },
  { id: 'inicio',        label: 'Inicio',       ancho: 90,  editable: true, base: true },
  { id: 'fin',           label: 'Fin',          ancho: 90,  base: true },
  { id: 'cuadrilla',     label: 'Cuadrilla',    ancho: 120, editable: true, base: true },
  { id: 'restricciones', label: 'Restricc.',    ancho: 80,  alineacion: 'center', base: true },
  { id: 'semana',        label: 'Semana ISO',   ancho: 92,  ayuda: 'La semana con que agrupan Obeya y el Skyline' },
  { id: 'personas',      label: 'Personas',     ancho: 74,  alineacion: 'right' },
  { id: 'partidas',      label: 'Frentes',      ancho: 68,  alineacion: 'right', ayuda: 'Cuántas líneas del itemizado entran' },
  { id: 'cantidad',      label: 'Cantidad ppal', ancho: 130, alineacion: 'right', ayuda: 'La cantidad del frente que más pesa' },
  { id: 'grupo',         label: 'Zona / familia', ancho: 150 },
  { id: 'limites',       label: 'Límites de batería', ancho: 320, editable: true },
  { id: 'avance',        label: 'Avance',       ancho: 74,  alineacion: 'right' },
];

export const COLUMNAS_BASE: ColumnaId[] = COLUMNAS.filter(c => c.base).map(c => c.id);
export const COLUMNA_POR_ID = Object.fromEntries(COLUMNAS.map(c => [c.id, c])) as Record<ColumnaId, ColumnaDef>;

// ─── Agrupación ──────────────────────────────────────────────────────────────

export type AgruparPor = 'ninguno' | 'grupo' | 'semana' | 'cuadrilla' | 'estado';

export const AGRUPACIONES: { id: AgruparPor; label: string }[] = [
  { id: 'ninguno',   label: 'Sin agrupar' },
  { id: 'grupo',     label: 'Zona / familia' },
  { id: 'semana',    label: 'Semana ISO' },
  { id: 'cuadrilla', label: 'Cuadrilla' },
  { id: 'estado',    label: 'Estado' },
];

// ─── Formato ─────────────────────────────────────────────────────────────────

export const num = (v: number | null | undefined, dec = 0) =>
  v == null ? '—' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: dec });

export const fechaCorta = (s: string | null | undefined) =>
  s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) : '—';

export const diasEntre = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
