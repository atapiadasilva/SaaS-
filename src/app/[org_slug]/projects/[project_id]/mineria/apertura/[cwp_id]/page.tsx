'use client';

// Mesa de Trabajo de un CWP — la planificación intermedia, en un banco de trabajo.
//
// Reemplaza al asistente modal de cuatro pasos. El problema de aquél no era que fuera un
// pop-up: era que iba en una sola dirección. Una sesión de Pull Planning no avanza en línea
// recta — se prueba una estrategia, se descarta, se fusionan dos paquetes chicos, se divide
// uno grande, se corren fechas, y se vuelve atrás. Todo eso con las cantidades a la vista,
// porque cada movimiento consume saldo del CWP.
//
// De ahí el layout: los parámetros son un ribbon permanente y no pasos, el banco vive fijo a
// la izquierda mostrando lo que queda libre, el centro es planilla + Gantt sobre el mismo
// orden, y el inspector muestra el paquete activo con su alcance medible. Nada modal.
//
// El borrador vive en la base (`mining_apertura_sesion`), así que sobrevive al reload y dos
// personas en la misma sesión ven lo mismo.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, ArrowLeft, Play, Undo2, Upload, Trash2, Columns3,
  ZoomIn, ZoomOut, AlertTriangle, Info, CalendarClock, ChevronDown, Users,
} from 'lucide-react';
import { capacidadCiclo } from '@/lib/iwp-apertura';
import { cn } from '@/lib/utils';
import GridPaquetes, { type Orden } from '@/components/awp/mesa/GridPaquetes';
import GanttPaquetes from '@/components/awp/mesa/GanttPaquetes';
import PanelBanco from '@/components/awp/mesa/PanelBanco';
import InspectorPaquete, { type Sugerida } from '@/components/awp/mesa/InspectorPaquete';
import {
  COLUMNAS, COLUMNAS_BASE, AGRUPACIONES, num, sumarDias,
  type Fila, type ColumnaId, type AgruparPor, type Cuadrilla, type Turno,
  type FilaBancoMesa, type Dimension,
} from '@/components/awp/mesa/tipos';

const ESCALAS = [1.5, 3, 6, 12];

interface Datos {
  cwp: { cwp_id: string; cwp_nombre: string | null; cwa_id: string | null; disciplina: string | null; disciplina_cod: string | null; hh_planner: number | null; fecha_ini: string | null; ruta_critica: boolean | null };
  banco: FilaBancoMesa[];
  totales: { hh_banco: number; hh_asignadas: number; hh_saldo: number; hh_en_borrador: number; pct_aperturado: number; n_partidas: number; n_partidas_sin_rendimiento: number; n_borradores: number; n_publicados: number; hh_planner: number };
  dimensiones: Dimension[];
  turnos: Turno[];
  cuadrillas: Cuadrilla[];
  sesion: { id: string; cuadrilla_id: string | null; turno_id: string | null; hh_objetivo: number | null; estrategia: string; dimension_zona: string | null; fecha_inicio: string | null; cuadrillas_paralelo: number; claves_incluidas: string[] } | null;
  borradores: any[];
  publicados: any[];
}

