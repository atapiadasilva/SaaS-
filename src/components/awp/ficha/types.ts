// Tipos y utilidades compartidas por el editor de ficha CWP y la vista de impresión.
import { metaDe } from '@/lib/iwp-estado';

export type Orientacion = 'vertical' | 'horizontal';

export type FuenteDatos = 'kpis' | 'jerarquia' | 'alcance' | 'programa' | 'itemizado' | 'iwp' | 'planos';

export type Bloque =
  | { id: string; tipo: 'titulo'; texto: string }
  | { id: string; tipo: 'subtitulo'; texto: string }
  | { id: string; tipo: 'parrafo'; texto: string }
  | { id: string; tipo: 'nota'; texto: string; color?: 'rojo' | 'ambar' | 'verde' | 'azul' }
  | { id: string; tipo: 'imagenes'; titulo?: string; porFila: 1 | 2 | 3; imgs: { url: string; caption?: string }[] }
  | { id: string; tipo: 'datos'; fuente: FuenteDatos; titulo?: string }
  | { id: string; tipo: 'firmas'; roles: string[] }
  | { id: string; tipo: 'salto' }
  | { id: string; tipo: 'divisor' };

export interface FichaData {
  /** Identidad del proyecto, para el pie de la ficha impresa. */
  proyecto?: { nombre: string | null; codigo_externo: string | null };
  cwp: {
    cwp_id: string; cwp_nombre: string | null; disciplina_cod: string | null; disciplina: string | null;
    disciplina_grupo: string | null; cwa_id: string | null; cv_id: string | null; ewp_id: string | null;
    alcance: string | null; costo_oferta_clp: number | null; ruta_critica: boolean | null;
    status_cwp: string | null; hito_contractual: string | null; es_oficial: boolean | null;
    cwaNombre: string; cvNombre: string;
  };
  kpis: {
    hhProg: number; hhItem: number; nProg: number; nItems: number;
    progIni: string | null; progFin: string | null; nIwp: number; avanceCwp: number | null; costo: number | null;
  };
  programa: { cod: string; nombre: string; ini: string | null; fin: string | null; hh: number; unidad: string | null; cantidad: number | null }[];
  itemizado: { item: string; descripcion: string; detalle: string | null; partida: string | null; cantidad: number | null; unidad: string | null; hh_unidad: number | null; hh_item: number; commodity: string | null }[];
  iwps: { iwp_id: string; descripcion: string | null; status: string | null; ini: string | null; fin: string | null; hh: number; avance: number; crew: number | null; consPend: number; consTotal: number }[];
  planos: { codigo: string; descripcion: string; tipo: string; rev: string | null; n_interno: string | null; estado: string | null; disciplina: string | null; ewp_id: string | null }[];
  ficha: { orientacion: Orientacion; bloques: Bloque[]; updated_at: string; updated_by: string | null } | null;
}

let _seq = 0;
export const nuevoId = () => `b${Date.now().toString(36)}${(_seq++).toString(36)}`;

// Formateadores es-CL
export const fn = (v: any) => v == null ? '—' : Math.round(Number(v)).toLocaleString('es-CL');
export const f1 = (v: any) => v == null ? '—' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: 1 });
export const fd = (v: any) => v ? String(v).slice(0, 10) : '—';
export const fmm = (v: any) => !v ? '—' : '$' + Math.round(Number(v) / 1e6).toLocaleString('es-CL') + ' MM';

// La ficha va firmada y se le entrega al mandante: el nombre del estado tiene que ser el
// mismo que muestra la plataforma. Antes era una copia a la que le faltaban LIBERADO y
// CERRADO, así que un paquete liberado se imprimía con su código crudo `LIBERADO`.
export const statusLabel = (s: string | null | undefined) => metaDe(s ?? '').label;

// Composición por defecto cuando el CWP aún no tiene ficha guardada.
export function bloquesPorDefecto(): Bloque[] {
  return [
    { id: nuevoId(), tipo: 'datos', fuente: 'alcance' },
    { id: nuevoId(), tipo: 'datos', fuente: 'programa' },
    { id: nuevoId(), tipo: 'datos', fuente: 'itemizado' },
    { id: nuevoId(), tipo: 'datos', fuente: 'iwp' },
    { id: nuevoId(), tipo: 'datos', fuente: 'planos' },
    { id: nuevoId(), tipo: 'firmas', roles: ['Jefe de Terreno', 'Oficina Técnica (AWP)', 'Administrador de Contrato'] },
  ];
}

// Plantilla de sección por departamento — el usuario la rellena.
export function plantillaDepto(depto: string): Bloque[] {
  return [
    { id: nuevoId(), tipo: 'titulo', texto: `${depto} — Recursos y alcance en este CWP` },
    { id: nuevoId(), tipo: 'parrafo', texto: 'Alcance de la disciplina en este paquete:\n• \n\nProcedimientos aplicables:\n• \n\nRiesgos críticos:\n• \n\nEquipos comprometidos:\n• \n\nDotación / RRHH:\n• ' },
  ];
}

export const ETIQUETA_FUENTE: Record<FuenteDatos, string> = {
  kpis: 'KPIs del paquete',
  jerarquia: 'Jerarquía AWP',
  alcance: 'Alcance del paquete',
  programa: 'Programa P333',
  itemizado: 'Itemizado de cobro (MC)',
  iwp: 'Paquetes de instalación (IWP)',
  planos: 'Planos y documentos',
};
