'use client';

// Asistente de apertura de un CWP en IWPs — la rutina de Pull Planning, en pantalla.
//
// Sigue el orden de la lámina 40 de O3 ("La Rutina de Pull Planning"), agrupando sus diez
// pasos en cuatro que una persona puede recorrer en una sesión:
//
//   1 · Cantidades   pasos 1–2   qué hay que construir y a qué rendimiento
//   2 · Quiebre      pasos 3–5   con qué cuadrilla, de qué tamaño, cortado por dónde
//   3 · Secuencia    pasos 6–8   en qué orden, a qué ritmo, con qué línea de balance
//   4 · Restricciones pasos 9–10  qué lo puede frenar, y confirmar
//
// El preview del quiebre se recalcula en vivo con el mismo motor que corre el servidor
// (`lib/iwp-apertura`), así que lo que se ve es exactamente lo que se va a escribir.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, X, AlertTriangle, Info, CheckCircle2, ChevronRight, ChevronLeft, Users, Plus } from 'lucide-react';
import {
  proponerIwps, encadenarFechas, capacidadCiclo, taktPromedio,
  type PartidaBanco, type Turno, type Cuadrilla, type Estrategia, type Zona, type IwpPropuesto,
} from '@/lib/iwp-apertura';

interface FilaBanco extends PartidaBanco { pu_clp: number | null }
interface Dimension { clave: string; label: string; zonas: { clave: string; nombre: string; peso: number; n: number }[] }
interface Sugerida { tipo: string; descripcion: string; fecha_necesaria: string | null; origen: string; severidad: string }

interface BancoResp {
  cwp: { cwp_id: string; cwp_nombre: string | null; disciplina: string | null; disciplina_cod: string | null; hh_planner: number | null; fecha_ini: string | null };
  fuente: 'mc' | 'itemizado';
  banco: FilaBanco[];
  totales: {
    hh_banco: number; hh_asignadas: number; hh_saldo: number; monto_clp: number;
    hh_planner: number; pct_aperturado: number; n_iwp: number;
    n_partidas: number; n_partidas_sin_rendimiento: number;
  };
  dimensiones: Dimension[];
  turnos: Turno[];
  cuadrillas: Cuadrilla[];
}

interface Props {
  projectId: string;
  cwpId: string;
  onClose: () => void;
  onCreated: (resumen: { n_iwp: number; hh_total: number }) => void;
}

const ROJO = '#FF0000';
const num = (v: number | null | undefined, dec = 0) =>
  v == null ? '—' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: dec });
const hoyISO = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });

const PASOS = [
  { n: 1, label: 'Cantidades', sub: 'Qué hay que construir' },
  { n: 2, label: 'Quiebre', sub: 'Cuadrilla y tamaño' },
  { n: 3, label: 'Secuencia', sub: 'Orden, ritmo y balance' },
  { n: 4, label: 'Restricciones', sub: 'Qué lo puede frenar' },
];

