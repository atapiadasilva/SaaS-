'use client';

import React from 'react';
import { type Bloque, type FichaData, type Orientacion, fn, f1, fd, fmm, STATUS_LABEL } from './types';

// Render puro del documento de ficha CWP. Lo usan tanto el editor (preview en vivo) como la
// página de impresión, así que lo que se ve es exactamente lo que sale en PDF (WYSIWYG).

const CSS = `
.fd { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; }
.fd * { box-sizing: border-box; }
.fd h1 { font-size: 20px; margin: 0; letter-spacing: -0.01em; }
.fd h1 .disc { display: inline-block; vertical-align: 3px; margin-right: 8px; padding: 2px 10px; border-radius: 8px; background: #FF0000; color: #fff; font-size: 13px; font-weight: 800; }
.fd .h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: #757575; border-bottom: 2px solid #FF0000; padding-bottom: 3px; margin: 18px 0 7px; font-weight: 800; }
.fd table { width: 100%; border-collapse: collapse; }
.fd th { text-align: left; font-size: 9px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 3px 6px; }
.fd td { padding: 3px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; font-size: 10px; }
.fd tr { page-break-inside: avoid; }
.fd .mono { font-family: Consolas, monospace; font-size: 9.5px; white-space: nowrap; }
.fd .num { text-align: right; font-family: Consolas, monospace; }
.fd .nw { white-space: nowrap; }
.fd .dim { color: #94a3b8; font-style: italic; }
.fd .dim2 { color: #94a3b8; font-size: 8.5px; }
.fd .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #FF0000; padding-bottom: 10px; gap: 20px; }
.fd .brand { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
.fd .brand .mark { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(135deg,#FF0000,#A00000); color: #fff; font-weight: 900; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.fd .brand .name { font-size: 11px; font-weight: 800; letter-spacing: .08em; color: #1A1A1A; }
.fd .brand .name b { color: #FF0000; }
.fd .brand .tag { font-size: 7.5px; color: #757575; text-transform: uppercase; letter-spacing: .14em; }
.fd .trace { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-family: Consolas, monospace; font-size: 9.5px; color: #475569; flex-wrap: wrap; }
.fd .trace b { color: #1A1A1A; }
.fd .trace .sep { color: #FF0000; }
.fd .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: 9.5px; background: #e2e8f0; margin: 0 0 4px 4px; }
.fd .badge.crit { background: #fee2e2; color: #a00000; }
.fd .badge.warn { background: #fef3c7; color: #92400e; }
.fd .badge.ok { background: #dcfce7; color: #166534; }
.fd .chip { display: inline-block; padding: 1px 8px; border-radius: 999px; font-weight: 700; font-size: 8.5px; background: #eff6ff; color: #1d4ed8; }
.fd .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-top: 12px; }
.fd .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; page-break-inside: avoid; }
.fd .kpi b { display: block; font-size: 14px; letter-spacing: -0.01em; }
.fd .kpi span { font-size: 8px; text-transform: uppercase; color: #64748b; letter-spacing: .04em; }
.fd .box { border-left: 3px solid #FF0000; background: #fafafa; padding: 8px 12px; border-radius: 0 8px 8px 0; color: #334155; line-height: 1.55; white-space: pre-wrap; font-size: 10.5px; }
.fd .callout { padding: 8px 12px; border-radius: 8px; line-height: 1.5; white-space: pre-wrap; font-size: 10.5px; }
.fd .callout.rojo { background: #fee2e2; color: #991b1b; }
.fd .callout.ambar { background: #fef3c7; color: #92400e; }
.fd .callout.verde { background: #dcfce7; color: #166534; }
.fd .callout.azul { background: #eff6ff; color: #1e40af; }
.fd .parrafo { white-space: pre-wrap; line-height: 1.55; font-size: 10.5px; color: #334155; }
.fd .titulo { font-size: 13px; font-weight: 800; color: #1A1A1A; border-bottom: 2px solid #FF0000; padding-bottom: 3px; margin: 18px 0 8px; }
.fd .subtitulo { font-size: 11.5px; font-weight: 800; color: #334155; margin: 12px 0 4px; }
.fd .w-tl { width: 26%; }
.fd .tl { position: relative; height: 9px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
.fd .tl i { position: absolute; top: 1px; bottom: 1px; border-radius: 3px; background: linear-gradient(90deg,#FF0000,#c02020); }
.fd .gal { display: grid; gap: 8px; margin: 4px 0 8px; }
.fd .gal figure { margin: 0; page-break-inside: avoid; }
.fd .gal img { width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; display: block; object-fit: cover; }
.fd .gal figcaption { font-size: 8.5px; color: #64748b; margin-top: 3px; text-align: center; }
.fd .firmas { display: grid; gap: 24px; margin-top: 34px; page-break-inside: avoid; }
.fd .firma { border-top: 1px solid #334155; padding-top: 4px; text-align: center; font-size: 10px; color: #475569; }
.fd .foot { margin-top: 16px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 8px; color: #94a3b8; display: flex; justify-content: space-between; gap: 12px; }
.fd .salto { break-after: page; height: 0; }
.fd hr.divisor { border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0; }
`;

