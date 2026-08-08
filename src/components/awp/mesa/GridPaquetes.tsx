'use client';

// El grid de la Mesa: una planilla, no una lista de tarjetas.
//
// Se comporta como espera alguien que viene de Primavera: click selecciona, shift+click
// selecciona el rango, ctrl+click suma o resta, click en una celda editable la vuelve un
// input, Enter confirma y Escape cancela. Las columnas se eligen y el orden se cambia
// clickeando el encabezado.
//
// Sólo las filas de borrador se editan. Las de un IWP ya publicado se ven en el mismo grid
// —porque el planificador necesita el CWP completo a la vista— pero se tocan desde su ficha,
// que es donde vive la máquina de estados.

import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, Lock, AlertCircle, Pencil } from 'lucide-react';
import { ESTADO_META } from '@/lib/iwp-estado';
import { semanaIso } from '@/lib/iwp-estado';
import { cn } from '@/lib/utils';
import {
  COLUMNA_POR_ID, num, fechaCorta,
  type Fila, type ColumnaId, type AgruparPor, type Cuadrilla,
} from './tipos';

export const ALTO_FILA = 28;

export interface Orden { col: ColumnaId; dir: 'asc' | 'desc' }

interface Props {
  filas: Fila[];
  columnas: ColumnaId[];
  cuadrillas: Cuadrilla[];
  agrupar: AgruparPor;
  orden: Orden | null;
  onOrden: (o: Orden | null) => void;
  seleccion: Set<string>;
  onSeleccion: (s: Set<string>) => void;
  filaActiva: string | null;
  onActivar: (id: string | null) => void;
  onEditar: (fila: Fila, campo: string, valor: string | number | null) => void;
  /** Grupos colapsados; se comparte con el Gantt para que ambos muestren lo mismo. */
  colapsados: Set<string>;
  onColapsar: (s: Set<string>) => void;
  /** La mesa lo usa para mantener el scroll vertical pegado al del Gantt. */
  contenedorRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
}

export interface ItemLista {
  tipo: 'grupo' | 'fila';
  clave: string;
  fila?: Fila;
  titulo?: string;
  n?: number;
  hh?: number;
}

/** Aplana filas y encabezados de grupo en la lista que se pinta — la misma que usa el Gantt. */
export function construirLista(
  filas: Fila[],
  agrupar: AgruparPor,
  orden: Orden | null,
  cuadrillas: Cuadrilla[],
  colapsados: Set<string>,
): ItemLista[] {
  const ordenadas = ordenar(filas, orden, cuadrillas);
  if (agrupar === 'ninguno') return ordenadas.map(f => ({ tipo: 'fila' as const, clave: f.id, fila: f }));

  const grupos = new Map<string, Fila[]>();
  for (const f of ordenadas) {
    const k = claveGrupo(f, agrupar, cuadrillas);
    const arr = grupos.get(k) ?? [];
    arr.push(f);
    grupos.set(k, arr);
  }

  const salida: ItemLista[] = [];
  for (const [titulo, hijas] of grupos) {
    salida.push({
      tipo: 'grupo', clave: `g:${titulo}`, titulo,
      n: hijas.length, hh: hijas.reduce((s, f) => s + f.hh, 0),
    });
    if (!colapsados.has(titulo)) {
      for (const f of hijas) salida.push({ tipo: 'fila', clave: f.id, fila: f });
    }
  }
  return salida;
}

function claveGrupo(f: Fila, agrupar: AgruparPor, cuadrillas: Cuadrilla[]): string {
  switch (agrupar) {
    case 'grupo': return f.grupo || 'Sin zona';
    case 'semana': return f.fecha_inicio_plan ? semanaIso(f.fecha_inicio_plan) : 'Sin fecha';
    case 'cuadrilla': return cuadrillas.find(c => c.id === f.cuadrilla_id)?.codigo ?? 'Sin cuadrilla';
    case 'estado': return f.tipo === 'borrador' ? 'Borrador' : (ESTADO_META[f.status ?? 'PLANIFICADO'].label);
    default: return '';
  }
}

