// El estado de un IWP y las reglas para moverlo. Fuente única: lo leen la API, el detalle
// del paquete, el Skyline, el Gantt y la Sala de Apertura.
//
// Antes esto vivía repartido en cinco mapas de color que comparaban strings a mano, y en la
// base convivían tres grafías del mismo estado ('Planificado', 'PLANIFICADO',
// 'LISTO_PARA_TRABAJO'). Un IWP creado por el asistente no pintaba en ninguna vista.
//
// La máquina separa dos cosas que el estándar COAA/CII trata distinto y que antes estaban
// mezcladas:
//
//   LISTO_PARA_TRABAJO   el paquete quedó sin restricciones pendientes → lo calcula el sistema
//   LIBERADO             el superintendente lo mandó a terreno         → lo decide una persona
//
// Esa frontera es la regla dura del WorkFace Planning: **un IWP no se libera a terreno si no
// está libre de restricciones**. Es también el momento exacto en que la plataforma vale plata,
// así que se valida en el servidor y no se confía en el cliente.

export const ESTADOS_IWP = [
  'PLANIFICADO',
  'LISTO_PARA_TRABAJO',
  'LIBERADO',
  'EN_EJECUCION',
  'COMPLETADO',
  'CERRADO',
  'HOLD',
] as const;

export type EstadoIwp = (typeof ESTADOS_IWP)[number];

export interface EstadoMeta {
  label: string;
  /** Qué significa, en la lengua de terreno. Va en los tooltips. */
  ayuda: string;
  /** Color del bloque en Skyline / Gantt / listas. */
  color: string;
  fondo: string;
  texto: string;
  /** Lo mueve el sistema solo; no se ofrece como acción manual. */
  automatico?: boolean;
}

export const ESTADO_META: Record<EstadoIwp, EstadoMeta> = {
  PLANIFICADO: {
    label: 'Planificado',
    ayuda: 'El paquete existe y tiene alcance, pero todavía tiene restricciones por despejar.',
    color: '#94A3B8', fondo: '#F1F5F9', texto: '#334155',
  },
  LISTO_PARA_TRABAJO: {
    label: 'Listo',
    ayuda: 'Sin restricciones pendientes. Entra al backlog ejecutable y puede liberarse a terreno.',
    color: '#16A34A', fondo: '#ECFDF5', texto: '#047857',
    automatico: true,
  },
  LIBERADO: {
    label: 'Liberado',
    ayuda: 'El superintendente lo entregó a terreno. La cuadrilla ya puede tomarlo.',
    color: '#FF0000', fondo: '#FEF2F2', texto: '#991B1B',
  },
  EN_EJECUCION: {
    label: 'En ejecución',
    ayuda: 'La cuadrilla está trabajando en el paquete y hay avance reportado.',
    color: '#F59E0B', fondo: '#FEF3C7', texto: '#B45309',
  },
  COMPLETADO: {
    label: 'Completado',
    ayuda: 'El alcance del paquete está terminado en terreno, a la espera de cierre documental.',
    color: '#059669', fondo: '#D1FAE5', texto: '#065F46',
  },
  CERRADO: {
    label: 'Cerrado',
    ayuda: 'Cerrado y valorizado. Ya no se toca.',
    color: '#475569', fondo: '#E2E8F0', texto: '#1E293B',
  },
  HOLD: {
    label: 'En espera',
    ayuda: 'Congelado por una decisión del proyecto, no por una restricción.',
    color: '#7C3AED', fondo: '#F3E8FF', texto: '#6B21A8',
  },
};

export function esEstadoIwp(v: unknown): v is EstadoIwp {
  return typeof v === 'string' && (ESTADOS_IWP as readonly string[]).includes(v);
}

/**
 * Normaliza lo que venga de la base o de un import antiguo. Devuelve `PLANIFICADO` ante
 * cualquier cosa que no reconozca: es el estado más conservador — nunca convierte basura en
 * "listo para trabajo".
 */
export function normalizarEstado(v: unknown): EstadoIwp {
  const s = String(v ?? '').trim().toUpperCase();
  if (esEstadoIwp(s)) return s;
  if (s === 'EN_ESPERA' || s === 'ESPERA') return 'HOLD';
  return 'PLANIFICADO';
}

export const metaDe = (v: unknown): EstadoMeta => ESTADO_META[normalizarEstado(v)];

// ─── Transiciones ────────────────────────────────────────────────────────────