function Cabecera({ d }: { d: FichaData }) {
  const c = d.cwp, k = d.kpis;
  const badges: React.ReactNode[] = [];
  if (c.ruta_critica) badges.push(<span key="rc" className="badge crit">🔥 RUTA CRÍTICA</span>);
  if (c.status_cwp) badges.push(<span key="st" className="badge">{c.status_cwp}</span>);
  if (c.es_oficial === false) badges.push(<span key="of" className="badge warn">No oficial</span>);
  if (k.avanceCwp != null) badges.push(<span key="av" className={`badge ${k.avanceCwp >= 100 ? 'ok' : ''}`}>Avance {k.avanceCwp}%</span>);

  return (
    <>
      <div className="head">
        <div>
          <div className="brand">
            <div className="mark">H</div>
            <div>
              <div className="name">HILO <b>DIGITAL</b></div>
              <div className="tag">Ficha de Paquete de Construcción · AWP</div>
            </div>
          </div>
          <h1><span className="disc">{c.disciplina_cod ?? ''}</span>CWP {c.cwp_id}</h1>
          <div style={{ marginTop: 3, fontSize: 12 }}>{c.cwp_nombre ?? ''}</div>
          <div className="trace">
            CWA <b>{c.cwa_id ?? '—'}</b> {c.cwaNombre && <span className="dim2">{c.cwaNombre}</span>}
            <span className="sep">›</span> CV <b>{c.cv_id ?? '—'}</b> {c.cvNombre && <span className="dim2">{c.cvNombre}</span>}
            <span className="sep">›</span> CWP <b>{c.cwp_id}</b>
            <span className="sep">›</span> EWP <b>{c.ewp_id ?? '—'}</b>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div>{badges}</div>
          {c.hito_contractual && <div style={{ marginTop: 6, fontSize: 9.5 }}><b>🎯 {c.hito_contractual}</b></div>}
          <div className="dim" style={{ marginTop: 6 }}>P333 Crecimiento Ujina · PG210 Puerto<br />Generado {new Date().toISOString().slice(0, 10)}</div>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><b>{fmm(k.costo)}</b><span>Costo oferta</span></div>
        <div className="kpi"><b>{fn(k.hhProg)}</b><span>HH programa ({k.nProg} act.)</span></div>
        <div className="kpi"><b>{fn(k.hhItem)}</b><span>HH itemizado ({k.nItems})</span></div>
        <div className="kpi"><b>{fd(k.progIni)}</b><span>Inicio programa</span></div>
        <div className="kpi"><b>{fd(k.progFin)}</b><span>Fin programa</span></div>
        <div className="kpi"><b>{k.nIwp ? `${k.nIwp} · ${k.avanceCwp ?? 0}%` : '—'}</b><span>IWPs · avance</span></div>
      </div>
    </>
  );
}

