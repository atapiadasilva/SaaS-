import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import CFB from 'cfb';

/* ═══════════════════════════════════════════════════════════════════════════
   MPP Binary Parser — TypeScript / Server-side
   Reads OLE2/CFB container and extracts task data from Microsoft Project files.
   Supports MPP9 (2000-2003), MPP12 (2007), MPP14 (2010-2021+).
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getView(buf: Uint8Array, off: number, len: number): DataView {
  return new DataView(buf.buffer, buf.byteOffset + off, Math.min(len, buf.length - off));
}
function i32(buf: Uint8Array, off: number): number { return getView(buf, off, 4).getInt32(0, true); }
function u32(buf: Uint8Array, off: number): number { return getView(buf, off, 4).getUint32(0, true); }
function i16(buf: Uint8Array, off: number): number { return getView(buf, off, 2).getInt16(0, true); }
function u16(buf: Uint8Array, off: number): number { return getView(buf, off, 2).getUint16(0, true); }
function f64(buf: Uint8Array, off: number): number { return getView(buf, off, 8).getFloat64(0, true); }

/** Read Windows FILETIME → ISO date string */
function fileTime(buf: Uint8Array, off: number): string | null {
  if (off + 8 > buf.length) return null;
  const lo = u32(buf, off), hi = u32(buf, off + 4);
  if (lo === 0 && hi === 0) return null;
  const ms = (hi * 0x100000000 + lo) / 10000 - 11644473600000;
  if (ms < 0 || ms > 4102444800000) return null;
  return new Date(ms).toISOString().substring(0, 10);
}

/** Read MPP "duration timestamp" — ms since 1984-01-01 */
function mppTimestamp(buf: Uint8Array, off: number): string | null {
  if (off + 8 > buf.length) return null;
  const lo = u32(buf, off), hi = u32(buf, off + 4);
  if (lo === 0 && hi === 0) return null;
  // MPP stores dates as milliseconds since epoch (various epochs used)
  const ms = (hi * 0x100000000 + lo);
  // Try FILETIME first
  const ftMs = ms / 10000 - 11644473600000;
  if (ftMs > 946684800000 && ftMs < 4102444800000) {
    return new Date(ftMs).toISOString().substring(0, 10);
  }
  // Try raw ms from Unix epoch
  if (ms > 946684800000 && ms < 4102444800000) {
    return new Date(ms).toISOString().substring(0, 10);
  }
  return null;
}

/** Decode UTF-16LE */
function utf16(buf: Uint8Array, off: number, len: number): string {
  if (off + len > buf.length) len = buf.length - off;
  return new TextDecoder('utf-16le').decode(buf.slice(off, off + len)).replace(/\0+$/, '');
}

/** Decode UTF-8 */
function utf8(buf: Uint8Array, off: number, len: number): string {
  if (off + len > buf.length) len = buf.length - off;
  return new TextDecoder('utf-8').decode(buf.slice(off, off + len)).replace(/\0+$/, '');
}

/** Check if string looks like a valid task name */
function isValidName(s: string): boolean {
  if (!s || s.length < 2 || s.length > 500) return false;
  const printable = s.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '');
  return printable.length > s.length * 0.7;
}

// ─── CFB Stream reader ───────────────────────────────────────────────────────

function getStream(cfb: CFB.CFB$Container, path: string): Uint8Array | null {
  const entry = CFB.find(cfb, path);
  if (!entry?.content) return null;
  return new Uint8Array(entry.content);
}

function listEntries(cfb: CFB.CFB$Container): { name: string; path: string; size: number; type: number }[] {
  const results: { name: string; path: string; size: number; type: number }[] = [];
  for (const e of cfb.FileIndex) {
    if (e.name && e.name !== 'Root Entry') {
      results.push({ name: e.name, path: e.name, size: e.size, type: e.type });
    }
  }
  return results;
}

// ─── Scan for date sequences in binary data ──────────────────────────────────

function scanDates(buf: Uint8Array): string[] {
  const dates: string[] = [];
  for (let i = 0; i <= buf.length - 8; i += 4) {
    const d = fileTime(buf, i);
    if (d) dates.push(d);
  }
  return dates;
}

// ─── Scan for UTF-16LE strings in binary data ────────────────────────────────

function scanStrings(buf: Uint8Array, minLen = 3): string[] {
  const strings: string[] = [];
  let start = -1;
  for (let i = 0; i < buf.length - 1; i += 2) {
    const ch = u16(buf, i);
    if (ch >= 0x20 && ch < 0xFFFE) {
      if (start < 0) start = i;
    } else {
      if (start >= 0 && (i - start) >= minLen * 2) {
        const s = utf16(buf, start, i - start);
        if (isValidName(s)) strings.push(s);
      }
      start = -1;
    }
  }
  if (start >= 0 && (buf.length - start) >= minLen * 2) {
    const s = utf16(buf, start, buf.length - start);
    if (isValidName(s)) strings.push(s);
  }
  return strings;
}

// ─── VarData / Var2Data reader ────────────────────────────────────────────────
// MPP VarData format: blocks of records, each prefixed with an offset table

