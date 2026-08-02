/**
 * Colores del editor de elementos y preferencias del panel de revisión.
 *
 * Regla de fondo: el color comunica pertenencia a un paquete. Lo que NO pertenece a ninguno se
 * deja con su color nativo del CAD (alpha=0), no con otro color más — así "sacar de la categoría"
 * se ve como sacarlo, no como repintarlo.
 */

// Paleta cíclica para distinguir grupos al colorear (rota cada ~16 valores)
const COLOR_PAL = [
  [21,101,192],[230,81,0],[0,105,92],[173,20,87],[94,53,177],[201,161,0],[46,125,50],[141,110,99],
  [197,17,98],[0,131,143],[40,53,147],[251,140,0],[97,97,97],[156,39,176],[33,150,243],[121,85,72],
];
export function colorForIndex(i: number): { r: number; g: number; b: number } {
  const [r, g, b] = COLOR_PAL[i % COLOR_PAL.length];
  return { r: r / 255, g: g / 255, b: b / 255 };
}

// Códigos "sin asignar"/contexto (SIN-CWA, SIN-CV, y los placeholders anidados "{padre}.SIN-CV"/".SIN-CWP")
// no se pintan con un color de la paleta: se pintan con alpha=0 (sin tinte) para RESTAURAR el color nativo
// del CAD — así "mover un elemento a Sin asignar" se ve y se siente como "sacarlo de la categoría", no
// como pintarlo de otro color más.
export function isSinAsignar(codigo: string): boolean {
  return codigo.includes('SIN-');
}

// `colorearCreadas=false` deja las categorías NO oficiales (creadas desde la app, fuera del
// itemizado/DevPack original) con su color nativo del CAD (alpha=0) en vez de un color de la
// paleta — así se distinguen visualmente las áreas nuevas de las oficiales sin tener que adivinar.
export function paintColorFor(codigo: string, idx: number, esOficial = true, colorearCreadas = true): { r: number; g: number; b: number; a: number } {
  if (isSinAsignar(codigo)) return { r: 0.6, g: 0.6, b: 0.6, a: 0 };
  if (!esOficial && !colorearCreadas) return { r: 0.6, g: 0.6, b: 0.6, a: 0 };
  return { ...colorForIndex(idx), a: 1 };
}

// Color único, casi negro, para "Vista de contraste": todo lo que NO es oficial (creadas + sin
// asignar) queda con este mismo tono para que las categorías oficiales (con su color de paleta)
// resalten con máximo contraste — pensado para revisar visualmente el límite de batería AWP.
export const CONTRASTE_COLOR = { r: 0.04, g: 0.04, b: 0.04, a: 1 };

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}

// ── Preferencias del panel de Revisión ──────────────────────────────────────
// (pestaña CWA/CV/CWP, filtro oficiales/creadas, etc.) — se guardan por proyecto para no tener
// que reconfigurarlas cada vez que se entra a la página.
import type { Nivel } from './elementos-tipos';

export interface RevisionPrefs {
  nivel: Nivel;
  mostrarFiltro: 'todas' | 'oficiales' | 'creadas';
  colorearCreadas: boolean;
}
function revisionPrefsKey(projectId: string): string { return `mineria-revision-prefs-v1:${projectId}`; }
export function loadRevisionPrefs(projectId: string): Partial<RevisionPrefs> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(revisionPrefsKey(projectId)) ?? '{}'); } catch { return {}; }
}
// Lee-combina-escribe: el panel de Revisión y la página principal guardan campos distintos del mismo
// objeto de preferencias — un overwrite directo haría que uno le pisara los campos al otro.
export function saveRevisionPrefs(projectId: string, partial: Partial<RevisionPrefs>) {
  if (typeof window === 'undefined') return;
  const current = loadRevisionPrefs(projectId);
  window.localStorage.setItem(revisionPrefsKey(projectId), JSON.stringify({ ...current, ...partial }));
}
