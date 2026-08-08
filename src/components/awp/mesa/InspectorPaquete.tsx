'use client';

// El inspector del paquete activo. Es donde vive el «con más data»: Primavera muestra
// actividad, duración y recursos; acá además está el alcance medible (cantidades del
// itemizado con su rendimiento), quién lo ejecuta, y qué lo puede frenar según lo que ya
// declararon los departamentos sobre el CWP.

import { useState } from 'react';
import Link from 'next/link';
import { Scissors, Merge, Trash2, ExternalLink, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { ESTADO_META } from '@/lib/iwp-estado';
import { cn } from '@/lib/utils';
import { num, fechaCorta, type Fila, type Cuadrilla, type Turno } from './tipos';

export interface Sugerida {
  tipo: string; descripcion: string; fecha_necesaria: string | null;
  origen: string; severidad: string;
}

type Pestana = 'alcance' | 'cantidades' | 'restricciones';

interface Props {
  fila: Fila | null;
  cuadrillas: Cuadrilla[];
  turno: Turno | null;
  sugeridas: Sugerida[];
  seleccion: Set<string>;
  base: string;
  onDividir: (fila: Fila, partes: number) => void;
  onFusionar: () => void;
  onEliminar: () => void;
  onCerrar: () => void;
}

export default function InspectorPaquete({
  fila, cuadrillas, turno, sugeridas, seleccion, base,
  onDividir, onFusionar, onEliminar, onCerrar,
}: Props) {
  const [tab, setTab] = useState<Pestana>('alcance');
  const [partes, setPartes] = useState(2);

  if (!fila) {
    return (
      <div className="h-full flex items-center justify-center px-6 bg-white border-l border-[#E5E5E5]">
        <p className="text-[10.5px] text-[#9E9E9E] italic text-center leading-relaxed">
          Selecciona un paquete para ver su alcance, sus cantidades y lo que lo puede frenar.
        </p>
      </div>
    );
  }

  const cuadrilla = cuadrillas.find(c => c.id === fila.cuadrilla_id);
  const esBorrador = fila.tipo === 'borrador';
  const hhTotal = fila.partidas?.reduce((s, p) => s + Number(p.hh || 0), 0) ?? 0;
  const excedeTurno = turno && fila.dias != null && fila.dias > turno.dias_trabajo;

  return (
    <div className="h-full flex flex-col bg-white border-l border-[#E5E5E5]">
      <div className="px-3 py-2 border-b border-[#EEEEEE]">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black text-[#9E9E9E] tabular-nums">#{fila.secuencia}</span>
              {esBorrador ? (
                <span className="text-[8px] font-black px-1.5 py-px rounded bg-[#F1F5F9] text-[#334155] uppercase">Borrador</span>
              ) : (
                <span className="text-[8px] font-black px-1.5 py-px rounded uppercase"
                  style={{ backgroundColor: ESTADO_META[fila.status ?? 'PLANIFICADO'].fondo, color: ESTADO_META[fila.status ?? 'PLANIFICADO'].texto }}>
                  {ESTADO_META[fila.status ?? 'PLANIFICADO'].label}
                </span>
              )}
            </div>
            <div className="text-[11px] font-bold text-[#1A1A1A] leading-tight mt-0.5">{fila.nombre}</div>
            {!esBorrador && (
              <Link href={`${base}/mineria?cwp=${encodeURIComponent(fila.id.split('-IWP-')[0])}`}
                className="inline-flex items-center gap-1 text-[9px] text-[#FF0000] font-bold mt-0.5 hover:underline">
                {fila.id} <ExternalLink className="w-2.5 h-2.5" />
              </Link>
            )}
          </div>
          <button onClick={onCerrar} className="p-1 shrink-0"><X className="w-3.5 h-3.5 text-[#BDBDBD]" /></button>
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-2">
          <Mini label="HH" valor={num(fila.hh)} />
          <Mini label="Días" valor={String(fila.dias ?? '—')} alerta={!!excedeTurno} />
          <Mini label="Frentes" valor={String(fila.partidas?.length ?? 0)} />
        </div>

        {excedeTurno && (
          <div className="flex gap-1.5 mt-2 px-2 py-1.5 rounded bg-[#FFFBEB] border border-[#FDE68A] text-[9px] text-[#92400E] leading-snug">
            <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
            Dura {fila.dias} días y el turno {turno!.codigo} son {turno!.dias_trabajo}: la cuadrilla baja antes de cerrarlo.
          </div>
        )}
      </div>

      <div className="flex border-b border-[#EEEEEE] bg-[#FAFAFA]">
        {([['alcance', 'Alcance'], ['cantidades', 'Cantidades'], ['restricciones', 'Restricciones']] as [Pestana, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              'flex-1 py-1.5 text-[9.5px] font-black uppercase tracking-wide transition',
              tab === id ? 'bg-white text-[#FF0000] border-b-2 border-[#FF0000]' : 'text-[#757575] hover:text-[#A00000]',
            )}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'alcance' && (
          <div className="flex flex-col gap-2.5">
            <Campo label="Límites de batería">
              <p className="text-[10px] text-[#33475B] leading-relaxed">{fila.limites_bateria || '—'}</p>
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Inicio"><span className="text-[10.5px] text-[#1A1A1A] tabular-nums">{fechaCorta(fila.fecha_inicio_plan)}</span></Campo>
              <Campo label="Fin"><span className="text-[10.5px] text-[#1A1A1A] tabular-nums">{fechaCorta(fila.fecha_fin_plan)}</span></Campo>
            </div>
            <Campo label="Cuadrilla">
              {cuadrilla ? (
                <div className="text-[10px] text-[#33475B]">
                  <b className="text-[#1A1A1A]">{cuadrilla.codigo}</b> · {cuadrilla.n_personas} personas
                  {turno && <> · {turno.codigo} ({turno.horas_dia} h × {turno.dias_trabajo} d)</>}
                  {cuadrilla.factor_productividad !== 1 && <> · factor {cuadrilla.factor_productividad}</>}
                </div>
              ) : <span className="text-[10px] text-[#BDBDBD]">Sin asignar</span>}
            </Campo>
            {fila.grupo && <Campo label="Zona / familia"><span className="text-[10px] text-[#33475B]">{fila.grupo}</span></Campo>}
            {!esBorrador && (
              <Campo label="Avance físico">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-[#F0F0F0] overflow-hidden">
                    <div className="h-full bg-[#16A34A]" style={{ width: `${Math.min(100, fila.avance_fisico_pct ?? 0)}%` }} />
                  </div>
                  <span className="text-[10px] font-bold tabular-nums">{Math.round(fila.avance_fisico_pct ?? 0)}%</span>
                </div>
              </Campo>
            )}
          </div>
        )}

        {tab === 'cantidades' && (
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[9px] font-black uppercase text-[#757575]">Lo que terreno tiene que medir</span>
              <span className="text-[9px] text-[#757575] tabular-nums">{num(hhTotal)} HH</span>
            </div>
            <table className="w-full text-[9.5px]">
              <thead>
                <tr className="text-[8px] font-black uppercase text-[#9E9E9E] border-b border-[#EEEEEE]">
                  <th className="text-left py-1">Frente</th>
                  <th className="text-right py-1 w-16">Cant.</th>
                  <th className="text-right py-1 w-12">HH</th>
                </tr>
              </thead>
              <tbody>
                {(fila.partidas ?? []).map((p, i) => (
                  <tr key={`${p.clave}-${i}`} className="border-b border-[#F5F5F5]">
                    <td className="py-1 pr-1">
                      <div className="text-[#33475B] leading-tight">{p.descripcion || p.item}</div>
                      <div className="text-[8px] text-[#BDBDBD] tabular-nums">
                        {p.item}{p.hh_unidad ? ` · ${num(p.hh_unidad, 3)} HH/${p.unidad ?? 'un'}` : ''}
                      </div>
                    </td>
                    <td className="py-1 text-right tabular-nums font-bold text-[#1A1A1A] whitespace-nowrap">
                      {num(p.cantidad, 1)} <span className="font-normal text-[#9E9E9E]">{p.unidad ?? ''}</span>
                    </td>
                    <td className="py-1 text-right tabular-nums text-[#757575]">{num(p.hh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(fila.partidas ?? []).length === 0 && (
              <p className="text-[10px] text-[#9E9E9E] italic py-6 text-center">
                Sin cantidades asignadas: no hay con qué medir el cierre.
              </p>
            )}
          </div>
        )}

        {tab === 'restricciones' && (
          <div className="flex flex-col gap-1.5">
            {!esBorrador && fila.constraints && (
              <div className={cn(
                'flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-bold mb-1',
                fila.constraints.pendientes > 0 ? 'bg-[#FFFBEB] text-[#92400E]' : 'bg-[#F0FDF4] text-[#166534]',
              )}>
                {fila.constraints.pendientes > 0
                  ? <><AlertCircle className="w-3 h-3" /> {fila.constraints.pendientes} de {fila.constraints.total} sin despejar</>
                  : <><CheckCircle2 className="w-3 h-3" /> Sin restricciones pendientes</>}
              </div>
            )}

            <p className="text-[9px] text-[#757575] leading-relaxed mb-1">
              {esBorrador
                ? 'Lo que los departamentos ya declararon sobre este CWP. Al publicar se copia a cada paquete y la rutina de 6WLA las va despejando.'
                : 'El detalle se administra desde la ficha del IWP.'}
            </p>

            {sugeridas.length === 0 ? (
              <div className="flex items-center gap-1.5 px-2 py-2 rounded bg-[#F0FDF4] text-[10px] text-[#166534]">
                <CheckCircle2 className="w-3 h-3 shrink-0" /> Ningún departamento tiene restricciones abiertas sobre este CWP.
              </div>
            ) : sugeridas.map((s, i) => (
              <div key={i} className="px-2 py-1.5 rounded border border-[#F0F0F0]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[7.5px] font-black px-1 rounded bg-[#F3F4F6] text-[#374151]">{s.tipo}</span>
                  <span className="text-[8.5px] text-[#9E9E9E]">{s.origen}</span>
                  {s.fecha_necesaria && (
                    <span className="text-[8.5px] text-[#B45309] ml-auto tabular-nums">{fechaCorta(s.fecha_necesaria)}</span>
                  )}
                </div>
                <p className="text-[9.5px] text-[#33475B] leading-snug mt-0.5">{s.descripcion}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Acciones sobre el paquete: sólo tienen sentido en el borrador */}
      {esBorrador && (
        <div className="border-t border-[#EEEEEE] p-2 flex flex-col gap-1.5 bg-[#FAFAFA]">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onDividir(fila, partes)}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-white border border-[#E5E5E5] text-[9.5px] font-bold text-[#33475B] hover:border-[#FF0000] hover:text-[#FF0000] transition"
            >
              <Scissors className="w-3 h-3" /> Dividir en
            </button>
            <input
              type="number" min={2} max={12} value={partes}
              onChange={e => setPartes(Math.max(2, Math.min(12, Number(e.target.value) || 2)))}
              className="w-12 px-1.5 py-1.5 text-[9.5px] text-center border border-[#E5E5E5] rounded-md outline-none focus:border-[#FF0000]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onFusionar} disabled={seleccion.size < 2}
              title={seleccion.size < 2 ? 'Marca al menos dos paquetes en el grid' : `Fusionar ${seleccion.size} paquetes`}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-white border border-[#E5E5E5] text-[9.5px] font-bold text-[#33475B] hover:border-[#FF0000] hover:text-[#FF0000] transition disabled:opacity-40 disabled:hover:border-[#E5E5E5] disabled:hover:text-[#33475B]"
            >
              <Merge className="w-3 h-3" /> Fusionar {seleccion.size > 1 ? `(${seleccion.size})` : ''}
            </button>
            <button
              onClick={onEliminar}
              title="Eliminar del borrador"
              className="px-2 py-1.5 rounded-md bg-white border border-[#E5E5E5] hover:border-[#FF0000] transition"
            >
              <Trash2 className="w-3 h-3 text-[#9E9E9E]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div className={cn('rounded border px-1.5 py-1', alerta ? 'border-[#FDE68A] bg-[#FFFBEB]' : 'border-[#EEEEEE]')}>
      <div className="text-[7.5px] font-black uppercase text-[#9E9E9E]">{label}</div>
      <div className={cn('text-[12px] font-black tabular-nums', alerta ? 'text-[#B45309]' : 'text-[#1A1A1A]')}>{valor}</div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[8px] font-black uppercase tracking-wide text-[#9E9E9E] mb-0.5">{label}</div>
      {children}
    </div>
  );
}