function ordenar(filas: Fila[], orden: Orden | null, cuadrillas: Cuadrilla[]): Fila[] {
  const base = [...filas];
  if (!orden) {
    // Por defecto, el orden del plan: cuándo parte cada paquete.
    return base.sort((a, b) =>
      (a.fecha_inicio_plan ?? '9999').localeCompare(b.fecha_inicio_plan ?? '9999') || a.secuencia - b.secuencia);
  }
  const v = (f: Fila): string | number => {
    switch (orden.col) {
      case 'secuencia': return f.secuencia;
      case 'nombre': return f.nombre ?? '';
      case 'hh': return f.hh;
      case 'dias': return f.dias ?? 0;
      case 'inicio': return f.fecha_inicio_plan ?? '9999';
      case 'fin': return f.fecha_fin_plan ?? '9999';
      case 'semana': return f.fecha_inicio_plan ? semanaIso(f.fecha_inicio_plan) : 'zzz';
      case 'cuadrilla': return cuadrillas.find(c => c.id === f.cuadrilla_id)?.codigo ?? 'zzz';
      case 'estado': return f.tipo === 'borrador' ? 'A' : (f.status ?? '');
      case 'partidas': return f.partidas?.length ?? 0;
      case 'grupo': return f.grupo ?? 'zzz';
      case 'avance': return f.avance_fisico_pct ?? 0;
      case 'restricciones': return f.constraints?.pendientes ?? 0;
      default: return 0;
    }
  };
  return base.sort((a, b) => {
    const x = v(a), y = v(b);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return orden.dir === 'asc' ? c : -c;
  });
}

