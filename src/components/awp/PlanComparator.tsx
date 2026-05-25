'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import * as XLSX from 'xlsx';
import {
  Play, Pause, SkipBack, SkipForward, Loader2, Upload,
  GitCompare, X, FileSpreadsheet, ChevronLeft, ChevronRight,
  Check, RefreshCw, Monitor, Settings2,
} from 'lucide-react';
import Link from 'next/link';
import type { ForgeViewerHandle } from './ForgeViewer';
import { detectAllTables } from '@/lib/excel/detectTables';
import type { DetectedTable } from '@/lib/excel/detectTables';

const ForgeViewer = dynamic(() => import('./ForgeViewer'), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlanRow {
  bim_id:    string;
  actividad: string;
  tag:       string;
  wbs:       string;
  ciclo:     string;
  inicio:    string;   // YYYY-MM-DD
  fin:       string;   // YYYY-MM-DD
  recurso:   number;
}

interface ColMapping {
  bim_id: string; actividad: string; inicio: string; fin: string;
  recurso: string; tag: string; wbs: string; ciclo: string;
}

type ImportStep = 'idle' | 'sheet' | 'mapping' | 'done';

interface WizardState {
  step:         ImportStep;
  fileName:     string;
  wb:           XLSX.WorkBook | null;
  sheet:        string;
  tables:       DetectedTable[];
  rawRows:      Record<string, unknown>[];
  headers:      string[];
  preview:      Record<string, unknown>[];
  mapping:      ColMapping;
  rows:         PlanRow[];
  recursoLabel: string;
}

type PlaySpeed = 'day' | 'week' | 'month';
type VizMode   = 'ghost' | 'isolated' | 'all';

const STEP_DAYS: Record<PlaySpeed, number> = { day: 1, week: 7, month: 30 };
const HEX_A    = '#3b82f6';  // Plan A — en progreso
const HEX_B    = '#f97316';  // Plan B — en progreso

// ─── Helpers ─────────────────────────────────────────────────────────────────

function excelDateToISO(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return '';
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s
    : s.replace(/^(\d{2})[/-](\d{2})[/-](\d{4})$/, '$3-$2-$1');
  return isNaN(new Date(iso).getTime()) ? '' : iso;
}
function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? '0').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDate(d: Date) {
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function autoDetect(headers: string[]): ColMapping {
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ns = headers.map(norm);
  const find = (...terms: string[]) => {
    for (const t of terms) { const i = ns.findIndex(n => n.includes(t)); if (i >= 0) return headers[i]; }
    return '';
  };
  return {
    bim_id:    find('revitelement','revit','ifcguid','elementoguid','guid','elemento'),
    actividad: find('actividadplan','actividad','activity','descripcion','nombre'),
    inicio:    find('fechainicio','inicio','startdate','start'),
    fin:       find('fechafin','fin','enddate','end'),
    recurso:   find('hh','hora','volumen','area','m3','m2','cantidad','resource','grosor'),
    tag:       find('tag','idpm','codigo','code'),
    wbs:       find('wbs'),
    ciclo:     find('ciclo','fase','etapa','phase'),
  };
}

function applyMapping(raw: Record<string, unknown>[], m: ColMapping): PlanRow[] {
  return raw.map(r => ({
    bim_id:    String(r[m.bim_id]    ?? '').trim(),
    actividad: String(r[m.actividad] ?? '').trim(),
    tag:       String(r[m.tag]       ?? '').trim(),
    wbs:       String(r[m.wbs]       ?? '').trim(),
    ciclo:     String(r[m.ciclo]     ?? '').trim(),
    inicio:    excelDateToISO(r[m.inicio]),
    fin:       excelDateToISO(r[m.fin]),
    recurso:   m.recurso ? toNum(r[m.recurso]) : 0,
  })).filter(r => r.bim_id && r.inicio && r.fin);
}

function activeRows(rows: PlanRow[], date: Date): PlanRow[] {
  const ds = isoDate(date);
  return rows.filter(r => r.inicio <= ds && ds <= r.fin);
}

const emptyMapping = (): ColMapping => ({
  bim_id: '', actividad: '', inicio: '', fin: '', recurso: '', tag: '', wbs: '', ciclo: '',
});
const emptyWizard = (): WizardState => ({
  step: 'idle', fileName: '', wb: null, sheet: '',
  tables: [], rawRows: [],
  headers: [], preview: [], mapping: emptyMapping(), rows: [], recursoLabel: '',
});

// ─── ColSelect ────────────────────────────────────────────────────────────────

function ColSelect({ label, required, value, headers, onChange, previewRows }: {
  label: string; required?: boolean; value: string; headers: string[];
  onChange: (v: string) => void; previewRows: Record<string, unknown>[];
}) {
  const preview = value ? previewRows.slice(0, 2).map(r => String(r[value] ?? '—')).join(' · ') : '';
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-blue-400">
        <option value="">— sin mapear —</option>
        {headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      {preview && <span className="text-[9px] text-slate-400 truncate" title={preview}>{preview}</span>}
    </div>
  );
}

// ─── ImportWizard ─────────────────────────────────────────────────────────────

function ImportWizard({ label, color, uid, state, onChange }: {
  label: string; color: string; uid: string;
  state: WizardState; onChange: (next: WizardState) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleFile = (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    setLoading(true);
    file.arrayBuffer().then(buf => {
      try {
        const wb = XLSX.read(buf, { type: 'array', cellDates: false });
        const tables = detectAllTables(wb);
        if (tables.length === 1) {
          const t = tables[0];
          const raw = t.rows as Record<string, unknown>[];
          onChange({ ...emptyWizard(), step: 'mapping', fileName: file.name, wb, tables, sheet: t.tableName, rawRows: raw, headers: t.headers, preview: raw.slice(0, 5), mapping: autoDetect(t.headers), rows: [], recursoLabel: '' });
        } else {
          onChange({ ...emptyWizard(), step: 'sheet', fileName: file.name, wb, tables, sheet: '', rawRows: [], headers: [], preview: [], mapping: emptyMapping(), rows: [], recursoLabel: '' });
        }
      } finally { setLoading(false); }
    });
  };

  const selectTable = (t: DetectedTable) => {
    const raw = t.rows as Record<string, unknown>[];
    onChange({ ...state, step: 'mapping', sheet: t.tableName, rawRows: raw, headers: t.headers, preview: raw.slice(0, 5), mapping: autoDetect(t.headers) });
  };

  const confirmMapping = () => {
    if (!state.mapping.bim_id || !state.mapping.inicio || !state.mapping.fin) return;
    const rows = applyMapping(state.rawRows, state.mapping);
    onChange({ ...state, step: 'done', rows, recursoLabel: state.mapping.recurso || '' });
  };

  const setM = (k: keyof ColMapping, v: string) =>
    onChange({ ...state, mapping: { ...state.mapping, [k]: v } });

  if (state.step === 'idle') return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-4"
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files); }}>
      <FileSpreadsheet size={24} className="text-slate-300" />
      <div className="text-center">
        <p className="text-[11px] font-black uppercase tracking-widest" style={{ color }}>{label}</p>
        <p className="text-[9px] text-slate-400 font-bold mt-0.5">Importa tu planificación Excel</p>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 size={13} className="animate-spin" />
          <span className="text-[10px] font-bold">Leyendo…</span>
        </div>
      ) : (
        <>
          <label htmlFor={`file-${uid}`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black cursor-pointer transition"
            style={{ background: `${color}20`, color }}>
            <Upload size={12} /> Subir Excel / CSV
          </label>
          <input id={`file-${uid}`} type="file" accept=".xlsx,.xls,.csv" className="sr-only"
            onChange={e => { handleFile(e.target.files); (e.target as HTMLInputElement).value = ''; }} />
          <p className="text-[9px] text-slate-400">o arrastra aquí</p>
        </>
      )}
    </div>
  );

  if (state.step === 'sheet') return (
    <div className="flex flex-col gap-2 p-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black" style={{ color }}>Selecciona tabla</span>
        <button onClick={() => onChange(emptyWizard())} className="text-slate-300 hover:text-slate-500"><X size={12} /></button>
      </div>
      <p className="text-[9px] text-slate-500 font-bold truncate">{state.fileName}</p>
      {state.tables.map(t => (
        <button key={`${t.sheetName}::${t.tableName}`} onClick={() => selectTable(t)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50 text-left transition">
          <FileSpreadsheet size={11} className="text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-700 truncate">{t.tableName}</p>
            <p className="text-[9px] text-slate-400">{t.rows.length} filas · {t.headers.length} cols · hoja: {t.sheetName}</p>
          </div>
        </button>
      ))}
    </div>
  );

  if (state.step === 'mapping') {
    const ok = state.mapping.bim_id && state.mapping.inicio && state.mapping.fin;
    return (
      <div className="flex flex-col gap-2 p-3 overflow-y-auto h-full">
        <div className="flex items-center justify-between shrink-0">
          <span className="text-[10px] font-black" style={{ color }}>Mapear columnas</span>
          <button onClick={() => onChange(emptyWizard())} className="text-slate-300 hover:text-slate-500"><X size={12} /></button>
        </div>
        <p className="text-[9px] text-slate-500 font-bold truncate shrink-0">
          {state.fileName} › {state.sheet}
        </p>
        <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
          <ColSelect label="ID BIM (Revit / GUID)" required value={state.mapping.bim_id} headers={state.headers} onChange={v => setM('bim_id', v)} previewRows={state.preview} />
          <ColSelect label="Actividad" value={state.mapping.actividad} headers={state.headers} onChange={v => setM('actividad', v)} previewRows={state.preview} />
          <ColSelect label="Fecha Inicio" required value={state.mapping.inicio} headers={state.headers} onChange={v => setM('inicio', v)} previewRows={state.preview} />
          <ColSelect label="Fecha Fin" required value={state.mapping.fin} headers={state.headers} onChange={v => setM('fin', v)} previewRows={state.preview} />
          <ColSelect label="Recurso (HH / m³ / m²…)" value={state.mapping.recurso} headers={state.headers} onChange={v => setM('recurso', v)} previewRows={state.preview} />
          <ColSelect label="TAG / Código" value={state.mapping.tag} headers={state.headers} onChange={v => setM('tag', v)} previewRows={state.preview} />
          <ColSelect label="WBS" value={state.mapping.wbs} headers={state.headers} onChange={v => setM('wbs', v)} previewRows={state.preview} />
          <ColSelect label="Ciclo / Fase" value={state.mapping.ciclo} headers={state.headers} onChange={v => setM('ciclo', v)} previewRows={state.preview} />
        </div>
        <button onClick={confirmMapping} disabled={!ok}
          className="shrink-0 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-black transition disabled:opacity-40 mt-1"
          style={{ background: ok ? color : '#e2e8f0', color: ok ? '#fff' : '#94a3b8' }}>
          <Check size={12} /> Importar {ok ? '' : '(faltan campos *)'}
        </button>
      </div>
    );
  }

  // done
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Compact summary header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-100"
        style={{ background: `${color}10` }}>
        <div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-[10px] font-black" style={{ color }}>{label}</span>
          </div>
          <p className="text-[9px] text-slate-500 font-bold truncate max-w-[160px]">{state.fileName}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black" style={{ color }}>{state.rows.length.toLocaleString()} elem.</span>
          <button onClick={() => onChange(emptyWizard())} className="text-slate-300 hover:text-slate-500">
            <RefreshCw size={11} />
          </button>
        </div>
      </div>
      {/* Activities placeholder — parent renders the table */}
      <div className="flex-1 overflow-hidden" id={`activities-slot-${uid}`} />
    </div>
  );
}

