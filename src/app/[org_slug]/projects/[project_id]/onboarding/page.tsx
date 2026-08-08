'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { Upload, CheckCircle2, Loader2, ArrowRight, FileSpreadsheet, ListTree, Package, Rocket, AlertTriangle } from 'lucide-react';
import { parseXER } from '@/lib/xer';

interface Campo { k: string; label: string; req?: boolean; keys: string[] }
interface Entidad { id: 'cwp' | 'programa' | 'itemizado'; nombre: string; icon: any; ayuda: string; campos: Campo[] }

const ENTIDADES: Entidad[] = [
  { id: 'cwp', nombre: 'Catálogo AWP (CWP)', icon: ListTree, ayuda: 'La estructura base. El código CWP es la clave que conecta todo.', campos: [
    { k: 'cwp_id', label: 'CWP (clave)', req: true, keys: ['cwp'] },
    { k: 'cwp_nombre', label: 'Nombre', keys: ['nombre', 'name'] },
    { k: 'disciplina_cod', label: 'Disciplina', keys: ['discipl', 'disc'] },
    { k: 'cwa_id', label: 'CWA', keys: ['cwa'] },
    { k: 'cv_id', label: 'CV', keys: ['cv'] },
  ] },
  { id: 'programa', nombre: 'Programa (P6 / XER)', icon: FileSpreadsheet, ayuda: 'Actividades del programa. Acepta .xer de Primavera o Excel. Cada actividad debe traer su CWP.', campos: [
    { k: 'cod_actividad', label: 'Código actividad (clave)', req: true, keys: ['cod', 'task_code', 'codigo', 'activity'] },
    { k: 'nombre_actividad', label: 'Nombre actividad', keys: ['nombre', 'task_name', 'name', 'descrip'] },
    { k: 'hh', label: 'HH', keys: ['hh', 'horas', 'work', 'qty'] },
    { k: 'fecha_inicio', label: 'Fecha inicio', keys: ['inicio', 'start', 'comienzo'] },
    { k: 'fecha_fin', label: 'Fecha fin', keys: ['fin', 'finish', 'termino', 'end'] },
    { k: 'cwp_id', label: 'CWP (clave)', req: true, keys: ['cwp'] },
  ] },
  { id: 'itemizado', nombre: 'Itemizado de cobro', icon: Package, ayuda: 'Ítems de cobro con cantidades y HH. Cada ítem debe traer su CWP.', campos: [
    { k: 'item', label: 'Ítem (clave)', req: true, keys: ['item', 'partida'] },
    { k: 'descripcion', label: 'Descripción', keys: ['descrip'] },
    { k: 'unidad', label: 'Unidad', keys: ['unidad', 'unit', 'un'] },
    { k: 'cantidad', label: 'Cantidad', keys: ['cantidad', 'cant', 'qty'] },
    { k: 'hh_item', label: 'HH', keys: ['hh', 'horas'] },
    { k: 'commodity', label: 'Commodity', keys: ['commodity', 'obra', 'commod'] },
    { k: 'cwp_id', label: 'CWP (clave)', req: true, keys: ['cwp'] },
  ] },
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

export default function OnboardingPage() {
  const { org_slug, project_id } = useParams<{ org_slug: string; project_id: string }>();
  const [done, setDone] = useState<Record<string, number>>({});

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-black text-[#1A1A1A] flex items-center gap-2"><Rocket className="w-6 h-6 text-[#FF0000]" /> Onboarding <span className="text-[#FF0000]">de datos</span></h1>
        <p className="text-[11.5px] text-slate-500">Carga las fuentes del proyecto paso a paso. La columna <b>CWP</b> es la clave que conecta programa, itemizado y modelo.</p>
      </div>

      <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-2.5 text-[11px] text-blue-800 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        Orden recomendado: <b>1) Catálogo CWP</b> (define la estructura) → <b>2) Programa</b> → <b>3) Itemizado</b>. Cada carga reemplaza la anterior de esa entidad.
      </div>

      {ENTIDADES.map((e, i) => (
        <ImportStep key={e.id} paso={i + 1} entidad={e} projectId={project_id}
          onDone={(n) => setDone(d => ({ ...d, [e.id]: n }))} hecho={done[e.id]} />
      ))}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between">
        <div className="text-[12px] text-slate-500">Cuando termines, revisa el estado en Configuración y abre AWP Minería.</div>
        <div className="flex gap-2">
          <Link href={`/${org_slug}/projects/${project_id}/setup`} className="px-4 py-2 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-600 hover:bg-slate-50">Ver Configuración</Link>
          <Link href={`/${org_slug}/projects/${project_id}/mineria`} className="px-4 py-2 rounded-lg bg-[#FF0000] text-white text-[12px] font-black inline-flex items-center gap-1.5">Abrir Minería <ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>
      </div>
    </div>
  );
}

