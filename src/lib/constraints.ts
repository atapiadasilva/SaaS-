// Catálogo de restricciones de un IWP, alineado al estándar COAA/CII de WorkFace Planning.
//
// Antes los tipos eran seis strings sueltos en un `<select>` y el POST de apertura escribía
// derecho el nombre del departamento como tipo. Sin catálogo no hay dueño; sin dueño la
// restricción no se cierra sola y los departamentos no tienen ninguna razón para entrar a la
// plataforma.
//
// El estándar separa las restricciones **críticas** —documentos, materiales y andamios, las
// tres que efectivamente matan un IWP— de las **secundarias** (equipos de construcción,
// control de proyecto, seguridad, calidad y personal). Se respeta esa distinción porque
// ordena el tablero: lo crítico se escala antes.
//
// `MEDIO_AMBIENTE` no viene del estándar norteamericano: se agrega porque en la minería
// chilena es un departamento con permisos propios que frenan frentes de trabajo.

export const TIPOS_CONSTRAINT = [
  'INGENIERIA',
  'MATERIAL',
  'ANDAMIO',
  'EQUIPO',
  'PERMISO',
  'PREDECESORA',
  'CALIDAD',
  'PERSONAL',
  'MEDIO_AMBIENTE',
  'OTRO',
] as const;

export type TipoConstraint = (typeof TIPOS_CONSTRAINT)[number];

export interface TipoConstraintMeta {
  label: string;
  /** Qué se está esperando, dicho como lo diría un planificador. */
  ayuda: string;
  /** Departamento que responde por el cierre. Alimenta la bandeja de cada módulo. */
  depto: string;
  /** Las tres críticas del estándar: se escalan antes que el resto. */
  critica: boolean;
  color: string;
}

export const CONSTRAINT_META: Record<TipoConstraint, TipoConstraintMeta> = {
  INGENIERIA: {
    label: 'Ingeniería / IFC',
    ayuda: 'Plano o documento que todavía no está emitido para construcción.',
    depto: 'Ingeniería', critica: true, color: '#1D4ED8',
  },
  MATERIAL: {
    label: 'Material',
    ayuda: 'Suministro sin liberar, sin llegar a obra o sin recepcionar en bodega.',
    depto: 'Suministros', critica: true, color: '#B45309',
  },
  ANDAMIO: {
    label: 'Andamio',
    ayuda: 'Acceso al frente que depende de un andamio no montado o no certificado.',
    depto: 'Equipos', critica: true, color: '#C2410C',
  },
  EQUIPO: {
    label: 'Equipo de construcción',
    ayuda: 'Grúa, manlift, equipo de soldadura o herramienta mayor no disponible.',
    depto: 'Equipos', critica: false, color: '#0F766E',
  },
  PERMISO: {
    label: 'Permiso',
    ayuda: 'Permiso de trabajo, bloqueo, izaje o intervención sin autorizar.',
    depto: 'SSO', critica: false, color: '#7C3AED',
  },
  PREDECESORA: {
    label: 'Predecesora',
    ayuda: 'Trabajo previo de otra disciplina que aún no libera el frente.',
    depto: 'Planificación', critica: false, color: '#475569',
  },
  CALIDAD: {
    label: 'Calidad / ITP',
    ayuda: 'Protocolo, ITP o liberación de calidad pendiente.',
    depto: 'Calidad', critica: false, color: '#0369A1',
  },
  PERSONAL: {
    label: 'Personal',
    ayuda: 'Cuadrilla incompleta, sin acreditación o sin la especialidad requerida.',
    depto: 'RRHH', critica: false, color: '#9D174D',
  },
  MEDIO_AMBIENTE: {
    label: 'Medio ambiente',
    ayuda: 'Permiso ambiental, manejo de residuos o restricción de intervención.',
    depto: 'Medio Ambiente', critica: false, color: '#15803D',
  },
  OTRO: {
    label: 'Otro',
    ayuda: 'Cualquier impedimento que no calce en las categorías del estándar.',
    depto: 'Proyecto', critica: false, color: '#6B7280',
  },
};

export function esTipoConstraint(v: unknown): v is TipoConstraint {
  return typeof v === 'string' && (TIPOS_CONSTRAINT as readonly string[]).includes(v);
}

