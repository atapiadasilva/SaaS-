// Cómo se escribe un número y una fecha en Hilo — fuente única.
//
// POR QUÉ: la misma fecha se veía de cinco formas distintas según la pantalla —
// `18-Ene-27` en Planificación, `18-01` en Trisemanal, `18-01-27` en los dashboards de
// departamento, `2027-01-18` en la ficha que se le entrega al mandante. Y los números
// tenían veinte copias del mismo `toLocaleString('es-CL')`, unas devolviendo `—` cuando
// faltaba el dato y otras dejando la celda vacía, así que "sin dato" se veía distinto en
// cada tabla.
//
// El formato canónico de fecha es `18-Ene-27`: **el mes va en letras a propósito**. Este
// proyecto ya se quemó con fechas ambiguas —las planillas de P6 vienen en formato de
// EE.UU. (M/D/YYYY) y el 10 de octubre se leía como mes 14 (ver `fechaCelda()` en
// scripts/programa-cons-cargar.mjs)—. Un `05-03-27` no dice si es marzo o mayo; un
// `05-Mar-27` no se puede leer mal.

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Lo que se muestra cuando no hay dato. Un guion largo, nunca una celda vacía. */
export const SIN_DATO = '—';

/** Acepta 'YYYY-MM-DD', ISO completo o Date. Devuelve null si no se puede leer. */
function partes(v: string | Date | null | undefined): { d: string; m: number; a: string } | null {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { d: m[3], m: mes, a: m[1] };
}

/** Fecha canónica: `18-Ene-27`. */
export function fecha(v: string | Date | null | undefined): string {
  const p = partes(v);
  return p ? `${p.d}-${MESES[p.m - 1]}-${p.a.slice(2)}` : SIN_DATO;
}

/** Sin año, para chips y columnas estrechas: `18-Ene`. Sólo donde el año se entiende por contexto. */
export function fechaCorta(v: string | Date | null | undefined): string {
  const p = partes(v);
  return p ? `${p.d}-${MESES[p.m - 1]}` : SIN_DATO;
}

/** Año completo, para documentos que salen del sistema: `18-Ene-2027`. */
export function fechaLarga(v: string | Date | null | undefined): string {
  const p = partes(v);
  return p ? `${p.d}-${MESES[p.m - 1]}-${p.a}` : SIN_DATO;
}

/** Entero con separador de miles chileno. `null` → `—`. */
export function numero(v: number | string | null | undefined): string {
  if (v == null || v === '') return SIN_DATO;
  const n = Number(v);
  return isNaN(n) ? SIN_DATO : Math.round(n).toLocaleString('es-CL');
}

/** Número con decimales fijos (cantidades de obra, rendimientos). */
export function decimal(v: number | string | null | undefined, dec = 1): string {
  if (v == null || v === '') return SIN_DATO;
  const n = Number(v);
  return isNaN(n) ? SIN_DATO : n.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Pesos chilenos: `$29.869.398.881`. */
export function clp(v: number | null | undefined): string {
  return v == null ? SIN_DATO : '$' + Math.round(v).toLocaleString('es-CL');
}

/** Pesos en millones, para KPI: `$18.358 MM`. */
export function clpMM(v: number | null | undefined): string {
  return v == null ? SIN_DATO : '$' + Math.round(v / 1e6).toLocaleString('es-CL') + ' MM';
}
