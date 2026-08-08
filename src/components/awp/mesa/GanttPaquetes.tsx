'use client';

// El Gantt de la Mesa: la misma lista del grid, dibujada contra el calendario.
//
// Las barras se arrastran. Es la diferencia entre mirar un plan y hacerlo: cuando el
// planificador ve que dos paquetes se pisan, los corre con el mouse en vez de calcular
// fechas a mano. Si hay varios seleccionados, se mueven todos juntos —como en Primavera—
// porque reprogramar un frente completo es una sola decisión, no doce.
//
// Comparte `construirLista` con el grid para que las filas queden alineadas fila a fila; si
// cada uno ordenara por su cuenta, el Gantt mostraría una cosa y la planilla otra.

import { useEffect, useMemo, useState } from 'react';
import { ESTADO_META } from '@/lib/iwp-estado';
import { cn } from '@/lib/utils';
import { construirLista, ALTO_FILA, type Orden } from './GridPaquetes';
import { num, diasEntre, type Fila, type AgruparPor, type Cuadrilla } from './tipos';

const ALTO_ESCALA = 34;

interface Props {
  filas: Fila[];
  cuadrillas: Cuadrilla[];
  agrupar: AgruparPor;
  orden: Orden | null;
  colapsados: Set<string>;
  seleccion: Set<string>;
  filaActiva: string | null;
  onActivar: (id: string) => void;
  /** px por día. Lo controla el zoom del ribbon. */
  escala: number;
  /** Mueve el paquete (y los demás seleccionados) tantos días. */
  onMover: (fila: Fila, deltaDias: number) => void;
  /** Cambia la duración desde el borde derecho de la barra. */
  onRedimensionar: (fila: Fila, dias: number) => void;
  /** La mesa lo usa para mantener el scroll vertical pegado al del grid. */
  contenedorRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

interface Arrastre {
  id: string;
  modo: 'mover' | 'redimensionar';
  xInicial: number;
  deltaDias: number;
}

export default function GanttPaquetes({
  filas, cuadrillas, agrupar, orden, colapsados, seleccion, filaActiva,
  onActivar, escala, onMover, onRedimensionar, contenedorRef, onScroll,
}: Props) {
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);

