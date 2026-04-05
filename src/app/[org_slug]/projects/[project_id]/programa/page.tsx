'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { CalendarDays, Upload, FileText, Loader2, RefreshCw, X, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import GanttChart, { Activity } from '@/components/awp/GanttChart';
import { supabase } from '@/lib/supabase';

// ─── Column mapping helpers ───────────────────────────────────────────────────

function findCol(headers: string[], candidates: string[]): string | undefined {
  return headers.find(h =>
    candidates.some(c => h.toUpperCase().replace(/\s/g, '').includes(c.toUpperCase().replace(/\s/g, '')))
  );
}

function parseHH(v: any): number {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function parseDate(v: any): string | undefined {
  if (!v) return undefined;
  // Excel serial number
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(v).trim();
  if (!s) return undefined;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().substring(0,10);
  return undefined;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProgramaPage({ params }: { params: Promise<{ org_slug: string; project_id: string }> }) {
  const { project_id } = use(params);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading]       = useState(true);
  const [importing, setImporting]   = useState(false);
  const [preview, setPreview]       = useState<any[]>([]);
  const [colMap, setColMap]         = useState<Record<string,string>>({});
  const [headers, setHeaders]       = useState<string[]>([]);
  const [step, setStep]             = useState<'idle'|'preview'|'saving'>('idle');
  const [error, setError]           = useState<string|null>(null);
  const [totalHH, setTotalHH]       = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/program?project_id=${project_id}`);
    const data: Activity[] = await res.json();
    setActivities(data);
    setTotalHH(data.filter(a => !a.is_summary).reduce((s,a) => s + (a.hh||0), 0));
    setLoading(false);
  }, [project_id]);

  useEffect(() => { load(); }, [load]);

  // ── Excel import ─────────────────────────────────────────────────────────────

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
        if (!rows.length) { setError('Archivo vacío'); return; }

        const hdrs = Object.keys(rows[0]);
        setHeaders(hdrs);
        setPreview(rows);

        // Auto-detect columns
        const auto: Record<string,string> = {
          wbs:      findCol(hdrs, ['WBS','CODIGO','CÓDIGO','ID']) ?? '',
          desc:     findCol(hdrs, ['DESCRIPCION','DESCRIPCIÓN','NOMBRE','NAME','ACTIVIDAD']) ?? '',
          cwp:      findCol(hdrs, ['CWP']) ?? '',
          ewp:      findCol(hdrs, ['EWP']) ?? '',
          pwp:      findCol(hdrs, ['PWP']) ?? '',
          disc:     findCol(hdrs, ['DISCIPLINA','DISC']) ?? '',
          hh:       findCol(hdrs, ['HH','HORAS','MAN','MANHOUR']) ?? '',
          start:    findCol(hdrs, ['INICIO','START','COMIENZO','FECHA INICIO']) ?? '',
          end:      findCol(hdrs, ['TERMINO','TÉRMINO','FIN','END','FECHA FIN','FECHA TÉRMINO']) ?? '',
          progress: findCol(hdrs, ['AVANCE','PROGRESO','PROGRESS','%']) ?? '',
          parent:   findCol(hdrs, ['PADRE','PARENT','NIVEL PADRE']) ?? '',
          summary:  findCol(hdrs, ['RESUMEN','SUMMARY','ES RESUMEN','NIVEL']) ?? '',
        };
        setColMap(auto);
        setStep('preview');
      } catch {
        setError('Error leyendo el archivo Excel');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    setStep('saving');
    const mapped: any[] = preview.map((row, i) => ({
      wbs_code:    String(row[colMap.wbs] ?? `ACT-${i+1}`).trim(),
      description: String(row[colMap.desc] ?? '').trim(),
      cwp_code:    String(row[colMap.cwp] ?? '').trim() || undefined,
      ewp_code:    String(row[colMap.ewp] ?? '').trim() || undefined,
      pwp_code:    String(row[colMap.pwp] ?? '').trim() || undefined,
      discipline:  String(row[colMap.disc] ?? '').trim() || undefined,
      hh:          parseHH(row[colMap.hh]),
      start_date:  parseDate(row[colMap.start]),
      end_date:    parseDate(row[colMap.end]),
      progress:    parseHH(row[colMap.progress]),
      parent_wbs:  colMap.parent ? String(row[colMap.parent] ?? '').trim() || undefined : undefined,
      is_summary:  colMap.summary
        ? ['true','1','si','sí','yes','s','x'].includes(String(row[colMap.summary]).toLowerCase().trim())
        : false,
    }));

    const res = await fetch('/api/program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id, activities: mapped, replace: true }),
    });

    if (!res.ok) {
      const err = await res.json();
      setError(err.error ?? 'Error guardando');
      setStep('preview');
      return;
    }

    setStep('idle');
    setPreview([]);
    setHeaders([]);
    await load();
  };

  // ─── Stats ────────────────────────────────────────────────────────────────

  const disciplines = [...new Set(activities.filter(a => !a.is_summary && a.discipline).map(a => a.discipline!))];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] gap-4">

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#0C1E4F] rounded-2xl flex items-center justify-center text-white shrink-0">
            <CalendarDays size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black text-[#0C1E4F] leading-none">Programa Maestro</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Carta Gantt · {activities.filter(a=>!a.is_summary).length} actividades ·{' '}
              <span className="text-[#0C1E4F]">
                {totalHH.toLocaleString('es-CL', { maximumFractionDigits: 0 })} HH
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Import button */}
          <label className="flex items-center gap-2 px-4 py-2 bg-[#0C1E4F] text-white rounded-xl text-[11px] font-black uppercase tracking-widest cursor-pointer hover:bg-blue-700 transition-colors">
            <Upload size={13} />
            Importar Excel
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </label>
        </div>
      </div>

      {/* Discipline summary pills */}
      {disciplines.length > 0 && (
        <div className="shrink-0 flex flex-wrap gap-2">
          {disciplines.map(disc => {
            const hhDisc = activities.filter(a => !a.is_summary && a.discipline === disc).reduce((s,a) => s+(a.hh||0),0);
            const code = disc.toUpperCase().substring(0,2);
            const colors = { bar:'#94A3B8', bg:'#F1F5F9', text:'#64748B', label: disc, ...({} as any) };
            // apply DISC_COLORS if available
            const dc = (GanttChart as any).__DISC_COLORS?.[code];
            return (
              <div
                key={disc}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[10px] font-bold"
                style={{ background: '#F8FAFC', borderColor: '#E2E8F0', color: '#475569' }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.bar }} />
                {disc} · {hhDisc.toLocaleString('es-CL', { maximumFractionDigits: 0 })} HH
              </div>
            );
          })}
        </div>
      )}

      {/* Import preview modal */}
      {step === 'preview' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Mapeo de Columnas</p>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">{preview.length} filas detectadas</p>
              </div>
              <button onClick={() => { setStep('idle'); setPreview([]); }} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {[
                { key:'wbs',      label:'Código WBS *' },
                { key:'desc',     label:'Descripción' },
                { key:'cwp',      label:'CWP' },
                { key:'ewp',      label:'EWP' },
                { key:'pwp',      label:'PWP' },
                { key:'disc',     label:'Disciplina' },
                { key:'hh',       label:'HH (Man-Hours)' },
                { key:'start',    label:'Fecha Inicio' },
                { key:'end',      label:'Fecha Término' },
                { key:'progress', label:'% Avance' },
                { key:'parent',   label:'WBS Padre' },
                { key:'summary',  label:'¿Es resumen? (true/1)' },
              ].map(field => (
                <div key={field.key} className="flex items-center gap-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest w-40 shrink-0">{field.label}</label>
                  <select
                    value={colMap[field.key] ?? ''}
                    onChange={e => setColMap(p => ({ ...p, [field.key]: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">— sin mapear —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {error && (
              <div className="mx-6 mb-2 flex items-center gap-2 text-rose-600 text-[11px] font-bold bg-rose-50 rounded-xl px-3 py-2">
                <AlertCircle size={13} /> {error}
              </div>
            )}

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => { setStep('idle'); setPreview([]); }} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!colMap.wbs}
                className="px-6 py-2 bg-[#0C1E4F] text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <FileText size={13} /> Cargar {preview.length} actividades
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="fixed inset-0 z-50 bg-white/80 flex items-center justify-center gap-3">
          <Loader2 size={28} className="animate-spin text-[#0C1E4F]" />
          <p className="font-black text-slate-500 uppercase tracking-widest text-sm">Procesando programa...</p>
        </div>
      )}

      {/* Gantt */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-3">
            <Loader2 size={24} className="animate-spin text-[#0C1E4F]" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Cargando programa...</p>
          </div>
        ) : (
          <GanttChart activities={activities} />
        )}
      </div>

      {error && step === 'idle' && (
        <div className="shrink-0 flex items-center gap-2 text-rose-600 text-[11px] font-bold bg-rose-50 rounded-xl px-4 py-2 border border-rose-100">
          <AlertCircle size={13} /> {error}
        </div>
      )}
    </div>
  );
}