function ImportStep({ paso, entidad, projectId, onDone, hecho }: {
  paso: number; entidad: Entidad; projectId: string; onDone: (n: number) => void; hecho?: number;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const Icon = entidad.icon;

  const onFile = async (file: File) => {
    setMsg(null); setFileName(file.name);
    let hs: string[] = [], rs: string[][] = [];
    if (file.name.toLowerCase().endsWith('.xer')) {
      const t = parseXER(await file.text());
      const task = t['TASK'];
      if (!task) { setMsg('El .xer no contiene tabla TASK.'); return; }
      hs = task.headers; rs = task.rows;
    } else {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any[][];
      hs = (aoa[0] ?? []).map(String); rs = aoa.slice(1).map(r => r.map(String));
    }
    setHeaders(hs); setRows(rs);
    // Auto-mapeo por nombre
    const guess: Record<string, string> = {};
    for (const c of entidad.campos) {
      const h = hs.find(x => c.keys.some(k => norm(x).includes(norm(k))));
      if (h) guess[c.k] = h;
    }
    setMap(guess);
  };

  const cargar = async () => {
    const faltan = entidad.campos.filter(c => c.req && !map[c.k]);
    if (faltan.length) { setMsg(`Falta mapear: ${faltan.map(c => c.label).join(', ')}`); return; }
    setBusy(true); setMsg(null);
    const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
    const filas = rows.map(r => {
      const o: any = {};
      for (const c of entidad.campos) if (map[c.k]) o[c.k] = r[idx[map[c.k]]];
      return o;
    });
    try {
      const res = await fetch('/api/project-ingest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, entidad: entidad.id, filas }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error);
      setMsg(`✓ ${d.insertadas.toLocaleString('es-CL')} filas cargadas${d.sin_cwp ? ` · ${d.sin_cwp} sin CWP` : ''}`);
      onDone(d.insertadas);
    } catch (e: any) { setMsg(`Error: ${e.message ?? e}`); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-black ${hecho ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{hecho ? <CheckCircle2 className="w-4 h-4" /> : paso}</span>
        <Icon className="w-4 h-4 text-[#FF0000]" />
        <div className="flex-1">
          <div className="text-[13px] font-black text-[#1A1A1A]">{entidad.nombre}</div>
          <div className="text-[10.5px] text-slate-400">{entidad.ayuda}</div>
        </div>
        {hecho != null && <span className="text-[11px] font-mono font-bold text-emerald-700">{hecho.toLocaleString('es-CL')} filas</span>}
      </div>

      <label className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-slate-200 hover:border-red-300 cursor-pointer text-[12px] text-slate-500 w-fit">
        <Upload className="w-4 h-4" /> {fileName || 'Subir archivo (.xlsx, .csv, .xer)'}
        <input type="file" accept=".xlsx,.xls,.csv,.xer" hidden onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>

      {headers.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Mapea las columnas ({rows.length.toLocaleString('es-CL')} filas detectadas)</div>
          <div className="grid md:grid-cols-2 gap-2">
            {entidad.campos.map(c => (
              <div key={c.k} className="flex items-center gap-2">
                <span className={`text-[11px] w-40 shrink-0 ${c.req ? 'font-bold text-[#A00000]' : 'text-slate-600'}`}>{c.label}</span>
                <select value={map[c.k] ?? ''} onChange={e => setMap(m => ({ ...m, [c.k]: e.target.value }))}
                  className={`flex-1 border rounded-lg px-2 py-1.5 text-[11px] outline-none ${c.req && !map[c.k] ? 'border-red-300' : 'border-slate-200'}`}>
                  <option value="">— sin mapear —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button onClick={cargar} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FF0000] text-white text-[12px] font-black disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Cargar {entidad.nombre.split(' ')[0]}
            </button>
            {msg && <span className={`text-[11px] font-semibold ${msg.startsWith('✓') ? 'text-emerald-700' : 'text-[#A00000]'}`}>{msg}</span>}
          </div>
        </div>
      )}
      {headers.length === 0 && msg && <div className="mt-2 text-[11px] text-[#A00000]">{msg}</div>}
    </div>
  );
}
