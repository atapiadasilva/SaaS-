// Color de cada disciplina — fuente única.
//
// POR QUÉ: había cuatro sistemas conviviendo y la misma disciplina salía de distinto color
// según la pantalla. Medido en el Puerto: Estructura (S) era roja en el explorador de Minería
// y morada en Recursos; Obras Civiles (C), azul en una y verde en la otra. Peor todavía, el
// explorador y `/api/mining-data` asignaban el color **por orden alfabético de aparición**,
// así que la misma disciplina cambiaba de color entre proyectos con distinto set de
// disciplinas, y agregar una disciplina nueva recoloreaba todas las demás.
//
// La regla ahora: el color cuelga del CÓDIGO de disciplina (la letra del CWP), que es estable
// y compartido por todos los proyectos. Un código desconocido cae a un gris neutro — no a un
// color prestado de otra disciplina, que es lo que hacía la paleta por índice.

/** Paleta por código de disciplina. Los códigos son los de la letra del CWP (312101.**C**001). */
export const COLOR_DISCIPLINA: Record<string, string> = {
  C:  '#2E7D32', // Obras Civiles
  D:  '#1565C0', // Hormigones
  S:  '#6A1B9A', // Estructura
  M:  '#E65100', // Equipos mecánicos
  MB: '#C9A100', // Calderería / mecánica bulk
  P:  '#AD1457', // Piping
  E:  '#00695C', // Equipos eléctricos
  EW: '#00838F', // Cableado
  ER: '#3949AB', // Módulos sala eléctrica
  T:  '#0891B2', // Canalizaciones
  J:  '#546E7A', // Instrumentos
  A:  '#5E35B1', // Arquitectura
  F:  '#8D6E63', // Facilities
  FF: '#B71C1C', // Red de incendio
  X:  '#795548', // Demoliciones
};

/** Gris neutro para lo que no está en el catálogo (incluye 'N/A' y 'Sin disciplina'). */
export const COLOR_SIN_DISCIPLINA = '#9E9E9E';

/** Color estable de una disciplina por su código. */
export function colorDisciplina(codigo: string | null | undefined): string {
  const k = String(codigo ?? '').trim().toUpperCase();
  return COLOR_DISCIPLINA[k] ?? COLOR_SIN_DISCIPLINA;
}

// Los nombres de disciplina que trae el WBS de Primavera no vienen con el código: la
// Planificación sólo tiene el texto ("OBRAS CIVILES", "PIPING"…). Este mapa lo traduce al
// código para que el Gantt pinte con los mismos colores que el resto de la plataforma.
const NOMBRE_A_CODIGO: [string, string][] = [
  ['OBRAS CIVILES', 'C'], ['CIVIL', 'C'],
  ['HORMIG', 'D'],
  ['ESTRUCTURA', 'S'],
  ['CALDERER', 'MB'],
  ['MECÁNICA', 'M'], ['MECANICA', 'M'],
  ['PIPING', 'P'], ['CAÑERÍA', 'P'], ['CANERIA', 'P'],
  ['CABLEADO', 'EW'],
  ['CANALIZACION', 'T'], ['CANALIZACIÓN', 'T'],
  ['SALA ELÉCTRICA', 'ER'], ['SALA ELECTRICA', 'ER'],
  ['ELECTRIC', 'E'], ['ELÉCTRIC', 'E'],
  ['INSTRUMENT', 'J'],
  ['ARQUITECTURA', 'A'],
  ['FACILITIES', 'F'],
  ['INCENDIO', 'FF'],
  ['DEMOLIC', 'X'],
  ['MOV. TIERRA', 'C'], ['MOVIMIENTO DE TIERRA', 'C'],
];

/** Código de disciplina deducido de un texto libre (WBS de P6, nombre de disciplina). */
export function codigoDesdeNombre(txt: string | null | undefined): string | null {
  const t = String(txt ?? '').toUpperCase();
  for (const [clave, codigo] of NOMBRE_A_CODIGO) if (t.includes(clave)) return codigo;
  return null;
}

/** Color a partir de un texto libre; gris si no se reconoce la disciplina. */
export function colorDesdeNombre(txt: string | null | undefined): string {
  return colorDisciplina(codigoDesdeNombre(txt));
}
