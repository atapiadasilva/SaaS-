// Catálogo canónico de las FUENTES DE DATOS de un proyecto — única fuente de verdad.
// Es el gemelo de `modules.ts`: aquel dice qué módulos ve un proyecto, este dice de qué
// datos se alimentan y, sobre todo, cuáles transportan la llave CWP.
//
// PRINCIPIO: el CWP es la llave del proyecto entero, no del módulo AWP. Toda fuente que
// describa trabajo (una actividad, un ítem de cobro, un plano, un elemento 3D, un
// suministro, un documento) debe traer su CWP para poder responder "¿qué pasa con este
// paquete?" con datos de todos los departamentos a la vez. Una fuente cargada pero sin
// llave es data muerta: existe, pero no conecta.

import type { ModuleKey } from './modules';

export type CapaDato = 'awp' | 'bim' | 'documental' | 'ejecucion' | 'departamentos';

export const CAPA_LABEL: Record<CapaDato, string> = {
  awp: 'Estructura AWP',
  bim: 'Modelo BIM',
  documental: 'Documental',
  ejecucion: 'Ejecución',
  departamentos: 'Departamentos',
};

export interface FuenteDato {
  key: string;
  label: string;
  tabla: string;
  capa: CapaDato;
  /** Columna que transporta la llave CWP. null = esta fuente todavía no la lleva. */
  campoCwp: string | null;
  /** Módulos que esta fuente habilita. */
  modulos: ModuleKey[];
  /** Sin esta fuente el proyecto no es operable. */
  esencial?: boolean;
}

export const FUENTES: FuenteDato[] = [
  // ── Estructura AWP: el esqueleto. Sin catálogo CWP no hay llave que repartir.
  { key: 'cwp',            label: 'Catálogo CWP',      tabla: 'mining_cwp',           capa: 'awp',           campoCwp: null,             modulos: ['mineria', 'planificacion'], esencial: true },
  { key: 'programa',       label: 'Programa P6',       tabla: 'mining_programa',      capa: 'awp',           campoCwp: 'cwp_id',         modulos: ['planificacion', 'recursos'], esencial: true },
  { key: 'itemizado',      label: 'Itemizado ECO-2',   tabla: 'mining_itemizado',     capa: 'awp',           campoCwp: 'cwp_id',         modulos: ['estado-pago', 'conciliacion'], esencial: true },
  { key: 'ponderaciones',  label: 'Bases M&P',         tabla: 'mining_ponderaciones', capa: 'awp',           campoCwp: null,             modulos: ['estado-pago'] },
  // ── Modelo BIM
  { key: 'elementos',      label: 'Elementos 3D',      tabla: 'mining_elementos',     capa: 'bim',           campoCwp: 'cwp_id',         modulos: ['mineria'] },
  // ── Documental (CDE)
  { key: 'planos',         label: 'Planos',            tabla: 'mining_planos',        capa: 'documental',    campoCwp: 'cwp_id',         modulos: ['mineria'] },
  { key: 'documentos',     label: 'Docs Aconex',       tabla: 'mining_doc_aconex',    capa: 'documental',    campoCwp: 'cwp_id_exacto',  modulos: ['calidad', 'sso', 'medio-ambiente'] },
  // ── Ejecución
  { key: 'iwp',            label: 'IWP',               tabla: 'mining_iwp',           capa: 'ejecucion',     campoCwp: 'cwp_id',         modulos: ['mineria'] },
  { key: 'trisemanal',     label: 'Trisemanal 3WLA',   tabla: 'mining_3wla',          capa: 'ejecucion',     campoCwp: 'cwp_id',         modulos: ['trisemanal'] },
  { key: 'avance',         label: 'Avance registrado', tabla: 'mining_avance_pasos',  capa: 'ejecucion',     campoCwp: null,             modulos: ['estado-pago'] },
  // ── Departamentos
  { key: 'personal',       label: 'Personal',          tabla: 'mining_personal',      capa: 'departamentos', campoCwp: null,             modulos: ['rrhh'] },
  { key: 'suministros',    label: 'Suministros',       tabla: 'mining_suministro',    capa: 'departamentos', campoCwp: 'cwp_id',         modulos: ['mineria'] },
  { key: 'equipos',        label: 'Equipos',           tabla: 'mining_equipos',       capa: 'departamentos', campoCwp: null,             modulos: ['equipos'] },
  { key: 'dotacion',       label: 'Dotación',          tabla: 'mining_dotacion',      capa: 'departamentos', campoCwp: null,             modulos: ['recursos', 'rrhh'] },
  { key: 'consideraciones',label: 'Consideraciones',   tabla: 'mining_consideraciones',capa: 'departamentos', campoCwp: 'cwp_id',        modulos: ['calidad', 'sso'] },
];