/**
 * Lleva cualquier etiqueta antigua o texto libre al catálogo. Se usa al sembrar restricciones
 * en la apertura (donde el origen es una consideración de departamento con el tipo escrito a
 * mano) y al normalizar imports.
 */
export function normalizarTipo(v: unknown): TipoConstraint {
  // Sin quitar los acentos, "Ingeniería" no calzaba con INGENIERIA y caía en OTRO — que es
  // justo como lo escribe cualquiera en castellano. Pasó con 25 de 56 restricciones en SCPY.
  const s = String(v ?? '').trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_');
  if (esTipoConstraint(s)) return s;

  const alias: Record<string, TipoConstraint> = {
    IFC: 'INGENIERIA', DOCUMENTO: 'INGENIERIA', DOCUMENTOS: 'INGENIERIA', PLANO: 'INGENIERIA',
    PLANOS: 'INGENIERIA', DISENO: 'INGENIERIA', CONTROL_DOCUMENTAL: 'INGENIERIA',
    MATERIALES: 'MATERIAL', SUMINISTRO: 'MATERIAL', SUMINISTROS: 'MATERIAL', BODEGA: 'MATERIAL',
    ANDAMIOS: 'ANDAMIO', SCAFFOLD: 'ANDAMIO',
    EQUIPOS: 'EQUIPO', MAQUINARIA: 'EQUIPO', GRUA: 'EQUIPO',
    PERMISOS: 'PERMISO', SSO: 'PERMISO', SEGURIDAD: 'PERMISO', HSE: 'PERMISO',
    PREDECESORAS: 'PREDECESORA', SECUENCIA: 'PREDECESORA', ACCESO: 'PREDECESORA',
    // "Liberación de área" es como el 3WLA nombra el frente que otra disciplina todavía no
    // entrega: es una predecesora, no un "Otro".
    LIBERACION_DE_AREA: 'PREDECESORA', LIBERACION: 'PREDECESORA', AREA: 'PREDECESORA',
    ITP: 'CALIDAD', PROTOCOLO: 'CALIDAD', QA: 'CALIDAD', QC: 'CALIDAD',
    RRHH: 'PERSONAL', DOTACION: 'PERSONAL', CUADRILLA: 'PERSONAL', MANO_DE_OBRA: 'PERSONAL',
    AMBIENTAL: 'MEDIO_AMBIENTE', MEDIOAMBIENTE: 'MEDIO_AMBIENTE', MA: 'MEDIO_AMBIENTE',
  };
  if (alias[s]) return alias[s];

  // Etiquetas compuestas del tipo "Terreno/Acceso": se prueba cada parte antes de rendirse.
  for (const parte of s.split(/[\/|,]+/).map(p => p.trim()).filter(Boolean)) {
    if (esTipoConstraint(parte)) return parte;
    if (alias[parte]) return alias[parte];
  }
  return 'OTRO';
}

export const metaTipo = (v: unknown): TipoConstraintMeta => CONSTRAINT_META[normalizarTipo(v)];

/** El departamento que responde por un tipo, salvo que se haya asignado uno a mano. */
export function deptoDe(tipo: unknown, override?: string | null): string {
  return override?.trim() || CONSTRAINT_META[normalizarTipo(tipo)].depto;
}

export const SEVERIDADES = ['alta', 'media', 'baja'] as const;
export type Severidad = (typeof SEVERIDADES)[number];

export function normalizarSeveridad(v: unknown): Severidad {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'alta' || s === 'bloqueante' || s === 'critica') return 'alta';
  if (s === 'baja' || s === 'info') return 'baja';
  return 'media';
}

/**
 * Cuán urgente es esta restricción hoy. Ordena el tablero: primero lo que ya está vencido y
 * es crítico, después lo que vence pronto.
 *
 * Devuelve días restantes (negativo = vencida) o `null` si no tiene fecha comprometida —
 * porque una restricción sin fecha no es urgente, es peor: nadie se hizo cargo.
 */
export function diasParaVencer(fechaNecesaria: string | null | undefined): number | null {
  if (!fechaNecesaria) return null;
  const f = new Date(fechaNecesaria.slice(0, 10) + 'T00:00:00');
  if (isNaN(f.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - hoy.getTime()) / 86400000);
}
