'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Search, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

// Estado de Pago — avance físico y financiero por item del ECO-2 según las
// Bases de Medición y Pago. El avance de cada item se calcula como la suma
// ponderada de sus pasos (pesos de mining_ponderaciones).

interface Item {
  id: string; item: string; n_partida: string | null; partida_mp: string | null;
  area: string | null; cwa_id: string | null; commodity: string | null; descripcion: string;
  obra: string | null; unidad: string | null; cantidad: number | null; hh_item: number | null;
  pu_clp: number | null; p_total_clp: number | null; cwp_id: string | null;
}
interface Paso { id: string; partida: string; tipo: 'fisico' | 'financiero'; hito: string; peso: number; orden: number; }
interface Avance { item: string; ponderacion_id: string; pct: number; }

const clp = (v: number) => '$' + Math.round(v).toLocaleString('es-CL');
const fnum = (v: number) => Math.round(v).toLocaleString('es-CL');

export default function EstadoPagoPage() {
  const params = useParams();
  const projectId = params.project_id as string;
  const orgSlug = params.org_slug as string;

  const [items, setItems] = useState<Item[]>([]);
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [avances, setAvances] = useState<Map<string, number>>(new Map()); // `${item}|${pondId}` -> pct
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [soloConAvance, setSoloConAvance] = useState(false);

  useEffect(() => {
    fetch(`/api/mining-estado-pago?project_id=${projectId}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(d => {
        setItems(d.items ?? []);
        setPasos(d.pasos ?? []);
        const m = new Map<string, number>();
        for (const a of d.avances ?? []) m.set(`${a.item}|${a.ponderacion_id}`, Number(a.pct));
        setAvances(m);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  const pasosPorPartida = useMemo(() => {
    const m = new Map<string, Paso[]>();
    for (const p of pasos) {
      const arr = m.get(p.partida) ?? [];
      arr.push(p);
      m.set(p.partida, arr);
    }
    return m;
  }, [pasos]);

  // avance de un item = Σ (peso_paso × pct_paso) / Σ pesos, por tipo
  const avanceItem = (it: Item, tipo: 'fisico' | 'financiero'): number | null => {
    if (!it.partida_mp) return null;
    const pp = (pasosPorPartida.get(it.partida_mp) ?? []).filter(p => p.tipo === tipo);
    if (!pp.length) return null;
    const totalPeso = pp.reduce((s, p) => s + p.peso, 0);
    if (!totalPeso) return null;
    const ganado = pp.reduce((s, p) => s + p.peso * ((avances.get(`${it.item}|${p.id}`) ?? 0) / 100), 0);
    return ganado / totalPeso;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    let rows = items;
    if (q) rows = rows.filter(r => [r.item, r.n_partida, r.descripcion, r.obra, r.commodity, r.cwp_id, r.area].some(v => v && String(v).toUpperCase().includes(q)));
    if (soloConAvance) rows = rows.filter(r => (avanceItem(r, 'fisico') ?? 0) > 0);
    return rows;
  }, [items, search, soloConAvance, avances, pasosPorPartida]);

  const kpi = useMemo(() => {
    const total = items.reduce((s, it) => s + (it.p_total_clp ?? 0), 0);
    let fisicoPond = 0, ganado = 0, base = 0;
    for (const it of items) {
      const monto = it.p_total_clp ?? 0;
      const af = avanceItem(it, 'fisico');
      const afin = avanceItem(it, 'financiero');
      if (af != null) { fisicoPond += monto * af; base += monto; }
      if (afin != null) ganado += monto * afin;
    }
    return {
      total,
      fisicoPct: base ? fisicoPond / base * 100 : 0,
      ganado,
      cobrable: total ? ganado / total * 100 : 0,
      sinBmp: items.filter(it => !it.partida_mp || !pasosPorPartida.has(it.partida_mp)).length,
    };
  }, [items, avances, pasosPorPartida]);

  const setPct = async (it: Item, paso: Paso, pct: number) => {
    const key = `${it.item}|${paso.id}`;
    const prev = avances.get(key) ?? 0;
    setAvances(m => new Map(m).set(key, pct));
    try {
      const res = await fetch('/api/mining-estado-pago', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, item: it.item, ponderacion_id: paso.id, pct }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error);
    } catch (e: any) {
      setError(e.message);
      setAvances(m => new Map(m).set(key, prev));
    }
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 96, color: '#757575', fontSize: 13 }}><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Cargando Estado de Pago…</div>;
  if (error && !items.length) return <div style={{ color: '#A00000', fontSize: 13, padding: 32 }}>{error}</div>;

  const Bar = ({ v, color }: { v: number; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 999, backgroundColor: '#F0F0F0', overflow: 'hidden', minWidth: 50 }}>
        <div style={{ height: '100%', width: `${Math.min(100, v)}%`, backgroundColor: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 900, color: '#1A1A1A', width: 38, textAlign: 'right' }}>{v.toFixed(1)}%</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontWeight: 'bold', fontSize: 22, color: '#1A1A1A' }}>ESTADO <span style={{ color: '#FF0000' }}>DE PAGO</span></h1>
        <p style={{ fontSize: 11.5, color: '#757575' }}>Avance físico y financiero por ítem del itemizado según las Bases de Medición y Pago (ponderaciones CMDIC).</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          // Un "$0" se lee como "este contrato vale cero", que es falso: lo que pasa es que
          // el ECO-2 cargado no trae precios unitarios. La pantalla lo dice en vez de inventar.
          { label: 'TOTAL CONTRATO',
            valor: kpi.total > 0 ? clp(kpi.total) : '—',
            sub: kpi.total > 0 ? `${fnum(items.length)} ítems del itemizado` : `${fnum(items.length)} ítems del itemizado · sin precios cargados` },
          { label: 'AVANCE FÍSICO', valor: kpi.fisicoPct.toFixed(1) + '%', sub: 'ponderado por monto' },
          { label: 'MONTO GANADO (EP)', valor: clp(kpi.ganado), sub: 'según hitos financieros' },
          { label: 'AVANCE FINANCIERO', valor: kpi.cobrable.toFixed(1) + '%', sub: 'del total contrato' },
        ].map(k => (
          <div key={k.label} style={{ borderRadius: 14, border: '2px solid #EEEEEE', backgroundColor: 'white', padding: '14px 16px' }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: '#757575', letterSpacing: 0.5 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1A1A1A', marginTop: 2 }}>{k.valor}</div>
            <div style={{ fontSize: 9.5, color: '#9E9E9E' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* REGLA DE ORO DEL COBRO: todo ítem del itemizado necesita una forma de pago definida
          en las Bases de Medición y Pago. Un ítem sin ella se ejecuta igual en terreno, pero
          no se puede medir ni facturar — es trabajo regalado. Por eso el aviso es rojo y no
          amarillo: no es una advertencia de calidad de dato, es plata que se pierde. */}
      {kpi.sinBmp > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: '#A00000', backgroundColor: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
          <div>
            <b>{kpi.sinBmp} de {fnum(items.length)} ítems no se pueden cobrar.</b>{' '}
            No tienen forma de pago definida en las Bases de Medición y Pago: se pueden ejecutar en
            terreno, pero no hay con qué medirlos ni facturarlos.
            <Link href={`/${orgSlug}/projects/${projectId}/conciliacion`} style={{ marginLeft: 6, fontWeight: 700, textDecoration: 'underline' }}>
              Asignarles forma de pago →
            </Link>
          </div>
        </div>
      )}

      {/* Controles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ width: 13, height: 13, position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar item…" style={{ paddingLeft: 28, paddingRight: 12, paddingTop: 6, paddingBottom: 6, borderRadius: 999, border: '1px solid #E0E0E0', fontSize: 11, outline: 'none', width: 220 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#33475B', cursor: 'pointer' }}>
          <input type="checkbox" checked={soloConAvance} onChange={e => setSoloConAvance(e.target.checked)} /> Solo con avance
        </label>
        {error && <span style={{ fontSize: 10.5, color: '#A00000' }}>{error}</span>}
      </div>

      {/* Tabla */}
      <div style={{ borderRadius: 12, border: '1px solid #EEEEEE', overflow: 'hidden', backgroundColor: 'white' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '2px solid #FF0000' }}>
              {['', 'Item', 'N° Partida', 'BMP', 'Descripción', 'CWP', 'Un.', 'Cant.', 'P. Total', 'Avance físico', 'Avance financiero', 'Ganado'].map((h, i) => (
                <th key={i} style={{ padding: '9px 10px', textAlign: i >= 6 && i <= 8 ? 'right' : 'left', fontWeight: 900, fontSize: 9.5, color: '#33475B', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(it => {
              const af = avanceItem(it, 'fisico');
              const afin = avanceItem(it, 'financiero');
              const abierto = openItem === it.item;
              const pf = (pasosPorPartida.get(it.partida_mp ?? '') ?? []);
              const sinReglas = !pf.length;
              return (
                <Fragment key={it.id}>
                  <tr onClick={() => setOpenItem(abierto ? null : it.item)} style={{ borderBottom: '1px solid #F5F5F5', cursor: 'pointer', backgroundColor: abierto ? '#FFF5F5' : 'white' }}>
                    <td style={{ padding: '7px 6px 7px 12px', width: 20 }}>{abierto ? <ChevronDown style={{ width: 13, height: 13, color: '#FF0000' }} /> : <ChevronRight style={{ width: 13, height: 13, color: '#BDBDBD' }} />}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{it.item}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 10, color: '#757575' }}>{it.n_partida ?? '—'}</td>
                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                      {it.partida_mp && !sinReglas ? (
                        <span style={{ display: 'inline-block', fontFamily: 'monospace', fontSize: 9.5, fontWeight: 900, padding: '2px 10px', borderRadius: 9999, border: '1.5px solid #22C55E', backgroundColor: '#DCFCE7', color: '#166534' }}>{it.partida_mp}</span>
                      ) : it.partida_mp ? (
                        <span style={{ display: 'inline-block', fontFamily: 'monospace', fontSize: 9.5, fontWeight: 900, padding: '2px 10px', borderRadius: 9999, border: '1.5px solid #FBBF24', backgroundColor: '#FEF3C7', color: '#B45309' }} title="Partida asignada pero sin reglas de ponderación">{it.partida_mp}</span>
                      ) : (
                        <span style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 900, padding: '2px 10px', borderRadius: 9999, border: '1.5px dashed #FECACA', backgroundColor: '#FEE2E2', color: '#A00000' }}>sin BMP</span>
                      )}
                    </td>
                    <td style={{ padding: '7px 10px', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.descripcion}>{it.descripcion}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 10, color: it.cwp_id ? '#166534' : '#A00000' }}>{it.cwp_id ?? 'sin CWP'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10 }}>{it.unidad}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{it.cantidad != null ? it.cantidad.toLocaleString('es-CL') : ''}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{it.p_total_clp != null ? clp(it.p_total_clp) : ''}</td>
                    <td style={{ padding: '7px 10px', minWidth: 120 }}>{af != null ? <Bar v={af * 100} color="#FF0000" /> : <span style={{ fontSize: 9.5, color: '#BDBDBD', fontStyle: 'italic' }}>sin BMP</span>}</td>
                    <td style={{ padding: '7px 10px', minWidth: 120 }}>{afin != null ? <Bar v={afin * 100} color="#22C55E" /> : <span style={{ fontSize: 9.5, color: '#BDBDBD', fontStyle: 'italic' }}>—</span>}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 900, color: '#166534' }}>{afin != null && it.p_total_clp != null ? clp(it.p_total_clp * afin) : ''}</td>
                  </tr>
                  {abierto && (
                    <tr>
                      <td colSpan={12} style={{ backgroundColor: '#FAFAFA', borderBottom: '2px solid #EEEEEE', padding: '12px 24px 16px' }}>
                        {sinReglas ? (
                          <div style={{ fontSize: 11, color: '#B45309' }}>Este item no tiene partida BMP con reglas ({it.partida_mp ?? 'sin asignar'}). Asígnala en Conciliación para reportar avance.</div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                            {(['fisico', 'financiero'] as const).map(tipo => {
                              const grupo = pf.filter(p => p.tipo === tipo);
                              if (!grupo.length) return <div key={tipo} />;
                              return (
                                <div key={tipo}>
                                  <div style={{ fontSize: 9.5, fontWeight: 900, color: tipo === 'fisico' ? '#FF0000' : '#166534', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                    {tipo === 'fisico' ? 'Pasos de avance físico' : 'Hitos de pago (financiero)'} · {it.partida_mp}
                                  </div>
                                  {grupo.map(p => {
                                    const pct = avances.get(`${it.item}|${p.id}`) ?? 0;
                                    return (
                                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', borderBottom: '1px dashed #EEEEEE' }}>
                                        <span style={{ fontSize: 9, fontWeight: 900, color: '#9E9E9E', width: 34, flexShrink: 0 }}>{(p.peso * 100).toFixed(0)}%</span>
                                        <span style={{ fontSize: 10.5, color: '#33475B', flex: 1 }}>{p.hito}</span>
                                        <input type="number" min={0} max={100} value={pct}
                                          onClick={e => e.stopPropagation()}
                                          onChange={e => setPct(it, p, Math.max(0, Math.min(100, Number(e.target.value))))}
                                          style={{ width: 58, padding: '3px 6px', borderRadius: 6, border: '1px solid #E0E0E0', fontSize: 10.5, textAlign: 'right', outline: 'none' }} />
                                        <button onClick={e => { e.stopPropagation(); setPct(it, p, pct === 100 ? 0 : 100); }}
                                          style={{ fontSize: 9, fontWeight: 900, padding: '3px 8px', borderRadius: 999, border: 'none', cursor: 'pointer', backgroundColor: pct === 100 ? '#DCFCE7' : '#F5F5F5', color: pct === 100 ? '#166534' : '#757575' }}>
                                          {pct === 100 ? '✓ 100%' : 'Completar'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
