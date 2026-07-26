// Parser de archivos Primavera P6 (.xer). El formato es texto tab-delimitado con marcadores:
//   %T <NombreTabla>   %F <campos...>   %R <valores...>   %E (fin)
// Devuelve cada tabla como { headers, rows } para poder mapear columnas como si fuera un Excel.
export interface XerTable { headers: string[]; rows: string[][]; }

export function parseXER(text: string): Record<string, XerTable> {
  const out: Record<string, XerTable> = {};
  let cur: XerTable | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw) continue;
    const cols = raw.split('\t');
    const tag = cols[0];
    if (tag === '%T') { cur = { headers: [], rows: [] }; out[cols[1]] = cur; }
    else if (tag === '%F' && cur) { cur.headers = cols.slice(1); }
    else if (tag === '%R' && cur) { cur.rows.push(cols.slice(1)); }
  }
  return out;
}

// Convierte la tabla TASK del XER a filas objeto {header: valor} para el importador de Programa.
export function xerTaskRows(tables: Record<string, XerTable>): Record<string, string>[] {
  const t = tables['TASK'];
  if (!t) return [];
  return t.rows.map(r => Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? ''])));
}
