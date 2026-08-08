// Deduplicación del feed diario de la IA (`mining_consideraciones`).
//
// POR QUÉ: la tabla acumula una fila por cada carga del reporte, así que el mismo
// hallazgo aparece dos o tres veces. Medido en el Puerto: 71 filas para 36 hechos
// reales; Calidad mostraba tres veces el mismo ITP rechazado. Al usuario le importa
// el hecho, no cuántas veces se registró.
//
// Fuente única a propósito: el Panel deduplicaba por su cuenta en el cliente y los
// dashboards de departamento no deduplicaban nada, así que la misma observación se
// contaba 1 vez en un lado y 3 en el otro. Cualquier pantalla que muestre o cuente
// consideraciones pasa por aquí.

export interface ConsideracionBase {
  titulo?: string | null;
  tipo?: string | null;
  detalle?: string | null;
  fecha_reporte?: string | null;
  n_cmdic?: string | null;
  cwp_id?: string | null;
  iwp_id?: string | null;
  responsable?: string | null;
  [k: string]: unknown;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** El mismo hallazgo cargado dos veces comparte título y tipo. El detalle no entra en
 *  la llave: entre cargas suele venir reescrito y separaría copias del mismo hecho. */
const llave = (c: ConsideracionBase) => `${norm(c.titulo)}|${norm(c.tipo)}`;

/** Entre copias gana la que sirve más: primero la que trae vínculos (documento, CWP,
 *  IWP, responsable), y a igual riqueza la más reciente. Quedarse con la primera que
 *  llega perdería el chip del documento que sí trae una de ellas. */
function riqueza(c: ConsideracionBase): number {
  return [c.n_cmdic, c.cwp_id, c.iwp_id, c.responsable, c.detalle].filter(v => !!String(v ?? '').trim()).length;
}

export function dedupeConsideraciones<T extends ConsideracionBase>(filas: T[]): T[] {
  const mejorPorLlave = new Map<string, T>();

  for (const fila of filas) {
    const k = llave(fila);
    const actual = mejorPorLlave.get(k);
    if (!actual) { mejorPorLlave.set(k, fila); continue; }

    const rNueva = riqueza(fila);
    const rActual = riqueza(actual);
    if (rNueva > rActual) { mejorPorLlave.set(k, fila); continue; }
    if (rNueva === rActual && String(fila.fecha_reporte ?? '') > String(actual.fecha_reporte ?? '')) {
      mejorPorLlave.set(k, fila);
    }
  }

  return [...mejorPorLlave.values()];
}
