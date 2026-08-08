// Cómo se lee el estado de un documento de Aconex — fuente única.
//
// Aconex maneja DOS estados distintos que se confunden con facilidad, y la plataforma los
// muestra en pantallas distintas:
//
//   · `estado_aconex`      — el estado de revisión del documento (Aprobado, Rechazado,
//                            En revisión). Es lo que miran Calidad y los demás departamentos.
//   · `estado_ciclo_vida`  — el «Estatus» de Aconex: dónde está el documento en su ciclo
//                            («Emitido para construcción» = IFC). **Es el que gobierna el
//                            gate de liberación del IWP**, por regla COAA.
//
// Un documento puede estar "Aprobado" y todavía no ser IFC: aprobar un procedimiento no es
// emitir un plano para construir. Confundirlos deja pasar a terreno paquetes sin ingeniería.
//
// OJO CON EL IDIOMA: Aconex entrega estos textos en español ("Emitido para construcción").
// La vista `v_cwp_ingenieria` los buscaba en inglés y contaba 0 documentos IFC teniendo 350,
// así que la Sala de Apertura declaraba bloqueado el proyecto entero. Por eso aquí se buscan
// raíces ('construc', 'aprobad') y no frases: cubren español con y sin acento, e inglés.

const tiene = (estado: string | null | undefined, ...raices: string[]) => {
  const s = String(estado ?? '').toLowerCase();
  return !!s && raices.some(r => s.includes(r));
};

/** Aprobado en revisión. «Emitido para aprobación» NO cuenta: es lo contrario. */
export function esAprobado(estado: string | null | undefined): boolean {
  return tiene(estado, 'aprobad', 'approved') && !tiene(estado, 'para aprob', 'for approval');
}

export function esRechazado(estado: string | null | undefined): boolean {
  return tiene(estado, 'rechaz', 'reject');
}

/** Ni aprobado ni rechazado, pero con estado declarado. */
export function esEnRevision(estado: string | null | undefined): boolean {
  return !!estado && !esAprobado(estado) && !esRechazado(estado);
}

/**
 * Emitido para construcción (IFC). El único estado que habilita liberar un IWP a terreno.
 * Se aplica sobre `estado_ciclo_vida`, no sobre `estado_aconex`.
 */
export function esIfc(estadoCicloVida: string | null | undefined): boolean {
  return tiene(estadoCicloVida, 'construc');
}
