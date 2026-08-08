'use client';

// Sala de Apertura — la pantalla que contesta «¿qué CWP quiebro esta semana?».
//
// El motor de apertura ya existía y funcionaba, pero para llegar a él había que saber de
// antemano qué CWP tocaba: entrar a Minería, encontrarlo entre setenta y cuatro, abrir su
// pestaña IWP y recién ahí ver el botón. Por eso el proyecto tenía 98 CWP aperturables y
// ninguno aperturado.
//
// Acá la lista viene ordenada por urgencia real (fecha de inicio, ruta crítica, saldo), cada
// fila dice si se puede aperturar y —cuando no— qué falta exactamente y dónde arreglarlo. El
// asistente se abre desde la misma fila: un clic desde la entrada al proyecto.

import { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, Split, AlertTriangle, CheckCircle2, Search, ArrowRight,
  Layers, CalendarClock, ShieldAlert, Boxes,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colorDisciplina } from '@/lib/disciplinas';

const ROJO = '#FF0000';
/** La meta del estándar COAA: cuatro semanas de backlog libre de restricciones. */
const META_BACKLOG_SEMANAS = 4;

const num = (v: number | null | undefined, dec = 0) =>
  v == null ? '—' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: dec });

interface Bloqueo { codigo: string; mensaje: string; severidad: 'bloqueo' | 'aviso'; destino?: string }

interface FilaCwp {
  cwp_id: string; nombre: string | null; cwa: string | null; disciplina: string | null;
  disciplina_cod: string | null; fecha_ini: string | null; dias_para_inicio: number | null;
  ruta_critica: boolean; hh_banco: number; hh_asignadas: number; hh_saldo: number;
  pct_aperturado: number; n_partidas: number; n_sin_rendimiento: number;
  n_planos: number; n_elementos: number; n_iwp: number; n_iwp_listos: number;
  n_docs: number; n_docs_ifc: number;
  aperturable: boolean; bloqueos: Bloqueo[];
}

interface Resumen {
  n_cwp: number; n_aperturables: number; n_bloqueados: number; n_completos: number;
  hh_banco: number; hh_aperturadas: number; pct_aperturado: number;
  n_iwp: number; por_estado: Record<string, number>;
  hh_backlog: number; semanas_backlog: number | null; hh_semana_capacidad: number;
  n_cuadrillas: number; iwp_en_riesgo: number;
  n_docs: number; n_docs_ifc: number; n_cwp_con_ifc: number;
}

type Filtro = 'listos' | 'bloqueados' | 'todos';

// `useSearchParams` obliga a una frontera de Suspense: sin ella, el prerender de la ruta
// falla al construir. La sala real va adentro.
export default function SalaAperturaPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center gap-2 pt-24 text-[13px] text-[#757575]">
        <Loader2 className="w-4 h-4 animate-spin text-[#FF0000]" /> Cargando…
      </div>
    }>
      <SalaApertura />
    </Suspense>
  );
}

