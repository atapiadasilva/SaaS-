'use client';

import { useState } from 'react';
import { CheckSquare, Square, ArrowRightCircle, Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLUMN_DEFS, type Elemento } from './elementos-tipos';

function levelBadge(value: string | null): { texto: string; cls: string } {
  if (!value) return { texto: '—', cls: 'bg-red-50 text-red-500' };
  if (value.includes('SIN-')) return { texto: value, cls: 'bg-amber-50 text-amber-700' };
  return { texto: value, cls: 'bg-emerald-50 text-emerald-700' };
}

function LevelCell({ value }: { value: string | null }) {
  const { texto, cls } = levelBadge(value);
  return (
    <td className="px-2 py-1.5">
      <span className={cn('px-1.5 py-0.5 rounded text-[9.5px] font-bold font-mono inline-block max-w-[140px] truncate', cls)} title={texto}>
        {texto}
      </span>
    </td>
  );
}

export default function RowItem({ r, checked, onToggle, onApply, onIsolate, visibleCols, applying }: {
  r: Elemento; checked: boolean; onToggle: () => void; onApply: (target: string) => void; onIsolate: () => void;
  visibleCols: Set<string>; applying: boolean;
}) {
  const [target, setTarget] = useState('');
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      <td className="px-2 py-1.5"><button onClick={onToggle}>{checked ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> : <Square className="w-3.5 h-3.5 text-slate-300" />}</button></td>
      <LevelCell value={r.cwa_id} />
      <LevelCell value={r.cv_id} />
      <LevelCell value={r.cwp_id} />
      <LevelCell value={r.swp_id} />
      <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500 max-w-[160px] truncate">
        <span className="truncate" title={r.sp3d_moniker}>{r.sp3d_moniker}</span>
        {r.requiere_alta_sp3d && (
          <span className="ml-1 px-1 py-0 rounded text-[8px] font-black uppercase bg-slate-100 text-slate-500" title={`Identificado por GUID del modelo: ${r.guid_modelo ?? '—'}`}>
            GUID
          </span>
        )}
      </td>
      {COLUMN_DEFS.filter(c => visibleCols.has(c.key)).map(c => (
        <td key={c.key} className="px-2 py-1.5 max-w-[200px] truncate" title={String(c.get(r) ?? '')}>{c.get(r)}</td>
      ))}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <input list="cwp-catalog-options" value={target} onChange={e => setTarget(e.target.value)} placeholder="CWP…" className="w-24 px-1.5 py-0.5 text-[10px] border border-slate-200 rounded" />
          <button disabled={applying || !target.trim()} onClick={() => { onApply(target); setTarget(''); }} className="p-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30" title="Reasignar"><ArrowRightCircle className="w-3.5 h-3.5 text-[#0D47A1]" /></button>
          <button onClick={onIsolate} className="p-1 rounded bg-slate-100 hover:bg-slate-200" title="Ver en 3D"><Crosshair className="w-3.5 h-3.5 text-slate-500" /></button>
        </div>
      </td>
    </tr>
  );
}