export default function AperturaWizard({ projectId, cwpId, onClose, onCreated }: Props) {
  const [data, setData] = useState<BancoResp | null>(null);
  const [sugeridas, setSugeridas] = useState<Sugerida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState(1);
  const [guardando, setGuardando] = useState(false);

  // Paso 1
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  // Paso 2
  const [cuadrillaId, setCuadrillaId] = useState('');
  const [turnoId, setTurnoId] = useState('');
  const [hhObjetivo, setHhObjetivo] = useState<number | null>(null);
  const [estrategia, setEstrategia] = useState<Estrategia>('hh');
  const [dimZona, setDimZona] = useState('');
  // Paso 3
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [paralelo, setParalelo] = useState(1);
  const [overrides, setOverrides] = useState<Record<number, { nombre?: string; limites?: string }>>({});
  // Paso 4
  const [restSel, setRestSel] = useState<Set<number>>(new Set());

  const cargar = useCallback(() => {
    setError(null);
    Promise.all([
      fetch(`/api/mining-cwp-banco?project_id=${projectId}&cwp_id=${encodeURIComponent(cwpId)}`)
        .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d as BancoResp; }),
      fetch(`/api/mining-iwp-apertura?project_id=${projectId}&cwp_id=${encodeURIComponent(cwpId)}`)
        .then(async r => { const d = await r.json(); return r.ok ? (d.sugeridas ?? []) : []; }),
    ])
      .then(([banco, sug]) => {
        setData(banco);
        setSugeridas(sug);
        setRestSel(new Set(sug.map((_: Sugerida, i: number) => i)));
        // Preselección sensata: la cuadrilla de la disciplina del CWP y el turno por defecto.
        const cuad = banco.cuadrillas.find(c => c.disciplina_cod === banco.cwp.disciplina_cod) ?? banco.cuadrillas[0];
        if (cuad) setCuadrillaId(cuad.id);
        const turno = banco.turnos.find(t => t.id === cuad?.turno_id) ?? banco.turnos[0];
        if (turno) setTurnoId(turno.id);
        if (banco.cwp.fecha_ini) setFechaInicio(banco.cwp.fecha_ini.slice(0, 10));
      })
      .catch(e => setError(String(e.message ?? e)));
  }, [projectId, cwpId]);

  useEffect(() => { cargar(); }, [cargar]);

  const cuadrilla = useMemo(() => data?.cuadrillas.find(c => c.id === cuadrillaId) ?? null, [data, cuadrillaId]);
  const turno = useMemo(() => data?.turnos.find(t => t.id === turnoId) ?? null, [data, turnoId]);
  const capacidad = useMemo(() => cuadrilla && turno ? capacidadCiclo(cuadrilla, turno) : 0, [cuadrilla, turno]);

  // Al cambiar de cuadrilla o turno el objetivo vuelve a ser la capacidad del ciclo: es la
  // regla del negocio (un IWP = un turno), no una preferencia que convenga recordar.
  useEffect(() => { if (capacidad > 0) setHhObjetivo(capacidad); }, [capacidad]);

  const zonas: Zona[] = useMemo(() => {
    const dim = data?.dimensiones.find(d => d.clave === dimZona);
    return (dim?.zonas ?? []).map(z => ({ clave: z.clave, nombre: z.nombre, peso: z.peso }));
  }, [data, dimZona]);

  const propuesta = useMemo(() => {
    if (!data || !cuadrilla || !turno || !hhObjetivo) return null;
    return proponerIwps(data.banco, cuadrilla, turno, {
      estrategia, hhObjetivo, zonas,
      itemsExcluidos: [...excluidos],
    });
  }, [data, cuadrilla, turno, hhObjetivo, estrategia, zonas, excluidos]);

  const fechas = useMemo(() => {
    if (!propuesta || !turno) return [];
    return encadenarFechas(propuesta.iwps, fechaInicio, turno, paralelo);
  }, [propuesta, turno, fechaInicio, paralelo]);

  const bloqueado = propuesta?.alertas.some(a => a.severidad === 'bloqueo') ?? false;
  const nIwp = propuesta?.iwps.length ?? 0;

  const nombreDe = (iwp: IwpPropuesto) => overrides[iwp.secuencia]?.nombre ?? iwp.nombre;
  const limitesDe = (iwp: IwpPropuesto) => overrides[iwp.secuencia]?.limites ?? iwp.limites_bateria;

  const confirmar = async () => {
    if (!propuesta || !data) return;
    setGuardando(true); setError(null);
    try {
      const res = await fetch('/api/mining-iwp-apertura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, cwp_id: cwpId,
          cuadrilla_id: cuadrillaId || null, turno_id: turnoId || null, estrategia,
          iwps: propuesta.iwps.map((iwp, i) => ({
            nombre: nombreDe(iwp),
            grupo: iwp.grupo,
            limites_bateria: limitesDe(iwp),
            secuencia: iwp.secuencia,
            hh: iwp.hh,
            dias: iwp.dias,
            fecha_inicio_plan: fechas[i]?.fecha_inicio_plan,
            fecha_fin_plan: fechas[i]?.fecha_fin_plan,
            partidas: iwp.partidas,
          })),
          restricciones: sugeridas.filter((_, i) => restSel.has(i)),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? 'No se pudo crear la apertura');
      onCreated({ n_iwp: d.n_iwp, hh_total: d.hh_total });
    } catch (e: any) {
      setError(String(e.message ?? e));
      setGuardando(false);
    }
  };

  // ── Chrome ────────────────────────────────────────────────────────────────
  const marco = (contenido: React.ReactNode, pie?: React.ReactNode) => (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 'min(1100px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: 20, backgroundColor: 'white', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #EEEEEE' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#1A1A1A' }}>Aperturar {cwpId} en IWP</div>
            <div style={{ fontSize: 10.5, color: '#757575' }}>
              Rutina de Pull Planning · {data?.cwp.cwp_nombre ?? 'cargando…'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}>
            <X style={{ width: 18, height: 18, color: '#9E9E9E' }} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #EEEEEE', backgroundColor: '#FAFAFA' }}>
          {PASOS.map(p => {
            const activo = p.n === paso;
            const hecho = p.n < paso;
            return (
              <button key={p.n} onClick={() => data && setPaso(p.n)} disabled={!data}
                style={{ flex: 1, padding: '10px 12px', border: 'none', cursor: data ? 'pointer' : 'default', textAlign: 'left', backgroundColor: activo ? 'white' : 'transparent', borderBottom: activo ? `2px solid ${ROJO}` : '2px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 999, fontSize: 9, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: activo ? ROJO : hecho ? '#16A34A' : '#E5E7EB', color: activo || hecho ? 'white' : '#757575' }}>{p.n}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: activo ? '#1A1A1A' : '#757575' }}>{p.label}</span>
                </div>
                <div style={{ fontSize: 9, color: '#9E9E9E', marginLeft: 22 }}>{p.sub}</div>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 18 }}>{contenido}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderTop: '1px solid #EEEEEE', backgroundColor: '#FAFAFA' }}>
          {pie}
        </div>
      </div>
    </div>
  );

  if (error && !data) return marco(
    <div style={{ padding: 24, fontSize: 12, color: '#A00000' }}>{error}</div>,
    <button onClick={onClose} style={{ marginLeft: 'auto', ...btnSec }}>Cerrar</button>,
  );

  if (!data) return marco(
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 40, color: '#757575', fontSize: 12.5 }}>
      <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Levantando cantidades y rendimientos del CWP…
    </div>,
  );

  // ── Pie de página según el paso ───────────────────────────────────────────
  const pie = (
    <>
      {error && <span style={{ fontSize: 10.5, color: '#A00000', fontWeight: 700, maxWidth: 520 }}>{error}</span>}
      {paso === 1 && <span style={{ fontSize: 10.5, color: '#757575' }}>{data.totales.n_partidas - excluidos.size} de {data.totales.n_partidas} partidas entran a la apertura</span>}
      {paso > 1 && nIwp > 0 && (
        <span style={{ fontSize: 10.5, color: '#757575' }}>
          <b style={{ color: '#1A1A1A' }}>{nIwp} IWP</b> · {num(propuesta?.hh_total)} HH · TAKT {taktPromedio(propuesta!.iwps)} días
        </span>
      )}
      <button onClick={() => paso > 1 ? setPaso(paso - 1) : onClose()} style={{ marginLeft: 'auto', ...btnSec }}>
        {paso > 1 ? <><ChevronLeft style={{ width: 12, height: 12 }} /> Atrás</> : 'Cancelar'}
      </button>
      {paso < 4 ? (
        <button onClick={() => setPaso(paso + 1)} disabled={paso >= 2 && (bloqueado || nIwp === 0)}
          style={{ ...btnPri, opacity: paso >= 2 && (bloqueado || nIwp === 0) ? 0.5 : 1 }}>
          Siguiente <ChevronRight style={{ width: 12, height: 12 }} />
        </button>
      ) : (
        <button onClick={confirmar} disabled={guardando || bloqueado || nIwp === 0} style={{ ...btnPri, opacity: guardando || bloqueado || nIwp === 0 ? 0.6 : 1 }}>
          {guardando && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
          Crear {nIwp} IWP
        </button>
      )}
    </>
  );

  return marco(
    <>
      {paso === 1 && <PasoCantidades data={data} excluidos={excluidos} setExcluidos={setExcluidos} />}
      {paso === 2 && (
        <PasoQuiebre
          data={data} projectId={projectId}
          cuadrillaId={cuadrillaId} setCuadrillaId={setCuadrillaId}
          turnoId={turnoId} setTurnoId={setTurnoId}
          hhObjetivo={hhObjetivo} setHhObjetivo={setHhObjetivo}
          estrategia={estrategia} setEstrategia={setEstrategia}
          dimZona={dimZona} setDimZona={setDimZona}
          capacidad={capacidad} cuadrilla={cuadrilla} turno={turno}
          propuesta={propuesta} onCuadrillaCreada={cargar}
        />
      )}
      {paso === 3 && propuesta && turno && (
        <PasoSecuencia
          propuesta={propuesta} fechas={fechas} turno={turno}
          fechaInicio={fechaInicio} setFechaInicio={setFechaInicio}
          paralelo={paralelo} setParalelo={setParalelo}
          overrides={overrides} setOverrides={setOverrides}
        />
      )}
      {paso === 4 && propuesta && (
        <PasoRestricciones
          sugeridas={sugeridas} sel={restSel} setSel={setRestSel}
          nIwp={nIwp} hhTotal={propuesta.hh_total} data={data}
          cuadrilla={cuadrilla} turno={turno} fechas={fechas}
        />
      )}
    </>,
    pie,
  );
}