function SalaApertura() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.project_id as string;
  const orgSlug = params.org_slug as string;
  const base = `/${orgSlug}/projects/${projectId}`;

  const [data, setData] = useState<{ resumen: Resumen; cwps: FilaCwp[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('listos');
  const [busca, setBusca] = useState('');

  // La Mesa vuelve acá tras publicar y lo cuenta por la URL.
  const publicados = Number(searchParams.get('publicado') ?? 0);
  const aviso = publicados > 0
    ? `${publicados} IWP publicados. Ya entran al backlog; despeja sus restricciones para poder liberarlos a terreno.`
    : null;

  const cargar = useCallback(() => {
    fetch(`/api/mining-apertura?project_id=${projectId}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(d => { setData(d); setError(null); })
      .catch(e => setError(String(e.message ?? e)));
  }, [projectId]);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => {
    if (!data) return [];
    const q = busca.trim().toLowerCase();
    return data.cwps.filter(c => {
      if (filtro === 'listos' && (!c.aperturable || c.hh_saldo <= 1)) return false;
      if (filtro === 'bloqueados' && c.aperturable) return false;
      if (!q) return true;
      return `${c.cwp_id} ${c.nombre ?? ''} ${c.disciplina ?? ''} ${c.cwa ?? ''}`.toLowerCase().includes(q);
    });
  }, [data, filtro, busca]);

  if (error) return <div className="p-8 text-[13px] text-[#A00000]">{error}</div>;
  if (!data) return (
    <div className="flex items-center justify-center gap-2 pt-24 text-[13px] text-[#757575]">
      <Loader2 className="w-4 h-4 animate-spin text-[#FF0000]" /> Levantando el banco de cantidades del proyecto…
    </div>
  );

  const r = data.resumen;
  const sinCuadrillas = r.n_cuadrillas === 0;

  return (
    <div className="max-w-[1500px] mx-auto pb-16">
      <div className="mb-4">
        <h1 className="text-[22px] font-bold text-[#1A1A1A]">
          SALA DE <span className="text-[#FF0000]">APERTURA</span>
        </h1>
        <p className="text-[11.5px] text-[#757575]">
          Qué CWP quebrar en IWP esta semana, en qué orden, y qué falta en los que todavía no se puede.
        </p>
      </div>

      {/* ── Los cuatro números del WorkFace Planning ── */}
      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
        <Kpi
          icon={Layers} label="Alcance aperturado"
          valor={`${r.pct_aperturado}%`}
          nota={`${num(r.hh_aperturadas)} de ${num(r.hh_banco)} HH del banco`}
          barra={r.pct_aperturado}
          tono={r.pct_aperturado >= 60 ? 'ok' : r.pct_aperturado > 0 ? 'warn' : 'crit'}
        />
        <Kpi
          icon={Boxes} label="Backlog constraint-free"
          valor={r.semanas_backlog == null ? '—' : `${r.semanas_backlog} sem`}
          nota={r.semanas_backlog == null
            ? 'Sin cuadrillas no hay con qué medirlo'
            : `${num(r.hh_backlog)} HH listas · meta ${META_BACKLOG_SEMANAS} semanas (COAA)`}
          barra={r.semanas_backlog == null ? 0 : Math.min(100, (r.semanas_backlog / META_BACKLOG_SEMANAS) * 100)}
          tono={r.semanas_backlog == null ? 'crit' : r.semanas_backlog >= META_BACKLOG_SEMANAS ? 'ok' : r.semanas_backlog > 0 ? 'warn' : 'crit'}
        />
        <Kpi
          icon={ShieldAlert} label="IWP en riesgo"
          valor={num(r.iwp_en_riesgo)}
          nota="Parten en menos de 14 días con restricciones abiertas"
          tono={r.iwp_en_riesgo === 0 ? 'ok' : 'crit'}
        />
        <Kpi
          icon={CalendarClock} label="CWP por aperturar"
          valor={num(r.n_aperturables)}
          nota={`${num(r.n_completos)} completos · ${num(r.n_bloqueados)} bloqueados · ${num(r.n_cwp)} en total`}
          tono={r.n_aperturables > 0 ? 'warn' : 'ok'}
        />
      </div>

      {sinCuadrillas && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[#FECACA] bg-[#FEF2F2] px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-[#FF0000] shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-[#991B1B] leading-relaxed">
            <b>Este proyecto no tiene cuadrillas activas.</b> El tamaño de un IWP sale de la capacidad de una
            cuadrilla en un ciclo de turno, así que sin catálogo de cuadrillas no hay con qué dimensionar nada.
            {' '}
            <Link href={`${base}/recursos/cuadrillas`} className="font-black underline underline-offset-2">
              Crear cuadrillas →
            </Link>
          </div>
        </div>
      )}

      {/* Sin ingeniería emitida para construcción no hay paquete liberable, por regla COAA. Se avisa
          arriba y no en cada fila porque cuando pasa, pasa en todo el proyecto a la vez. */}
      {r.n_docs > 0 && r.n_docs_ifc === 0 && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-[#EA580C] shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-[#9A3412] leading-relaxed">
            <b>Ningún documento está emitido para construcción.</b> Los {num(r.n_docs)} documentos vinculados
            a CWP están en revisión o emisión interna. Se puede aperturar para planificar, pero
            ningún IWP se va a poder liberar hasta que llegue ingeniería IFC.
            {' '}
            <Link href={`${base}/mineria/documentos`} className="font-black underline underline-offset-2">
              Ver documentos →
            </Link>
          </div>
        </div>
      )}

      {aviso && (
        <div className="flex items-center gap-2 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-2.5 mb-4 text-[11.5px] text-[#166534]">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {aviso}
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {([
          ['listos', `Por aperturar (${r.n_aperturables})`],
          ['bloqueados', `Bloqueados (${r.n_bloqueados})`],
          ['todos', `Todos (${r.n_cwp})`],
        ] as [Filtro, string][]).map(([id, label]) => (
          <button
            key={id} onClick={() => setFiltro(id)}
            className={cn(
              'px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide transition',
              filtro === id
                ? 'bg-[#FF0000] text-white shadow-[0_2px_10px_rgba(255,0,0,0.3)]'
                : 'text-[#757575] hover:text-[#A00000] hover:bg-red-50 border border-[#EEEEEE]',
            )}
          >
            {label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="w-3.5 h-3.5 text-[#BDBDBD] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar CWP, disciplina o CWA…"
            className="pl-9 pr-3 py-2 text-[11.5px] border border-[#EEEEEE] rounded-full w-[280px] outline-none focus:border-[#FECACA]"
          />
        </div>
      </div>

      {/* ── El ranking ── */}
      <div className="rounded-xl border-2 border-[#EEEEEE] overflow-hidden bg-white">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#FAFAFA] text-left">
              {['CWP', 'Inicio', 'Banco', 'Apertura', 'Saldo', 'Estado', ''].map((h, i) => (
                <th key={i} className={cn(
                  'px-3 py-2 text-[9px] font-black uppercase tracking-wide text-[#757575] border-b border-[#EEEEEE]',
                  i >= 2 && i <= 4 && 'text-right',
                )}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map(c => (
              <FilaApertura key={c.cwp_id} c={c} base={base} />
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <div className="py-14 text-center text-[12px] text-[#9E9E9E] italic">
            {filtro === 'listos'
              ? 'No queda ningún CWP por aperturar con los datos actuales. Revisa los bloqueados.'
              : 'Sin CWP para este filtro.'}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Fila del ranking ────────────────────────────────────────────────────────

function FilaApertura({ c, base }: { c: FilaCwp; base: string }) {
  const [abierto, setAbierto] = useState(false);
  const bloqueos = c.bloqueos.filter(b => b.severidad === 'bloqueo');
  const avisos = c.bloqueos.filter(b => b.severidad === 'aviso');
  const completo = c.hh_banco > 0 && c.hh_saldo <= 1;

  const urgente = c.dias_para_inicio != null && c.dias_para_inicio <= 30;
  const atrasado = c.dias_para_inicio != null && c.dias_para_inicio < 0;

  return (
    <>
      <tr
        className={cn('border-b border-[#F5F5F5] hover:bg-red-50/40 transition', abierto && 'bg-red-50/30')}
        onClick={() => setAbierto(v => !v)}
        style={{ cursor: 'pointer' }}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            {c.disciplina_cod && (
              <span
                className="min-w-[24px] text-center rounded px-1.5 py-0.5 text-white text-[9px] font-extrabold shrink-0"
                style={{ backgroundColor: colorDisciplina(c.disciplina_cod) }}
              >
                {c.disciplina_cod}
              </span>
            )}
            <div className="min-w-0">
              <div className="font-mono font-extrabold text-[11px] text-[#1A1A1A] flex items-center gap-1.5">
                {c.cwp_id}
                {c.ruta_critica && (
                  <span title="En ruta crítica del programa" className="text-[8px] font-black px-1.5 py-px rounded-full bg-[#FEE2E2] text-[#A00000]">
                    RC
                  </span>
                )}
              </div>
              <div className="text-[10px] text-[#9E9E9E] truncate max-w-[320px]">{c.nombre ?? '—'}</div>
            </div>
          </div>
        </td>

        <td className="px-3 py-2.5 whitespace-nowrap">
          {c.dias_para_inicio == null ? (
            <span className="text-[10px] text-[#BDBDBD]">sin fecha</span>
          ) : (
            <span className={cn(
              'text-[10.5px] font-bold',
              atrasado ? 'text-[#A00000]' : urgente ? 'text-[#B45309]' : 'text-[#757575]',
            )}>
              {atrasado ? `${Math.abs(c.dias_para_inicio)} d atrás` : `en ${c.dias_para_inicio} d`}
            </span>
          )}
        </td>

        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          <b className="text-[11px] text-[#1A1A1A]">{num(c.hh_banco)}</b>
          <span className="text-[9px] text-[#BDBDBD]"> HH</span>
          <div className="text-[9px] text-[#BDBDBD]">{c.n_partidas} partidas</div>
        </td>

        <td className="px-3 py-2.5 w-[130px]">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[#F0F0F0] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, c.pct_aperturado)}%`,
                  backgroundColor: c.pct_aperturado >= 99 ? '#16A34A' : ROJO,
                }}
              />
            </div>
            <span className="text-[9.5px] font-black text-[#1A1A1A] w-9 text-right">{c.pct_aperturado}%</span>
          </div>
          <div className="text-[9px] text-[#BDBDBD] mt-0.5">
            {c.n_iwp} IWP{c.n_iwp_listos > 0 && ` · ${c.n_iwp_listos} listos`}
          </div>
        </td>

        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          <b className={cn('text-[11px]', completo ? 'text-[#16A34A]' : 'text-[#1A1A1A]')}>{num(c.hh_saldo)}</b>
          <span className="text-[9px] text-[#BDBDBD]"> HH</span>
        </td>

        <td className="px-3 py-2.5">
          <Semaforo bloqueos={bloqueos.length} avisos={avisos.length} completo={completo} />
        </td>

        <td className="px-3 py-2.5 text-right">
          {c.aperturable && !completo ? (
            <Link
              href={`${base}/mineria/apertura/${encodeURIComponent(c.cwp_id)}`}
              onClick={e => e.stopPropagation()}
              title="Abrir la Mesa de Trabajo de este CWP"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#FF0000] text-white text-[10.5px] font-black hover:brightness-110 transition whitespace-nowrap"
            >
              <Split className="w-3 h-3" /> Aperturar
            </Link>
          ) : (
            <Link
              href={`${base}/mineria/apertura/${encodeURIComponent(c.cwp_id)}`}
              onClick={e => e.stopPropagation()}
              className="text-[10px] text-[#BDBDBD] hover:text-[#FF0000] transition"
            >
              {completo ? 'Ver mesa' : 'Bloqueado'}
            </Link>
          )}
        </td>
      </tr>

      {abierto && (
        <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE]">
          <td colSpan={7} className="px-4 py-3">
            {c.bloqueos.length === 0 ? (
              <div className="flex items-center gap-2 text-[11px] text-[#166534]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Sin observaciones: el banco está completo, tiene planos y elementos en el modelo.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {c.bloqueos.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10.5px] leading-relaxed">
                    <span className={cn(
                      'text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0 mt-px',
                      b.severidad === 'bloqueo' ? 'bg-[#FEE2E2] text-[#A00000]' : 'bg-[#FEF3C7] text-[#B45309]',
                    )}>
                      {b.severidad === 'bloqueo' ? 'BLOQUEA' : 'AVISO'}
                    </span>
                    <span className="text-[#33475B]">{b.mensaje}</span>
                    {b.destino && (
                      <Link
                        href={`${base}/${b.destino}`}
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[#FF0000] font-black shrink-0 hover:underline"
                      >
                        Arreglar <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-4 mt-2.5 pt-2.5 border-t border-[#EEEEEE] text-[9.5px] text-[#9E9E9E]">
              <span>{c.n_planos} planos</span>
              <span>{c.n_elementos} elementos en el modelo</span>
              {c.cwa && <span>CWA {c.cwa}</span>}
              <Link
                href={`${base}/mineria?cwp=${encodeURIComponent(c.cwp_id)}`}
                onClick={e => e.stopPropagation()}
                className="ml-auto text-[#FF0000] font-black hover:underline"
              >
                Ver el CWP en el explorador →
              </Link>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

function Semaforo({ bloqueos, avisos, completo }: { bloqueos: number; avisos: number; completo: boolean }) {
  if (completo) return <Chip color="#16A34A" fondo="#ECFDF5" texto="#047857">Aperturado</Chip>;
  if (bloqueos > 0) return <Chip color={ROJO} fondo="#FEF2F2" texto="#991B1B">{bloqueos} bloqueo{bloqueos > 1 ? 's' : ''}</Chip>;
  if (avisos > 0) return <Chip color="#F59E0B" fondo="#FFFBEB" texto="#92400E">{avisos} aviso{avisos > 1 ? 's' : ''}</Chip>;
  return <Chip color="#16A34A" fondo="#ECFDF5" texto="#047857">Listo</Chip>;
}

function Chip({ color, fondo, texto, children }: { color: string; fondo: string; texto: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] font-black whitespace-nowrap"
      style={{ backgroundColor: fondo, color: texto }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {children}
    </span>
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
      <div className="text-[21px] font-black leading-none" style={{ color: '#1A1A1A' }}>{valor}</div>
      {barra != null && (
        <div className="h-1.5 rounded-full bg-[#F0F0F0] overflow-hidden mt-2">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, barra)}%`, backgroundColor: color }} />
        </div>
      )}
      <div className="text-[9.5px] text-[#9E9E9E] mt-1.5 leading-snug">{nota}</div>
    </div>
  );
}
