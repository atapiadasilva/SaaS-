import type { SupabaseClient } from '@supabase/supabase-js';

// "Mapa del mundo": describe el esquema REAL y actual de las tablas mining_* —
// se consulta en vivo (information_schema) en vez de hardcodearlo, así que crece
// solo cuando se agregan tablas o columnas nuevas, sin tocar este archivo.
export async function buildSchemaMap(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('mining_bot_schema_map');
  if (error || !data) return '(no se pudo leer el esquema de la base de datos)';

  const porTabla = new Map<string, string[]>();
  for (const row of data as { table_name: string; column_name: string; data_type: string }[]) {
    const cols = porTabla.get(row.table_name) ?? [];
    cols.push(`${row.column_name}:${row.data_type}`);
    porTabla.set(row.table_name, cols);
  }

  const lines: string[] = [];
  for (const [tabla, cols] of porTabla) {
    lines.push(`- ${tabla}(${cols.join(', ')})`);
  }
  return lines.join('\n');
}