// ─── Paso 1 · Cantidades y rendimientos ──────────────────────────────────────

function PasoCantidades({ data, excluidos, setExcluidos }: {
  data: BancoResp; excluidos: Set<string>; setExcluidos: (s: Set<string>) => void;
}) {
  const t = data.totales;
  const toggle = (item: string) => {
    const n = new Set(excluidos);
    if (n.has(item)) n.delete(item); else n.add(item);
    setExcluidos(n);
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 14 }}>
        <Kpi label="HH DEL BANCO" valor={num(t.hh_banco)} nota={t.hh_planner ? `${num(t.hh_planner)} HH del planner` : undefined} />
        <Kpi label="YA EN IWP" valor={num(t.hh_asignadas)} nota={`${t.n_iwp} IWP abiertos`} color={t.hh_asignadas > 0 ? '#B45309' : undefined} />
        <Kpi label="SALDO POR APERTURAR" valor={num(t.hh_saldo)} color={ROJO} />
        <Kpi label="APERTURADO" valor={`${t.pct_aperturado}%`} nota={`${t.n_partidas} partidas`} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 900, color: '#1A1A1A' }}>Banco de cantidades</span>
        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999, backgroundColor: '#EFF6FF', color: '#1D4ED8', textTransform: 'uppercase' }}>
          fuente: {data.fuente === 'mc' ? 'matriz de cobro' : 'itemizado'}
        </span>
        <span style={{ fontSize: 10, color: '#757575', marginLeft: 'auto' }}>Desmarca lo que no quieras aperturar todavía</span>
      </div>

      {t.n_partidas_sin_rendimiento > 0 && (
        <Aviso severidad="aviso">
          {t.n_partidas_sin_rendimiento} partida(s) tienen saldo pero no tienen rendimiento HH/unidad. Quedan fuera del quiebre automático hasta que se les cargue el rendimiento en el itemizado.
        </Aviso>
      )}

      <div style={{ border: '1px solid #EEEEEE', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
          <thead>
            <tr style={{ backgroundColor: '#FAFAFA', textAlign: 'left' }}>
              {['', 'Item', 'Descripción', 'Un.', 'Cantidad', 'Ya asignada', 'Saldo', 'HH/un', 'HH saldo'].map((h, i) => (
                <th key={i} style={{ padding: '7px 8px', fontSize: 9, fontWeight: 900, color: '#757575', textTransform: 'uppercase', textAlign: i >= 4 ? 'right' : 'left', borderBottom: '1px solid #EEEEEE' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.banco.map(b => {
              const off = excluidos.has(b.item);
              const agotada = b.cantidad_saldo <= 0;
              return (
                <tr key={b.item} style={{ borderBottom: '1px solid #F5F5F5', opacity: off || agotada ? 0.45 : 1, backgroundColor: agotada ? '#FAFAFA' : 'white' }}>
                  <td style={{ padding: '6px 8px' }}>
                    <input type="checkbox" checked={!off && !agotada} disabled={agotada} onChange={() => toggle(b.item)} style={{ accentColor: ROJO, cursor: agotada ? 'default' : 'pointer' }} />
                  </td>
                  <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap' }}>{b.item}</td>
                  <td style={{ padding: '6px 8px', color: '#33475B', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.descripcion ?? ''}>{b.descripcion ?? '—'}</td>
                  <td style={{ padding: '6px 8px', color: '#757575' }}>{b.unidad ?? '—'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#33475B' }}>{num(b.cantidad_total, 2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: b.cantidad_asignada > 0 ? '#B45309' : '#BDBDBD' }}>{num(b.cantidad_asignada, 2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: agotada ? '#9E9E9E' : '#1A1A1A' }}>{num(b.cantidad_saldo, 2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: b.hh_unidad ? '#33475B' : '#DC2626', fontWeight: b.hh_unidad ? 400 : 700 }}>
                    {b.hh_unidad ? num(b.hh_unidad, 3) : 'falta'}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: '#1A1A1A' }}>{num(b.hh_saldo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Paso 2 · El quiebre ─────────────────────────────────────────────────────

function PasoQuiebre({
  data, projectId, cuadrillaId, setCuadrillaId, turnoId, setTurnoId, hhObjetivo, setHhObjetivo,
  estrategia, setEstrategia, dimZona, setDimZona, capacidad, cuadrilla, turno, propuesta, onCuadrillaCreada,
}: {
  data: BancoResp; projectId: string;
  cuadrillaId: string; setCuadrillaId: (v: string) => void;
  turnoId: string; setTurnoId: (v: string) => void;
  hhObjetivo: number | null; setHhObjetivo: (v: number) => void;
  estrategia: Estrategia; setEstrategia: (v: Estrategia) => void;
  dimZona: string; setDimZona: (v: string) => void;
  capacidad: number; cuadrilla: Cuadrilla | null; turno: Turno | null;
  propuesta: ReturnType<typeof proponerIwps> | null;
  onCuadrillaCreada: () => void;
}) {
  const sinCuadrillas = data.cuadrillas.length === 0;

  const ESTRATEGIAS: { id: Estrategia; label: string; desc: string; disponible: boolean }[] = [
    { id: 'hh', label: 'Por carga de trabajo', desc: 'Corta el saldo en paquetes del tamaño objetivo, en el orden del itemizado.', disponible: true },
    { id: 'commodity', label: 'Por familia de partida', desc: 'Un frente por commodity (hormigón, estructura, cañería). Cada familia se trocea aparte.', disponible: true },
    { id: 'zona', label: 'Por zona del modelo', desc: 'Reparte las cantidades entre sectores o niveles del 3D y hace un paquete por zona.', disponible: data.dimensiones.length > 0 },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sinCuadrillas ? (
          <CuadrillaRapida projectId={projectId} turnos={data.turnos} disciplina={data.cwp.disciplina_cod} onCreada={onCuadrillaCreada} />
        ) : (
          <>
            <Campo label="Cuadrilla">
              <select value={cuadrillaId} onChange={e => setCuadrillaId(e.target.value)} style={input}>
                {data.cuadrillas.map(c => (
                  <option key={c.id} value={c.id}>{c.codigo} — {c.nombre ?? `${c.n_personas} personas`} ({c.n_personas}p)</option>
                ))}
              </select>
            </Campo>
            <Campo label="Turno">
              <select value={turnoId} onChange={e => setTurnoId(e.target.value)} style={input}>
                {data.turnos.map(t => (
                  <option key={t.id} value={t.id}>{t.codigo} — {t.dias_trabajo}×{t.dias_descanso} · {t.horas_dia} h/día</option>
                ))}
              </select>
            </Campo>

            {cuadrilla && turno && (
              <div style={{ borderRadius: 10, border: '1px solid #FECACA', backgroundColor: '#FEF2F2', padding: '10px 12px' }}>
                <div style={{ fontSize: 9, fontWeight: 900, color: '#991B1B' }}>UN IWP = UN CICLO DE TURNO</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#1A1A1A', marginTop: 2 }}>{num(capacidad)} HH</div>
                <div style={{ fontSize: 9.5, color: '#7F1D1D', lineHeight: 1.4 }}>
                  {cuadrilla.n_personas} personas × {turno.horas_dia} h × {turno.dias_trabajo} días
                  {cuadrilla.factor_productividad !== 1 && ` × factor ${cuadrilla.factor_productividad}`}
                </div>
              </div>
            )}

            <Campo label={`HH objetivo por IWP${capacidad ? ` (capacidad: ${num(capacidad)})` : ''}`}>
              <input type="number" min={1} value={hhObjetivo ?? ''} onChange={e => setHhObjetivo(Number(e.target.value))} style={input} />
            </Campo>

            <div>
              <div style={{ fontSize: 9.5, fontWeight: 900, color: '#757575', textTransform: 'uppercase', marginBottom: 6 }}>Cómo cortar el alcance</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ESTRATEGIAS.map(e => (
                  <label key={e.id} title={e.disponible ? '' : 'El modelo 3D de este CWP no tiene sectores ni niveles cargados'}
                    style={{ display: 'flex', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: e.disponible ? 'pointer' : 'not-allowed', opacity: e.disponible ? 1 : 0.45, border: estrategia === e.id ? '1px solid #FECACA' : '1px solid #F3F4F6', backgroundColor: estrategia === e.id ? '#FEF2F2' : 'white' }}>
                    <input type="radio" checked={estrategia === e.id} disabled={!e.disponible} onChange={() => setEstrategia(e.id)} style={{ accentColor: ROJO, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#1A1A1A' }}>{e.label}</div>
                      <div style={{ fontSize: 9.5, color: '#757575', lineHeight: 1.35 }}>{e.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {estrategia === 'zona' && (
              <Campo label="Dimensión del modelo">
                <select value={dimZona} onChange={e => setDimZona(e.target.value)} style={input}>
                  <option value="">Elige una…</option>
                  {data.dimensiones.map(d => <option key={d.clave} value={d.clave}>{d.label} — {d.zonas.length} zonas</option>)}
                </select>
              </Campo>
            )}
          </>
        )}
      </div>

      <div>
        {(propuesta?.alertas ?? []).map((a, i) => (
          <Aviso key={i} severidad={a.severidad}>{a.mensaje}</Aviso>
        ))}

        {!propuesta || propuesta.iwps.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 11.5, color: '#9E9E9E', fontStyle: 'italic' }}>
            {sinCuadrillas ? 'Crea una cuadrilla para dimensionar los paquetes.' : 'Ajusta los parámetros para ver la propuesta de quiebre.'}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: ROJO }}>{propuesta.iwps.length}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: '#1A1A1A' }}>IWP propuestos</span>
              <span style={{ fontSize: 10.5, color: '#757575' }}>
                {num(propuesta.hh_total)} HH · promedio {num(propuesta.hh_total / propuesta.iwps.length)} HH · TAKT {taktPromedio(propuesta.iwps)} días
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 380, overflowY: 'auto' }}>
              {propuesta.iwps.map(iwp => (
                <div key={iwp.secuencia} style={{ border: '1px solid #EEEEEE', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: '#1A1A1A' }}>{iwp.secuencia}. {iwp.nombre}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: ROJO, marginLeft: 'auto' }}>{num(iwp.hh)} HH</span>
                    <span style={{ fontSize: 9.5, color: '#757575' }}>{iwp.dias} d</span>
                  </div>
                  <div style={{ fontSize: 9.5, color: '#757575', marginTop: 3 }}>
                    {iwp.partidas.slice(0, 3).map(p => `${p.item} ${num(p.cantidad, 1)} ${p.unidad ?? ''}`).join(' · ')}
                    {iwp.partidas.length > 3 && ` · +${iwp.partidas.length - 3} partidas`}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Atajo para no dejar al planificador en un callejón sin salida si el proyecto no tiene cuadrillas. */
function CuadrillaRapida({ projectId, turnos, disciplina, onCreada }: {
  projectId: string; turnos: Turno[]; disciplina: string | null; onCreada: () => void;
}) {
  const [codigo, setCodigo] = useState(disciplina ? `CUAD-${disciplina}` : 'CUAD-01');
  const [personas, setPersonas] = useState('12');
  const [turnoId, setTurnoId] = useState(turnos[0]?.id ?? '');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const crear = async () => {
    setGuardando(true); setErr(null);
    try {
      const res = await fetch('/api/mining-cuadrilla', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, tipo: 'cuadrilla', codigo,
          nombre: `Cuadrilla ${disciplina ?? ''}`.trim(), disciplina_cod: disciplina,
          n_personas: Number(personas), turno_id: turnoId || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json())?.error);
      onCreada();
    } catch (e: any) { setErr(String(e.message ?? e)); setGuardando(false); }
  };

  return (
    <div style={{ border: '1px dashed #FECACA', borderRadius: 12, padding: 14, backgroundColor: '#FFFBFB' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Users style={{ width: 14, height: 14, color: ROJO }} />
        <span style={{ fontSize: 11.5, fontWeight: 900, color: '#1A1A1A' }}>Este proyecto no tiene cuadrillas</span>
      </div>
      <div style={{ fontSize: 10, color: '#757575', marginBottom: 10, lineHeight: 1.4 }}>
        Sin cuadrilla no hay cómo dimensionar un IWP. Crea una acá para seguir; el catálogo completo se administra en Recursos.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Campo label="Código"><input value={codigo} onChange={e => setCodigo(e.target.value)} style={input} /></Campo>
        <Campo label="Personas"><input type="number" min={1} value={personas} onChange={e => setPersonas(e.target.value)} style={input} /></Campo>
        <Campo label="Turno">
          <select value={turnoId} onChange={e => setTurnoId(e.target.value)} style={input}>
            {turnos.map(t => <option key={t.id} value={t.id}>{t.codigo} · {t.horas_dia} h × {t.dias_trabajo} d</option>)}
          </select>
        </Campo>
        {err && <span style={{ fontSize: 10, color: '#A00000' }}>{err}</span>}
        <button onClick={crear} disabled={guardando} style={{ ...btnPri, justifyContent: 'center' }}>
          {guardando ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : <Plus style={{ width: 12, height: 12 }} />}
          Crear cuadrilla
        </button>
      </div>
    </div>
  );
}

// ─── Paso 3 · Secuencia, TAKT y línea de balance ─────────────────────────────

function PasoSecuencia({
  propuesta, fechas, turno, fechaInicio, setFechaInicio, paralelo, setParalelo, overrides, setOverrides,
}: {
  propuesta: ReturnType<typeof proponerIwps>; fechas: { fecha_inicio_plan: string; fecha_fin_plan: string }[];
  turno: Turno; fechaInicio: string; setFechaInicio: (v: string) => void;
  paralelo: number; setParalelo: (v: number) => void;
  overrides: Record<number, { nombre?: string; limites?: string }>;
  setOverrides: (v: Record<number, { nombre?: string; limites?: string }>) => void;
}) {
  const iwps = propuesta.iwps;
  const set = (seq: number, campo: 'nombre' | 'limites', valor: string) =>
    setOverrides({ ...overrides, [seq]: { ...overrides[seq], [campo]: valor } });

  const t0 = fechas.length ? new Date(fechas[0].fecha_inicio_plan + 'T00:00:00').getTime() : Date.now();
  const tFin = fechas.length ? Math.max(...fechas.map(f => new Date(f.fecha_fin_plan + 'T00:00:00').getTime())) : t0;
  const span = Math.max(1, (tFin - t0) / 86400000);
  const dia = (iso: string) => (new Date(iso + 'T00:00:00').getTime() - t0) / 86400000;

  const W = 640, H = Math.max(120, iwps.length * 13 + 24);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <Campo label="Inicio del primer IWP"><input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={{ ...input, width: 150 }} /></Campo>
        <Campo label="Cuadrillas en paralelo">
          <input type="number" min={1} max={8} value={paralelo} onChange={e => setParalelo(Math.max(1, Number(e.target.value)))} style={{ ...input, width: 90 }} />
        </Campo>
        <div style={{ display: 'flex', gap: 14, marginLeft: 'auto' }}>
          <Kpi label="TAKT" valor={`${taktPromedio(iwps)} d`} nota="por IWP" />
          <Kpi label="PLAZO TOTAL" valor={`${Math.round(span) + 1} d`} nota={fechas.length ? `${fechaCorta(fechas[0].fecha_inicio_plan)} → ${fechaCorta(fechas[fechas.length - 1].fecha_fin_plan)}` : ''} />
        </div>
      </div>

      {/* Línea de balance: cada IWP es un tramo; la pendiente del conjunto es el ritmo real. */}
      <div style={{ border: '1px solid #EEEEEE', borderRadius: 10, padding: 10, marginBottom: 14, overflowX: 'auto' }}>
        <div style={{ fontSize: 9.5, fontWeight: 900, color: '#757575', textTransform: 'uppercase', marginBottom: 6 }}>
          Línea de balance · secuencia de ejecución
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 460, height: H }}>
          {iwps.map((iwp, i) => {
            const f = fechas[i];
            if (!f) return null;
            const x1 = (dia(f.fecha_inicio_plan) / span) * (W - 60) + 30;
            const x2 = (dia(f.fecha_fin_plan) / span) * (W - 60) + 30;
            const y = 12 + i * 13;
            const excede = iwp.dias > turno.dias_trabajo;
            return (
              <g key={iwp.secuencia}>
                <line x1={30} y1={y} x2={W - 30} y2={y} stroke="#F5F5F5" strokeWidth={1} />
                <line x1={x1} y1={y} x2={Math.max(x2, x1 + 2)} y2={y} stroke={excede ? '#B45309' : ROJO} strokeWidth={6} strokeLinecap="round" />
                <text x={4} y={y + 3} fontSize={7} fill="#9E9E9E">{iwp.secuencia}</text>
                <text x={Math.max(x2, x1 + 2) + 5} y={y + 3} fontSize={7} fill="#757575">{Math.round(iwp.hh)} HH</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 900, color: '#1A1A1A', marginBottom: 6 }}>
        Alcance y límites de batería
      </div>
      <div style={{ fontSize: 10, color: '#757575', marginBottom: 8 }}>
        Paso 5 de la rutina: dejar por escrito hasta dónde llega cada paquete, para que dos cuadrillas no se pisen en el mismo frente.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {iwps.map((iwp, i) => (
          <div key={iwp.secuencia} style={{ border: '1px solid #EEEEEE', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 9.5, fontWeight: 900, color: '#9E9E9E', width: 18 }}>{iwp.secuencia}</span>
              <input value={overrides[iwp.secuencia]?.nombre ?? iwp.nombre} onChange={e => set(iwp.secuencia, 'nombre', e.target.value)}
                style={{ ...input, flex: 1, fontWeight: 700 }} />
              <span style={{ fontSize: 9.5, color: '#757575', whiteSpace: 'nowrap' }}>
                {fechas[i] ? `${fechaCorta(fechas[i].fecha_inicio_plan)} → ${fechaCorta(fechas[i].fecha_fin_plan)}` : '—'} · {num(iwp.hh)} HH
              </span>
            </div>
            <input value={overrides[iwp.secuencia]?.limites ?? iwp.limites_bateria} onChange={e => set(iwp.secuencia, 'limites', e.target.value)}
              placeholder="Límites de batería…" style={{ ...input, fontSize: 10, color: '#33475B' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Paso 4 · Restricciones y confirmación ───────────────────────────────────

function PasoRestricciones({ sugeridas, sel, setSel, nIwp, hhTotal, data, cuadrilla, turno, fechas }: {
  sugeridas: Sugerida[]; sel: Set<number>; setSel: (s: Set<number>) => void;
  nIwp: number; hhTotal: number; data: BancoResp;
  cuadrilla: Cuadrilla | null; turno: Turno | null;
  fechas: { fecha_inicio_plan: string; fecha_fin_plan: string }[];
}) {
  const toggle = (i: number) => {
    const n = new Set(sel);
    if (n.has(i)) n.delete(i); else n.add(i);
    setSel(n);
  };
  const saldoPost = data.totales.hh_saldo - hhTotal;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 900, color: '#1A1A1A', marginBottom: 4 }}>
          Restricciones que los departamentos ya declararon ({sugeridas.length})
        </div>
        <div style={{ fontSize: 10, color: '#757575', marginBottom: 10, lineHeight: 1.4 }}>
          Vienen del CWP, así que se copian a cada IWP nuevo. La rutina de 6WLA las va despejando semana a semana antes de que el paquete se pueda liberar a terreno.
        </div>

        {sugeridas.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 10, backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', fontSize: 11, color: '#166534' }}>
            <CheckCircle2 style={{ width: 15, height: 15 }} />
            Ningún departamento tiene restricciones abiertas sobre este CWP.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sugeridas.map((s, i) => (
              <label key={i} style={{ display: 'flex', gap: 8, padding: '9px 11px', borderRadius: 8, cursor: 'pointer', border: sel.has(i) ? '1px solid #FDE68A' : '1px solid #F3F4F6', backgroundColor: sel.has(i) ? '#FFFBEB' : 'white' }}>
                <input type="checkbox" checked={sel.has(i)} onChange={() => toggle(i)} style={{ accentColor: ROJO, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 8.5, fontWeight: 900, padding: '1px 6px', borderRadius: 999, backgroundColor: '#F3F4F6', color: '#374151' }}>{s.tipo}</span>
                    <span style={{ fontSize: 9.5, color: '#757575' }}>{s.origen}</span>
                    {s.fecha_necesaria && <span style={{ fontSize: 9.5, color: '#B45309', marginLeft: 'auto' }}>vence {fechaCorta(s.fecha_necesaria.slice(0, 10))}</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#33475B', marginTop: 3 }}>{s.descripcion}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ borderRadius: 12, border: '2px solid #EEEEEE', padding: 14, alignSelf: 'start' }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: '#757575', textTransform: 'uppercase', marginBottom: 10 }}>Resumen de la apertura</div>
        {[
          ['IWP a crear', String(nIwp)],
          ['HH aperturadas', num(hhTotal)],
          ['Cuadrilla', cuadrilla ? `${cuadrilla.codigo} · ${cuadrilla.n_personas}p` : '—'],
          ['Turno', turno ? `${turno.codigo} · ${turno.horas_dia} h` : '—'],
          ['Ventana', fechas.length ? `${fechaCorta(fechas[0].fecha_inicio_plan)} → ${fechaCorta(fechas[fechas.length - 1].fecha_fin_plan)}` : '—'],
          ['Restricciones por IWP', String(sel.size)],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid #F5F5F5', fontSize: 10.5 }}>
            <span style={{ color: '#757575' }}>{k}</span>
            <span style={{ fontWeight: 800, color: '#1A1A1A' }}>{v}</span>
          </div>
        ))}
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, backgroundColor: saldoPost > 0 ? '#FFFBEB' : '#F0FDF4', border: `1px solid ${saldoPost > 0 ? '#FDE68A' : '#BBF7D0'}` }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: saldoPost > 0 ? '#92400E' : '#166534' }}>SALDO DEL CWP DESPUÉS</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#1A1A1A' }}>{num(Math.max(0, saldoPost))} HH</div>
          <div style={{ fontSize: 9.5, color: saldoPost > 0 ? '#92400E' : '#166534' }}>
            {saldoPost > 0 ? 'Queda alcance por aperturar en una próxima sesión.' : 'El CWP queda completamente aperturado.'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Piezas compartidas ──────────────────────────────────────────────────────

const input: React.CSSProperties = {
  display: 'block', width: '100%', padding: '7px 9px', fontSize: 11,
  border: '1px solid #E5E7EB', borderRadius: 8, outline: 'none', backgroundColor: 'white',
};
const btnPri: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 11,
  fontWeight: 800, backgroundColor: ROJO, color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer',
};
const btnSec: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 14px', fontSize: 11,
  fontWeight: 700, backgroundColor: 'white', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 10, cursor: 'pointer',
};

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 9.5, fontWeight: 900, color: '#757575', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

function Kpi({ label, valor, nota, color }: { label: string; valor: string; nota?: string; color?: string }) {
  return (
    <div style={{ borderRadius: 10, border: '1px solid #EEEEEE', padding: '8px 11px' }}>
      <div style={{ fontSize: 8.5, fontWeight: 900, color: '#757575' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: color ?? '#1A1A1A', marginTop: 2 }}>{valor}</div>
      {nota && <div style={{ fontSize: 8.5, color: '#9E9E9E' }}>{nota}</div>}
    </div>
  );
}

function Aviso({ severidad, children }: { severidad: string; children: React.ReactNode }) {
  const estilo = severidad === 'bloqueo'
    ? { bg: '#FEF2F2', bd: '#FECACA', fg: '#991B1B', Icono: AlertTriangle }
    : severidad === 'aviso'
      ? { bg: '#FFFBEB', bd: '#FDE68A', fg: '#92400E', Icono: AlertTriangle }
      : { bg: '#EFF6FF', bd: '#BFDBFE', fg: '#1E40AF', Icono: Info };
  const { Icono } = estilo;
  return (
    <div style={{ display: 'flex', gap: 8, padding: '8px 11px', marginBottom: 8, borderRadius: 8, backgroundColor: estilo.bg, border: `1px solid ${estilo.bd}`, fontSize: 10.5, color: estilo.fg, lineHeight: 1.4 }}>
      <Icono style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}
