import * as XLSX from 'xlsx';

export interface DetectedTable {
  sheetName: string;
  tableName: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

function buildTable(
  rows2d: (unknown[] | null)[],
  sheetName: string,
  label: string,
): DetectedTable | null {
  let hdrIdx = 0;
  for (let i = 0; i < Math.min(8, rows2d.length); i++) {
    const filled = (rows2d[i] ?? []).filter(c => c !== null && c !== '' && c !== undefined);
    if (filled.length >= 2) { hdrIdx = i; break; }
  }

  const hdrRow = rows2d[hdrIdx] ?? [];
  const colCount = Math.max(
    hdrRow.length,
    ...rows2d.slice(hdrIdx + 1).map(r => (r ?? []).length),
  );
  if (colCount < 1) return null;

  const raw: string[] = Array.from({ length: colCount }, (_, i) => {
    const v = String(hdrRow[i] ?? '').trim();
    return v || `Col_${i + 1}`;
  });
  const seen = new Map<string, number>();
  const headers = raw.map(h => {
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    return n === 0 ? h : `${h}_${n + 1}`;
  });

  const rows = rows2d
    .slice(hdrIdx + 1)
    .filter(row => (row ?? []).some(c => c !== null && c !== '' && c !== undefined))
    .map(row => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { obj[h] = (row as unknown[])?.[i] ?? ''; });
      return obj;
    });

  if (!rows.length) return null;
  return { sheetName, tableName: label, headers, rows };
}

function tablesFromSheet(ws: XLSX.WorkSheet, sheetName: string): DetectedTable[] {
  // 1. Excel structured tables (Office table objects)
  const xlTables = (ws as Record<string, unknown>)['!tables'] as
    Array<{ name?: string; ref: string }> | undefined;

  if (xlTables?.length) {
    const out: DetectedTable[] = [];
    for (const xt of xlTables) {
      try {
        const range = XLSX.utils.decode_range(xt.ref);
        const mini: XLSX.WorkSheet = {};
        for (let r = range.s.r; r <= range.e.r; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const src = XLSX.utils.encode_cell({ r, c });
            const dst = XLSX.utils.encode_cell({ r: r - range.s.r, c: c - range.s.c });
            if (ws[src]) mini[dst] = ws[src];
          }
        }
        mini['!ref'] = XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: range.e.r - range.s.r, c: range.e.c - range.s.c },
        });
        const rows2d = XLSX.utils.sheet_to_json<unknown[]>(mini, {
          header: 1, defval: null, blankrows: false,
        }) as (unknown[] | null)[];
        const label = xt.name ?? sheetName;
        const t = buildTable(rows2d, sheetName, label);
        if (t) out.push(t);
      } catch { /* skip malformed table */ }
    }
    if (out.length) return out;
  }

  // 2. Scan for contiguous data regions separated by empty rows
  const all = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1, defval: null, blankrows: true,
  }) as (unknown[] | null)[];

  const segments: (unknown[] | null)[][] = [];
  let current: (unknown[] | null)[] | null = null;

  for (let i = 0; i <= all.length; i++) {
    const row = all[i];
    const empty = i === all.length ||
      !(row ?? []).some(c => c !== null && c !== '' && c !== undefined);

    if (!empty) {
      if (!current) current = [];
      current.push(row);
    } else if (current) {
      if (current.length >= 2) segments.push(current);
      current = null;
    }
  }

  return segments.flatMap((seg, idx) => {
    const label = segments.length === 1
      ? sheetName
      : `${sheetName} — Tabla ${idx + 1}`;
    const t = buildTable(seg, sheetName, label);
    return t ? [t] : [];
  });
}

export function detectAllTables(wb: XLSX.WorkBook): DetectedTable[] {
  return wb.SheetNames.flatMap(name => tablesFromSheet(wb.Sheets[name], name));
}
