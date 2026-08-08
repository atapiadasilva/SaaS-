'use client';

import { useMemo, useState } from 'react';
import { Loader2, Tag, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchWithRetry, parseJsonOrThrow } from './elementos-red';

export interface PartidaItemizado {
  item: string;
  descripcion: string | null;
  cwp_id: string | null;
  unidad: string | null;
  cantidad: number | null;
}

/**
 * Tageo de un grupo con correlativo automático, amarrado a una línea del itemizado.
 *
 * El TAG es el nombre con que la pieza se conoce fuera del modelo. Ponerlo pieza por pieza sobre
 * miles de elementos no se termina nunca, así que se da el patrón ("DUR-00") y el servidor reparte
 * el correlativo sobre la selección completa.
 *
 * La partida NO es opcional: un elemento con nombre pero sin línea de cobro es una pieza que nadie
 * puede valorizar. Por eso el botón no se habilita hasta que estén los dos campos.
 */
export default function TagLoteBar({ projectId, monikers, partidas, cwpsDeLaSeleccion, onListo }: {
  projectId: string;
  monikers: string[];
  partidas: PartidaItemizado[];
  /** CWP presentes en la selección: sirven para ofrecer primero las partidas que corresponden. */
  cwpsDeLaSeleccion: string[];
  onListo: (mensaje: string) => void;
}) {
  const [patron, setPatron] = useState('');
  const [item, setItem] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Las partidas del CWP seleccionado van primero: amarrar una pieza de piping a una partida de
  // hormigón es el error fácil de cometer y difícil de encontrar después.
  const ordenadas = useMemo(() => {
    const delCwp = new Set(cwpsDeLaSeleccion.filter(Boolean));
    const dentro = partidas.filter(p => p.cwp_id && delCwp.has(p.cwp_id));
    const fuera = partidas.filter(p => !p.cwp_id || !delCwp.has(p.cwp_id));
    return { dentro, fuera };
  }, [partidas, cwpsDeLaSeleccion]);

  // Vista previa del rango, para que se vea qué va a pasar antes de apretar.
  const previo = useMemo(() => {
    const s = patron.trim();
    if (!s || !monikers.length) return null;
    const m = s.match(/^(.*?)(0+)$/);
    const prefijo = m ? m[1] : (s.endsWith('-') ? s : `${s}-`);
    const ancho = m ? m[2].length : 3;
    const f = (n: number) => `${prefijo}${String(n).padStart(ancho, '0')}`;
    return monikers.length === 1 ? f(1) : `${f(1)} … ${f(monikers.length)}`;
  }, [patron, monikers.length]);

  const puede = !!patron.trim() && !!item.trim() && monikers.length > 0 && !guardando;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetchWithRetry('/api/mining-elementos/taggear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, monikers, patron: patron.trim(), item: item.trim() }),
      });
      const d = await parseJsonOrThrow(res);
      onListo(`✓ ${d.actualizados} elemento(s) tagueados ${d.desde} → ${d.hasta}, en la partida ${d.partida.item}`);
      setPatron('');
      setItem('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-[#0D47A1] text-white px-4 py-2 flex items-center gap-2 flex-wrap shrink-0 border-t border-white/10">
      <Tag className="w-3.5 h-3.5 shrink-0" />
      <span className="text-[11px] font-bold shrink-0">Taguear {monikers.length.toLocaleString('es-CL')}</span>

      <input
        value={patron} onChange={e => setPatron(e.target.value)}
        placeholder="Patrón… ej. DUR-00"
        title="Los ceros del final definen los dígitos del correlativo: DUR-00 da DUR-01, DUR-02…"
        className="px-2 py-1 rounded text-[11px] text-[#08203F] w-36 font-mono"
      />
      {previo && <span className="text-[10px] font-mono text-white/70 shrink-0">{previo}</span>}

      <select
        value={item} onChange={e => setItem(e.target.value)}
        className="min-w-0 flex-1 max-w-[420px] px-2 py-1 rounded text-[11px] text-[#08203F]"
      >
        <option value="">— Partida del itemizado (obligatoria) —</option>
        {ordenadas.dentro.length > 0 && (
          <optgroup label="Del CWP de la selección">
            {ordenadas.dentro.map(p => (
              <option key={p.item} value={p.item}>{p.item} · {(p.descripcion ?? '').slice(0, 60)} ({p.cantidad ?? '—'} {p.unidad ?? ''})</option>
            ))}
          </optgroup>
        )}
        <optgroup label="Resto del itemizado">
          {ordenadas.fuera.map(p => (
            <option key={p.item} value={p.item}>{p.item} · {(p.descripcion ?? '').slice(0, 60)}</option>
          ))}
        </optgroup>
      </select>

      <button
        onClick={guardar} disabled={!puede}
        title={!patron.trim() ? 'Falta el patrón del tag' : !item.trim() ? 'Falta la partida: sin ella la pieza no se puede cobrar' : undefined}
        className="shrink-0 inline-flex items-center gap-1.5 bg-white text-[#0D47A1] hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed rounded px-3 py-1 text-[11px] font-black"
      >
        {guardando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Tagueando…</> : <><Tag className="w-3.5 h-3.5" /> Asignar tag y partida</>}
      </button>

      {error && (
        <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-amber-200 w-full">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </span>
      )}
    </div>
  );
}