export default function GridPaquetes({
  filas, columnas, cuadrillas, agrupar, orden, onOrden, seleccion, onSeleccion,
  filaActiva, onActivar, onEditar, colapsados, onColapsar, contenedorRef, onScroll,
}: Props) {
  const [editando, setEditando] = useState<{ id: string; col: ColumnaId } | null>(null);
  const [ultima, setUltima] = useState<string | null>(null);

  const lista = useMemo(
    () => construirLista(filas, agrupar, orden, cuadrillas, colapsados),
    [filas, agrupar, orden, cuadrillas, colapsados],
  );
  const soloFilas = useMemo(() => lista.filter(i => i.tipo === 'fila').map(i => i.fila!), [lista]);

  const clickFila = useCallback((f: Fila, e: React.MouseEvent) => {
    onActivar(f.id);
    if (e.shiftKey && ultima) {
      const i = soloFilas.findIndex(x => x.id === ultima);
      const j = soloFilas.findIndex(x => x.id === f.id);
      if (i >= 0 && j >= 0) {
        const [a, b] = i < j ? [i, j] : [j, i];
        const s = new Set(seleccion);
        for (let k = a; k <= b; k++) s.add(soloFilas[k].id);
        onSeleccion(s);
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      const s = new Set(seleccion);
      if (s.has(f.id)) s.delete(f.id); else s.add(f.id);
      onSeleccion(s);
    } else {
      onSeleccion(new Set([f.id]));
    }
    setUltima(f.id);
  }, [onActivar, onSeleccion, seleccion, soloFilas, ultima]);

  const anchoTotal = columnas.reduce((s, c) => s + COLUMNA_POR_ID[c].ancho, 0);

  return (
    <div ref={contenedorRef} onScroll={onScroll} className="h-full overflow-auto">
      <div style={{ minWidth: anchoTotal }}>
        {/* Encabezado */}
        <div className="sticky top-0 z-10 flex bg-[#FAFAFA] border-b border-[#E5E5E5]" style={{ height: ALTO_FILA }}>
          {columnas.map(id => {
            const c = COLUMNA_POR_ID[id];
            const activo = orden?.col === id;
            return (
              <button
                key={id} title={c.ayuda}
                onClick={() => onOrden(
                  activo && orden.dir === 'asc' ? { col: id, dir: 'desc' }
                    : activo && orden.dir === 'desc' ? null
                      : { col: id, dir: 'asc' })}
                className={cn(
                  'shrink-0 px-2 flex items-center gap-1 text-[9px] font-black uppercase tracking-wide border-r border-[#EEEEEE] hover:bg-[#F0F0F0] transition',
                  activo ? 'text-[#FF0000]' : 'text-[#757575]',
                  c.alineacion === 'right' && 'justify-end',
                  c.alineacion === 'center' && 'justify-center',
                )}
                style={{ width: c.ancho }}
              >
                {c.label}
                {activo && <span className="text-[7px]">{orden.dir === 'asc' ? '▲' : '▼'}</span>}
              </button>
            );
          })}
        </div>

        {/* Filas */}
        {lista.map(item => {
          if (item.tipo === 'grupo') {
            const abierto = !colapsados.has(item.titulo!);
            return (
              <button
                key={item.clave}
                onClick={() => {
                  const s = new Set(colapsados);
                  if (abierto) s.add(item.titulo!); else s.delete(item.titulo!);
                  onColapsar(s);
                }}
                className="w-full flex items-center gap-1.5 px-2 bg-[#F4F4F5] border-b border-[#E5E5E5] hover:bg-[#EDEDEE] transition"
                style={{ height: ALTO_FILA }}
              >
                {abierto ? <ChevronDown className="w-3 h-3 text-[#757575]" /> : <ChevronRight className="w-3 h-3 text-[#757575]" />}
                <span className="text-[10px] font-black text-[#1A1A1A]">{item.titulo}</span>
                <span className="text-[9px] text-[#757575]">{item.n} paquetes · {num(item.hh)} HH</span>
              </button>
            );
          }

          const f = item.fila!;
          const sel = seleccion.has(f.id);
          const activa = filaActiva === f.id;
          const bloqueada = f.tipo === 'publicado';

          return (
            <div
              key={f.id}
              onClick={e => clickFila(f, e)}
              className={cn(
                'flex border-b border-[#F2F2F2] cursor-default transition-colors',
                sel ? 'bg-[#FEF2F2]' : activa ? 'bg-[#FFFBFB]' : 'bg-white hover:bg-[#FAFAFA]',
                activa && 'shadow-[inset_2px_0_0_#FF0000]',
              )}
              style={{ height: ALTO_FILA }}
            >
              {columnas.map(id => (
                <Celda
                  key={id} col={id} fila={f} cuadrillas={cuadrillas} bloqueada={bloqueada}
                  editando={editando?.id === f.id && editando.col === id}
                  onEmpezar={() => { if (!bloqueada && COLUMNA_POR_ID[id].editable) setEditando({ id: f.id, col: id }); }}
                  onTerminar={(valor) => {
                    setEditando(null);
                    if (valor !== undefined) onEditar(f, campoDe(id), valor);
                  }}
                />
              ))}
            </div>
          );
        })}

        {lista.length === 0 && (
          <div className="py-16 text-center text-[12px] text-[#9E9E9E] italic">
            No hay paquetes todavía. Elige cuadrilla y turno arriba, y genera el quiebre.
          </div>
        )}
      </div>
    </div>
  );
}

/** Nombre de la columna en la base. */
function campoDe(col: ColumnaId): string {
  switch (col) {
    case 'nombre': return 'nombre';
    case 'dias': return 'dias';
    case 'inicio': return 'fecha_inicio_plan';
    case 'cuadrilla': return 'cuadrilla_id';
    case 'limites': return 'limites_bateria';
    default: return col;
  }
}

// ─── Celda ───────────────────────────────────────────────────────────────────

function Celda({ col, fila, cuadrillas, bloqueada, editando, onEmpezar, onTerminar }: {
  col: ColumnaId; fila: Fila; cuadrillas: Cuadrilla[]; bloqueada: boolean;
  editando: boolean;
  onEmpezar: () => void;
  onTerminar: (valor?: string | number | null) => void;
}) {
  const c = COLUMNA_POR_ID[col];
  const editable = !bloqueada && !!c.editable;

  const clases = cn(
    'shrink-0 px-2 flex items-center text-[10.5px] border-r border-[#F5F5F5] overflow-hidden whitespace-nowrap',
    c.alineacion === 'right' && 'justify-end',
    c.alineacion === 'center' && 'justify-center',
    editable && 'hover:bg-[#FFF5F5] cursor-text',
  );

  if (editando) {
    return (
      <div className={cn(clases, 'p-0')} style={{ width: c.ancho }}>
        <EditorCelda col={col} fila={fila} cuadrillas={cuadrillas} onTerminar={onTerminar} />
      </div>
    );
  }

  return (
    <div
      className={clases} style={{ width: c.ancho }}
      onDoubleClick={e => { e.stopPropagation(); onEmpezar(); }}
      title={c.editable && !bloqueada ? 'Doble clic para editar' : undefined}
    >
      <Contenido col={col} fila={fila} cuadrillas={cuadrillas} />
    </div>
  );
}

function Contenido({ col, fila, cuadrillas }: { col: ColumnaId; fila: Fila; cuadrillas: Cuadrilla[] }) {
  const cuad = cuadrillas.find(c => c.id === fila.cuadrilla_id);

  switch (col) {
    case 'secuencia':
      return <span className="text-[9.5px] text-[#9E9E9E] tabular-nums">{fila.secuencia}</span>;

    case 'nombre':
      return (
        <span className="flex items-center gap-1.5 min-w-0">
          {fila.tipo === 'publicado' && <Lock className="w-2.5 h-2.5 text-[#BDBDBD] shrink-0" />}
          {fila.editado && <Pencil className="w-2.5 h-2.5 text-[#FF0000] shrink-0" />}
          <span className="truncate text-[#1A1A1A]" title={fila.nombre}>{fila.nombre}</span>
        </span>
      );

    case 'estado': {
      if (fila.tipo === 'borrador') {
        return <Pill fondo="#F1F5F9" texto="#334155">Borrador</Pill>;
      }
      const m = ESTADO_META[fila.status ?? 'PLANIFICADO'];
      return <Pill fondo={m.fondo} texto={m.texto}>{m.label}</Pill>;
    }

    case 'hh':
      return <span className="font-bold text-[#1A1A1A] tabular-nums">{num(fila.hh)}</span>;

    case 'dias':
      return <span className="tabular-nums text-[#33475B]">{fila.dias ?? '—'}</span>;

    case 'inicio':
      return <span className="tabular-nums text-[#33475B]">{fechaCorta(fila.fecha_inicio_plan)}</span>;

    case 'fin':
      return <span className="tabular-nums text-[#757575]">{fechaCorta(fila.fecha_fin_plan)}</span>;

    case 'semana':
      return <span className="tabular-nums text-[#757575]">{fila.fecha_inicio_plan ? semanaIso(fila.fecha_inicio_plan) : '—'}</span>;

    case 'cuadrilla':
      return <span className="truncate text-[#33475B]">{cuad?.codigo ?? '—'}</span>;

    case 'personas':
      return <span className="tabular-nums text-[#757575]">{cuad?.n_personas ?? '—'}</span>;

    case 'partidas':
      return <span className="tabular-nums text-[#757575]">{fila.partidas?.length ?? 0}</span>;

    case 'cantidad': {
      const p = [...(fila.partidas ?? [])].sort((a, b) => b.hh - a.hh)[0];
      return p
        ? <span className="tabular-nums text-[#33475B] truncate" title={p.descripcion ?? p.item}>{num(p.cantidad, 1)} {p.unidad ?? ''}</span>
        : <span className="text-[#BDBDBD]">—</span>;
    }

    case 'grupo':
      return <span className="truncate text-[#757575]" title={fila.grupo ?? ''}>{fila.grupo ?? '—'}</span>;

    case 'limites':
      return <span className="truncate text-[#757575]" title={fila.limites_bateria ?? ''}>{fila.limites_bateria ?? '—'}</span>;

    case 'avance':
      return fila.tipo === 'publicado'
        ? <span className="tabular-nums font-bold text-[#33475B]">{Math.round(fila.avance_fisico_pct ?? 0)}%</span>
        : <span className="text-[#BDBDBD]">—</span>;

    case 'restricciones': {
      const c = fila.constraints;
      if (!c || c.total === 0) return <span className="text-[#BDBDBD]">—</span>;
      return c.pendientes > 0
        ? <span className="inline-flex items-center gap-1 text-[#B45309] font-bold"><AlertCircle className="w-3 h-3" />{c.pendientes}</span>
        : <span className="text-[#16A34A] font-bold">✓</span>;
    }

    default:
      return null;
  }
}

function EditorCelda({ col, fila, cuadrillas, onTerminar }: {
  col: ColumnaId; fila: Fila; cuadrillas: Cuadrilla[];
  onTerminar: (valor?: string | number | null) => void;
}) {
  const inicial =
    col === 'nombre' ? fila.nombre
      : col === 'dias' ? String(fila.dias ?? '')
        : col === 'inicio' ? (fila.fecha_inicio_plan ?? '')
          : col === 'limites' ? (fila.limites_bateria ?? '')
            : col === 'cuadrilla' ? (fila.cuadrilla_id ?? '')
              : '';
  const [valor, setValor] = useState(inicial);

  const comun = 'w-full h-full px-2 text-[10.5px] border-2 border-[#FF0000] outline-none bg-white';

  if (col === 'cuadrilla') {
    return (
      <select
        autoFocus value={valor} className={comun}
        onChange={e => { setValor(e.target.value); onTerminar(e.target.value || null); }}
        onBlur={() => onTerminar()}
        onClick={e => e.stopPropagation()}
      >
        <option value="">— sin cuadrilla —</option>
        {cuadrillas.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.n_personas}p</option>)}
      </select>
    );
  }

  return (
    <input
      autoFocus
      type={col === 'inicio' ? 'date' : col === 'dias' ? 'number' : 'text'}
      value={valor}
      className={comun}
      onChange={e => setValor(e.target.value)}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key === 'Enter') onTerminar(col === 'dias' ? Number(valor) || null : valor);
        if (e.key === 'Escape') onTerminar();
      }}
      onBlur={() => onTerminar(col === 'dias' ? Number(valor) || null : valor)}
    />
  );
}

function Pill({ fondo, texto, children }: { fondo: string; texto: string; children: React.ReactNode }) {
  return (
    <span
      className="px-1.5 py-px rounded text-[8.5px] font-black uppercase tracking-wide whitespace-nowrap"
      style={{ backgroundColor: fondo, color: texto }}
    >
      {children}
    </span>
  );
}
