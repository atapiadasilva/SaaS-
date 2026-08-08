'use client';

// Conformidad BIM — el modelo del proyecto medido contra el Anexo 7.
//
// La Guía de consulta práctica BIM–AWP (Codelco VP + Hoja de Ruta BIM CChC, julio 2026) fija qué
// atributos debe traer cada elemento del modelo y en qué etapa. Es la tabla con la que un mandante
// evalúa la entrega. Hasta ahora esa revisión se hacía a mano, exportando el modelo a Excel y
// contando; acá sale de `mining_elementos`, que ya está cargada.
//
// La pantalla separa dos preguntas que se confunden todo el tiempo:
//   · «¿está lleno el dato?» → lo arregla el modelador, y es el % de cobertura de cada atributo.
//   · «¿tenemos dónde guardarlo?» → lo arregla la plataforma, y es el conteo de brecha del catálogo.
// Mezclarlas produce el peor informe posible: uno que dice 100% porque sólo mide lo que ya guarda.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, ClipboardCheck, Database, Layers, AlertTriangle, ArrowLeft, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ETAPAS, ETAPA_META, HITOS_AVANCE_MODELO, NIVELES_INFORMACION,
  type Etapa, type EstadoAtributo, type TipoDato,
} from '@/lib/atributos-bim';

const ROJO = '#FF0000';
const ETAPA_STORAGE_KEY = 'mineria-atributos-etapa-v1';

const num = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: 0 });

interface AtributoApi {
  clave: string; descripcion: string; tipo: TipoDato; etapas: Etapa[];
  exigido: boolean; estado: EstadoAtributo;
  columna: string | null; propuesta: string | null; nota: string | null;
  n_con_dato: number | null; pct: number | null; error: string | null;
}

interface GrupoApi {
  clave: string; label: string; disciplinar: boolean;
  n_exigidos: number; n_capturados: number; n_propuestos: number; n_no_capturados: number;
  pct_medible: number | null;
  atributos: AtributoApi[];
}

interface Respuesta {
  etapa: Etapa; disciplina: string | null; columna_disciplina: string;
  /** `conteos` = la función SQL del script 08 todavía no está aplicada. */
  via: 'rpc' | 'conteos';
  disciplinas: { valor: string; n: number }[];
  universo: number; total_proyecto: number;
  resumen: {
    n_exigidos: number; n_capturados: number; n_propuestos: number; n_no_capturados: number;
    pct_medible: number | null; pct_cobertura_catalogo: number;
  };
  grupos: GrupoApi[];
}