// ─── Activity table ───────────────────────────────────────────────────────────

function ActivityTable({ rows, color, page, onPage, totalPages }: {
  rows: PlanRow[]; color: string; page: number;
  onPage: (p: number) => void; totalPages: number;
}) {
  if (!rows.length) return (
    <p className="text-[10px] text-slate-400 font-bold p-3 text-center">Sin elementos en construcción en esta fecha</p>
  );
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[9px]">
          <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
            <tr>
              {['TAG', 'Actividad', 'WBS', 'Inicio', 'Fin'].map(h => (
                <th key={h} className="px-2 py-1.5 text-left font-black text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-b border-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="px-2 py-1.5 font-black whitespace-nowrap" style={{ color }}>{r.tag || r.bim_id.slice(-6)}</td>
                <td className="px-2 py-1.5 text-slate-600 max-w-[140px] truncate" title={r.actividad}>{r.actividad || '—'}</td>
                <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{r.wbs}</td>
                <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{r.inicio}</td>
                <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{r.fin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 border-t border-slate-100">
          <button onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0}
            className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronLeft size={11} /></button>
          <span className="text-[9px] text-slate-500 font-bold">{page + 1}/{totalPages}</span>
          <button onClick={() => onPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
            className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronRight size={11} /></button>
        </div>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  modelUrn: string | null;
  modelName?: string | null;
  loadingModel?: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlanComparator({ projectId, modelUrn, modelName, loadingModel }: Props) {

  const [wizA, setWizA] = useState<WizardState>(emptyWizard);
  const [wizB, setWizB] = useState<WizardState>(emptyWizard);

  const [viewerAReady, setViewerAReady] = useState(false);
  const [viewerBReady, setViewerBReady] = useState(false);
  const [applyingA,   setApplyingA]   = useState(false);
  const [applyingB,   setApplyingB]   = useState(false);

  const [playDate,  setPlayDate]  = useState<Date | null>(null);
  const [playing,   setPlaying]   = useState(false);
  const [playSpeed, setPlaySpeed] = useState<PlaySpeed>('week');
  const [vizMode,   setVizMode]   = useState<VizMode>('ghost');
  const [pageA,     setPageA]     = useState(0);
  const [pageB,     setPageB]     = useState(0);

  const viewerRefA = useRef<ForgeViewerHandle>(null);
  const viewerRefB = useRef<ForgeViewerHandle>(null);
  const playRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const PAGE = 6;
  const rowsA = wizA.rows;
  const rowsB = wizB.rows;

  // ── Date range ─────────────────────────────────────────────────────────────
  const dateRange = useMemo<{ min: Date; max: Date } | null>(() => {
    const all = [...rowsA, ...rowsB];
    const ts: number[] = [];
    for (const r of all) {
      const s = r.inicio ? new Date(r.inicio) : null;
      const e = r.fin    ? new Date(r.fin)    : null;
      if (s && !isNaN(s.getTime())) ts.push(s.getTime());
      if (e && !isNaN(e.getTime())) ts.push(e.getTime());
    }
    if (!ts.length) return null;
    return { min: new Date(Math.min(...ts)), max: new Date(Math.max(...ts)) };
  }, [rowsA, rowsB]);

  const totalDays = useMemo(() =>
    dateRange ? Math.max(1, Math.round((dateRange.max.getTime() - dateRange.min.getTime()) / 86_400_000)) : 0,
  [dateRange]);

  useEffect(() => { if (dateRange && !playDate) setPlayDate(new Date(dateRange.min)); }, [dateRange]);

  // ── Rows by construction state at current date ─────────────────────────────
  const categorize = useCallback((rows: PlanRow[], date: Date) => {
    const ds = isoDate(date);
    const past    = rows.filter(r => r.fin    <  ds);
    const current = rows.filter(r => r.inicio <= ds && ds <= r.fin);
    const future  = rows.filter(r => r.inicio >  ds);
    return { past, current, future };
  }, []);

  const catsA = useMemo(() => playDate ? categorize(rowsA, playDate) : null, [playDate, rowsA, categorize]);
  const catsB = useMemo(() => playDate ? categorize(rowsB, playDate) : null, [playDate, rowsB, categorize]);

  const actA = catsA?.current ?? [];
  const actB = catsB?.current ?? [];

  // Progress %
  const progressA = rowsA.length ? Math.round(((catsA?.past.length ?? 0) + actA.length * 0.5) / rowsA.length * 100) : 0;
  const progressB = rowsB.length ? Math.round(((catsB?.past.length ?? 0) + actB.length * 0.5) / rowsB.length * 100) : 0;

  // ── 4D apply: cumulative — past visible, current colored, future by vizMode ─
  const apply4D = useCallback(async (
    vr: ForgeViewerHandle,
    rows: PlanRow[],
    cats: { past: PlanRow[]; current: PlanRow[]; future: PlanRow[] },
    hex: string,
    setApplying: (b: boolean) => void,
  ) => {
    if (!rows.length) return;
    setApplying(true);
    try {
      await vr.buildUniversalIndex();

      // Collect unique bim_ids per group
      const uniq = (r: PlanRow[]) => [...new Set(r.map(x => x.bim_id).filter(Boolean))];
      const pastIds    = uniq(cats.past);
      const currentIds = uniq(cats.current);
      const futureIds  = uniq(cats.future);

      // Resolve groups in parallel (3 calls regardless of row count)
      const [pastDb, currentDb, futureDb] = await Promise.all([
        pastIds.length    ? vr.resolveByUniversal(pastIds)    : Promise.resolve([] as number[]),
        currentIds.length ? vr.resolveByUniversal(currentIds) : Promise.resolve([] as number[]),
        futureIds.length  ? vr.resolveByUniversal(futureIds)  : Promise.resolve([] as number[]),
      ]);

      // Reset
      vr.showAll();
      vr.clearHighlights();

      if (vizMode === 'ghost') {
        // Isolate past + current → future becomes ghosted (semi-transparent)
        const visible = [...pastDb, ...currentDb];
        if (visible.length) vr.isolate(visible);
      } else if (vizMode === 'isolated') {
        // Hide future entirely, past + current fully visible
        if (futureDb.length) vr.hide(futureDb);
      }
      // 'all': showAll already called, everything visible

      // Color only in-progress elements
      if (currentDb.length) {
        vr.applyThemingBatch(new Map([[hex, currentDb]]));
      }
    } finally {
      setApplying(false);
    }
  }, [vizMode]);

  const applyColorsA = useCallback(async () => {
    const vr = viewerRefA.current;
    if (!vr || !viewerAReady || !playDate || !rowsA.length || !catsA) return;
    await apply4D(vr, rowsA, catsA, HEX_A, setApplyingA);
  }, [viewerRefA, viewerAReady, playDate, rowsA, catsA, apply4D]);

  const applyColorsB = useCallback(async () => {
    const vr = viewerRefB.current;
    if (!vr || !viewerBReady || !playDate || !rowsB.length || !catsB) return;
    await apply4D(vr, rowsB, catsB, HEX_B, setApplyingB);
  }, [viewerRefB, viewerBReady, playDate, rowsB, catsB, apply4D]);

  useEffect(() => { if (rowsA.length && viewerAReady) applyColorsA(); }, [playDate, rowsA, viewerAReady, vizMode]);
  useEffect(() => { if (rowsB.length && viewerBReady) applyColorsB(); }, [playDate, rowsB, viewerBReady, vizMode]);

  // ── Play/pause ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (playRef.current) { clearInterval(playRef.current); playRef.current = null; }
    if (!playing || !dateRange || !playDate) return;
    playRef.current = setInterval(() => {
      setPlayDate(prev => {
        if (!prev) return prev;
        const next = addDays(prev, STEP_DAYS[playSpeed]);
        if (next > dateRange.max) { setPlaying(false); return dateRange.max; }
        return next;
      });
    }, 500);
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playing, playSpeed, dateRange]);

  const sliderVal = useMemo(() => {
    if (!dateRange || !playDate) return 0;
    return Math.round((playDate.getTime() - dateRange.min.getTime()) / 86_400_000);
  }, [dateRange, playDate]);

  const pagesA = Math.max(1, Math.ceil(actA.length / PAGE));
  const pagesB = Math.max(1, Math.ceil(actB.length / PAGE));
  const pageRowsA = actA.slice(pageA * PAGE, (pageA + 1) * PAGE);
  const pageRowsB = actB.slice(pageB * PAGE, (pageB + 1) * PAGE);

  const noModel = !loadingModel && !modelUrn;

  // ─── Viewer column render ──────────────────────────────────────────────────
  const renderViewerCol = (
    side: 'A' | 'B',
    color: string,
    progress: number,
    wiz: WizardState,
    setWiz: (s: WizardState) => void,
    viewerRef: React.RefObject<ForgeViewerHandle | null>,
    viewerReady: boolean,
    setViewerReady: (b: boolean) => void,
    applying: boolean,
    actRows: PlanRow[],
    pageRows: PlanRow[],
    page: number,
    setPage: (p: number) => void,
    pages: number,
  ) => {
    const label = `Plan ${side}`;
    const uid   = side.toLowerCase();
    const orgSlug = typeof window !== 'undefined'
      ? window.location.pathname.split('/')[1] : '';

    return (
      <div className="flex flex-col flex-1 overflow-hidden min-h-0 relative">

        {/* Column header */}
        <div className="shrink-0 border-b" style={{ borderColor: `${color}30` }}>
          <div className="flex items-center justify-between px-4 py-2"
            style={{ background: `${color}12` }}>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{label}</span>
              {wiz.step === 'done' && (
                <span className="text-[9px] text-slate-500 font-bold truncate max-w-[120px]">
                  · {wiz.fileName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {applying && <Loader2 size={11} className="animate-spin" style={{ color }} />}
              {wiz.step === 'done' && playDate && (
                <>
                  <span className="text-[9px] text-slate-400 font-bold">
                    {actRows.length} en obra
                  </span>
                  <span className="text-[10px] font-black" style={{ color }}>
                    {progress}%
                  </span>
                </>
              )}
            </div>
          </div>
          {/* Progress bar */}
          {wiz.step === 'done' && (
            <div className="h-1 bg-slate-100">
              <div className="h-full transition-all duration-300"
                style={{ width: `${progress}%`, background: color }} />
            </div>
          )}
        </div>

        {/* 3D Viewer — 60% */}
        <div className="shrink-0 overflow-hidden" style={{ height: '60%' }}>
          {loadingModel ? (
            <div className="flex-1 flex items-center justify-center h-full bg-slate-100 gap-2">
              <Loader2 size={16} className="animate-spin text-slate-300" />
              <span className="text-[10px] text-slate-400 font-bold">Cargando modelo…</span>
            </div>
          ) : noModel ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 bg-slate-100">
              <Monitor size={24} className="text-slate-300" />
              <p className="text-[10px] text-slate-400 font-bold text-center px-4">
                Configura el modelo BIM desde Visor BIM
              </p>
            </div>
          ) : (
            <ForgeViewer
              ref={viewerRef}
              urn={modelUrn!}
              onReady={() => setViewerReady(true)}
            />
          )}
          {/* Viewer ready indicator */}
          {modelUrn && !viewerReady && !loadingModel && (
            <div className="absolute top-10 left-0 right-0 flex justify-center pointer-events-none">
              <span className="text-[9px] text-white font-bold bg-black/40 px-2 py-0.5 rounded-full animate-pulse">
                Iniciando visor…
              </span>
            </div>
          )}
        </div>

        {/* Bottom section — 40%: import wizard or activities */}
        <div className="flex-1 overflow-hidden min-h-0 border-t border-slate-200">
          {wiz.step !== 'done' ? (
            <ImportWizard
              label={label} color={color} uid={uid}
              state={wiz} onChange={s => { setWiz(s); setPage(0); }}
            />
          ) : (
            <ActivityTable
              rows={pageRows} color={color}
              page={page} onPage={setPage} totalPages={pages}
            />
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">

      {/* ── Shared timeline bar ──────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-4 py-2 flex items-center gap-3">
        <GitCompare size={12} className="text-[#0C1E4F] shrink-0" />
        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest shrink-0">
          Comparador 4D
        </span>

        {/* Viz mode */}
        <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[9px] font-black shrink-0">
          {([
            ['ghost',    'Fantasma'],
            ['isolated', 'Aislado'],
            ['all',      'Todo'],
          ] as [VizMode, string][]).map(([m, lbl]) => (
            <button key={m} onClick={() => setVizMode(m)}
              className={`px-2.5 py-1 transition ${vizMode === m ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Speed */}
        <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[9px] font-black shrink-0">
          {(['day','week','month'] as PlaySpeed[]).map(s => (
            <button key={s} onClick={() => setPlaySpeed(s)}
              className={`px-2.5 py-1 transition ${playSpeed === s ? 'bg-[#0C1E4F] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              {s === 'day' ? 'Día' : s === 'week' ? 'Sem' : 'Mes'}
            </button>
          ))}
        </div>

        {/* Playback controls + slider */}
        {dateRange && playDate ? (
          <>
            <button onClick={() => setPlayDate(prev => prev ? addDays(prev, -STEP_DAYS[playSpeed]) : prev)}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 shrink-0">
              <SkipBack size={11} />
            </button>
            <button onClick={() => setPlaying(p => !p)}
              className="p-1.5 rounded-lg bg-[#0C1E4F] text-white hover:bg-blue-800 shrink-0">
              {playing ? <Pause size={11} /> : <Play size={11} />}
            </button>
            <button onClick={() => setPlayDate(prev => prev ? addDays(prev, STEP_DAYS[playSpeed]) : prev)}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 shrink-0">
              <SkipForward size={11} />
            </button>

            <div className="flex-1 flex flex-col gap-0.5 mx-2">
              <input type="range" min={0} max={totalDays} value={sliderVal}
                onChange={e => setPlayDate(addDays(dateRange.min, Number(e.target.value)))}
                className="w-full h-1.5 accent-[#0C1E4F]" />
              <div className="flex justify-between">
                <span className="text-[8px] text-slate-400 font-bold">{fmtDate(dateRange.min)}</span>
                <span className="text-[8px] text-slate-400 font-bold">{fmtDate(dateRange.max)}</span>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[11px] font-black text-[#0C1E4F]">{fmtDate(playDate)}</p>
              <p className="text-[8px] text-slate-400 font-bold">
                A: {actA.length} · B: {actB.length}
              </p>
            </div>
          </>
        ) : (
          <p className="text-[10px] text-slate-400 font-bold ml-4">
            {rowsA.length || rowsB.length
              ? 'Calculando fechas…'
              : 'Importa los planes para activar la línea de tiempo'}
          </p>
        )}
      </div>

      {/* ── Two-column viewers ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0 divide-x divide-slate-200">
        {renderViewerCol(
          'A', HEX_A, progressA, wizA, setWizA, viewerRefA, viewerAReady, setViewerAReady,
          applyingA, actA, pageRowsA, pageA, setPageA, pagesA,
        )}
        {renderViewerCol(
          'B', HEX_B, progressB, wizB, setWizB, viewerRefB, viewerBReady, setViewerBReady,
          applyingB, actB, pageRowsB, pageB, setPageB, pagesB,
        )}
      </div>
    </div>
  );
}
