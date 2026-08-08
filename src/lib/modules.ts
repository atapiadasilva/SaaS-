// Catálogo canónico de módulos de la plataforma — ÚNICA fuente de verdad.
// La navegación, la creación de proyectos, el setup y el gating del layout leen de aquí.
// `projects.active_modules` guarda un arreglo con las `key` de los módulos habilitados por proyecto.

export type ModuleKey =
  | 'panel' | 'mineria' | 'apertura' | 'planificacion' | 'trisemanal' | 'recursos'
  | 'calidad' | 'medio-ambiente' | 'sso' | 'equipos' | 'rrhh'
  | 'conciliacion' | 'estado-pago' | 'setup';

export type ModuleCategory = 'nucleo' | 'awp' | 'departamentos';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  category: ModuleCategory;
  descripcion: string;
  /** Siempre visible, no se puede desactivar (Panel y Setup). */
  alwaysOn?: boolean;
  /** Requiere datos cargados para ser útil (se sugiere activarlo tras el onboarding). */
  requiereDatos?: boolean;
}

export const MODULE_CATALOG: ModuleDef[] = [
  { key: 'panel',          label: 'Panel',          category: 'nucleo', descripcion: 'Tablero ejecutivo con KPIs, curva S y avance por disciplina.', alwaysOn: true },
  { key: 'mineria',        label: 'AWP Minería',    category: 'awp', descripcion: 'Explorador CWP con visor 3D BIM, itemizado, planos, programa e IWP.', requiereDatos: true },
  // La apertura es la acción que da sentido al resto del producto, así que vive en la barra y
  // no escondida dentro de una pestaña del explorador.
  { key: 'apertura',       label: 'Apertura',       category: 'awp', descripcion: 'Sala de Apertura: qué CWP quebrar en IWP esta semana, en qué orden y qué falta en los bloqueados.', requiereDatos: true },
  { key: 'planificacion',  label: 'Planificación',  category: 'awp', descripcion: 'Programa maestro / Carta Gantt por CWP y disciplina.', requiereDatos: true },
  { key: 'trisemanal',     label: 'Trisemanal',     category: 'awp', descripcion: 'Planificación intermedia (3WLA): actividades, HH y restricciones por CWP.', requiereDatos: true },
  { key: 'recursos',       label: 'Recursos',       category: 'awp', descripcion: 'Estadísticas por disciplina y curva de dotación estimada.', requiereDatos: true },
  { key: 'conciliacion',   label: 'Conciliación',   category: 'awp', descripcion: 'Salud de los cruces de datos (itemizado, Bases de M&P, Programa, Aconex, BIM) y match manual.', requiereDatos: true },
  { key: 'estado-pago',    label: 'Estado de Pago', category: 'awp', descripcion: 'Avance físico/financiero por ítem y monto ganado según Bases de M&P.', requiereDatos: true },
  { key: 'calidad',        label: 'Calidad',        category: 'departamentos', descripcion: 'Documentos, procedimientos e ITP con estado de aprobación en Aconex.' },
  { key: 'medio-ambiente', label: 'M. Ambiente',    category: 'departamentos', descripcion: 'Documentos y consideraciones ambientales del contrato.' },
  { key: 'sso',            label: 'SSO',            category: 'departamentos', descripcion: 'Seguridad y salud ocupacional: permisos, procedimientos y documentos.' },
  { key: 'equipos',        label: 'Equipos',        category: 'departamentos', descripcion: 'Maquinaria y equipos: acreditación y documentación.' },
  { key: 'rrhh',           label: 'RRHH',           category: 'departamentos', descripcion: 'Personal, dotación y documentación de recursos humanos.' },
  { key: 'setup',          label: 'Setup',          category: 'nucleo', descripcion: 'Configuración del proyecto, mapeo de datos y onboarding.', alwaysOn: true },
];

export const MODULE_BY_KEY: Record<string, ModuleDef> = Object.fromEntries(MODULE_CATALOG.map(m => [m.key, m]));

const ALWAYS: ModuleKey[] = MODULE_CATALOG.filter(m => m.alwaysOn).map(m => m.key);

// Módulos activados por defecto al crear un proyecto, según su etapa.
export function modulosPorDefecto(stage?: string | null): ModuleKey[] {
  if (stage === 'operacion') {
    // Proyecto en ejecución: se habilita todo el set AWP + departamentos.
    return MODULE_CATALOG.map(m => m.key);
  }
  // Licitación / cierre / sin etapa: parte mínimo, se van activando tras cargar datos.
  return ['panel', 'conciliacion', 'setup'];
}

// Normaliza el valor crudo de projects.active_modules (puede venir como arreglo nuevo,
// objeto legacy {clave:bool}, o null) a la lista ordenada y saneada de módulos a mostrar.
// Panel siempre primero, Setup siempre último; se descartan claves desconocidas.
export function resolverModulos(raw: unknown): ModuleKey[] {
  let keys: string[] = [];
  if (Array.isArray(raw)) {
    keys = raw.filter((k): k is string => typeof k === 'string');
  } else if (raw && typeof raw === 'object') {
    keys = Object.entries(raw as Record<string, unknown>).filter(([, v]) => v === true).map(([k]) => k);
  }
  const validas = new Set(keys.filter(k => k in MODULE_BY_KEY) as ModuleKey[]);
  for (const a of ALWAYS) validas.add(a);
  // Ordenar según el catálogo (que ya deja panel primero y setup último)
  return MODULE_CATALOG.filter(m => validas.has(m.key)).map(m => m.key);
}