interface VarDataBlock {
  id: number;
  type: number;
  data: Uint8Array;
  str: string | null;
}

function readVarData(buf: Uint8Array): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (!buf || buf.length < 4) return result;

  // Strategy 1: Try reading as offset-table VarData
  // The VarData stream often starts with a header followed by records
  // Each record has: [offset_to_data (4 bytes)] [type (2 bytes)] [data...]
  
  // Strategy 2: Just scan for strings and group by position
  const strings = scanStrings(buf, 2);
  strings.forEach((s, i) => {
    result.set(i, [s]);
  });

  return result;
}

// ─── FixedData reader ─────────────────────────────────────────────────────────

interface FixedRecord {
  offset: number;
  id: number;
  dates: string[];
  percentComplete: number;
  duration: number;
  flags: number;
}

function readFixedData(buf: Uint8Array, recordSize: number): FixedRecord[] {
  const records: FixedRecord[] = [];
  if (!buf || buf.length < recordSize || recordSize < 16) return records;

  const count = Math.floor(buf.length / recordSize);
  for (let i = 0; i < count; i++) {
    const off = i * recordSize;
    const rec = buf.slice(off, off + recordSize);

    // Extract all potential dates from this record
    const dates: string[] = [];
    for (let j = 0; j <= rec.length - 8; j += 4) {
      const d = fileTime(rec, j);
      if (d) dates.push(d);
    }

    // Try to read percent complete (usually a short int somewhere)
    let pct = 0;
    // Common offsets for percent complete in different MPP versions
    for (const pctOff of [110, 112, 114, 130, 132]) {
      if (pctOff + 2 <= rec.length) {
        const v = i16(rec, pctOff);
        if (v >= 0 && v <= 100) { pct = v; break; }
      }
    }

    records.push({
      offset: off,
      id: i32(rec, 0),
      dates: [...new Set(dates)],
      percentComplete: pct,
      duration: 0,
      flags: rec.length >= 4 ? u32(rec, 0) : 0,
    });
  }
  return records;
}

// ─── Detect record size by finding repeating patterns ─────────────────────────

function detectRecordSize(buf: Uint8Array): number {
  // Try common MPP task record sizes
  const candidates = [380, 388, 376, 372, 240, 248, 260, 268, 320, 328, 340, 360, 400, 176, 184, 188, 192, 196, 200, 120, 128, 136, 140, 144, 148, 160];
  
  for (const size of candidates) {
    if (buf.length % size !== 0) continue;
    const count = buf.length / size;
    if (count < 2 || count > 50000) continue;
    
    // Check if records look plausible: first 4 bytes of each record should be
    // incrementing IDs or similar patterns
    let valid = 0;
    for (let i = 0; i < Math.min(count, 20); i++) {
      const id = i32(buf, i * size);
      if (id >= 0 && id < 100000) valid++;
    }
    if (valid > Math.min(count, 20) * 0.6) return size;
  }
  
  // Fallback: try to find record boundaries by looking for date clusters
  return 0;
}

// ─── Main MPP Parser ─────────────────────────────────────────────────────────

interface ParsedTask {
  id: string;
  name: string;
  wbs: string;
  start: string | null;
  finish: string | null;
  progress: number;
  isSummary: boolean;
  isMilestone: boolean;
  hh: number;
}

