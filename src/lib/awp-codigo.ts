// Codificación del CWP — fuente única de verdad de cómo se lee un código de paquete.
//
// Formato canónico de Hilo Digital:  {CV}.{DISC}{SEQ}   ej. 312101.C001 · 0044100.MB002
//   CV   = código de la subárea constructiva (Construction Vertical). NO tiene largo fijo:
//          Collahuasi usa 6 dígitos (312101) y Spence 7 (0044100). Asumir 6 rompe Spence.
//   CWA  = los primeros 4 caracteres del CV (convención estable en todos los proyectos).
//   DISC = letra(s) de disciplina (C, D, MB, EW, FF…).
//   SEQ  = secuencia correlativa dentro de esa disciplina y CV.
//
// Los códigos placeholder que genera la UI para elementos sin clasificar
// ("3121.SIN-CV.SIN-CWP") no calzan con el patrón y devuelven null: es lo correcto,
// no son CWP reales.

const LARGO_CWA = 4;

// Formato canónico:  {CV}.{DISC}{SEQ}          312101.C001 · 0044100.MB002
const RE_CWP = /^(\d{4,8})\.([A-Za-z]+)(\d+)$/;

// Formato Andina (EIMI00413):  CWP-{AREA}-{SECTOR}-{DISC}-{SEQ}   CWP-3351-10-BA-010
// El cliente lo usa así en el programa, en el Power BI y en sus documentos, así que se
// respeta tal cual en vez de traducirlo: CV = AREA+SECTOR, CWA = AREA.
const RE_CWP_PREFIJADO = /^CWP-(\d{4})-(\d{2})-([A-Za-z]{2,3})-(\d{2,4})$/i;

// Formato EPV1 (EIMI00416):  {ÁREA WBS}-{CV}-{DISC}{SEQ}   1222-D003-ME001
// El CV es alfanumérico (A001, D003) y el área WBS de 4 dígitos.
const RE_CWP_WBS = /^(\d{4})-([A-Za-z]\d{3})-([A-Za-z]{2})(\d{3})$/;

export interface CwpPartes {
  cv_id: string;
  cwa_id: string;
  disciplina_cod: string;
  secuencia: number;
}

/** Descompone un CWP en sus partes. Devuelve null si no calza con ningún formato conocido. */
export function parseCwp(cwpId: string | null | undefined): CwpPartes | null {
  const s = String(cwpId ?? '').trim();

  const p = s.match(RE_CWP_PREFIJADO);
  if (p) {
    const [, area, sector, disc, seq] = p;
    return { cv_id: area + sector, cwa_id: area, disciplina_cod: disc.toUpperCase(), secuencia: Number(seq) };
  }

  const m = s.match(RE_CWP);
  if (!m) return null;
  const [, cv, disc, seq] = m;
  if (cv.length <= LARGO_CWA) return null; // un CV que no supera al CWA no aporta jerarquía
  return { cv_id: cv, cwa_id: cv.slice(0, LARGO_CWA), disciplina_cod: disc.toUpperCase(), secuencia: Number(seq) };
}

/** CWA y CV derivados del CWP; ambos null si el código no calza con el formato. */
export function deriveCwaCv(cwpId: string): { cwa_id: string | null; cv_id: string | null } {
  const p = parseCwp(cwpId);
  return p ? { cwa_id: p.cwa_id, cv_id: p.cv_id } : { cwa_id: null, cv_id: null };
}

/** CWA derivado de un CV, sin pasar por el CWP. */
export function cwaDesdeCv(cvId: string): string {
  return String(cvId ?? '').slice(0, LARGO_CWA);
}

/** ¿El código respeta el formato canónico? Úsalo para validar un data pack antes de cargarlo. */
export function esCwpValido(cwpId: string | null | undefined): boolean {
  return parseCwp(cwpId) !== null;
}