function TablaPrograma({ d, titulo }: { d: FichaData; titulo?: string }) {
  const prog = d.programa;
  const t0 = d.kpis.progIni ? +new Date(d.kpis.progIni) : 0;
  const t1 = d.kpis.progFin ? +new Date(d.kpis.progFin) : 1;
  const span = Math.max(1, t1 - t0);
  const bar = (s: string | null, e: string | null) => {
    if (!s || !e || !d.kpis.progIni) return null;
    const l = ((+new Date(s) - t0) / span) * 100;
    const w = Math.max(1.2, ((+new Date(e) - +new Date(s)) / span) * 100);
    return <div className="tl"><i style={{ left: `${l.toFixed(1)}%`, width: `${w.toFixed(1)}%` }} /></div>;
  };
  return (
    <section>
      <div className="h2">{titulo ?? `Programa P333 (${prog.length} actividades · ${fn(d.kpis.hhProg)} HH)`}</div>
      <table>
        <tbody>
          <tr><th>Actividad</th><th>Descripción</th><th>Fechas</th><th style={{ textAlign: 'right' }}>HH</th><th>Línea de tiempo</th></tr>
          {prog.length ? prog.map((t, i) => (
            <tr key={i}>
              <td className="mono">{t.cod}</td>
              <td>{t.nombre}</td>
              <td className="nw">{fd(t.ini)} → {fd(t.fin)}</td>
              <td className="num">{fn(t.hh)}</td>
              <td className="w-tl">{bar(t.ini, t.fin)}</td>
            </tr>
          )) : <tr><td colSpan={5} className="dim">Este CWP no tiene actividades en el programa P333.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function TablaItemizado({ d, titulo }: { d: FichaData; titulo?: string }) {
  const items = d.itemizado;
  return (
    <section>
      <div className="h2">{titulo ?? `Itemizado de cobro — MC (${items.length} ítems · ${fn(d.kpis.hhItem)} HH)`}</div>
      <table>
        <tbody>
          <tr><th>Ítem</th><th>Descripción</th><th>Detalle</th><th>Partida BMP</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>HH/u</th><th style={{ textAlign: 'right' }}>HH</th></tr>
          {items.length ? items.map((i, k) => (
            <tr key={k}>
              <td className="mono">{i.item}</td>
              <td>{i.descripcion}</td>
              <td className="dim2">{i.detalle ?? ''}</td>
              <td className="mono">{i.partida ?? ''}</td>
              <td className="num nw">{f1(i.cantidad)} {i.unidad ?? ''}</td>
              <td className="num">{f1(i.hh_unidad)}</td>
              <td className="num">{fn(i.hh_item)}</td>
            </tr>
          )) : <tr><td colSpan={7} className="dim">Sin ítems del itemizado vinculados a este CWP.</td></tr>}
          {items.length ? <tr><td colSpan={6} style={{ fontWeight: 700 }}>TOTAL</td><td className="num" style={{ fontWeight: 700 }}>{fn(d.kpis.hhItem)}</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}

function TablaIwp({ d, titulo }: { d: FichaData; titulo?: string }) {
  const iwps = d.iwps;
  return (
    <section>
      <div className="h2">{titulo ?? `Paquetes de instalación (IWP) — ${iwps.length}`}</div>
      <table>
        <tbody>
          <tr><th>IWP</th><th>Descripción</th><th>Estado</th><th>Fechas plan</th><th style={{ textAlign: 'right' }}>HH</th><th style={{ textAlign: 'right' }}>Avance</th><th>Constraints</th></tr>
          {iwps.length ? iwps.map((i, k) => (
            <tr key={k}>
              <td className="mono">{i.iwp_id}</td>
              <td>{i.descripcion ?? ''}</td>
              <td><span className="chip">{STATUS_LABEL[i.status ?? ''] ?? i.status ?? '—'}</span></td>
              <td className="nw">{fd(i.ini)} → {fd(i.fin)}</td>
              <td className="num">{fn(i.hh)}</td>
              <td className="num"><b>{i.avance}%</b></td>
              <td className="nw">{i.consPend ? `⚠ ${i.consPend}/${i.consTotal} pend.` : (i.consTotal ? '✓ despejados' : '—')}</td>
            </tr>
          )) : <tr><td colSpan={7} className="dim">Todavía no se abre en IWP — el paquete no tiene frentes de instalación cortados.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function TablaPlanos({ d, titulo }: { d: FichaData; titulo?: string }) {
  const planos = d.planos;
  return (
    <section>
      <div className="h2">{titulo ?? `Planos y documentos del CWP (${planos.length})`}</div>
      <table>
        <tbody>
          <tr><th>Código CMDIC</th><th>N° Interno</th><th>Título / descripción</th><th>Tipo</th><th>Rev</th><th>Estado Aconex</th></tr>
          {planos.length ? planos.map((p, k) => (
            <tr key={k}>
              <td className="mono">{p.codigo}</td>
              <td className="mono">{p.n_interno ?? '—'}</td>
              <td>{p.descripcion || <span className="dim">sin título</span>}</td>
              <td className="dim2">{p.tipo}</td>
              <td className="mono">{p.rev ?? '—'}</td>
              <td className="dim2">{p.estado ?? '—'}</td>
            </tr>
          )) : <tr><td colSpan={6} className="dim">Sin planos vinculados a este CWP.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function BloqueDatos({ d, fuente, titulo }: { d: FichaData; fuente: string; titulo?: string }) {
  switch (fuente) {
    case 'kpis': return <div className="kpis" style={{ marginTop: 4 }}>
      <div className="kpi"><b>{fmm(d.kpis.costo)}</b><span>Costo oferta</span></div>
      <div className="kpi"><b>{fn(d.kpis.hhProg)}</b><span>HH programa</span></div>
      <div className="kpi"><b>{fn(d.kpis.hhItem)}</b><span>HH itemizado</span></div>
      <div className="kpi"><b>{fd(d.kpis.progIni)}</b><span>Inicio</span></div>
      <div className="kpi"><b>{fd(d.kpis.progFin)}</b><span>Fin</span></div>
      <div className="kpi"><b>{d.kpis.nIwp}</b><span>IWPs</span></div>
    </div>;
    case 'jerarquia': return <div className="trace" style={{ marginTop: 6 }}>
      CWA <b>{d.cwp.cwa_id ?? '—'}</b> <span className="dim2">{d.cwp.cwaNombre}</span>
      <span className="sep">›</span> CV <b>{d.cwp.cv_id ?? '—'}</b> <span className="dim2">{d.cwp.cvNombre}</span>
      <span className="sep">›</span> CWP <b>{d.cwp.cwp_id}</b>
      <span className="sep">›</span> EWP <b>{d.cwp.ewp_id ?? '—'}</b>
    </div>;
    case 'alcance': return d.cwp.alcance
      ? <section><div className="h2">{titulo ?? 'Alcance del paquete'}</div><div className="box">{d.cwp.alcance}</div></section>
      : <section><div className="h2">{titulo ?? 'Alcance del paquete'}</div><div className="dim">Sin alcance registrado para este CWP.</div></section>;
    case 'programa': return <TablaPrograma d={d} titulo={titulo} />;
    case 'itemizado': return <TablaItemizado d={d} titulo={titulo} />;
    case 'iwp': return <TablaIwp d={d} titulo={titulo} />;
    case 'planos': return <TablaPlanos d={d} titulo={titulo} />;
    default: return null;
  }
}

function RenderBloque({ b, d }: { b: Bloque; d: FichaData }) {
  switch (b.tipo) {
    case 'titulo': return <div className="titulo">{b.texto}</div>;
    case 'subtitulo': return <div className="subtitulo">{b.texto}</div>;
    case 'parrafo': return <div className="parrafo">{b.texto}</div>;
    case 'nota': return <div className={`callout ${b.color ?? 'azul'}`}>{b.texto}</div>;
    case 'divisor': return <hr className="divisor" />;
    case 'salto': return <div className="salto" />;
    case 'firmas': return <div className="firmas" style={{ gridTemplateColumns: `repeat(${Math.max(1, b.roles.length)}, 1fr)` }}>
      {b.roles.map((r, i) => <div key={i} className="firma">{r}</div>)}
    </div>;
    case 'imagenes': return <section>
      {b.titulo && <div className="h2">{b.titulo}</div>}
      <div className="gal" style={{ gridTemplateColumns: `repeat(${b.porFila}, 1fr)` }}>
        {b.imgs.map((im, i) => (
          <figure key={i}>
            {im.url ? <img src={im.url} alt={im.caption ?? ''} /> : <div className="dim" style={{ border: '1px dashed #cbd5e1', borderRadius: 8, padding: 24, textAlign: 'center' }}>imagen</div>}
            {im.caption && <figcaption>{im.caption}</figcaption>}
          </figure>
        ))}
      </div>
    </section>;
    case 'datos': return <BloqueDatos d={d} fuente={b.fuente} titulo={b.titulo} />;
    default: return null;
  }
}

export default function FichaDocument({ data, orientacion, bloques }: { data: FichaData; orientacion: Orientacion; bloques: Bloque[] }) {
  const width = orientacion === 'horizontal' ? 1100 : 780;
  return (
    <div className="fd" style={{ width, maxWidth: '100%', margin: '0 auto', padding: 28 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Cabecera d={data} />
      {bloques.map(b => <RenderBloque key={b.id} b={b} d={data} />)}
      <div className="foot">
        <span>HILO Digital — EIMI00417 Puerto Collahuasi · Ficha generada desde la red de datos AWP</span>
        <span>{data.cwp.cwp_id} · {new Date().toLocaleDateString('es-CL')}</span>
      </div>
    </div>
  );
}
