'use client';

// El banco de cantidades del CWP, a la izquierda de la mesa y siempre a la vista.
//
// La selección es **opt-in**: nada entra hasta que alguien lo marca. Arrancar con los 26
// frentes de un CWP marcados invitaba a quebrar el alcance completo de una sentada, que es
// justo lo que la rutina de Pull Planning no hace — una sesión abre una tajada («esta semana
// las fundaciones del Acopio de Sal») y la siguiente abre otra. Con opt-out, no elegir era
// elegirlo todo.
//
// De ahí el flujo pensado: buscar («Acopio de Sal») y marcar los visibles de un golpe.
//
// Cada frente muestra tres bandas: lo que ya se llevaron los IWP publicados, lo que está
// comprometido en el borrador que se está armando, y lo que queda libre. Ver las tres a la
// vez es lo que evita repartir dos veces la misma cantidad y descubrirlo recién al publicar.

import { useMemo, useState } from 'react';
import { Search, Layers, CheckSquare, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { num, type FilaBancoMesa } from './tipos';

interface Props {
  banco: FilaBancoMesa[];
  /** Frentes elegidos para esta sesión de apertura. */
  incluidas: Set<string>;
  onIncluidas: (s: Set<string>) => void;
  /** Frentes que toca el paquete activo — se resaltan para ubicarlo en el banco. */
  clavesActivas: Set<string>;
}

export default function PanelBanco({ banco, incluidas, onIncluidas, clavesActivas }: Props) {
  const [busca, setBusca] = useState('');
  const [soloConSaldo, setSoloConSaldo] = useState(true);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return banco.filter(b => {
      if (soloConSaldo && b.cantidad_saldo <= 0) return false;
      if (!q) return true;
      return `${b.item} ${b.descripcion ?? ''} ${b.commodity ?? ''}`.toLowerCase().includes(q);
    });
  }, [banco, busca, soloConSaldo]);

  // Lo elegido, no el banco completo: es lo que va a pesar la próxima generación.
  const elegido = useMemo(() => banco.reduce((t, b) => {
    if (!incluidas.has(b.clave)) return t;
    return { hh: t.hh + b.hh_saldo, n: t.n + 1 };
  }, { hh: 0, n: 0 }), [banco, incluidas]);

  const totales = useMemo(() => banco.reduce((t, b) => ({
    banco: t.banco + b.hh_total,
    publicado: t.publicado + b.hh_asignadas,
    borrador: t.borrador + b.hh_en_borrador,
  }), { banco: 0, publicado: 0, borrador: 0 }), [banco]);
  const libre = Math.max(0, totales.banco - totales.publicado - totales.borrador);

  const alternar = (clave: string) => {
    const s = new Set(incluidas);
    if (s.has(clave)) s.delete(clave); else s.add(clave);
    onIncluidas(s);
  };

  const conSaldo = useMemo(() => banco.filter(b => b.cantidad_saldo > 0), [banco]);
  const visiblesSinMarcar = visibles.filter(b => !incluidas.has(b.clave) && b.cantidad_saldo > 0);
  const filtrando = busca.trim().length > 0;

  return (
    <div className="h-full flex flex-col bg-white border-r border-[#E5E5E5]">
      <div className="px-3 py-2 border-b border-[#EEEEEE]">
        <div className="flex items-center gap-1.5 mb-2">
          <Layers className="w-3 h-3 text-[#FF0000]" />
          <span className="text-[10px] font-black uppercase tracking-wide text-[#1A1A1A]">Frentes del CWP</span>
          <span className={cn('text-[9px] ml-auto font-bold tabular-nums', elegido.n > 0 ? 'text-[#FF0000]' : 'text-[#9E9E9E]')}>
            {elegido.n} de {conSaldo.length} elegidos
          </span>
        </div>

        {/* Las tres bandas del CWP completo */}
        <div className="h-2 rounded-full overflow-hidden flex bg-[#F0F0F0] mb-1">
          <div style={{ width: `${pct(totales.publicado, totales.banco)}%`, backgroundColor: '#16A34A' }} />
          <div style={{ width: `${pct(totales.borrador, totales.banco)}%`, backgroundColor: '#FF0000' }} />
        </div>
        <div className="flex gap-2.5 text-[8.5px] text-[#757575] mb-2">
          <Leyenda color="#16A34A">{num(totales.publicado)} publicado</Leyenda>
          <Leyenda color="#FF0000">{num(totales.borrador)} borrador</Leyenda>
          <Leyenda color="#E5E5E5">{num(libre)} libre</Leyenda>
        </div>

        <div className="relative">
          <Search className="w-3 h-3 text-[#BDBDBD] absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar frente, área o item…"
            className="w-full pl-7 pr-2 py-1.5 text-[10px] border border-[#EEEEEE] rounded-md outline-none focus:border-[#FECACA]"
          />
        </div>

        {/* Marcar en bloque. Buscar «Acopio de Sal» y marcar los visibles es el gesto
            que arma una sesión en dos clics. */}
        <div className="flex items-center gap-1 mt-1.5">
          {filtrando && visiblesSinMarcar.length > 0 && (
            <BotonMini onClick={() => onIncluidas(new Set([...incluidas, ...visiblesSinMarcar.map(b => b.clave)]))}>
              <CheckSquare className="w-2.5 h-2.5" /> Elegir los {visiblesSinMarcar.length} visibles
            </BotonMini>
          )}
          {!filtrando && (
            <BotonMini onClick={() => onIncluidas(new Set(conSaldo.map(b => b.clave)))}>
              <CheckSquare className="w-2.5 h-2.5" /> Todos
            </BotonMini>
          )}
          {elegido.n > 0 && (
            <BotonMini onClick={() => onIncluidas(new Set())}>
              <Square className="w-2.5 h-2.5" /> Ninguno
            </BotonMini>
          )}
          <label className="flex items-center gap-1 ml-auto text-[9px] text-[#757575] cursor-pointer">
            <input type="checkbox" checked={soloConSaldo} onChange={e => setSoloConSaldo(e.target.checked)}
              className="accent-[#FF0000]" />
            Con saldo
          </label>
        </div>

        {elegido.n > 0 && (
          <div className="mt-1.5 px-2 py-1 rounded bg-[#FEF2F2] border border-[#FECACA] text-[9.5px] text-[#991B1B] tabular-nums">
            Entran a la sesión: <b>{num(elegido.hh)} HH</b>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {elegido.n === 0 && (
          <div className="px-3 py-3 text-[9.5px] text-[#757575] leading-relaxed border-b border-[#F5F5F5] bg-[#FAFAFA]">
            Marca los frentes que se abren en esta sesión. Lo que no marques queda en el saldo
            del CWP para una próxima.
          </div>
        )}

        {visibles.map(b => {
          const dentro = incluidas.has(b.clave);
          const activa = clavesActivas.has(b.clave);
          const agotada = b.cantidad_saldo <= 0;
          const sinRendimiento = !b.hh_unidad;
          return (
            <label
              key={b.clave}
              className={cn(
                'flex items-start gap-2 px-3 py-2 border-b border-[#F5F5F5] transition-colors cursor-pointer',
                dentro && 'bg-[#FFF7F7]',
                activa && 'bg-[#FFF0F0]',
                agotada && 'opacity-40 cursor-not-allowed',
                !dentro && !agotada && 'hover:bg-[#FAFAFA]',
              )}
            >
              <input
                type="checkbox" checked={dentro} disabled={agotada}
                onChange={() => !agotada && alternar(b.clave)}
                className="accent-[#FF0000] mt-0.5 shrink-0 cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[9.5px] font-black text-[#1A1A1A] tabular-nums">{b.item}</span>
                  {sinRendimiento && (
                    <span title="Sin rendimiento HH/unidad: no entra al quiebre automático"
                      className="text-[7.5px] font-black px-1 rounded bg-[#FEE2E2] text-[#A00000]">
                      SIN REND.
                    </span>
                  )}
                  {agotada && <span className="text-[7.5px] font-black px-1 rounded bg-[#ECFDF5] text-[#047857]">COMPLETO</span>}
                </div>
                <div className={cn('text-[9.5px] leading-tight truncate', dentro ? 'text-[#1A1A1A]' : 'text-[#33475B]')}
                  title={b.descripcion ?? ''}>
                  {b.descripcion ?? '—'}
                </div>

                <div className="h-1.5 rounded-full overflow-hidden flex bg-[#F0F0F0] my-1">
                  <div style={{ width: `${pct(b.cantidad_asignada, b.cantidad_total)}%`, backgroundColor: '#16A34A' }} />
                  <div style={{ width: `${pct(b.cantidad_en_borrador, b.cantidad_total)}%`, backgroundColor: '#FF0000' }} />
                </div>

                <div className="flex items-baseline gap-1.5 text-[8.5px] text-[#9E9E9E] tabular-nums">
                  <span className="text-[#1A1A1A] font-bold">{num(b.cantidad_libre, 1)}</span>
                  <span>{b.unidad ?? ''} libres de {num(b.cantidad_total, 1)}</span>
                  {b.hh_unidad && <span className="ml-auto">{num(b.hh_unidad, 3)} HH/un</span>}
                </div>
              </div>
            </label>
          );
        })}

        {visibles.length === 0 && (
          <div className="px-3 py-10 text-center text-[10px] text-[#9E9E9E] italic">
            {soloConSaldo ? 'Todo el banco está repartido.' : 'Sin frentes para esa búsqueda.'}
          </div>
        )}
      </div>
    </div>
  );
}

const pct = (parte: number, total: number) => total > 0 ? Math.min(100, (parte / total) * 100) : 0;

function BotonMini({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#E5E5E5] bg-white text-[8.5px] font-bold text-[#757575] hover:border-[#FF0000] hover:text-[#FF0000] transition">
      {children}
    </button>
  );
}

function Leyenda({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}