  // «Hoy» se resuelve después de pintar: leer el reloj durante el render haría que el
  // servidor y el navegador dibujaran la línea en días distintos.
  const [hoy, setHoy] = useState<string | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setHoy(new Date().toISOString().slice(0, 10)));
    return () => cancelAnimationFrame(id);
  }, []);

  const lista = useMemo(
    () => construirLista(filas, agrupar, orden, cuadrillas, colapsados),
    [filas, agrupar, orden, cuadrillas, colapsados],
  );

  // ── Ventana temporal ──
  // Sin ninguna fecha no hay calendario que dibujar; el `null` lo resuelve el render.
  const ventana = useMemo(() => {
    const fechas = filas.flatMap(f => [f.fecha_inicio_plan, f.fecha_fin_plan]).filter(Boolean) as string[];
    if (!fechas.length) return null;
    const min = fechas.reduce((a, b) => (a < b ? a : b));
    const max = fechas.reduce((a, b) => (a > b ? a : b));
    // Una semana de aire a cada lado para que las barras no queden pegadas al borde.
    const ini = new Date(min + 'T00:00:00');
    ini.setDate(ini.getDate() - 7);
    const iniIso = ini.toISOString().slice(0, 10);
    return { inicio: iniIso, totalDias: Math.max(30, diasEntre(iniIso, max) + 14) };
  }, [filas]);

  const inicio = ventana?.inicio ?? '';
  const totalDias = ventana?.totalDias ?? 0;

  const x = (iso: string) => diasEntre(inicio, iso) * escala;
  const ancho = totalDias * escala;

  // ── Escala: meses arriba, semanas abajo ──
  const { meses, semanas } = useMemo(() => {
    const meses: { label: string; x: number; ancho: number }[] = [];
    const semanas: { label: string; x: number; ancho: number; finDeMes: boolean }[] = [];
    let mesActual = '';
    let mesDesde = 0;

    for (let d = 0; d < totalDias; d++) {
      const fecha = new Date(inicio + 'T00:00:00');
      fecha.setDate(fecha.getDate() + d);
      const mes = fecha.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });
      if (mes !== mesActual) {
        if (mesActual) meses.push({ label: mesActual, x: mesDesde * escala, ancho: (d - mesDesde) * escala });
        mesActual = mes;
        mesDesde = d;
      }
      if (fecha.getDay() === 1) {
        semanas.push({
          label: String(fecha.getDate()).padStart(2, '0'),
          x: d * escala, ancho: 7 * escala,
          finDeMes: fecha.getDate() <= 7,
        });
      }
    }
    if (mesActual) meses.push({ label: mesActual, x: mesDesde * escala, ancho: (totalDias - mesDesde) * escala });
    return { meses, semanas };
  }, [inicio, totalDias, escala]);

  const hoyX = hoy && ventana ? x(hoy) : -1;

  // ── Arrastre ──
  const empezar = (e: React.PointerEvent, fila: Fila, modo: 'mover' | 'redimensionar') => {
    if (fila.tipo === 'publicado') return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setArrastre({ id: fila.id, modo, xInicial: e.clientX, deltaDias: 0 });
  };

  const mover = (e: React.PointerEvent) => {
    if (!arrastre) return;
    const delta = Math.round((e.clientX - arrastre.xInicial) / escala);
    if (delta !== arrastre.deltaDias) setArrastre({ ...arrastre, deltaDias: delta });
  };

  const soltar = (fila: Fila) => {
    if (!arrastre || arrastre.id !== fila.id) { setArrastre(null); return; }
    const { modo, deltaDias } = arrastre;
    setArrastre(null);
    if (deltaDias === 0) return;
    if (modo === 'mover') onMover(fila, deltaDias);
    else onRedimensionar(fila, Math.max(1, (fila.dias ?? 1) + deltaDias));
  };

  if (!ventana) {
    return (
      <div ref={contenedorRef} onScroll={onScroll} className="h-full flex items-center justify-center bg-white">
        <p className="text-[10.5px] text-[#9E9E9E] italic px-6 text-center">
          Ningún paquete tiene fechas todavía. Pon una fecha de inicio en el ribbon y genera el quiebre.
        </p>
      </div>
    );
  }

  return (
    <div ref={contenedorRef} onScroll={onScroll} className="h-full overflow-auto bg-white">
      <div style={{ width: ancho, minWidth: '100%', position: 'relative' }}>
        {/* Escala */}
        <div className="sticky top-0 z-10 bg-[#FAFAFA] border-b border-[#E5E5E5]" style={{ height: ALTO_ESCALA }}>
          <div className="relative" style={{ height: 17 }}>
            {meses.map((m, i) => (
              <div key={i} className="absolute text-[9px] font-black text-[#33475B] px-1.5 border-r border-[#E5E5E5] leading-[17px] uppercase overflow-hidden whitespace-nowrap"
                style={{ left: m.x, width: m.ancho }}>
                {m.label}
              </div>
            ))}
          </div>
          <div className="relative border-t border-[#EEEEEE]" style={{ height: 16 }}>
            {semanas.map((s, i) => (
              <div key={i} className={cn(
                'absolute text-[8px] text-[#9E9E9E] px-1 leading-[16px] border-r',
                s.finDeMes ? 'border-[#D4D4D4]' : 'border-[#F0F0F0]',
              )} style={{ left: s.x, width: s.ancho }}>
                {s.label}
              </div>
            ))}
          </div>
        </div>

        {/* Rejilla de semanas */}
        <div className="absolute inset-0 pointer-events-none" style={{ top: ALTO_ESCALA }}>
          {semanas.map((s, i) => (
            <div key={i} className={cn('absolute top-0 bottom-0 border-l', s.finDeMes ? 'border-[#E5E5E5]' : 'border-[#F7F7F7]')}
              style={{ left: s.x }} />
          ))}
          {hoyX >= 0 && hoyX <= ancho && (
            <div className="absolute top-0 bottom-0 w-px bg-[#FF0000] opacity-50" style={{ left: hoyX }}>
              <span className="absolute -top-0 left-1 text-[7px] font-black text-[#FF0000]">HOY</span>
            </div>
          )}
        </div>

        {/* Barras */}
        <div className="relative">
          {lista.map(item => {
            if (item.tipo === 'grupo') {
              return <div key={item.clave} className="bg-[#F4F4F5] border-b border-[#E5E5E5]" style={{ height: ALTO_FILA }} />;
            }
            const f = item.fila!;
            const sel = seleccion.has(f.id);
            const activa = filaActiva === f.id;
            const arr = arrastre?.id === f.id ? arrastre : null;

            if (!f.fecha_inicio_plan || !f.fecha_fin_plan) {
              return (
                <div key={f.id} className="border-b border-[#F2F2F2] flex items-center px-2" style={{ height: ALTO_FILA }}>
                  <span className="text-[8.5px] text-[#BDBDBD] italic">sin fechas</span>
                </div>
              );
            }

            const x1 = x(f.fecha_inicio_plan) + (arr?.modo === 'mover' ? arr.deltaDias * escala : 0);
            const anchoBase = (diasEntre(f.fecha_inicio_plan, f.fecha_fin_plan) + 1) * escala;
            const anchoBarra = Math.max(escala, anchoBase + (arr?.modo === 'redimensionar' ? arr.deltaDias * escala : 0));

            const meta = f.tipo === 'publicado' ? ESTADO_META[f.status ?? 'PLANIFICADO'] : null;
            const color = meta?.color ?? '#FF0000';
            const bloqueada = f.tipo === 'publicado';

            return (
              <div
                key={f.id}
                onClick={() => onActivar(f.id)}
                className={cn(
                  'relative border-b border-[#F2F2F2]',
                  sel ? 'bg-[#FEF2F2]' : activa ? 'bg-[#FFFBFB]' : 'hover:bg-[#FAFAFA]',
                )}
                style={{ height: ALTO_FILA }}
              >
                <div
                  onPointerDown={e => empezar(e, f, 'mover')}
                  onPointerMove={mover}
                  onPointerUp={() => soltar(f)}
                  onPointerCancel={() => setArrastre(null)}
                  title={`${f.nombre}\n${num(f.hh)} HH · ${f.dias ?? '—'} días${bloqueada ? '\n(publicado: se edita desde su ficha)' : '\nArrastra para mover'}`}
                  className={cn(
                    'absolute rounded-[3px] flex items-center px-1.5 select-none',
                    bloqueada ? 'cursor-not-allowed opacity-75' : 'cursor-grab active:cursor-grabbing',
                    (sel || activa) && 'ring-2 ring-[#FF0000] ring-offset-0',
                  )}
                  style={{
                    left: x1, width: anchoBarra, top: 5, height: ALTO_FILA - 11,
                    backgroundColor: bloqueada ? meta!.fondo : '#FFE4E4',
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  {anchoBarra > 46 && (
                    <span className="text-[8px] font-bold truncate" style={{ color: bloqueada ? meta!.texto : '#991B1B' }}>
                      {num(f.hh)} HH
                    </span>
                  )}
                  {/* Avance real dentro de la barra, sólo si hay algo que mostrar */}
                  {bloqueada && (f.avance_fisico_pct ?? 0) > 0 && (
                    <div className="absolute left-0 bottom-0 h-[3px] rounded-bl-[3px]"
                      style={{ width: `${Math.min(100, f.avance_fisico_pct ?? 0)}%`, backgroundColor: color }} />
                  )}
                  {!bloqueada && (
                    <div
                      onPointerDown={e => empezar(e, f, 'redimensionar')}
                      onPointerMove={mover}
                      onPointerUp={() => soltar(f)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-[#FF0000] rounded-r-[3px]"
                      title="Arrastra para cambiar la duración"
                    />
                  )}
                </div>

                {arr && arr.deltaDias !== 0 && (
                  <span
                    className="absolute text-[8px] font-black text-[#FF0000] bg-white px-1 rounded pointer-events-none"
                    style={{ left: x1 + anchoBarra + 4, top: 7 }}
                  >
                    {arr.deltaDias > 0 ? '+' : ''}{arr.deltaDias} d
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
