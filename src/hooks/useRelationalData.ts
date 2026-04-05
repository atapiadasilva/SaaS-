'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface RelationalDataOptions {
  entityId: string;
  filterValue?: string;
  filterKey?: string;
  limit?: number;
  definition?: {
    selectedExtraColumns?: any[];
    reachableEntities?: any[];
  };
  mappings?: any[];
}

export function useRelationalData() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  const fetchData = useCallback(async (options: RelationalDataOptions) => {
    const { entityId, filterValue, filterKey, limit = 1000, definition, mappings = [] } = options;
    
    if (!entityId) return [];

    setIsLoading(true);
    setError(null);

    try {
      // 1. En el nuevo esquema, la data está en la tabla 'nodes' en la columna 'data' (JSONB Array)
      const { data: node, error: nodeError } = await supabase
        .from('nodes')
        .select('id, data')
        .eq('id', entityId)
        .single();
      
      if (nodeError) throw nodeError;
      if (!node || !node.data) return [];

      let rawRows = Array.isArray(node.data) ? node.data : [];
      const val = String(filterValue || '').replace(/[()]/g, '').trim().toLowerCase();
      
      // Resolver la llave de filtrado
      let actualFilterKey = filterKey;
      if (!actualFilterKey && mappings.length > 0) {
        actualFilterKey = mappings.find((m: any) => 
          m.master_key === 'cwp' && m.source_entity_id === entityId
        )?.source_attribute_name;
      }

      // Filtrado en memoria (ya que tenemos todo el JSON del nodo)
      let processedRows = rawRows;
      if (val) {
        processedRows = rawRows.filter((row: any) => {
          if (actualFilterKey) {
            return String(row[actualFilterKey] || '').toLowerCase().includes(val);
          }
          return Object.values(row).some(v => String(v || '').toLowerCase().includes(val));
        });
      }

      // Limitar resultados
      processedRows = processedRows.slice(0, limit);

      // 2. Lógica de uniones relacionales (JOINs)
      if (definition?.selectedExtraColumns && definition.selectedExtraColumns.length > 0) {
        const { selectedExtraColumns, reachableEntities } = definition;
        const entityIdsToFetch = Array.from(new Set(selectedExtraColumns.map((c: any) => c.entityId))) as string[];
        
        const relatedDataMap: Record<string, any[]> = {};
        
        // Fetch de todas las tablas relacionadas
        await Promise.all(entityIdsToFetch.map(async (eid: string) => {
          const { data: n } = await supabase.from('nodes').select('id, data').eq('id', eid).single();
          if (n && Array.isArray(n.data)) {
            relatedDataMap[eid] = n.data;
          }
        }));

        // Ejecutar JOINs
        processedRows = processedRows.flatMap(baseRow => {
          let currentRows = [{ ...baseRow }];

          entityIdsToFetch.forEach(eid => {
            const extraCols = selectedExtraColumns.filter((c: any) => c.entityId === eid);
            const re = (reachableEntities || []).find((r: any) => r.id === eid);
            
            if (re && re.joinKey) {
              const { parentCol, childCol } = re.joinKey;
              const matches = (relatedDataMap[eid] || []).filter(r => 
                String(r[childCol] ?? '').trim().toLowerCase() === String(baseRow[parentCol] ?? '').trim().toLowerCase()
              );

              if (matches.length > 0) {
                currentRows = currentRows.flatMap(cRow => 
                  matches.map(mRow => {
                    const expanded = { ...cRow };
                    extraCols.forEach((extra: any) => {
                      expanded[`JOIN::${eid}::${extra.column}`] = mRow[extra.column];
                    });
                    return expanded;
                  })
                );
              } else {
                currentRows = currentRows.map(cRow => {
                  const nullRow = { ...cRow };
                  extraCols.forEach((extra: any) => {
                    nullRow[`JOIN::${eid}::${extra.column}`] = '—';
                  });
                  return nullRow;
                });
              }
            }
          });
          return currentRows;
        });
      }

      return processedRows;
    } catch (err) {
      console.error('Error en useRelationalData:', err);
      setError(err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { fetchData, isLoading, error };
}