export default function MesaPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.project_id as string;
  const orgSlug = params.org_slug as string;
  const cwpId = decodeURIComponent(params.cwp_id as string);
  const base = `/${orgSlug}/projects/${projectId}`;

  const [d, setD] = useState<Datos | null>(null);
  const [sugeridas, setSugeridas] = useState<Sugerida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Vista
  const [columnas, setColumnas] = useState<ColumnaId[]>(COLUMNAS_BASE);
  const [agrupar, setAgrupar] = useState<AgruparPor>('ninguno');
  const [orden, setOrden] = useState<Orden | null>(null);
  const [escala, setEscala] = useState(3);
  const [anchoGrid, setAnchoGrid] = useState(720);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const [menuColumnas, setMenuColumnas] = useState(false);

  // Selección
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [filaActiva, setFilaActiva] = useState<string | null>(null);

  // Deshacer: pila de estados anteriores del borrador.
  const [pila, setPila] = useState<any[][]>([]);

  const gridRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<HTMLDivElement>(null);
  const sincronizando = useRef(false);

  // ── Carga ──
  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/mining-apertura-mesa?project_id=${projectId}&cwp_id=${encodeURIComponent(cwpId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      setD(j);
      setError(null);
    } catch (e: any) { setError(String(e.message ?? e)); }
  }, [projectId, cwpId]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    fetch(`/api/mining-iwp-apertura?project_id=${projectId}&cwp_id=${encodeURIComponent(cwpId)}`)
      .then(r => r.ok ? r.json() : { sugeridas: [] })
      .then(j => setSugeridas(j.sugeridas ?? []))
      .catch(() => {});
  }, [projectId, cwpId]);

  // La configuración de columnas es preferencia de quien mira, no dato del proyecto.
  useEffect(() => {
    try {
      const g = localStorage.getItem('hilo.mesa.columnas');
      if (g) setColumnas(JSON.parse(g));
    } catch { /* preferencia perdida, no es grave */ }
  }, []);
  const guardarColumnas = (c: ColumnaId[]) => {
    setColumnas(c);
    try { localStorage.setItem('hilo.mesa.columnas', JSON.stringify(c)); } catch { /* ídem */ }
  };

  // ── Acciones ──
  const accion = useCallback(async (nombre: string, payload: Record<string, unknown> = {}, apilar = true) => {
    if (apilar && d) setPila(p => [...p.slice(-19), d.borradores]);
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch('/api/mining-apertura-mesa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, cwp_id: cwpId, accion: nombre, ...payload }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      await cargar();
      return j;
    } catch (e: any) {
      setError(String(e.message ?? e));
      return null;
    } finally { setOcupado(false); }
  }, [projectId, cwpId, cargar, d]);

  const deshacer = async () => {
    const anterior = pila[pila.length - 1];
    if (!anterior) return;
    setPila(p => p.slice(0, -1));
    await accion('restaurar', { borradores: anterior }, false);
  };

  // ── Filas unificadas: publicados + borrador ──
  const filas: Fila[] = useMemo(() => {
    if (!d) return [];
    const pubs: Fila[] = d.publicados.map(p => ({
      id: p.iwp_id, tipo: 'publicado', secuencia: p.secuencia ?? 0,
      nombre: p.descripcion ?? p.iwp_id, grupo: null,
      limites_bateria: p.limites_bateria ?? p.descripcion_scope ?? null,
      cuadrilla_id: p.cuadrilla_id, fecha_inicio_plan: p.fecha_inicio_plan,
      fecha_fin_plan: p.fecha_fin_plan, dias: p.duracion_dias,
      hh: Number(p.hh_estimadas ?? 0), partidas: p.partidas ?? [],
      status: p.status, avance_fisico_pct: Number(p.avance_fisico_pct ?? 0),
      constraints: p.constraints,
    }));
    const bors: Fila[] = d.borradores.map(b => ({
      id: b.id, tipo: 'borrador', secuencia: b.secuencia,
      nombre: b.nombre ?? 'Paquete', grupo: b.grupo,
      limites_bateria: b.limites_bateria,
      cuadrilla_id: b.cuadrilla_id ?? d.sesion?.cuadrilla_id ?? null,
      fecha_inicio_plan: b.fecha_inicio_plan, fecha_fin_plan: b.fecha_fin_plan,
      dias: b.dias, hh: Number(b.hh ?? 0), partidas: b.partidas ?? [],
      editado: b.editado,
    }));
    return [...pubs, ...bors];
  }, [d]);

  const activa = useMemo(() => filas.find(f => f.id === filaActiva) ?? null, [filas, filaActiva]);
  const clavesActivas = useMemo(
    () => new Set((activa?.partidas ?? []).map(p => p.clave)),
    [activa],
  );

  const sesion = d?.sesion;
  const cuadrilla = d?.cuadrillas.find(c => c.id === sesion?.cuadrilla_id) ?? null;
  const turno = d?.turnos.find(t => t.id === sesion?.turno_id) ?? null;
  const capacidad = cuadrilla && turno ? capacidadCiclo(cuadrilla, turno) : 0;
  const incluidas = useMemo(() => new Set(sesion?.claves_incluidas ?? []), [sesion]);

  const idsBorrador = useMemo(
    () => new Set(filas.filter(f => f.tipo === 'borrador').map(f => f.id)),
    [filas],
  );
  const selBorrador = useMemo(
    () => [...seleccion].filter(id => idsBorrador.has(id)),
    [seleccion, idsBorrador],
  );

  // ── Scroll sincronizado entre planilla y Gantt ──
  const sincronizar = (desde: 'grid' | 'gantt') => () => {
    if (sincronizando.current) return;
    const a = desde === 'grid' ? gridRef.current : ganttRef.current;
    const b = desde === 'grid' ? ganttRef.current : gridRef.current;
    if (!a || !b) return;
    sincronizando.current = true;
    b.scrollTop = a.scrollTop;
    requestAnimationFrame(() => { sincronizando.current = false; });
  };

  // ── Handlers de edición ──
  const editarFila = (fila: Fila, campo: string, valor: string | number | null) => {
    if (fila.tipo !== 'borrador') return;
    accion('editar', { id: fila.id, campos: { [campo]: valor } });
  };

  const moverEnGantt = (fila: Fila, delta: number) => {
    // Si el paquete arrastrado está dentro de una selección, se mueve el grupo entero:
    // reprogramar un frente es una decisión sola, no doce.
    const ids = seleccion.has(fila.id) && selBorrador.length > 1 ? selBorrador : [fila.id];
    accion('lote', { ids, correr_dias: delta });
  };

  const redimensionar = (fila: Fila, dias: number) => {
    if (!fila.fecha_inicio_plan) return;
    accion('editar', {
      id: fila.id,
      campos: { dias, fecha_fin_plan: sumarDias(fila.fecha_inicio_plan, dias - 1) },
    });
  };

  const publicar = async () => {
    const n = d?.borradores.length ?? 0;
    const msg = sugeridas.length
      ? `Publicar ${n} IWP y sembrarles ${sugeridas.length} restricción(es) de los departamentos.\n\nNacen PLANIFICADOS: no se liberan a terreno hasta despejarlas.`
      : `Publicar ${n} IWP.\n\nNacen PLANIFICADOS y entran al backlog del proyecto.`;
    if (!window.confirm(msg)) return;
    const r = await accion('publicar', { restricciones: sugeridas }, false);
    if (r?.ok) router.push(`${base}/mineria/apertura?publicado=${r.n_iwp}`);
  };

  // ── Render ──
  if (error && !d) return (
    <div className="p-8">
      <p className="text-[13px] text-[#A00000] mb-3">{error}</p>
      <Link href={`${base}/mineria/apertura`} className="text-[11px] text-[#FF0000] font-bold">← Volver a la Sala de Apertura</Link>
    </div>
  );
  if (!d) return (
    <div className="flex items-center justify-center gap-2 pt-24 text-[13px] text-[#757575]">
      <Loader2 className="w-4 h-4 animate-spin text-[#FF0000]" /> Levantando el banco de cantidades…
    </div>
  );

  const sinCuadrillas = d.cuadrillas.length === 0;
  const hayBorrador = d.borradores.length > 0;
  const libre = Math.max(0, d.totales.hh_saldo - d.totales.hh_en_borrador);

  return (
    <div className="h-[calc(100%+3rem)] -m-6 flex flex-col bg-white overflow-hidden">
      {/* ── Ribbon ── */}
      <div className="shrink-0 border-b border-[#E5E5E5] bg-[#FAFAFA]">
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[#EEEEEE]">
          <Link href={`${base}/mineria/apertura`} title="Volver a la Sala de Apertura"
            className="p-1 rounded hover:bg-[#EEEEEE] transition">
            <ArrowLeft className="w-4 h-4 text-[#757575]" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-black text-[#1A1A1A]">{d.cwp.cwp_id}</span>
              {d.cwp.ruta_critica && (
                <span className="text-[8px] font-black px-1.5 py-px rounded-full bg-[#FEE2E2] text-[#A00000]">RUTA CRÍTICA</span>
              )}
            </div>
            <div className="text-[10px] text-[#757575] truncate max-w-[420px]">{d.cwp.cwp_nombre ?? '—'}</div>
          </div>

          <div className="flex items-center gap-4 ml-4 pl-4 border-l border-[#E5E5E5]">
            <Dato label="Banco" valor={`${num(d.totales.hh_banco)} HH`} />
            <Dato label="Publicado" valor={`${num(d.totales.hh_asignadas)} HH`} color="#16A34A" />
            <Dato label="En borrador" valor={`${num(d.totales.hh_en_borrador)} HH`} color="#FF0000" />
            <Dato label="Libre" valor={`${num(libre)} HH`} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={deshacer} disabled={!pila.length || ocupado}
              title="Deshacer el último cambio del borrador"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#E5E5E5] bg-white text-[10px] font-bold text-[#33475B] hover:border-[#FF0000] hover:text-[#FF0000] transition disabled:opacity-35 disabled:hover:border-[#E5E5E5] disabled:hover:text-[#33475B]"
            >
              <Undo2 className="w-3 h-3" /> Deshacer{pila.length ? ` (${pila.length})` : ''}
            </button>
            {hayBorrador && (
              <button
                onClick={async () => {
                  if (!window.confirm('Descartar el borrador completo. Los IWP ya publicados no se tocan.')) return;
                  await accion('descartar', {}, false);
                  setPila([]);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#E5E5E5] bg-white text-[10px] font-bold text-[#757575] hover:border-[#FF0000] hover:text-[#FF0000] transition"
              >
                <Trash2 className="w-3 h-3" /> Descartar
              </button>
            )}
            <button
              onClick={publicar} disabled={!hayBorrador || ocupado}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#FF0000] text-white text-[10.5px] font-black hover:brightness-110 transition disabled:opacity-35"
            >
              <Upload className="w-3 h-3" /> Publicar {hayBorrador ? d.borradores.length : ''} IWP
            </button>
          </div>
        </div>

        {/* Parámetros del quiebre — permanentes, no pasos */}
        <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap">
          <Selector label="Cuadrilla" valor={sesion?.cuadrilla_id ?? ''} ancho={150}
            onChange={v => accion('parametros', { cuadrilla_id: v || null }, false)}>
            <option value="">— elegir —</option>
            {d.cuadrillas.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.n_personas}p</option>)}
          </Selector>

          <Selector label="Turno" valor={sesion?.turno_id ?? ''} ancho={150}
            onChange={v => accion('parametros', { turno_id: v || null }, false)}>
            <option value="">— elegir —</option>
            {d.turnos.map(t => <option key={t.id} value={t.id}>{t.codigo} · {t.horas_dia}h × {t.dias_trabajo}d</option>)}
          </Selector>

          <Campo label={`HH por IWP${capacidad ? ` (ciclo: ${num(capacidad)})` : ''}`}>
            <input
              type="number" min={1} defaultValue={sesion?.hh_objetivo ?? capacidad ?? ''}
              key={`hh-${sesion?.hh_objetivo}-${capacidad}`}
              onBlur={e => accion('parametros', { hh_objetivo: Number(e.target.value) || null }, false)}
              className="w-[86px] px-2 py-1 text-[10.5px] border border-[#E5E5E5] rounded-md outline-none focus:border-[#FF0000] tabular-nums"
            />
          </Campo>

          <Selector label="Cortar por" valor={sesion?.estrategia ?? 'hh'} ancho={160}
            onChange={v => accion('parametros', { estrategia: v }, false)}>
            <option value="hh">Carga de trabajo</option>
            <option value="commodity">Familia de partida</option>
            <option value="zona" disabled={d.dimensiones.length === 0}>Zona del modelo</option>
          </Selector>

          {sesion?.estrategia === 'zona' && (
            <Selector label="Dimensión" valor={sesion?.dimension_zona ?? ''} ancho={160}
              onChange={v => accion('parametros', { dimension_zona: v || null }, false)}>
              <option value="">— elegir —</option>
              {d.dimensiones.map(dim => <option key={dim.clave} value={dim.clave}>{dim.label} ({dim.zonas.length})</option>)}
            </Selector>
          )}

          <Campo label="Inicio">
            <input
              type="date" defaultValue={sesion?.fecha_inicio ?? d.cwp.fecha_ini?.slice(0, 10) ?? ''}
              key={`ini-${sesion?.fecha_inicio}`}
              onChange={e => accion('parametros', { fecha_inicio: e.target.value || null }, false)}
              className="px-2 py-1 text-[10.5px] border border-[#E5E5E5] rounded-md outline-none focus:border-[#FF0000]"
            />
          </Campo>

          <Campo label="Cuadrillas en paralelo">
            <input
              type="number" min={1} max={8} defaultValue={sesion?.cuadrillas_paralelo ?? 1}
              key={`par-${sesion?.cuadrillas_paralelo}`}
              onBlur={e => accion('parametros', { cuadrillas_paralelo: Math.max(1, Number(e.target.value) || 1) }, false)}
              className="w-[56px] px-2 py-1 text-[10.5px] border border-[#E5E5E5] rounded-md outline-none focus:border-[#FF0000] tabular-nums text-center"
            />
          </Campo>

          <button
            onClick={() => accion('generar', { claves_incluidas: [...incluidas] })}
            disabled={ocupado || !sesion?.cuadrilla_id || !sesion?.turno_id || incluidas.size === 0}
            title={
              incluidas.size === 0 ? 'Marca en el banco los frentes que entran a esta sesión'
                : !sesion?.cuadrilla_id || !sesion?.turno_id ? 'Elige cuadrilla y turno'
                  : 'Recalcula el quiebre; los paquetes que editaste a mano se conservan'
            }
            className="self-end inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1A1A1A] text-white text-[10.5px] font-black hover:bg-[#333] transition disabled:opacity-35"
          >
            {ocupado ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {hayBorrador ? 'Regenerar' : 'Generar quiebre'}
          </button>

          {/* Vista */}
          <div className="ml-auto self-end flex items-center gap-2">
            <Selector label="Agrupar" valor={agrupar} ancho={128} onChange={v => setAgrupar(v as AgruparPor)}>
              {AGRUPACIONES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Selector>

            <div className="relative">
              <button onClick={() => setMenuColumnas(v => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#E5E5E5] bg-white text-[10px] font-bold text-[#33475B] hover:border-[#FF0000] transition">
                <Columns3 className="w-3 h-3" /> Columnas <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {menuColumnas && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenuColumnas(false)} />
                  <div className="absolute right-0 top-full mt-1 z-30 w-[220px] max-h-[320px] overflow-y-auto bg-white border border-[#E5E5E5] rounded-lg shadow-lg py-1">
                    {COLUMNAS.map(c => (
                      <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-[10.5px] hover:bg-[#FAFAFA] cursor-pointer">
                        <input
                          type="checkbox" className="accent-[#FF0000]"
                          checked={columnas.includes(c.id)}
                          onChange={() => guardarColumnas(
                            columnas.includes(c.id)
                              ? columnas.filter(x => x !== c.id)
                              : COLUMNAS.filter(x => columnas.includes(x.id) || x.id === c.id).map(x => x.id),
                          )}
                        />
                        <span className="text-[#33475B]">{c.label}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center border border-[#E5E5E5] rounded-md bg-white">
              <button onClick={() => setEscala(e => ESCALAS[Math.max(0, ESCALAS.indexOf(e) - 1)])}
                title="Alejar" className="px-1.5 py-1.5 hover:bg-[#F5F5F5] transition"><ZoomOut className="w-3 h-3 text-[#757575]" /></button>
              <button onClick={() => setEscala(e => ESCALAS[Math.min(ESCALAS.length - 1, ESCALAS.indexOf(e) + 1)])}
                title="Acercar" className="px-1.5 py-1.5 hover:bg-[#F5F5F5] transition border-l border-[#E5E5E5]"><ZoomIn className="w-3 h-3 text-[#757575]" /></button>
            </div>
          </div>
        </div>

        {/* Avisos que impiden trabajar */}
        {sinCuadrillas && (
          <Banda tono="crit">
            Este proyecto no tiene cuadrillas activas: sin ellas no hay con qué dimensionar un IWP.{' '}
            <Link href={`${base}/recursos/cuadrillas`} className="font-black underline underline-offset-2">Crear cuadrillas →</Link>
          </Banda>
        )}
        {d.totales.n_partidas_sin_rendimiento > 0 && (
          <Banda tono="aviso">
            {d.totales.n_partidas_sin_rendimiento} frente(s) con saldo pero sin rendimiento HH/unidad quedan fuera del quiebre automático.
          </Banda>
        )}
        {error && <Banda tono="crit">{error}</Banda>}
      </div>

      {/* ── Barra de selección múltiple ── */}
      {selBorrador.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-[#FEF2F2] border-b border-[#FECACA]">
          <span className="text-[10.5px] font-black text-[#991B1B]">{selBorrador.length} paquetes seleccionados</span>

          <span className="text-[10px] text-[#991B1B] ml-3">Correr</span>
          {[-7, -1, 1, 7].map(dd => (
            <button key={dd} onClick={() => accion('lote', { ids: selBorrador, correr_dias: dd })}
              className="px-2 py-1 rounded border border-[#FECACA] bg-white text-[9.5px] font-bold text-[#991B1B] hover:bg-[#FFE4E4] transition tabular-nums">
              {dd > 0 ? `+${dd}` : dd} d
            </button>
          ))}

          <select
            value="" onChange={e => e.target.value && accion('lote', { ids: selBorrador, campos: { cuadrilla_id: e.target.value } })}
            className="ml-3 px-2 py-1 text-[9.5px] border border-[#FECACA] rounded bg-white text-[#991B1B] outline-none"
          >
            <option value="">Asignar cuadrilla…</option>
            {d.cuadrillas.map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.n_personas}p</option>)}
          </select>

          <button onClick={() => accion('fusionar', { ids: selBorrador })} disabled={selBorrador.length < 2}
            className="px-2.5 py-1 rounded border border-[#FECACA] bg-white text-[9.5px] font-bold text-[#991B1B] hover:bg-[#FFE4E4] transition disabled:opacity-40">
            Fusionar
          </button>
          <button onClick={() => accion('eliminar', { ids: selBorrador })}
            className="px-2.5 py-1 rounded border border-[#FECACA] bg-white text-[9.5px] font-bold text-[#991B1B] hover:bg-[#FFE4E4] transition">
            Eliminar
          </button>

          <button onClick={() => setSeleccion(new Set())} className="ml-auto text-[9.5px] text-[#991B1B] underline">
            Quitar selección
          </button>
        </div>
      )}

      {/* ── Los tres paneles ── */}
      <div className="flex-1 flex min-h-0">
        <div className="shrink-0" style={{ width: 268 }}>
          <PanelBanco
            banco={d.banco} incluidas={incluidas} clavesActivas={clavesActivas}
            onIncluidas={s => accion('parametros', { claves_incluidas: [...s] }, false)}
          />
        </div>

        <div className="flex-1 flex min-w-0">
          <div className="shrink-0 min-w-0" style={{ width: anchoGrid }}>
            <GridPaquetes
              filas={filas} columnas={columnas} cuadrillas={d.cuadrillas}
              agrupar={agrupar} orden={orden} onOrden={setOrden}
              seleccion={seleccion} onSeleccion={setSeleccion}
              filaActiva={filaActiva} onActivar={setFilaActiva}
              onEditar={editarFila}
              colapsados={colapsados} onColapsar={setColapsados}
              contenedorRef={gridRef} onScroll={sincronizar('grid')}
            />
          </div>

          <Divisor onAncho={setAnchoGrid} />

          <div className="flex-1 min-w-0">
            <GanttPaquetes
              filas={filas} cuadrillas={d.cuadrillas}
              agrupar={agrupar} orden={orden} colapsados={colapsados}
              seleccion={seleccion} filaActiva={filaActiva} onActivar={setFilaActiva}
              escala={escala} onMover={moverEnGantt} onRedimensionar={redimensionar}
              contenedorRef={ganttRef} onScroll={sincronizar('gantt')}
            />
          </div>
        </div>

        <div className="shrink-0" style={{ width: 300 }}>
          <InspectorPaquete
            fila={activa} cuadrillas={d.cuadrillas} turno={turno} sugeridas={sugeridas}
            seleccion={new Set(selBorrador)} base={base}
            onDividir={(f, partes) => accion('dividir', { id: f.id, partes })}
            onFusionar={() => accion('fusionar', { ids: selBorrador })}
            onEliminar={() => activa && accion('eliminar', { ids: [activa.id] })}
            onCerrar={() => setFilaActiva(null)}
          />
        </div>
      </div>

      {/* ── Barra de estado ── */}
      <div className="shrink-0 flex items-center gap-4 px-3 py-1.5 bg-[#FAFAFA] border-t border-[#E5E5E5] text-[10px] text-[#757575]">
        <span><b className="text-[#1A1A1A]">{d.totales.n_publicados}</b> publicados</span>
        <span><b className="text-[#FF0000]">{d.totales.n_borradores}</b> en borrador</span>
        {turno && cuadrilla && (
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" /> {cuadrilla.codigo} · {cuadrilla.n_personas}p · {turno.codigo} → <b className="text-[#1A1A1A]">{num(capacidad)} HH/ciclo</b>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="w-3 h-3" /> TAKT {taktDe(filas)} d
        </span>
        <span className="ml-auto">
          {libre > 0
            ? <>Quedan <b className="text-[#1A1A1A]">{num(libre)} HH</b> sin repartir</>
            : <span className="text-[#16A34A] font-bold">El CWP queda completamente aperturado</span>}
        </span>
      </div>
    </div>
  );
}

const taktDe = (filas: Fila[]) => {
  const bs = filas.filter(f => f.tipo === 'borrador' && f.dias);
  return bs.length ? Math.round((bs.reduce((s, f) => s + (f.dias ?? 0), 0) / bs.length) * 10) / 10 : 0;
};

// ─── Piezas del ribbon ───────────────────────────────────────────────────────

function Divisor({ onAncho }: { onAncho: (v: number) => void }) {
  const [arrastrando, setArrastrando] = useState(false);
  useEffect(() => {
    if (!arrastrando) return;
    const mover = (e: MouseEvent) => onAncho(Math.max(280, Math.min(1200, e.clientX - 268)));
    const soltar = () => setArrastrando(false);
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
    return () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); };
  }, [arrastrando, onAncho]);

  return (
    <div
      onMouseDown={() => setArrastrando(true)}
      className={cn('shrink-0 w-1 cursor-col-resize transition-colors', arrastrando ? 'bg-[#FF0000]' : 'bg-[#E5E5E5] hover:bg-[#FF0000]')}
      title="Arrastra para repartir el espacio entre planilla y Gantt"
    />
  );
}

function Dato({ label, valor, color }: { label: string; valor: string; color?: string }) {
  return (
    <div>
      <div className="text-[8px] font-black uppercase tracking-wide text-[#9E9E9E] leading-none">{label}</div>
      <div className="text-[11.5px] font-black tabular-nums leading-tight" style={{ color: color ?? '#1A1A1A' }}>{valor}</div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[8px] font-black uppercase tracking-wide text-[#9E9E9E]">{label}</span>
      {children}
    </label>
  );
}

function Selector({ label, valor, onChange, ancho, children }: {
  label: string; valor: string; onChange: (v: string) => void; ancho: number; children: React.ReactNode;
}) {
  return (
    <Campo label={label}>
      <select
        value={valor} onChange={e => onChange(e.target.value)} style={{ width: ancho }}
        className="px-2 py-1 text-[10.5px] border border-[#E5E5E5] rounded-md outline-none focus:border-[#FF0000] bg-white"
      >
        {children}
      </select>
    </Campo>
  );
}

function Banda({ tono, children }: { tono: 'crit' | 'aviso'; children: React.ReactNode }) {
  const Icono = tono === 'crit' ? AlertTriangle : Info;
  return (
    <div className={cn(
      'flex items-start gap-2 px-3 py-1.5 text-[10.5px] leading-snug border-t',
      tono === 'crit' ? 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]' : 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]',
    )}>
      <Icono className="w-3.5 h-3.5 shrink-0 mt-px" />
      <span>{children}</span>
    </div>
  );
}