/** A dónde puede ir cada estado. Un destino ausente es una transición prohibida. */
const TRANSICIONES: Record<EstadoIwp, EstadoIwp[]> = {
  PLANIFICADO:        ['LISTO_PARA_TRABAJO', 'HOLD'],
  LISTO_PARA_TRABAJO: ['LIBERADO', 'PLANIFICADO', 'HOLD'],
  LIBERADO:           ['EN_EJECUCION', 'LISTO_PARA_TRABAJO', 'HOLD'],
  EN_EJECUCION:       ['COMPLETADO', 'HOLD'],
  COMPLETADO:         ['CERRADO', 'EN_EJECUCION'],
  CERRADO:            [],
  HOLD:               ['PLANIFICADO', 'LISTO_PARA_TRABAJO', 'LIBERADO', 'EN_EJECUCION'],
};

export interface ContextoTransicion {
  /** Restricciones abiertas del paquete. El gate de liberación se juega acá. */
  constraintsPendientes: number;
  /** Si el paquete tiene cantidades asignadas. Sin alcance no hay nada que liberar. */
  tienePartidas?: boolean;
  avancePct?: number;
}

export interface Veredicto {
  ok: boolean;
  /** Por qué no se puede, en palabras que sirvan de mensaje de error tal cual. */
  motivo?: string;
}

/**
 * ¿Se puede mover este paquete a `destino`?
 *
 * Las dos reglas que importan:
 *  - `LIBERADO` exige cero restricciones pendientes. Es la regla dura del estándar y la razón
 *    de que exista este archivo.
 *  - `LISTO_PARA_TRABAJO` también: marcar "listo" con restricciones abiertas sería mentirle
 *    al backlog, que es justamente el número que el superintendente usa para decidir.
 */
export function puedeTransicionar(
  desde: unknown,
  destino: unknown,
  ctx: ContextoTransicion,
): Veredicto {
  const origen = normalizarEstado(desde);

  if (!esEstadoIwp(destino)) {
    return { ok: false, motivo: `"${String(destino)}" no es un estado válido de IWP.` };
  }
  if (origen === destino) return { ok: true };

  if (!TRANSICIONES[origen].includes(destino)) {
    return {
      ok: false,
      motivo: `Un paquete ${ESTADO_META[origen].label.toLowerCase()} no puede pasar a ${ESTADO_META[destino].label.toLowerCase()}.`,
    };
  }

  if (destino === 'LISTO_PARA_TRABAJO' && ctx.constraintsPendientes > 0) {
    return {
      ok: false,
      motivo: `Quedan ${ctx.constraintsPendientes} restricción(es) sin despejar. Un IWP no entra al backlog con restricciones abiertas.`,
    };
  }

  if (destino === 'LIBERADO') {
    if (ctx.constraintsPendientes > 0) {
      return {
        ok: false,
        motivo: `No se puede liberar a terreno con ${ctx.constraintsPendientes} restricción(es) abierta(s). Despéjalas primero — es la regla del WorkFace Planning, no una advertencia.`,
      };
    }
    if (ctx.tienePartidas === false) {
      return {
        ok: false,
        motivo: 'Este paquete no tiene cantidades asignadas: terreno no tendría qué medir para cerrarlo. Aperturalo desde el CWP en vez de liberarlo así.',
      };
    }
  }

  return { ok: true };
}

/** Los destinos que tiene sentido ofrecerle a una persona desde el estado actual. */
export function transicionesManuales(desde: unknown): EstadoIwp[] {
  return TRANSICIONES[normalizarEstado(desde)].filter(e => !ESTADO_META[e].automatico);
}

// ─── Lectura de tablero ──────────────────────────────────────────────────────

/** Un paquete cuenta para el backlog ejecutable cuando ya no depende de nadie más. */
export function enBacklogEjecutable(estado: unknown): boolean {
  const e = normalizarEstado(estado);
  return e === 'LISTO_PARA_TRABAJO' || e === 'LIBERADO';
}

export function estaCerrado(estado: unknown): boolean {
  const e = normalizarEstado(estado);
  return e === 'COMPLETADO' || e === 'CERRADO';
}

/** Semana ISO (`2026-W31`), que es como agrupan el Skyline y las rutinas semanales. */
export function semanaIso(fechaIso: string): string {
  const d = new Date(fechaIso.slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d.getTime())) return '';
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}
