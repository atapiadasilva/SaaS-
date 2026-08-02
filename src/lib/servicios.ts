// Catálogo canónico de SERVICIOS — única fuente de verdad de quién es dueño de qué dato.
//
// Es el tercer gemelo: `modules.ts` dice qué módulos ve un proyecto, `fuentes-datos.ts` dice
// de qué datos se alimenta, y este dice QUIÉN LOS GOBIERNA.
//
// PRINCIPIO: un dato tiene un solo dueño. El servicio dueño es el único que escribe; todos los
// demás leen lo que ese servicio decidió publicar, nunca sus tablas internas. Así un
// departamento puede trabajar a su ritmo (borradores, correcciones) sin contaminar al resto, y
// el resto puede confiar en que lo publicado es deliberado.
//
// El diseño completo está en `docs/ARQUITECTURA_SERVICIOS.md`.

import type { ModuleKey } from './modules';
import { FUENTE_BY_KEY, type FuenteDato } from './fuentes-datos';

export type ServicioKey =
  | 'awp' | 'bim' | 'documental' | 'ejecucion' | 'recursos'
  | 'equipos' | 'suministros' | 'calidad' | 'sso' | 'medioambiente' | 'comercial';

/** Estado de una versión de servicio. Solo `publicada` es visible para los demás. */
export type EstadoVersion = 'draft' | 'publicada' | 'retirada';

export interface ServicioDef {
  key: ServicioKey;
  label: string;
  /** Quién responde por este dato en la obra. No es un rol del sistema, es una persona real. */
  dueno: string;
  descripcion: string;
  /** Schema privado en Postgres. Solo este servicio escribe ahí. */
  schema: string;
  /** Claves de `FUENTES` (fuentes-datos.ts) que este servicio gobierna. */
  fuentes: string[];
  /**
   * Recursos que este servicio ofrece al resto: su contrato. Cada uno es una vista
   * `pub.<servicio>_<recurso>` y un endpoint `/api/servicios/<servicio>/<recurso>`.
   */
  publica: string[];
  /** Servicios de los que lee — siempre vía `pub`, nunca vía sus tablas. */
  consume: ServicioKey[];
  /** Módulos de la UI que este servicio alimenta. */
  modulos: ModuleKey[];
  /**
   * `true` = ya vive en su schema privado, versionado y con contrato publicado.
   * `false` = todavía en `public.mining_*`, pendiente de migrar. El catálogo dice la
   * verdad sobre lo que existe, no sobre lo que se planea.
   */
  migrado?: boolean;
}

