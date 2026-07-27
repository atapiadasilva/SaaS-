/**
 * Parseo de números de planillas de obra, que llegan en formatos mezclados según quién
 * las exportó: es-CL ("1.234.567,89") y en-US ("1,234,567.89") conviven en el mismo pack.
 *
 * Confundirlos no da error: da un número plausible pero equivocado. Un precio de
 * "234,581,178" leído como decimal se convierte en 234,58 — el contrato pasa de miles de
 * millones a unos pocos millones y nadie lo nota hasta que cuadran cifras con el cliente.
 */

/** Convierte un valor de celda a número, o null si no lo es. */
export function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;

  let s = String(v).trim()
    .replace(/\s/g, '')
    .replace(/[$€]/g, '')
    .replace(/[A-Za-z]/g, '');       // "1.234 m3" → "1.234"
  if (!s) return null;

  const negativo = /^\(.*\)$/.test(s); // contabilidad: (1.234) es negativo
  s = s.replace(/[()]/g, '');

  const puntos = (s.match(/\./g) ?? []).length;
  const comas = (s.match(/,/g) ?? []).length;

  if (puntos && comas) {
    // El separador decimal es el que aparece más a la derecha.
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const miles = decimal === '.' ? ',' : '.';
    s = s.split(miles).join('').replace(decimal, '.');
  } else if (comas) {
    // Varias comas, o una seguida de exactamente 3 dígitos → separador de miles.
    s = (comas > 1 || /,\d{3}$/.test(s)) ? s.split(',').join('') : s.replace(',', '.');
  } else if (puntos) {
    s = (puntos > 1 || /\.\d{3}$/.test(s)) ? s.split('.').join('') : s;
  }

  const n = Number(s);
  if (isNaN(n)) return null;
  return negativo ? -n : n;
}

/** Fecha a YYYY-MM-DD. Acepta ISO, dd-mm-yyyy, dd/mm/yyyy y "lun 20-10-25" (MS Project). */
export function fecha(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const largo = s.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (largo) return `${largo[3]}-${largo[2]}-${largo[1]}`;
  const corto = s.match(/(\d{2})[/-](\d{2})[/-](\d{2})$/);   // "lun 20-10-25"
  if (corto) return `20${corto[3]}-${corto[2]}-${corto[1]}`;
  return null;
}
