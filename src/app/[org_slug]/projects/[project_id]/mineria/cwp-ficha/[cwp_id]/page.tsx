'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Save, Printer, Type, Heading, AlignLeft, Image as ImageIcon, Table, PenLine,
  ChevronUp, ChevronDown, Trash2, Plus, RotateCcw, Loader2, FileText, StickyNote, Minus, SeparatorHorizontal, Building2,
} from 'lucide-react';
import FichaDocument from '@/components/awp/ficha/FichaDocument';
import {
  type Bloque, type FichaData, type FuenteDatos, type Orientacion,
  bloquesPorDefecto, plantillaDepto, nuevoId, ETIQUETA_FUENTE,
} from '@/components/awp/ficha/types';

const DEPTOS = ['Calidad', 'Medio Ambiente', 'SSO', 'Equipos', 'RRHH', 'Terreno', 'Oficina Técnica'];

// Comprime una imagen a JPEG <=1600px para no inflar el jsonb con archivos gigantes.
function comprimirImagen(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        let { width, height } = img;
        if (width > max) { height = Math.round(height * max / width); width = max; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ScaledPreview({ width, children }: { width: number; children: React.ReactNode }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [h, setH] = useState(0);
  useEffect(() => {
    const holder = holderRef.current, inner = innerRef.current;
    if (!holder || !inner) return;
    const recalc = () => {
      const s = Math.min(1, holder.clientWidth / width);
      setScale(s);
      setH(inner.scrollHeight * s);
    };
    const ro = new ResizeObserver(recalc);
    ro.observe(holder); ro.observe(inner);
    recalc();
    return () => ro.disconnect();
  }, [width, children]);
  return (
    <div ref={holderRef} style={{ width: '100%', overflow: 'hidden' }}>
      <div style={{ height: h }}>
        <div ref={innerRef} style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
      </div>
    </div>
  );
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[12px] outline-none focus:border-red-400';
const btnGhost = 'p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700';

export default function FichaCwpEditorPage() {
  const params = useParams();
  const projectId = params.project_id as string;
  const orgSlug = params.org_slug as string;
  const cwpId = decodeURIComponent(params.cwp_id as string);

  const [data, setData] = useState<FichaData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orientacion, setOrientacion] = useState<Orientacion>('vertical');
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/mining-cwp-ficha?project_id=${projectId}&cwp_id=${encodeURIComponent(cwpId)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then((d: FichaData) => {
        setData(d);
        setOrientacion(d.ficha?.orientacion ?? 'vertical');
        setBloques(d.ficha?.bloques?.length ? d.ficha.bloques : bloquesPorDefecto());
      })
      .catch(e => setError(String(e.message ?? e)));
  }, [projectId, cwpId]);

  const mut = useCallback((fn: (prev: Bloque[]) => Bloque[]) => { setBloques(fn); setDirty(true); }, []);
  const add = (b: Bloque | Bloque[]) => mut(prev => [...prev, ...(Array.isArray(b) ? b : [b])]);
  const update = (id: string, patch: any) => mut(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  const remove = (id: string) => mut(prev => prev.filter(b => b.id !== id));
  const move = (id: string, dir: -1 | 1) => mut(prev => {
    const i = prev.findIndex(b => b.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= prev.length) return prev;
    const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/mining-cwp-ficha', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, cwp_id: cwpId, orientacion, bloques }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Error al guardar');
      setDirty(false); setToast('✓ Ficha guardada');
      setTimeout(() => setToast(null), 2500);
    } catch (e: any) { setToast(String(e.message ?? e)); }
    finally { setSaving(false); }
  };

  if (error) return <div className="p-10 text-red-700">Error: {error}</div>;
  if (!data) return <div className="p-10 text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando editor…</div>;

  const docWidth = orientacion === 'horizontal' ? 1100 : 780;

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Barra superior */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-3">
        <Link href={`/${orgSlug}/projects/${projectId}/mineria`} className={btnGhost} title="Volver a Minería"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="min-w-0">
          <div className="text-[13px] font-black text-[#1A1A1A] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#FF0000]" /> Editor de ficha — CWP {cwpId}
            {dirty && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">sin guardar</span>}
          </div>
          <div className="text-[10.5px] text-slate-500 truncate">{data.cwp.cwp_nombre}</div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-bold">
            <button onClick={() => { setOrientacion('vertical'); setDirty(true); }} className={`px-3 py-1.5 ${orientacion === 'vertical' ? 'bg-[#FF0000] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Vertical</button>
            <button onClick={() => { setOrientacion('horizontal'); setDirty(true); }} className={`px-3 py-1.5 ${orientacion === 'horizontal' ? 'bg-[#FF0000] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Horizontal</button>
          </div>
          <button onClick={() => { setBloques(bloquesPorDefecto()); setDirty(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-500 hover:bg-slate-50" title="Restaurar composición por defecto"><RotateCcw className="w-3.5 h-3.5" /> Reiniciar</button>
          <a href={`/${orgSlug}/projects/${projectId}/mineria/cwp-ficha/${encodeURIComponent(cwpId)}/print`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border-2 border-[#FF0000] text-[11px] font-black text-[#FF0000] hover:bg-red-50"><Printer className="w-3.5 h-3.5" /> Abrir PDF</a>
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#FF0000] text-white text-[11px] font-black disabled:opacity-40"><Save className="w-3.5 h-3.5" /> {saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '440px 1fr' }}>
        {/* Panel de edición */}
        <div className="border-r border-slate-200 bg-white h-[calc(100vh-49px)] overflow-y-auto p-4">
          <Paleta onAdd={add} />
          <div className="mt-4 space-y-2">
            {bloques.map((b, i) => (
              <BloqueCard key={b.id} b={b} first={i === 0} last={i === bloques.length - 1}
                onUp={() => move(b.id, -1)} onDown={() => move(b.id, 1)} onDelete={() => remove(b.id)} onUpdate={(p) => update(b.id, p)} />
            ))}
            {bloques.length === 0 && <div className="text-[11px] text-slate-400 italic text-center py-8">Documento vacío. Agrega bloques desde la paleta de arriba.</div>}
          </div>
        </div>

        {/* Preview en vivo */}
        <div className="h-[calc(100vh-49px)] overflow-y-auto p-6">
          <div className="bg-white shadow-xl mx-auto" style={{ maxWidth: docWidth + 40 }}>
            <ScaledPreview width={docWidth}>
              <FichaDocument data={data} orientacion={orientacion} bloques={bloques} />
            </ScaledPreview>
          </div>
        </div>
      </div>

      {toast && <div className="fixed bottom-5 right-5 bg-[#08203F] text-white text-[12px] font-semibold px-4 py-2.5 rounded-lg shadow-xl z-50">{toast}</div>}
    </div>
  );
}

function Paleta({ onAdd }: { onAdd: (b: Bloque | Bloque[]) => void }) {
  const [fuente, setFuente] = useState<FuenteDatos>('programa');
  const [depto, setDepto] = useState(DEPTOS[0]);
  const P = ({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) => (
    <button onClick={onClick} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-red-300 hover:text-[#A00000] hover:bg-red-50/50">
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
  return (
    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/60">
      <div className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 mb-2">Agregar bloque</div>
      <div className="flex flex-wrap gap-1.5">
        <P icon={Heading} label="Título" onClick={() => onAdd({ id: nuevoId(), tipo: 'titulo', texto: 'Nuevo título' })} />
        <P icon={Type} label="Subtítulo" onClick={() => onAdd({ id: nuevoId(), tipo: 'subtitulo', texto: 'Subtítulo' })} />
        <P icon={AlignLeft} label="Párrafo" onClick={() => onAdd({ id: nuevoId(), tipo: 'parrafo', texto: '' })} />
        <P icon={StickyNote} label="Nota" onClick={() => onAdd({ id: nuevoId(), tipo: 'nota', texto: '', color: 'azul' })} />
        <P icon={ImageIcon} label="Imágenes" onClick={() => onAdd({ id: nuevoId(), tipo: 'imagenes', porFila: 2, imgs: [] })} />
        <P icon={PenLine} label="Firmas" onClick={() => onAdd({ id: nuevoId(), tipo: 'firmas', roles: ['Jefe de Terreno', 'Oficina Técnica', 'Adm. Contrato'] })} />
        <P icon={SeparatorHorizontal} label="Divisor" onClick={() => onAdd({ id: nuevoId(), tipo: 'divisor' })} />
        <P icon={Minus} label="Salto pág." onClick={() => onAdd({ id: nuevoId(), tipo: 'salto' })} />
      </div>

      <div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2">
        <Table className="w-3.5 h-3.5 text-slate-400" />
        <select value={fuente} onChange={e => setFuente(e.target.value as FuenteDatos)} className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] outline-none">
          {(Object.keys(ETIQUETA_FUENTE) as FuenteDatos[]).map(k => <option key={k} value={k}>{ETIQUETA_FUENTE[k]}</option>)}
        </select>
        <button onClick={() => onAdd({ id: nuevoId(), tipo: 'datos', fuente })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-bold"><Plus className="w-3 h-3" /> Tabla</button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Building2 className="w-3.5 h-3.5 text-slate-400" />
        <select value={depto} onChange={e => setDepto(e.target.value)} className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] outline-none">
          {DEPTOS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <button onClick={() => onAdd(plantillaDepto(depto))} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-[11px] font-bold hover:bg-slate-100"><Plus className="w-3 h-3" /> Sección depto.</button>
      </div>
    </div>
  );
}

const TIPO_LABEL: Record<string, string> = {
  titulo: 'Título', subtitulo: 'Subtítulo', parrafo: 'Párrafo', nota: 'Nota', imagenes: 'Imágenes',
  datos: 'Tabla de datos', firmas: 'Firmas', salto: 'Salto de página', divisor: 'Divisor',
};

function BloqueCard({ b, first, last, onUp, onDown, onDelete, onUpdate }: {
  b: Bloque; first: boolean; last: boolean;
  onUp: () => void; onDown: () => void; onDelete: () => void; onUpdate: (patch: any) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-slate-100 bg-slate-50/70 rounded-t-xl">
        <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{TIPO_LABEL[b.tipo]}</span>
        {b.tipo === 'datos' && <span className="text-[9px] text-slate-400">· {ETIQUETA_FUENTE[b.fuente]}</span>}
        <div className="ml-auto flex items-center">
          <button onClick={onUp} disabled={first} className={btnGhost + ' disabled:opacity-25'}><ChevronUp className="w-3.5 h-3.5" /></button>
          <button onClick={onDown} disabled={last} className={btnGhost + ' disabled:opacity-25'}><ChevronDown className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className={btnGhost + ' hover:text-red-600'}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="p-2.5">
        <BloqueEditor b={b} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function BloqueEditor({ b, onUpdate }: { b: Bloque; onUpdate: (patch: any) => void }) {
  switch (b.tipo) {
    case 'titulo':
    case 'subtitulo':
      return <input className={inputCls} value={b.texto} onChange={e => onUpdate({ texto: e.target.value })} placeholder="Texto del título" />;
    case 'parrafo':
      return <textarea className={inputCls} rows={4} value={b.texto} onChange={e => onUpdate({ texto: e.target.value })} placeholder="Escribe el texto… (los saltos de línea se respetan)" />;
    case 'nota':
      return <div className="space-y-2">
        <textarea className={inputCls} rows={3} value={b.texto} onChange={e => onUpdate({ texto: e.target.value })} placeholder="Texto de la nota / advertencia" />
        <div className="flex gap-1.5">
          {(['azul', 'ambar', 'rojo', 'verde'] as const).map(c => (
            <button key={c} onClick={() => onUpdate({ color: c })} className={`w-6 h-6 rounded-full border-2 ${b.color === c ? 'border-slate-800' : 'border-transparent'}`}
              style={{ background: c === 'azul' ? '#3b82f6' : c === 'ambar' ? '#f59e0b' : c === 'rojo' ? '#ef4444' : '#22c55e' }} />
          ))}
        </div>
      </div>;
    case 'datos':
      return <input className={inputCls} value={b.titulo ?? ''} onChange={e => onUpdate({ titulo: e.target.value || undefined })} placeholder={`Título (opcional) — por defecto: ${ETIQUETA_FUENTE[b.fuente]}`} />;
    case 'firmas':
      return <div className="space-y-1.5">
        <div className="text-[10px] text-slate-400">Roles que firman (una por línea):</div>
        <textarea className={inputCls} rows={3} value={b.roles.join('\n')} onChange={e => onUpdate({ roles: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })} />
      </div>;
    case 'imagenes':
      return <ImagenesEditor b={b} onUpdate={onUpdate} />;
    case 'salto':
      return <div className="text-[10.5px] text-slate-400 italic">Fuerza el inicio de una nueva página al imprimir.</div>;
    case 'divisor':
      return <div className="text-[10.5px] text-slate-400 italic">Línea divisoria horizontal.</div>;
    default:
      return null;
  }
}

function ImagenesEditor({ b, onUpdate }: { b: Extract<Bloque, { tipo: 'imagenes' }>; onUpdate: (patch: any) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const nuevas = await Promise.all(Array.from(files).map(async f => ({ url: await comprimirImagen(f), caption: '' })));
      onUpdate({ imgs: [...b.imgs, ...nuevas] });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <input className={inputCls} value={b.titulo ?? ''} onChange={e => onUpdate({ titulo: e.target.value || undefined })} placeholder="Título de la sección (opcional)" />
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-400">Por fila:</span>
        {[1, 2, 3].map(n => (
          <button key={n} onClick={() => onUpdate({ porFila: n })} className={`w-7 h-7 rounded-lg border text-[11px] font-bold ${b.porFila === n ? 'bg-[#FF0000] text-white border-[#FF0000]' : 'border-slate-200 text-slate-500'}`}>{n}</button>
        ))}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => onFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 text-white text-[11px] font-bold disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Subir imagen
        </button>
      </div>
      {b.imgs.length === 0 && <div className="text-[10.5px] text-slate-400 italic">Sin imágenes. Sube capturas del modelo 3D, fotos de terreno o planos.</div>}
      <div className="space-y-1.5">
        {b.imgs.map((im, i) => (
          <div key={i} className="flex items-center gap-2 border border-slate-100 rounded-lg p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={im.url} alt="" className="w-12 h-12 object-cover rounded border border-slate-200" />
            <input className={inputCls} value={im.caption ?? ''} onChange={e => onUpdate({ imgs: b.imgs.map((x, j) => j === i ? { ...x, caption: e.target.value } : x) })} placeholder="Pie de imagen (opcional)" />
            <button onClick={() => onUpdate({ imgs: b.imgs.filter((_, j) => j !== i) })} className={btnGhost + ' hover:text-red-600'}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