export default function ConformidadBimPage() {
  const params = useParams();
  const projectId = params.project_id as string;
  const orgSlug = params.org_slug as string;
  const base = `/${orgSlug}/projects/${projectId}`;

  const [etapa, setEtapa] = useState<Etapa>('CONSTRUCCION');
  const [disciplina, setDisciplina] = useState('');
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verReferencia, setVerReferencia] = useState(false);

  // La etapa del Anexo 7 (FEL2/FEL3/detalle/construcción) es un eje distinto al `stage` del
  // proyecto, que es contractual (licitación/operación/cierre). Mientras no exista la columna en la
  // base, la elección vive en el navegador: es una preferencia de lectura, no un dato del proyecto.
  useEffect(() => {
    const guardada = localStorage.getItem(ETAPA_STORAGE_KEY);
    if (guardada && (ETAPAS as readonly string[]).includes(guardada)) setEtapa(guardada as Etapa);
  }, []);

  const cargar = useCallback(() => {
    setCargando(true);
    const qs = new URLSearchParams({ project_id: projectId, etapa });
    if (disciplina) qs.set('disciplina', disciplina);
    fetch(`/api/mining-atributos-bim?${qs}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then((d: Respuesta) => { setData(d); setError(null); })
      .catch(e => setError(String(e.message ?? e)))
      .finally(() => setCargando(false));
  }, [projectId, etapa, disciplina]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarEtapa = (e: Etapa) => {
    setEtapa(e);
    localStorage.setItem(ETAPA_STORAGE_KEY, e);
  };

  // Los grupos disciplinares sólo tienen sentido leídos sobre su propia disciplina. Sin filtro, un
  // "12% de cañerías con diámetro" es en realidad "12% del modelo completo son cañerías" y no dice
  // nada del cumplimiento. Se muestran igual, pero avisados.
  const grupos = useMemo(() => data?.grupos.filter(g => g.n_exigidos > 0) ?? [], [data]);

  if (error) return <div className="p-8 text-[13px] text-[#A00000]">{error}</div>;
  if (!data) return (
    <div className="flex items-center justify-center gap-2 pt-24 text-[13px] text-[#757575]">
      <Loader2 className="w-4 h-4 animate-spin text-[#FF0000]" /> Midiendo los atributos del modelo…
    </div>
  );

  const r = data.resumen;
  const sinModelo = data.total_proyecto === 0;

  return (
    <div className="max-w-[1500px] mx-auto pb-16">
      <div className="mb-4 flex items-start gap-4">
        <div>
          <Link href={`${base}/mineria/elementos`} className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-[#757575] hover:text-[#A00000] mb-1">
            <ArrowLeft className="w-3 h-3" /> Elementos
          </Link>
          <h1 className="text-[22px] font-bold text-[#1A1A1A]">
            CONFORMIDAD <span className="text-[#FF0000]">BIM</span>
          </h1>
          <p className="text-[11.5px] text-[#757575]">
            El modelo medido contra la tabla de atributos del Anexo 7 — Guía de consulta práctica BIM AWP,
            Codelco VP + Hoja de Ruta BIM CChC, julio 2026.
          </p>
        </div>
        <button
          onClick={() => setVerReferencia(v => !v)}
          className="ml-auto shrink-0 px-3 py-1.5 rounded-full border border-[#EEEEEE] bg-white hover:border-[#FF0000]/50 text-[10px] font-black uppercase tracking-wide text-[#757575] hover:text-[#A00000] transition flex items-center gap-1.5"
        >
          <Info className="w-3.5 h-3.5 text-[#FF0000]" /> {verReferencia ? 'Ocultar' : 'Ver'} NDI y estados
        </button>
      </div>

      {sinModelo && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[#FECACA] bg-[#FEF2F2] px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-[#FF0000] shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-[#991B1B] leading-relaxed">
            <b>Este proyecto no tiene elementos cargados.</b> La conformidad se mide sobre el modelo:
            sin elementos no hay nada que evaluar.
          </div>
        </div>
      )}

      {/* ── Las dos cifras que no hay que confundir ── */}
      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
        <Kpi
          icon={ClipboardCheck} label="Atributos exigidos"
          valor={num(r.n_exigidos)}
          nota={`${ETAPA_META[data.etapa].corto} · ${num(r.n_capturados)} los guarda Hilo hoy`}
          tono="ok"
        />
        <Kpi
          icon={Database} label="Cobertura del catálogo"
          valor={`${r.pct_cobertura_catalogo}%`}
          nota={`${num(r.n_propuestos)} con columna propuesta · ${num(r.n_no_capturados)} sin dónde guardarse`}
          barra={r.pct_cobertura_catalogo}
          tono={r.pct_cobertura_catalogo >= 70 ? 'ok' : r.pct_cobertura_catalogo >= 40 ? 'warn' : 'crit'}
        />
        <Kpi
          icon={Layers} label="Llenado del modelo"
          valor={r.pct_medible == null ? '—' : `${r.pct_medible}%`}
          nota="Promedio de los atributos que sí se pueden medir"
          barra={r.pct_medible ?? 0}
          tono={(r.pct_medible ?? 0) >= 80 ? 'ok' : (r.pct_medible ?? 0) >= 40 ? 'warn' : 'crit'}
        />
        <Kpi
          icon={Layers} label="Universo medido"
          valor={num(data.universo)}
          nota={data.disciplina
            ? `elementos de ${data.disciplina} · ${num(data.total_proyecto)} en el proyecto`
            : `elementos del modelo completo`}
          tono="ok"
        />
      </div>

      {/* ── Etapa y disciplina ── */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {ETAPAS.map(e => (
          <button
            key={e} onClick={() => cambiarEtapa(e)}
            title={ETAPA_META[e].descripcion}
            className={cn(
              'px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide transition',
              etapa === e
                ? 'bg-[#FF0000] text-white shadow-[0_2px_10px_rgba(255,0,0,0.3)]'
                : 'text-[#757575] hover:text-[#A00000] hover:bg-red-50 border border-[#EEEEEE]',
            )}
          >
            {ETAPA_META[e].corto}
          </button>
        ))}
        <select
          value={disciplina} onChange={e => setDisciplina(e.target.value)}
          className="ml-auto px-3 py-2 text-[11.5px] border border-[#EEEEEE] rounded-full outline-none focus:border-[#FECACA] bg-white text-[#33475B]"
        >
          <option value="">Modelo completo ({num(data.total_proyecto)})</option>
          {data.disciplinas.map(d => (
            <option key={d.valor} value={d.valor}>{d.valor} ({num(d.n)})</option>
          ))}
        </select>
      </div>
      <p className="text-[10.5px] text-[#9E9E9E] mb-4 leading-snug">
        {ETAPA_META[etapa].descripcion}
        {cargando && <span className="ml-2 text-[#FF0000] font-black">actualizando…</span>}
        {data.via === 'conteos' && !cargando && (
          <span className="ml-2 text-[#92400E]">
            · Contando columna por columna: aplica <code>scripts/sql/08-anexo7-atributos.sql</code> para
            que la agregación la resuelva la base y esto cargue al instante.
          </span>
        )}
      </p>

      {verReferencia && <Referencia />}

      {/* ── Los grupos del Anexo 7 ── */}
      <div className="space-y-3">
        {grupos.map(g => (
          <Grupo key={g.clave} g={g} filtrado={!!data.disciplina} universo={data.universo} />
        ))}
      </div>

      <p className="text-[10px] text-[#9E9E9E] mt-6 leading-relaxed max-w-[900px]">
        <b>Cómo leer esto.</b> «Guardado» es un atributo que ya tiene columna en <code>mining_elementos</code> y por
        eso se puede medir — que la columna exista no significa que el modelador la haya poblado:
        eso es el llenado. «Sin captura» no tiene dónde vivir todavía y es una decisión de
        proyecto: la guía dice que los atributos se acuerdan en el PEB de cada obra, no se copian
        completos. Los grupos por disciplina se miden sobre el subconjunto de esa especialidad —
        léelos con la disciplina filtrada o no significan nada.
      </p>
    </div>
  );
}

// ─── Grupo del catálogo ──────────────────────────────────────────────────────

function Grupo({ g, filtrado, universo }: { g: GrupoApi; filtrado: boolean; universo: number }) {
  const [abierto, setAbierto] = useState(false);
  const exigidos = g.atributos.filter(a => a.exigido);

  return (
    <div className="rounded-xl border-2 border-[#EEEEEE] bg-white overflow-hidden">
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAFA] transition text-left"
      >
        <span className="text-[12.5px] font-black text-[#1A1A1A] uppercase tracking-wide">{g.label}</span>
        {g.disciplinar && !filtrado && (
          <span className="text-[9px] font-black uppercase tracking-wide text-[#92400E] bg-[#FFFBEB] px-2 py-0.5 rounded-full">
            Filtra por disciplina
          </span>
        )}
        <span className="text-[10px] text-[#9E9E9E]">
          {exigidos.length} exigidos · {g.n_capturados} guardados · {g.n_propuestos} propuestos · {g.n_no_capturados} sin captura
        </span>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {g.pct_medible != null && <Barra pct={g.pct_medible} />}
          <span className="text-[10px] font-black text-[#757575]">{abierto ? '−' : '+'}</span>
        </div>
      </button>

      {abierto && (
        <table className="w-full border-collapse text-[11px] border-t border-[#EEEEEE]">
          <thead>
            <tr className="bg-[#FAFAFA] text-left">
              {['Atributo', 'Descripción', 'Tipo', 'Dónde vive en Hilo', 'Con dato'].map((h, i) => (
                <th key={i} className={cn(
                  'px-3 py-2 text-[9px] font-black uppercase tracking-wide text-[#757575] border-b border-[#EEEEEE]',
                  i === 4 && 'text-right',
                )}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exigidos.map(a => (
              <tr key={a.clave} className="border-b border-[#F5F5F5] last:border-0 align-top">
                <td className="px-3 py-2 font-black text-[#1A1A1A] whitespace-nowrap">{a.clave}</td>
                <td className="px-3 py-2 text-[#616161] leading-snug max-w-[420px]">
                  {a.descripcion}
                  {a.nota && (
                    <div className="text-[9.5px] text-[#9E9E9E] italic mt-0.5 leading-snug">{a.nota}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-[#9E9E9E] whitespace-nowrap">{a.tipo}</td>
                <td className="px-3 py-2 whitespace-nowrap"><Origen a={a} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {a.error
                    ? <span className="text-[9.5px] text-[#A00000]">error</span>
                    : a.pct == null
                      ? <span className="text-[#BDBDBD]">—</span>
                      : (
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-[9.5px] text-[#9E9E9E]">{num(a.n_con_dato)} / {num(universo)}</span>
                          <Barra pct={a.pct} />
                        </div>
                      )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Origen({ a }: { a: AtributoApi }) {
  if (a.estado === 'capturado') {
    return <code className="text-[10px] bg-[#ECFDF5] text-[#047857] px-1.5 py-0.5 rounded font-black">{a.columna}</code>;
  }
  if (a.estado === 'propuesto') {
    return <code className="text-[10px] bg-[#FFFBEB] text-[#92400E] px-1.5 py-0.5 rounded font-black">{a.propuesta}</code>;
  }
  return <span className="text-[10px] text-[#BDBDBD] italic">sin captura</span>;
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Barra({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#16A34A' : pct >= 40 ? '#F59E0B' : ROJO;
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className="h-1.5 w-[70px] rounded-full bg-[#F0F0F0] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
      </div>
      <span className="text-[9.5px] font-black w-[38px] text-right" style={{ color }}>{pct}%</span>
    </div>
  );
}

function Kpi({ icon: Icon, label, valor, nota, barra, tono }: {
  icon: React.ElementType; label: string; valor: string; nota: string;
  barra?: number; tono: 'ok' | 'warn' | 'crit';
}) {
  const color = tono === 'ok' ? '#16A34A' : tono === 'warn' ? '#F59E0B' : ROJO;
  return (
    <div className="rounded-xl border-2 border-[#EEEEEE] bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="text-[9px] font-black uppercase tracking-wide text-[#757575]">{label}</span>
      </div>
      <div className="text-[21px] font-black leading-none text-[#1A1A1A]">{valor}</div>
      {barra != null && (
        <div className="h-1.5 rounded-full bg-[#F0F0F0] overflow-hidden mt-2">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, barra)}%`, backgroundColor: color }} />
        </div>
      )}
      <div className="text-[9.5px] text-[#9E9E9E] mt-1.5 leading-snug">{nota}</div>
    </div>
  );
}