export const SERVICIOS: ServicioDef[] = [
  {
    key: 'awp', label: 'AWP / Control de Proyecto', dueno: 'Control de Proyecto',
    descripcion: 'La estructura del contrato: paquetes, programa, itemizado y ponderaciones. Es la raíz de la que cuelga todo lo demás.',
    schema: 'svc_awp',
    fuentes: ['cwp', 'programa', 'itemizado', 'ponderaciones'],
    publica: ['cwp', 'programa', 'itemizado', 'ponderaciones'],
    consume: [],
    modulos: ['mineria', 'planificacion', 'estado-pago', 'conciliacion'],
  },
  {
    key: 'bim', label: 'BIM', dueno: 'Coordinación BIM',
    descripcion: 'El modelo: elementos 3D vinculados a su paquete y los sistemas que forman.',
    schema: 'svc_bim',
    fuentes: ['elementos'],
    publica: ['elementos', 'sistemas'],
    consume: ['awp'],
    modulos: ['mineria'],
  },
  {
    key: 'documental', label: 'Control Documental', dueno: 'Control Documental',
    descripcion: 'El CDE: planos y documentos vigentes, con su revisión y estado de aprobación.',
    schema: 'svc_documental',
    fuentes: ['planos', 'documentos'],
    publica: ['planos', 'documentos'],
    consume: ['awp'],
    modulos: ['mineria', 'calidad', 'sso', 'medio-ambiente'],
  },
  {
    key: 'ejecucion', label: 'Ejecución / Terreno', dueno: 'Administración de Obra',
    descripcion: 'Lo que realmente pasa en terreno: IWP abiertos, avance registrado y restricciones.',
    schema: 'svc_ejecucion',
    fuentes: ['iwp', 'trisemanal', 'avance'],
    publica: ['iwp', 'avance', 'restricciones'],
    consume: ['awp', 'bim', 'recursos'],
    modulos: ['mineria', 'trisemanal'],
  },
  {
    key: 'recursos', label: 'Recursos y Personal', dueno: 'RRHH / Administración de Obra',
    descripcion: 'El dato REAL de terreno: Reporte Diario (dotación, HH y actividades ejecutadas) y la nómina con sus cuadrillas. La dotación *estimada* no vive aquí: se deriva del programa, y es de `awp`.',
    schema: 'svc_recursos',
    fuentes: ['personal', 'dotacion'],
    publica: ['reporte_diario', 'actividades', 'hh_por_cwp', 'equipos_horas', 'personal', 'cuadrillas', 'cobertura_llave'],
    consume: ['awp'],
    modulos: ['recursos', 'rrhh'],
    migrado: true,
  },
  {
    key: 'equipos', label: 'Equipos', dueno: 'Equipos y Maquinaria',
    descripcion: 'Maquinaria disponible, acreditación y asignación.',
    schema: 'svc_equipos',
    fuentes: ['equipos'],
    publica: ['disponibilidad'],
    consume: ['awp'],
    modulos: ['equipos'],
  },
  {
    key: 'suministros', label: 'Suministros', dueno: 'Abastecimiento',
    descripcion: 'Estado del material por paquete: es la restricción que más frena terreno.',
    schema: 'svc_suministros',
    fuentes: ['suministros'],
    publica: ['estado'],
    consume: ['awp'],
    modulos: ['mineria'],
  },
  {
    key: 'calidad', label: 'Calidad', dueno: 'Calidad',
    descripcion: 'ITP, protocolos, no conformidades y liberaciones por paquete.',
    schema: 'svc_calidad',
    fuentes: ['consideraciones'],
    publica: ['itp', 'liberaciones'],
    consume: ['awp', 'documental'],
    modulos: ['calidad'],
  },
  {
    key: 'sso', label: 'SSO', dueno: 'Prevención de Riesgos',
    descripcion: 'Permisos de trabajo, procedimientos y restricciones de seguridad.',
    schema: 'svc_sso',
    fuentes: [],
    publica: ['restricciones'],
    consume: ['awp', 'documental'],
    modulos: ['sso'],
  },
  {
    key: 'medioambiente', label: 'Medio Ambiente', dueno: 'Medio Ambiente',
    descripcion: 'Consideraciones y restricciones ambientales del contrato.',
    schema: 'svc_medioambiente',
    fuentes: [],
    publica: ['restricciones'],
    consume: ['awp', 'documental'],
    modulos: ['medio-ambiente'],
  },
  {
    key: 'comercial', label: 'Comercial / Estado de Pago', dueno: 'Comercial',
    descripcion: 'Estados de pago emitidos. Es casi puro consumidor: por eso es el que más necesita saber con qué versiones se calculó cada cifra.',
    schema: 'svc_comercial',
    fuentes: [],
    publica: ['emitidos'],
    consume: ['awp', 'ejecucion', 'recursos'],
    modulos: ['estado-pago'],
  },
];

export const SERVICIO_BY_KEY: Record<string, ServicioDef> =
  Object.fromEntries(SERVICIOS.map(s => [s.key, s]));

/** Servicio dueño de una fuente de datos. `undefined` = fuente huérfana, hay que asignarla. */
export function duenoDeFuente(fuenteKey: string): ServicioDef | undefined {
  return SERVICIOS.find(s => s.fuentes.includes(fuenteKey));
}

/** Las fuentes que este servicio gobierna, resueltas contra el catálogo de fuentes. */
export function fuentesDeServicio(key: ServicioKey): FuenteDato[] {
  return (SERVICIO_BY_KEY[key]?.fuentes ?? [])
    .map(k => FUENTE_BY_KEY[k])
    .filter(Boolean);
}

/**
 * Fuentes que un servicio gobierna pero que todavía no transportan el CWP.
 *
 * Son las que rompen el diseño en silencio: el servicio puede publicar su contrato, pero el
 * dato no cruza con nada. Un servicio con API y sin llave sigue siendo un silo.
 */
export function fuentesSinLlave(key: ServicioKey): FuenteDato[] {
  return fuentesDeServicio(key).filter(f => !f.campoCwp);
}

/** Quién se rompe si este servicio cambia su contrato. */
export function consumidoresDe(key: ServicioKey): ServicioDef[] {
  return SERVICIOS.filter(s => s.consume.includes(key));
}

/** Nombre de la vista en el schema `pub` que sirve un recurso del contrato. */
export function vistaPub(servicio: ServicioKey, recurso: string): string {
  return `${servicio}_${recurso}`;
}

/** `true` si el recurso pedido es parte del contrato declarado del servicio. */
export function esRecursoPublicado(servicio: string, recurso: string): boolean {
  return SERVICIO_BY_KEY[servicio]?.publica.includes(recurso) ?? false;
}