export const FUENTE_BY_KEY: Record<string, FuenteDato> = Object.fromEntries(FUENTES.map(f => [f.key, f]));

// ── Nivel de madurez ────────────────────────────────────────────────────────────
// No mide "cuántos datos hay" sino QUÉ SE PUEDE HACER con lo que hay. Cada nivel
// habilita preguntas que el anterior no podía responder.

export type NivelMadurez = 'vacio' | 'estructura' | 'planificable' | 'cobrable' | 'visual' | 'ejecutable' | 'midiendo';

export const NIVELES: { key: NivelMadurez; label: string; descripcion: string }[] = [
  { key: 'vacio',        label: 'Vacío',        descripcion: 'Proyecto creado, sin datos cargados.' },
  { key: 'estructura',   label: 'Estructura',   descripcion: 'Tiene catálogo CWP: ya existe la llave para colgar todo lo demás.' },
  { key: 'planificable', label: 'Planificable', descripcion: 'Programa vinculado al CWP: se puede ver la secuencia y la carga de HH.' },
  { key: 'cobrable',     label: 'Cobrable',     descripcion: 'Itemizado y Bases M&P: se puede valorizar y emitir estado de pago.' },
  { key: 'visual',       label: 'Visual',       descripcion: 'Elementos BIM vinculados: se navega la obra en 3D desde el paquete.' },
  { key: 'ejecutable',   label: 'Ejecutable',   descripcion: 'IWP o trisemanal: el trabajo está abierto a nivel de cuadrilla.' },
  { key: 'midiendo',     label: 'Midiendo',     descripcion: 'Hay avance registrado: la plataforma opera el proyecto, no solo lo describe.' },
];

export interface ConteoFuente { total: number; conLlave: number | null }

/** Nivel alcanzado según lo que hay cargado. Los niveles son acumulativos. */
export function nivelMadurez(c: Record<string, ConteoFuente>): NivelMadurez {
  const hay = (k: string) => (c[k]?.total ?? 0) > 0;
  if (!hay('cwp')) return 'vacio';
  if (hay('avance')) return 'midiendo';
  if (hay('iwp') || hay('trisemanal')) return 'ejecutable';
  if (hay('elementos')) return 'visual';
  if (hay('itemizado') && hay('ponderaciones')) return 'cobrable';
  if (hay('programa')) return 'planificable';
  return 'estructura';
}

/**
 * Cobertura de la llave: qué tan conectado está el proyecto.
 *
 * `pct` es el promedio de cobertura POR FUENTE, no por fila. Ponderar por filas sería
 * engañoso: un proyecto con 57.000 elementos BIM bien vinculados y 700 documentos sueltos
 * daría 99% y escondería que toda la capa documental está desconectada. Cada fuente pesa
 * igual porque cada una habilita preguntas distintas.
 *
 * `filas`/`conLlave` quedan como detalle del volumen absoluto.
 */
export function coberturaLlave(c: Record<string, ConteoFuente>): {
  filas: number; conLlave: number; pct: number; fuentesConDatos: number; fuentesConectadas: number;
} {
  let filas = 0, conLlave = 0, suma = 0, n = 0, conectadas = 0;
  for (const f of FUENTES) {
    if (!f.campoCwp) continue;
    const x = c[f.key];
    if (!x || !x.total) continue;
    filas += x.total;
    conLlave += x.conLlave ?? 0;
    const pctFuente = ((x.conLlave ?? 0) / x.total) * 100;
    suma += pctFuente;
    n++;
    if (pctFuente >= 98) conectadas++;
  }
  return {
    filas, conLlave,
    pct: n ? Math.round(suma / n) : 0,
    fuentesConDatos: n,
    fuentesConectadas: conectadas,
  };
}

/** Fuentes esenciales que faltan — lo que hay que cargar para desbloquear el proyecto. */
export function faltantesEsenciales(c: Record<string, ConteoFuente>): string[] {
  return FUENTES.filter(f => f.esencial && !(c[f.key]?.total ?? 0)).map(f => f.label);
}