/** Los otros dos catálogos de la guía: se muestran como referencia, todavía no se miden. */
function Referencia() {
  return (
    <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
      <div className="rounded-xl border-2 border-[#EEEEEE] bg-white p-4">
        <h2 className="text-[11px] font-black uppercase tracking-wide text-[#1A1A1A] mb-1">Niveles de Información (NDI)</h2>
        <p className="text-[10px] text-[#9E9E9E] mb-2.5 leading-snug">
          El NDI es de la <b>entidad</b>, no del modelo: un mismo modelo alberga elementos con niveles
          distintos. Es el LOIN de la ISO 19650.
        </p>
        <table className="w-full border-collapse text-[10.5px]">
          <tbody>
            {NIVELES_INFORMACION.map(n => (
              <tr key={n.nivel} className="border-b border-[#F5F5F5] last:border-0">
                <td className="py-1.5 pr-2 font-black text-[#FF0000] whitespace-nowrap">{n.nivel}</td>
                <td className="py-1.5 pr-2 text-[#33475B]">{n.nombre}</td>
                <td className="py-1.5 pr-2 text-[#9E9E9E] whitespace-nowrap">{n.resumen}</td>
                <td className="py-1.5 text-[#9E9E9E] text-right whitespace-nowrap">{n.fase}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border-2 border-[#EEEEEE] bg-white p-4">
        <h2 className="text-[11px] font-black uppercase tracking-wide text-[#1A1A1A] mb-1">Estados de avance del modelo</h2>
        <p className="text-[10px] text-[#9E9E9E] mb-2.5 leading-snug">
          Once hitos que acumulan 100% <b>por disciplina</b>. Es un estado de pago de la ingeniería:
          misma mecánica de rules of credit que Hilo ya usa para el avance físico.
        </p>
        <table className="w-full border-collapse text-[10.5px]">
          <tbody>
            {HITOS_AVANCE_MODELO.map(h => (
              <tr key={`${h.estado}-${h.hito}`} className="border-b border-[#F5F5F5] last:border-0">
                <td className="py-1.5 pr-2 font-black text-[#FF0000] whitespace-nowrap">{h.estado}</td>
                <td className="py-1.5 pr-2 text-[#33475B] whitespace-nowrap">{h.hito}</td>
                <td className="py-1.5 pr-2 text-[#9E9E9E] text-right whitespace-nowrap">{h.pct}%</td>
                <td className="py-1.5 text-[#9E9E9E] text-right whitespace-nowrap">acum. {h.acumulado}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