function parseMpp(buffer: ArrayBuffer): {
  tasks: ParsedTask[];
  projectName: string;
  success: boolean;
  error?: string;
  debug?: string;
} {
  try {
    const uint8 = new Uint8Array(buffer);
    const cfb = CFB.read(uint8 as any, { type: 'array' });
    const entries = listEntries(cfb);
    const entryNames = entries.map(e => `${e.name}(${e.size})`).join(', ');

    // ── Strategy 1: Look for embedded XML (some MPP files contain MSPDI XML) ──
    for (const entry of entries) {
      if (entry.size > 100) {
        const data = getStream(cfb, entry.name);
        if (data) {
          const head = utf8(data, 0, Math.min(200, data.length));
          if (head.includes('<?xml') && (head.includes('Project') || head.includes('Task'))) {
            // Found XML content — return it for client-side XML parsing
            const xmlText = utf8(data, 0, data.length);
            return {
              tasks: [],
              projectName: '',
              success: false,
              error: 'XML_EMBEDDED',
              debug: xmlText,
            };
          }
        }
      }
    }

    // ── Strategy 2: Read Props for project info ──
    let projectName = '';
    const propsStream = getStream(cfb, 'Props') || getStream(cfb, 'Props9') ||
      getStream(cfb, 'Props12') || getStream(cfb, 'Props14');
    if (propsStream && propsStream.length > 100) {
      const strs = scanStrings(propsStream, 3);
      if (strs.length > 0) projectName = strs[0];
    }

    // ── Strategy 3: Find task data in known directory patterns ──
    // MPP files store data in directories. Task data is typically under
    // a directory path like: /TBkndTask/FixedData, /TBkndTask/VarData
    // or in directories named with numeric IDs containing FixedData/VarData

    const allStreams: { name: string; data: Uint8Array }[] = [];
    for (const entry of entries) {
      if (entry.type === 2 && entry.size > 0) {
        const data = getStream(cfb, entry.name);
        if (data) allStreams.push({ name: entry.name, data });
      }
    }

    // Collect all strings from all VarData-like streams
    let allTaskNames: string[] = [];
    const varStreams = allStreams.filter(s =>
      s.name.toLowerCase().includes('var') ||
      s.name.toLowerCase().includes('text') ||
      s.name.toLowerCase().includes('string')
    );

    // If no named var streams found, scan ALL streams for strings
    const streamsToScan = varStreams.length > 0 ? varStreams : allStreams;
    for (const stream of streamsToScan) {
      const strs = scanStrings(stream.data, 3);
      if (strs.length > 2) {
        allTaskNames.push(...strs);
      }
    }

    // Collect all dates from FixedData-like streams
    let allDates: string[] = [];
    const fixedStreams = allStreams.filter(s =>
      s.name.toLowerCase().includes('fixed') ||
      s.name.toLowerCase().includes('task')
    );
    const dateStreams = fixedStreams.length > 0 ? fixedStreams : allStreams;
    for (const stream of dateStreams) {
      const dates = scanDates(stream.data);
      allDates.push(...dates);
    }

    // ── Strategy 4: Heuristic assembly ──
    // If we found strings and dates, try to correlate them into tasks
    // Remove duplicates and system strings
    allTaskNames = allTaskNames.filter(n =>
      !n.startsWith('Microsoft') &&
      !n.startsWith('MSProject') &&
      !n.startsWith('WBS') &&
      !n.includes('\\') &&
      !n.includes('{') &&
      n.length > 1 && n.length < 300
    );

    // Remove exact duplicates preserving order
    allTaskNames = [...new Set(allTaskNames)];

    // Sort dates and remove duplicates
    allDates = [...new Set(allDates)].sort();

    if (allTaskNames.length === 0) {
      // ── Strategy 5: Last resort — scan the entire buffer for strings ──
      const globalStrings = scanStrings(uint8, 4);
      allTaskNames = globalStrings.filter(n =>
        !n.startsWith('Microsoft') &&
        !n.startsWith('MSProject') &&
        !n.startsWith('Root') &&
        !n.startsWith('Workbook') &&
        !n.includes('\\') &&
        !n.includes('{') &&
        !n.includes('CompObj') &&
        n.length > 2 && n.length < 300
      );
      allTaskNames = [...new Set(allTaskNames)];
    }

    if (allTaskNames.length === 0) {
      return {
        tasks: [], projectName, success: false,
        error: `No se encontraron tareas en el archivo MPP. Streams: ${entryNames}`,
      };
    }

    // Build tasks from extracted names and dates
    const tasks: ParsedTask[] = allTaskNames.map((name, i) => {
      // Try to pair dates: each task gets 2 consecutive dates (start, finish)
      const dateIdx = i * 2;
      const start = dateIdx < allDates.length ? allDates[dateIdx] : null;
      const finish = dateIdx + 1 < allDates.length ? allDates[dateIdx + 1] : null;

      // Heuristics for summary/milestone detection
      const isSummary = name === name.toUpperCase() && name.length > 3;
      const isMilestone = name.toLowerCase().includes('hito') ||
        name.toLowerCase().includes('milestone') ||
        name.toLowerCase().includes('entrega');

      return {
        id: `mpp-${i + 1}`,
        name,
        wbs: `${i + 1}`,
        start,
        finish,
        progress: 0,
        isSummary,
        isMilestone,
        hh: 0,
      };
    });

    return {
      tasks,
      projectName: projectName || tasks[0]?.name || 'Proyecto MPP',
      success: tasks.length > 0,
      debug: `Streams: ${entryNames} | Names: ${allTaskNames.length} | Dates: ${allDates.length}`,
    };

  } catch (err: any) {
    return {
      tasks: [], projectName: '', success: false,
      error: `Error leyendo archivo: ${err.message}`,
    };
  }
}

// ─── API Route ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const result = parseMpp(buffer);

    // If we found embedded XML, return it for the client to parse with DOMParser
    if (result.error === 'XML_EMBEDDED' && result.debug) {
      return NextResponse.json({
        success: true,
        format: 'xml',
        xmlContent: result.debug,
        fileName: file.name,
      });
    }

    if (result.success && result.tasks.length > 0) {
      const activities = result.tasks.map((t, i) => ({
        id: t.id,
        wbs_code: t.wbs,
        description: t.name,
        hh: t.hh,
        start_date: t.start,
        end_date: t.finish,
        progress: t.progress,
        is_summary: t.isSummary,
        is_milestone: t.isMilestone,
        program_source: file.name,
        sort_order: i,
      }));

      return NextResponse.json({
        success: true,
        format: 'tasks',
        activities,
        meta: {
          projectName: result.projectName,
          totalTasks: activities.length,
          fileName: file.name,
          debug: result.debug,
        },
      });
    }

    return NextResponse.json({
      success: false,
      error: result.error,
      message: 'No se pudieron extraer actividades del archivo MPP.',
    }, { status: 422 });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
