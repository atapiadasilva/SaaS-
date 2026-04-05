/**
 * CWP column detection utilities.
 * Single source of truth — used by DataEditor, RelationalExplorer, EmbeddedView.
 */

export const CWP_FILTER_KEYS = [
  'CWP', 'PACKAGE', 'PAQUETE', 'WBS', 'EDT', 'PLANO', 'DRAWING'
] as const;

/**
 * Returns the first column from `columns` that matches a known CWP identifier.
 * Comparison is case-insensitive and trims whitespace.
 */
export function detectCwpColumn(columns: string[]): string | undefined {
  const upperCols = columns.map(c => c.toUpperCase().trim());
  for (const key of CWP_FILTER_KEYS) {
    const idx = upperCols.indexOf(key);
    if (idx !== -1) return columns[idx];
  }
  return undefined;
}

/**
 * Returns sorted unique CWP values from a dataset.
 */
export function extractCwpValues(
  data: Record<string, any>[],
  cwpColumn: string
): string[] {
  return Array.from(
    new Set(data.map(r => String(r[cwpColumn] || '')).filter(Boolean))
  ).sort();
}
