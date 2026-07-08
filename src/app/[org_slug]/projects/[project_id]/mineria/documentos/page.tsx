'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Search, FileText, ArrowLeft, ListTree } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MDoc {
  codigoDocumento: string;
  descripcion: string | null;
  tipo: string | null;
  confianza: string | null;
  cwpId: string | null;
  ewpId: string | null;
  cwaId: string | null;
  cvId: string | null;
  cwpNombre: string | null;
  esOficial: boolean;
  disciplinaCode: string;
  disciplina: string;
  disciplinaColor: string;
  tieneArchivo: boolean;
}
interface MDisc { code: string; name: string; color: string; n: number; }
interface MResponse { docs: MDoc[]; disciplinas: MDisc[]; total: number; conArchivo: number; }

const fn = (n: number) => n.toLocaleString('es-CL');

function buildOptions(docs: MDoc[], pick: (d: MDoc) => string | null): { value: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const d of docs) {
    const v = pick(d);
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, n]) => ({ value, n })).sort((a, b) => a.value.localeCompare(b.value));
}

export default function DocumentosPage() {
  const { org_slug, project_id } = useParams<{ org_slug: string; project_id: string }>();
  const [data, setData] = useState<MResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeDisc, setActiveDisc] = useState<string | null>(null);
  const [estado, setEstado] = useState<'' | 'oficial' | 'estimado_por_area' | 'sin_clasificar'>('');
  const [activeCwa, setActiveCwa] = useState('');
  const [activeCv, setActiveCv] = useState('');
  const [activeCwp, setActiveCwp] = useState('');

  useEffect(() => {
    if (!project_id) return;
    setLoading(true);
    fetch(`/api/mining-planos/list?project_id=${project_id}`)
      .then(r => r.json())
      .then((d: MResponse) => setData(d))
      .finally(() => setLoading(false));
  }, [project_id]);

  const matchesBase = (d: MDoc) => {
    const q = search.trim().toLowerCase();
    if (activeDisc && d.disciplinaCode !== activeDisc) return false;
    if (estado === 'oficial' && !d.esOficial) return false;
    if (estado === 'estimado_por_area' && d.confianza !== 'estimado_por_area') return false;
    if (estado === 'sin_clasificar' && d.confianza !== 'sin_clasificar') return false;
    if (q && !(d.codigoDocumento.toLowerCase().includes(q) || (d.descripcion ?? '').toLowerCase().includes(q))) return false;
    return true;
  };

  // Cascada: disciplina -> CWA -> CV -> CWP. Cada nivel se calcula sobre lo que ya filtraron
  // los niveles anteriores, así las opciones (y sus conteos) siempre reflejan los filtros activos.
  const docsForCwaOptions = useMemo(() => (data?.docs ?? []).filter(matchesBase), [data, search, activeDisc, estado]);
  const cwaOptions = useMemo(() => buildOptions(docsForCwaOptions, d => d.cwaId), [docsForCwaOptions]);

  const docsForCvOptions = useMemo(
    () => docsForCwaOptions.filter(d => !activeCwa || d.cwaId === activeCwa),
    [docsForCwaOptions, activeCwa]
  );
  const cvOptions = useMemo(() => buildOptions(docsForCvOptions, d => d.cvId), [docsForCvOptions]);

  const docsForCwpOptions = useMemo(
    () => docsForCvOptions.filter(d => !activeCv || d.cvId === activeCv),
    [docsForCvOptions, activeCv]
  );
  const cwpOptions = useMemo(() => buildOptions(docsForCwpOptions, d => d.cwpId), [docsForCwpOptions]);

  const filtered = useMemo(
    () => docsForCwpOptions.filter(d => !activeCwp || d.cwpId === activeCwp),
    [docsForCwpOptions, activeCwp]
  );

  // Cambiar un filtro de nivel superior invalida los de abajo (la disciplina ya re-filtra CWA/CV/CWP altiro).
  const onDiscClick = (code: string | null) => { setActiveDisc(code); setActiveCwa(''); setActiveCv(''); setActiveCwp(''); };
  const onCwaChange = (v: string) => { setActiveCwa(v); setActiveCv(''); setActiveCwp(''); };
  const onCvChange = (v: string) => { setActiveCv(v); setActiveCwp(''); };

  if (loading || !data) {
    return <div className="h-full flex items-center justify-center text-slate-400 text-[13px]">Cargando documentos…</div>;
  }

  return (
    <div className="h-full flex flex-col -m-6 bg-[#EEF2F7]">
      <div className="bg-gradient-to-br from-[#08203F] to-[#1565C0] text-white px-6 py-3 flex items-center gap-5 shrink-0">
        <Link
          href={`/${org_slug}/projects/${project_id}/mineria`}
          className="p-1.5 rounded bg-white/10 hover:bg-white/20 transition shrink-0"
          title="Volver a Explorador CWP"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-[15px] font-extrabold flex items-center gap-2"><FileText className="w-4 h-4" /> Control de Documentos</h1>
        <div className="flex gap-5 ml-auto flex-wrap">
          <Kpi value={fn(data.total)} label="documentos" />
          <Kpi value={fn(data.conArchivo)} label="con PDF local" />
          <Kpi value={fn(data.disciplinas.length)} label="disciplinas" />
        </div>
        <Link
          href={`/${org_slug}/projects/${project_id}/mineria/elementos`}
          className="px-2.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-wide transition flex items-center gap-1.5 shrink-0"
        >
          <ListTree className="w-3.5 h-3.5" /> Editor de Elementos
        </Link>
      </div>

      <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-2 flex-wrap shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por N° de documento o descripción…"
            className="w-[300px] border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-[12px] outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={estado} onChange={e => setEstado(e.target.value as any)}
          className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 outline-none"
        >
          <option value="">Todos los estados</option>
          <option value="oficial">Solo CWP oficial (itemizado original)</option>
          <option value="estimado_por_area">Estimado por área (a revisar)</option>
          <option value="sin_clasificar">Sin clasificar (genérico)</option>
        </select>
        <span className="text-[11px] text-slate-400 font-semibold ml-auto">{fn(filtered.length)} resultado(s)</span>
      </div>

      <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex gap-1.5 flex-wrap shrink-0">
        <button
          onClick={() => onDiscClick(null)}
          className="rounded-full px-2.5 py-1 text-[10px] font-extrabold text-white transition"
          style={{ background: '#0D47A1', opacity: activeDisc === null ? 1 : 0.4 }}
        >
          Todas ({fn(data.total)})
        </button>
        {data.disciplinas.map(d => (
          <button
            key={d.code} onClick={() => onDiscClick(activeDisc === d.code ? null : d.code)}
            className="rounded-full px-2.5 py-1 text-[10px] font-extrabold text-white transition"
            style={{ background: d.color, opacity: activeDisc === d.code || activeDisc === null ? 1 : 0.32 }}
          >
            {d.name} ({fn(d.n)})
          </button>
        ))}
      </div>

      <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-[10px] font-extrabold uppercase text-slate-400">Filtrar jerarquía:</span>
        <select
          value={activeCwa} onChange={e => onCwaChange(e.target.value)}
          className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-[11.5px] font-mono font-semibold text-slate-600 outline-none"
        >
          <option value="">Todos los CWA ({fn(cwaOptions.reduce((s, o) => s + o.n, 0))})</option>
          {cwaOptions.map(o => <option key={o.value} value={o.value}>{o.value} ({fn(o.n)})</option>)}
        </select>
        <select
          value={activeCv} onChange={e => onCvChange(e.target.value)}
          disabled={!cvOptions.length}
          className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-[11.5px] font-mono font-semibold text-slate-600 outline-none disabled:opacity-40"
        >
          <option value="">Todos los CV ({fn(cvOptions.reduce((s, o) => s + o.n, 0))})</option>
          {cvOptions.map(o => <option key={o.value} value={o.value}>{o.value} ({fn(o.n)})</option>)}
        </select>
        <select
          value={activeCwp} onChange={e => setActiveCwp(e.target.value)}
          disabled={!cwpOptions.length}
          className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-[11.5px] font-mono font-semibold text-slate-600 outline-none disabled:opacity-40"
        >
          <option value="">Todos los CWP ({fn(cwpOptions.reduce((s, o) => s + o.n, 0))})</option>
          {cwpOptions.map(o => <option key={o.value} value={o.value}>{o.value} ({fn(o.n)})</option>)}
        </select>
        {(activeCwa || activeCv || activeCwp) && (
          <button
            onClick={() => { setActiveCwa(''); setActiveCv(''); setActiveCwp(''); }}
            className="text-[10.5px] font-bold text-blue-700 hover:underline"
          >
            Limpiar jerarquía
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse bg-white text-[12px]">
          <thead>
            <tr className="bg-[#F8FAFC] text-[10px] uppercase text-slate-500 font-extrabold sticky top-0 z-10 border-b border-slate-200">
              <Th>N° Documento</Th><Th>Descripción</Th><Th>Disciplina</Th><Th>CWA / CWP</Th><Th center>Tipo</Th><Th center>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={d.codigoDocumento + i} className={cn('border-b border-slate-100 hover:bg-slate-50', i % 2 === 0 && 'bg-[#FAFBFD]')}>
                <Td className="font-mono">
                  {d.tieneArchivo ? (
                    <a
                      href={`/api/mining-planos/file?codigo_documento=${encodeURIComponent(d.codigoDocumento)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[#0D47A1] hover:underline inline-flex items-center gap-1"
                      title="Abrir PDF real desde la carpeta local de Aconex"
                    >
                      📄 {d.codigoDocumento}
                    </a>
                  ) : (
                    <span className="text-slate-500">{d.codigoDocumento}</span>
                  )}
                </Td>
                <Td className="max-w-[420px] truncate" title={d.descripcion ?? ''}>{d.descripcion}</Td>
                <Td>
                  <span className="text-[9.5px] font-extrabold text-white rounded px-1.5 py-0.5" style={{ background: d.disciplinaColor }}>
                    {d.disciplina}
                  </span>
                </Td>
                <Td className="font-mono text-slate-500">{d.cwpId ?? '—'}</Td>
                <Td center><span className="text-[9.5px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 font-semibold">{d.tipo || 'Plano'}</span></Td>
                <Td center><EstadoBadge confianza={d.confianza} esOficial={d.esOficial} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-12 text-center text-slate-400 text-[13px]">No hay documentos con esos filtros.</div>}
      </div>
    </div>
  );
}

function EstadoBadge({ confianza, esOficial }: { confianza: string | null; esOficial: boolean }) {
  if (esOficial) return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Oficial</span>;
  if (confianza === 'estimado_por_area') return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Estimado</span>;
  if (confianza === 'sin_clasificar') return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">Sin clasificar</span>;
  return <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">—</span>;
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-right">
      <b className="text-[15px] block leading-none">{value}</b>
      <span className="text-[9px] opacity-80 uppercase">{label}</span>
    </div>
  );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return <th className={cn('px-3 py-2 text-left', center && 'text-center')}>{children}</th>;
}
function Td({ children, className, title, center }: { children: React.ReactNode; className?: string; title?: string; center?: boolean }) {
  return <td className={cn('px-3 py-2 align-middle', center && 'text-center', className)} title={title}>{children}</td>;
}
