// Catálogo de lo que se puede cruzar en el Explorador de datos.
//
// La idea: cualquier pregunta del tipo "HH por CWA y disciplina" o "monto del itemizado
// por commodity" se responde eligiendo fuente + dimensión + métrica, sin escribir SQL ni
// programar una vista nueva por cada pregunta.
//
// Complementa a `fuentes-datos.ts`: aquel dice QUÉ fuentes tiene un proyecto y si traen la
// llave; este dice CÓMO se pueden agrupar y sumar.

export interface Dimension {
  key: string;      // columna real en la tabla
  label: string;
}

export interface Metrica {
  key: string;      // columna a sumar; 'count' = contar filas
  label: string;
  formato: 'entero' | 'clp' | 'decimal';
}

export interface FuenteExplorable {
  key: string;
  label: string;
  tabla: string;
  /** Filtro fijo que siempre se aplica (ej. el programa vigente). */
  filtro?: { columna: string; valor: string };
  dimensiones: Dimension[];
  metricas: Metrica[];
}

const CONTEO: Metrica = { key: 'count', label: 'Cantidad de filas', formato: 'entero' };

export const FUENTES_EXPLORABLES: FuenteExplorable[] = [
  {
    key: 'cwp', label: 'Catálogo CWP', tabla: 'mining_cwp',
    dimensiones: [
      { key: 'cwa_id', label: 'CWA (área)' },
      { key: 'cv_id', label: 'CV (subárea)' },
      { key: 'disciplina_cod', label: 'Disciplina' },
      { key: 'disciplina', label: 'Disciplina (nombre)' },
      { key: 'status_cwp', label: 'Estado del CWP' },
      { key: 'suministro', label: 'Estado de suministro' },
    ],
    metricas: [CONTEO,
      { key: 'hh_planner', label: 'HH planner', formato: 'entero' },
      { key: 'costo_oferta_clp', label: 'Costo oferta', formato: 'clp' }],
  },
  {
    key: 'programa', label: 'Programa', tabla: 'mining_programa',
    filtro: { columna: 'fuente', valor: 'P333' },
    dimensiones: [
      { key: 'cwp_id', label: 'CWP' },
      { key: 'cwa_id', label: 'CWA (área)' },
      { key: 'tipo', label: 'Tipo de actividad' },
      { key: 'sector', label: 'Sector' },
      { key: 'wbs', label: 'WBS' },
    ],
    metricas: [CONTEO,
      { key: 'hh', label: 'HH', formato: 'entero' },
      { key: 'cantidad', label: 'Cantidad', formato: 'decimal' }],
  },
  {
    key: 'itemizado', label: 'Itemizado ECO-2', tabla: 'mining_itemizado',
    dimensiones: [
      { key: 'cwp_id', label: 'CWP' },
      { key: 'cwa_id', label: 'CWA (área)' },
      { key: 'area', label: 'Área' },
      { key: 'commodity', label: 'Commodity' },
      { key: 'unidad', label: 'Unidad' },
      { key: 'partida_mp', label: 'Partida M&P' },
      { key: 'tipo_partida', label: 'Tipo de partida' },
    ],
    metricas: [CONTEO,
      { key: 'p_total_clp', label: 'Monto total', formato: 'clp' },
      { key: 'hh_item', label: 'HH', formato: 'entero' },
      { key: 'cantidad', label: 'Cantidad', formato: 'decimal' }],
  },
  {
    key: 'elementos', label: 'Elementos BIM', tabla: 'mining_elementos',
    dimensiones: [
      { key: 'cwp_id', label: 'CWP' },
      { key: 'cwa_id', label: 'CWA (área)' },
      { key: 'disciplina', label: 'Disciplina' },
      { key: 'tipo_elemento', label: 'Tipo de elemento' },
      { key: 'sector', label: 'Sector' },
      { key: 'material', label: 'Material' },
      { key: 'estado', label: 'Estado' },
      { key: 'swp_id', label: 'SWP (sistema)' },
    ],
    metricas: [CONTEO,
      { key: 'peso_kg', label: 'Peso (kg)', formato: 'decimal' },
      { key: 'volumen_m3', label: 'Volumen (m³)', formato: 'decimal' }],
  },
  {
    key: 'planos', label: 'Planos', tabla: 'mining_planos',
    dimensiones: [
      { key: 'cwp_id', label: 'CWP' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'confianza', label: 'Origen del vínculo' },
    ],
    metricas: [CONTEO],
  },
  {
    key: 'documentos', label: 'Documentos Aconex', tabla: 'mining_doc_aconex',
    dimensiones: [
      { key: 'cwp_id_exacto', label: 'CWP' },
      { key: 'cwa_id', label: 'CWA (área)' },
      { key: 'tipo_doc', label: 'Tipo de documento' },
      { key: 'estado_aconex', label: 'Estado en Aconex' },
      { key: 'disciplina_doc', label: 'Disciplina' },
      { key: 'origen', label: 'Empresa' },
    ],
    metricas: [CONTEO],
  },
  {
    key: 'trisemanal', label: 'Trisemanal 3WLA', tabla: 'mining_3wla',
    dimensiones: [
      { key: 'cwp_id', label: 'CWP' },
      { key: 'especialidad', label: 'Especialidad' },
      { key: 'commodity', label: 'Commodity' },
      { key: 'fecha_control', label: 'Fecha de control' },
    ],
    metricas: [CONTEO, { key: 'hh_total', label: 'HH', formato: 'entero' }],
  },
  {
    key: 'suministros', label: 'Suministros', tabla: 'mining_suministro',
    dimensiones: [
      { key: 'cwp_id', label: 'CWP' },
      { key: 'proveedor', label: 'Proveedor' },
      { key: 'liberado', label: 'Liberado' },
    ],
    metricas: [CONTEO],
  },
];

export const FUENTE_EXPLORABLE_BY_KEY: Record<string, FuenteExplorable> =
  Object.fromEntries(FUENTES_EXPLORABLES.map(f => [f.key, f]));

/** Etiqueta legible para una celda vacía: distinguir "sin dato" de un valor real. */
export const SIN_VALOR = '(sin asignar)';
