'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertTriangle, CheckCircle2, TrendingUp, FileText, Users, Truck, CalendarClock, Link2, Scale, Split, ArrowRight } from 'lucide-react';

// PANEL KPI — vista ejecutiva del contrato CC-06: economía, plazo, avance,
// integridad de datos (que todo calce), entregables clave, bloqueantes,
// compromisos contractuales, dotación e hitos.

const clp = (v: number | null | undefined) => v == null ? '—' : '$' + Math.round(v).toLocaleString('es-CL');
const clpMM = (v: number | null | undefined) => v == null ? '—' : '$' + (v / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ' MM';
const num = (v: number | null | undefined) => v == null ? '—' : Math.round(v).toLocaleString('es-CL');
const pct = (ok: number, total: number) => total ? Math.round(ok / total * 1000) / 10 : 0;
// Porcentaje presentable: sin base no hay porcentaje, y mostrar "NaN%" en un panel
// ejecutivo es peor que no mostrar nada.
const pctDe = (parte: number | null | undefined, base: number | null | undefined) =>
  base ? `${Math.round((Number(parte) / base) * 100)}%` : '—';

function parseFecha(s: string | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const Semaforo = ({ nivel }: { nivel: 'ok' | 'warn' | 'crit' }) => (
  <span style={{ width: 10, height: 10, borderRadius: 999, flexShrink: 0, display: 'inline-block', backgroundColor: nivel === 'ok' ? '#22C55E' : nivel === 'warn' ? '#FBBF24' : '#FF0000' }} />
);

const Card = ({ children, style }: any) => (
  <div style={{ borderRadius: 14, border: '2px solid #EEEEEE', backgroundColor: 'white', padding: '14px 16px', ...style }}>{children}</div>
);

const WfpCard = ({ label, valor, nota, barra, nivel }: {
  label: string; valor: string; nota: string; barra?: number; nivel: 'ok' | 'warn' | 'crit';
}) => {
  const color = nivel === 'ok' ? '#22C55E' : nivel === 'warn' ? '#FBBF24' : '#FF0000';
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Semaforo nivel={nivel} />
        <span style={{ fontSize: 9, fontWeight: 900, color: '#757575' }}>{label}</span>
      </div>
      <div style={{ fontSize: 21, fontWeight: 900, color: '#1A1A1A', marginTop: 2 }}>{valor}</div>
      {barra != null && (
        <div style={{ height: 5, borderRadius: 999, backgroundColor: '#F0F0F0', overflow: 'hidden', marginTop: 5 }}>
          <div style={{ height: '100%', width: `${Math.min(100, barra)}%`, backgroundColor: color, borderRadius: 999 }} />
        </div>
      )}
      <div style={{ fontSize: 9.5, color: '#9E9E9E', marginTop: 4 }}>{nota}</div>
    </Card>
  );
};

const SecTitle = ({ icon: Icon, children }: any) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '22px 0 10px' }}>
    <Icon style={{ width: 14, height: 14, color: '#FF0000' }} />
    <span style={{ fontSize: 12, fontWeight: 900, color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</span>
  </div>
);

export default function PanelPage() {
  const params = useParams();
  const projectId = params.project_id as string;
  const orgSlug = params.org_slug as string;
  const [d, setD] = useState<any | null>(null);
  const [wfp, setWfp] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/mining-kpi?project_id=${projectId}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j?.error); return j; })
      .then(setD)
      .catch(e => setError(e.message));
    // El pulso del WorkFace Planning va aparte: el panel no puede quedarse esperándolo, y si
    // el proyecto todavía no tiene banco de cantidades esta fila simplemente no aparece.
    fetch(`/api/mining-apertura?project_id=${projectId}`)
      .then(async r => (r.ok ? r.json() : null))
      .then(j => setWfp(j?.resumen ?? null))
      .catch(() => setWfp(null));
  }, [projectId]);

  const hoy = new Date();

  const plazo = useMemo(() => {
    if (!d) return null;
    const ini = parseFecha(d.contrato.inicio);
    const fin = parseFecha(d.contrato.fin);
    if (!ini || !fin) return null;
    const total = d.contrato.duracion_dias ?? Math.round((fin.getTime() - ini.getTime()) / 86400000);
    const dia = Math.max(0, Math.round((hoy.getTime() - ini.getTime()) / 86400000) + 1);
    return { dia, total, pct: Math.min(100, Math.round(dia / total * 1000) / 10) };
  }, [d]);

  // Observaciones abiertas del proyecto, derivadas de mining_consideraciones.
  // Antes esta lista estaba escrita a mano con los entregables de Collahuasi, así que
  // cualquier otro proyecto veía datos ajenos. Ahora sale de lo que está cargado.
  const entregables = useMemo(() => {
    if (!d) return [];
    const abiertas: any[] = d.consideraciones_abiertas ?? [];
    const nivelDe = (sev: string): 'ok' | 'warn' | 'crit' =>
      sev === 'BLOQUEANTE' ? 'crit' : sev === 'ADVERTENCIA' ? 'warn' : 'ok';
    // La deduplicación del feed diario vive en el servidor (lib/consideraciones), para que
    // el Panel y los dashboards de departamento cuenten el mismo hecho una sola vez.
    return abiertas
      .sort((a, b) => (a.severidad === 'BLOQUEANTE' ? -1 : 1) - (b.severidad === 'BLOQUEANTE' ? -1 : 1))
      .map(c => ({
        nombre: c.titulo ?? '(sin título)',
        estado: [c.tipo, c.estado].filter(Boolean).join(' · ') || 'Abierta',
        nivel: nivelDe(c.severidad),
        nota: [c.depto, c.cwp_id, c.fecha_limite && `límite ${c.fecha_limite}`].filter(Boolean).join(' · ') || undefined,
      }));
  }, [d]);

  const proximosHitos = useMemo(() => {
    if (!d) return [];
    return (d.contrato.hitos_programa ?? [])
      .map((h: any) => ({ ...h, f: parseFecha(h.fecha?.replace(/(\d{2})-(\w{3})-(\d{2})/, (_: string, dd: string, mm: string, yy: string) => {
        const M: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12', Abr: '04', Ago: '08', Ene: '01', Dic: '12' };
        return `${dd}-${M[mm] ?? '01'}-20${yy}`;
      }) ?? null) }))
      .filter((h: any) => h.f)
      .sort((a: any, b: any) => a.f.getTime() - b.f.getTime());
  }, [d]);

  if (error) return <div style={{ color: '#A00000', fontSize: 13, padding: 32 }}>{error}</div>;
  if (!d) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 96, color: '#757575', fontSize: 13 }}><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Consolidando KPIs…</div>;

  const it = d.integridad;
  const dot = d.dotacion ?? [];
  const ultDot = dot[dot.length - 1];
  const maxHd = Math.max(1, ...dot.map((x: any) => (Number(x.mod_hd) || 0) + (Number(x.moi_hd) || 0)));
  const relaciones = [
    { label: 'ECO-2 → CWP', ...it.conciliacion.eco2_cwp },
    { label: 'ECO-2 → BMP', ...it.conciliacion.eco2_bmp },
    { label: 'Programa → CWP', ...it.conciliacion.prog_cwp },
    { label: 'Aconex → CWP', ...it.conciliacion.aconex_cwp },
  ];
  const calceClp = it.ep_valor_contrato != null && Math.abs(it.eco2_clp - it.ep_valor_contrato) < 1000;

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', paddingBottom: 48 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontWeight: 'bold', fontSize: 22, color: '#1A1A1A' }}>PANEL <span style={{ color: '#FF0000' }}>KPI</span></h1>
        <p style={{ fontSize: 11.5, color: '#757575' }}>
          {(() => {
            const { codigo_externo: cod, nombre } = d.proyecto ?? {};
            // El nombre del proyecto suele venir ya con el código ("EIMI00413 - Andina"):
            // no lo repetimos delante.
            const titulo = nombre && cod && !nombre.includes(cod) ? `${cod} · ${nombre}` : (nombre || cod || 'Proyecto');
            return `${titulo} — vista ejecutiva consolidada.`;
          })()}
        </p>
      </div>

      {/* ── FILA 1: héroe económico/plazo/avance ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <Card><div style={{ fontSize: 9, fontWeight: 900, color: '#757575' }}>VALOR CONTRATO</div><div style={{ fontSize: 21, fontWeight: 900, color: '#1A1A1A' }}>{clpMM(d.contrato.valor_clp)}</div><div style={{ fontSize: 9.5, color: '#9E9E9E' }}>{num(it.eco2_hh)} HH · {num(d.proyecto?.n_items)} items ECO-2</div></Card>
        <Card><div style={{ fontSize: 9, fontWeight: 900, color: '#757575' }}>PLAZO</div>
          {plazo ? (<>
            <div style={{ fontSize: 21, fontWeight: 900, color: '#1A1A1A' }}>Día {plazo.dia} <span style={{ fontSize: 12, color: '#757575' }}>/ {plazo.total}</span></div>
            <div style={{ height: 5, borderRadius: 999, backgroundColor: '#F0F0F0', overflow: 'hidden', marginTop: 5 }}><div style={{ height: '100%', width: `${plazo.pct}%`, backgroundColor: '#FF0000', borderRadius: 999 }} /></div>
            <div style={{ fontSize: 9.5, color: '#9E9E9E', marginTop: 3 }}>{d.contrato.inicio} → {d.contrato.fin} ({plazo.pct}%)</div>
          </>) : (<>
            <div style={{ fontSize: 21, fontWeight: 900, color: '#BDBDBD' }}>—</div>
            <div style={{ fontSize: 9.5, color: '#9E9E9E', marginTop: 8 }}>Sin programa de construcción cargado</div>
          </>)}</Card>
        <Card><div style={{ fontSize: 9, fontWeight: 900, color: '#757575' }}>AVANCE FÍSICO (BMP)</div><div style={{ fontSize: 21, fontWeight: 900, color: d.avance.fisico_pct > 0 ? '#166534' : '#1A1A1A' }}>{d.avance.fisico_pct.toFixed(1)}%</div><div style={{ fontSize: 9.5, color: '#9E9E9E' }}>{d.avance.semanal ? `Semanal ${d.avance.semanal.corte ?? ''}: ${d.avance.semanal.real}% real / ${d.avance.semanal.plan}% plan` : 'Sin reporte semanal cargado'}</div></Card>
        <Card><div style={{ fontSize: 9, fontWeight: 900, color: '#757575' }}>MONTO GANADO</div><div style={{ fontSize: 21, fontWeight: 900, color: '#166534' }}>{clpMM(d.avance.financiero_clp)}</div><div style={{ fontSize: 9.5, color: '#9E9E9E' }}>{d.avance.financiero_pct.toFixed(2)}% del contrato</div></Card>
        <Card><div style={{ fontSize: 9, fontWeight: 900, color: '#757575' }}>ANTICIPO CURSADO</div><div style={{ fontSize: 21, fontWeight: 900, color: '#1A1A1A' }}>{clpMM(d.contrato.anticipo_clp)}</div><div style={{ fontSize: 9.5, color: '#9E9E9E' }}>{d.contrato.ep1 ? `EP ${d.contrato.ep1.n_cmdic ?? ''} ${d.contrato.ep1.periodo ?? ''}`.trim() : 'Sin estado de pago cargado'}</div></Card>
        <Card style={{ border: (d.consideraciones_abiertas ?? []).some((c: any) => c.severidad === 'BLOQUEANTE') ? '2px solid #FF0000' : '2px solid #EEEEEE' }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: '#757575' }}>BLOQUEANTES ABIERTAS</div>
          <div style={{ fontSize: 21, fontWeight: 900, color: '#FF0000' }}>{(d.consideraciones_abiertas ?? []).filter((c: any) => c.severidad === 'BLOQUEANTE').length}</div>
          <div style={{ fontSize: 9.5, color: '#9E9E9E' }}>{(d.consideraciones_abiertas ?? []).length} advertencias+bloqueantes</div></Card>
      </div>

      {/* ── FILA 1.5: WorkFace Planning — el pulso de la ejecución ──
          El panel medía el contrato pero no medía si el alcance estaba llegando a terreno:
          se podía tener 100% de los datos cargados y 0% del proyecto aperturado en IWP, que
          es exactamente lo que pasaba. */}
      {wfp && (
        <>
          <SecTitle icon={Split}>WorkFace Planning — del CWP al frente de trabajo</SecTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
            <WfpCard
              label="ALCANCE APERTURADO EN IWP"
              valor={`${wfp.pct_aperturado}%`}
              nota={`${num(wfp.hh_aperturadas)} de ${num(wfp.hh_banco)} HH del banco · ${wfp.n_iwp} IWP`}
              barra={wfp.pct_aperturado}
              nivel={wfp.pct_aperturado >= 60 ? 'ok' : wfp.pct_aperturado > 0 ? 'warn' : 'crit'}
            />
            <WfpCard
              label="BACKLOG CONSTRAINT-FREE"
              valor={wfp.semanas_backlog == null ? '—' : `${wfp.semanas_backlog} sem`}
              nota={wfp.semanas_backlog == null
                ? 'Sin cuadrillas activas no hay con qué medirlo'
                : `${num(wfp.hh_backlog)} HH listas · meta 4 semanas (COAA)`}
              barra={wfp.semanas_backlog == null ? 0 : Math.min(100, (wfp.semanas_backlog / 4) * 100)}
              nivel={wfp.semanas_backlog == null ? 'crit' : wfp.semanas_backlog >= 4 ? 'ok' : wfp.semanas_backlog > 0 ? 'warn' : 'crit'}
            />
            <WfpCard
              label="IWP EN RIESGO"
              valor={num(wfp.iwp_en_riesgo)}
              nota="Parten en menos de 14 días con restricciones abiertas"
              nivel={wfp.iwp_en_riesgo === 0 ? 'ok' : 'crit'}
            />
            <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 900, color: '#757575' }}>CWP POR APERTURAR</div>
                <div style={{ fontSize: 21, fontWeight: 900, color: '#1A1A1A' }}>{num(wfp.n_aperturables)}</div>
                <div style={{ fontSize: 9.5, color: '#9E9E9E' }}>
                  {num(wfp.n_completos)} completos · {num(wfp.n_bloqueados)} bloqueados
                </div>
              </div>
              <Link
                href={`/${orgSlug}/projects/${projectId}/mineria/apertura`}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, padding: '8px 12px', borderRadius: 10, backgroundColor: '#FF0000', color: 'white', fontSize: 10.5, fontWeight: 900, textDecoration: 'none' }}
              >
                Ir a la Sala de Apertura <ArrowRight style={{ width: 12, height: 12 }} />
              </Link>
            </Card>
          </div>
        </>
      )}

      {/* ── FILA 2: integridad — que todo calce ── */}
      <SecTitle icon={Scale}>Integridad de datos — que todo calce</SecTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Semaforo nivel={calceClp ? 'ok' : 'crit'} /><span style={{ fontSize: 11, fontWeight: 900 }}>ECO-2 vs Estado de Pago</span></div>
          <div style={{ fontSize: 10.5, color: '#33475B', lineHeight: 1.7 }}>
            Itemizado: <b>{clp(it.eco2_clp)}</b><br />
            EP-01 Valor Contrato: <b>{clp(it.ep_valor_contrato)}</b><br />
            {calceClp ? <span style={{ color: '#166534', fontWeight: 700 }}>✓ Calzan al peso (diferencia &lt; $1.000)</span> : <span style={{ color: '#A00000', fontWeight: 700 }}>✗ NO calzan — revisar</span>}
          </div>
        </Card>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Semaforo nivel="warn" /><span style={{ fontSize: 11, fontWeight: 900 }}>HH: tres fuentes, tres números</span></div>
          <div style={{ fontSize: 10.5, color: '#33475B', lineHeight: 1.7 }}>
            ECO-2 (contrato): <b>{num(it.eco2_hh)} HH</b><br />
            Programa P333: <b>{num(it.prog_hh)} HH</b> ({pctDe(it.prog_hh, it.eco2_hh)} del ECO-2)<br />
            CWP planner: <b>{num(it.cwp_hh)} HH</b> ({pctDe(it.cwp_hh, it.eco2_hh)} del ECO-2)
          </div>
        </Card>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Semaforo nivel={pct(it.conciliacion.eco2_cwp.ok, it.conciliacion.eco2_cwp.total) > 95 ? 'ok' : 'warn'} /><span style={{ fontSize: 11, fontWeight: 900 }}>Conciliación de las 4 relaciones</span></div>
          {relaciones.map(r => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 9.5, color: '#757575', width: 110 }}>{r.label}</span>
              <div style={{ flex: 1, height: 5, borderRadius: 999, backgroundColor: '#F0F0F0', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct(r.ok, r.total)}%`, backgroundColor: pct(r.ok, r.total) >= 98 ? '#22C55E' : pct(r.ok, r.total) >= 80 ? '#FBBF24' : '#FF0000', borderRadius: 999 }} />
              </div>
              <span style={{ fontSize: 9.5, fontWeight: 900, width: 44, textAlign: 'right' }}>{pct(r.ok, r.total)}%</span>
            </div>
          ))}
        </Card>
      </div>

      {/* ── FILA 3: entregables clave ── */}
      <SecTitle icon={FileText}>Observaciones abiertas{entregables.length ? ` (${entregables.length})` : ''}</SecTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {!entregables.length && (
          <div style={{ padding: '14px 16px', fontSize: 11.5, color: '#9E9E9E' }}>
            Sin observaciones abiertas registradas para este proyecto.
          </div>
        )}
        {entregables.map((e, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: i < entregables.length - 1 ? '1px solid #F5F5F5' : 'none', backgroundColor: e.nivel === 'crit' ? '#FFF5F5' : 'white' }}>
            <Semaforo nivel={e.nivel} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1A1A1A', width: 300, flexShrink: 0 }}>{e.nombre}</span>
            <span style={{ fontSize: 11, color: e.nivel === 'crit' ? '#A00000' : '#33475B', fontWeight: e.nivel === 'crit' ? 700 : 400 }}>{e.estado}</span>
            {e.nota && <span style={{ marginLeft: 'auto', fontSize: 9.5, color: '#9E9E9E', flexShrink: 0 }}>{e.nota}</span>}
          </div>
        ))}
      </Card>

      {/* ── FILA 4: bloqueantes/advertencias + compromisos ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12, marginTop: 22 }}>
        <div>
          <SecTitle icon={AlertTriangle}>Restricciones abiertas (semáforo IWP)</SecTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(d.consideraciones_abiertas ?? []).slice(0, 10).map((c: any, i: number) => (
              <Card key={i} style={{ padding: '10px 14px', border: c.severidad === 'BLOQUEANTE' ? '2px solid #FECACA' : '2px solid #FDE68A', backgroundColor: c.severidad === 'BLOQUEANTE' ? '#FFF5F5' : 'white' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 8, fontWeight: 900, padding: '2px 8px', borderRadius: 999, backgroundColor: c.severidad === 'BLOQUEANTE' ? '#FEE2E2' : '#FEF3C7', color: c.severidad === 'BLOQUEANTE' ? '#A00000' : '#B45309' }}>{c.severidad}</span>
                  <span style={{ fontSize: 8.5, fontWeight: 700, color: '#757575' }}>{c.depto}</span>
                  {c.cwp_id && <span style={{ fontSize: 8.5, fontFamily: 'monospace', fontWeight: 900, color: '#A00000' }}>{c.cwp_id}</span>}
                  {c.fecha_limite && <span style={{ marginLeft: 'auto', fontSize: 8.5, color: '#A00000', fontWeight: 700 }}>límite {c.fecha_limite}</span>}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1A1A1A', marginTop: 4 }}>{c.titulo}</div>
              </Card>
            ))}
          </div>
        </div>
        <div>
          <SecTitle icon={Link2}>Compromisos contractuales{(d.compromisos ?? []).length ? ` (${d.compromisos.length})` : ''}</SecTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(d.compromisos ?? []).slice(0, 10).map((c: any, i: number) => (
              <Card key={i} style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 8.5, fontFamily: 'monospace', color: '#757575' }}>{c.carta}</span>
                  <span style={{ fontSize: 8.5, color: '#9E9E9E' }}>{c.fecha}</span>
                  {c.fecha_limite && <span style={{ marginLeft: 'auto', fontSize: 8.5, color: '#A00000', fontWeight: 900 }}>límite {c.fecha_limite}</span>}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1A1A1A', marginTop: 4 }}>{c.compromiso}</div>
                <div style={{ fontSize: 9.5, color: '#757575', marginTop: 2 }}>{c.asunto}</div>
              </Card>
            ))}
            {(d.compromisos ?? []).length === 0 && <Card><span style={{ fontSize: 11, color: '#9E9E9E', fontStyle: 'italic' }}>Sin compromisos con acción pendiente detectados.</span></Card>}
          </div>
        </div>
      </div>

      {/* ── FILA 5: dotación + próximos hitos + RFI/docs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginTop: 22 }}>
        <div>
          <SecTitle icon={Users}>Dotación real (Reportes Diarios)</SecTitle>
          <Card>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#1A1A1A' }}>{ultDot ? num(Number(ultDot.mod_hd) + Number(ultDot.moi_hd)) : '—'}</span>
              <span style={{ fontSize: 10, color: '#757575' }}>personas al {ultDot?.fecha ?? '—'} ({num(ultDot?.mod_hd)} MOD + {num(ultDot?.moi_hd)} MOI)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64, marginTop: 10 }}>
              {dot.map((x: any, i: number) => {
                const mod = Number(x.mod_hd) || 0; const moi = Number(x.moi_hd) || 0;
                return (
                  <div key={i} title={`${x.fecha}: ${mod} MOD + ${moi} MOI`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ height: `${(moi / maxHd) * 100}%`, backgroundColor: '#FCA5A5', borderRadius: '2px 2px 0 0' }} />
                    <div style={{ height: `${(mod / maxHd) * 100}%`, backgroundColor: '#FF0000' }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 9, color: '#757575' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: '#FF0000', borderRadius: 2 }} /> MOD (directos)</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: '#FCA5A5', borderRadius: 2 }} /> MOI (indirectos)</span>
              <span style={{ marginLeft: 'auto' }}>HH acum: {ultDot ? num((Number(ultDot.mod_hh_acum) || 0) + (Number(ultDot.moi_hh_acum) || 0)) : '—'}</span>
            </div>
          </Card>
        </div>
        <div>
          <SecTitle icon={CalendarClock}>Próximos hitos del programa</SecTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {proximosHitos.filter((h: any) => h.f >= hoy).slice(0, 6).map((h: any, i: number) => {
              const dias = Math.round((h.f.getTime() - hoy.getTime()) / 86400000);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #F5F5F5' }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: dias <= 30 ? '#FF0000' : '#757575', width: 58, flexShrink: 0 }}>{dias} días</span>
                  <span style={{ fontSize: 10.5, color: '#1A1A1A' }}>{h.nombre}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: '#9E9E9E', flexShrink: 0 }}>{h.fecha}</span>
                </div>
              );
            })}
          </Card>
        </div>
        <div>
          <SecTitle icon={TrendingUp}>Ingeniería y documentos</SecTitle>
          <Card>
            <div style={{ fontSize: 10.5, color: '#33475B', lineHeight: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Docs Aconex</span><b>{num(d.documental.total)}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#166534' }}>Aprobados</span><b style={{ color: '#166534' }}>{num(d.documental.aprobados)}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#B45309' }}>En revisión</span><b style={{ color: '#B45309' }}>{num(d.documental.en_revision)}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#A00000' }}>Rechazados</span><b style={{ color: '#A00000' }}>{num(d.documental.rechazados)}</b></div>
              <div style={{ borderTop: '1px solid #F0F0F0', marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between' }}><span>RFI cerradas</span><b>{d.rfi.total}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#A00000' }}>RFI con cambio de diseño</span><b style={{ color: '#A00000' }}>{d.rfi.cambio_diseno}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Equipos en maestro</span><b>{(d.equipos ?? []).length}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>IWPs abiertos</span><b>{d.avance.iwps}</b></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
