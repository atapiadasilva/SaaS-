import { useMemo } from 'react';
import { detectCwpColumn, extractCwpValues } from '@/lib/cwp-utils';

/**
 * Detects the CWP column in a column list and derives the unique CWP values
 * present in a dataset. Replaces the duplicated useMemo pattern that existed
 * in DataEditor and RelationalExplorer.
 */
export function useCwpFilter(
  columns: string[],
  data: Record<string, any>[]
) {
  const cwpColumn = useMemo(() => detectCwpColumn(columns), [columns]);

  const cwpValues = useMemo(
    () => (cwpColumn ? extractCwpValues(data, cwpColumn) : []),
    [data, cwpColumn]
  );

  return { cwpColumn, cwpValues };
}
