'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, AlertTriangle, ShieldCheck, FileText, Clock } from 'lucide-react';

// Dashboard genérico por departamento: KPIs + consideraciones del feed diario IA + documentos Aconex.
// Lo usan los módulos Calidad, Medio Ambiente, SSO, Equipos y RRHH.

interface Props {
  projectId: string;
  depto: 'CALIDAD' | 'MEDIO_AMBIENTE' | 'SSO' | 'EQUIPOS' | 'RRHH';
  titulo: string;
  tituloAcento: string;
  descripcion: string;
}

interface Consideracion {
  id: string; fecha_reporte: string; tipo: string; cwp_id: string | null; iwp_id: string | null;
  n_cmdic: string | null; titulo: string; detalle: string | null;
  severidad: 'INFO' | 'ADVERTENCIA' | 'BLOQUEANTE'; estado: 'ABIERTA' | 'EN_CURSO' | 'CERRADA';
  fecha_limite: string | null; responsable: string | null; metadata: any;
}
interface Doc {
  id: string; n_cmdic: string; n_interno: string | null; titulo: string | null; tipo_doc: string | null; rev: string | null;
  estado_aconex: string | null; fecha_modificacion: string | null; funcion: string | null;
  categoria: string | null; cwa_id: string | null; cwp_id_exacto: string | null; cwp_sugerido: string | null; ext: string | null;
  tieneArchivo?: boolean;
}

const docFileUrl = (codigo: string) => `/api/mining-planos/file?codigo_documento=${encodeURIComponent(codigo)}`;

const fecha = (s: string | null) => s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

const SEV_STYLE = {
  BLOQUEANTE: { bg: '#FEE2E2', bd: '#FECACA', fg: '#A00000', label: 'BLOQUEANTE' },
  ADVERTENCIA: { bg: '#FEF3C7', bd: '#FDE68A', fg: '#B45309', label: 'ADVERTENCIA' },
  INFO: { bg: '#F5F5F5', bd: '#E0E0E0', fg: '#757575', label: 'INFO' },
} as const;

export default function DeptoDashboard({ projectId, depto, titulo, tituloAcento, descripcion }: Props) {
  const [data, setData] = useState<{ kpis: any; docs: Doc[]; consideraciones: Consideracion[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'consideraciones' | 'docs'>('consideraciones');

  useEffect(() => {
    fetch(`/api/mining-depto?project_id=${projectId}&depto=${depto}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(setData)
      .catch(e => setError(e.message));
  }, [projectId, depto]);

  const docsFiltrados = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toUpperCase();
    if (!q) return data.docs;
    return data.docs.filter(d => [d.n_cmdic, d.n_interno, d.titulo, d.tipo_doc, d.estado_aconex, d.cwp_id_exacto, d.cwp_sugerido].some(v => v && String(v).toUpperCase().includes(q)));
  }, [data, search]);

  const consFiltradas = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toUpperCase();
    let cs = data.consideraciones;
    if (q) cs = cs.filter(c => [c.titulo, c.detalle, c.cwp_id, c.tipo, c.n_cmdic].some(v => v && String(v).toUpperCase().includes(q)));
    const orden = { BLOQUEANTE: 0, ADVERTENCIA: 1, INFO: 2 };
    return [...cs].sort((a, b) => (a.estado === 'CERRADA' ? 1 : 0) - (b.estado === 'CERRADA' ? 1 : 0) || orden[a.severidad] - orden[b.severidad]);
  }, [data, search]);

  if (error) return <div style={{ color: '#A00000', fontSize: 13, padding: 32 }}>{error}</div>;
  if (!data) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 96, color: '#757575', fontSize: 13 }}><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Cargando {titulo.toLowerCase()}…</div>;

  const k = data.kpis;
  const estadoBadge = (e: string | null) => {
    if (!e) return { bg: '#F5F5F5', fg: '#9E9E9E', label: 'Sin estado' };
    if (/aprobado/i.test(e) && !/para aprob/i.test(e)) return { bg: '#DCFCE7', fg: '#166534', label: e };
    if (/rechaz/i.test(e)) return { bg: '#FEE2E2', fg: '#A00000', label: e };
    return { bg: '#FEF3C7', fg: '#B45309', label: e };
  };

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontWeight: 'bold', fontSize: 22, color: '#1A1A1A' }}>{titulo} <span style={{ color: '#FF0000' }}>{tituloAcento}</span></h1>
        <p style={{ fontSize: 11.5, color: '#757575' }}>{descripcion} {k.ultima_actualizacion && <span style={{ marginLeft: 8, color: '#166534', fontWeight: 700 }}>· Último reporte IA: {fecha(k.ultima_actualizacion)}</span>}</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'DOCUMENTOS', valor: k.docs_total, icon: FileText, color: '#33475B' },
          { label: 'APROBADOS', valor: k.aprobados, icon: ShieldCheck, color: '#166534' },
          { label: 'EN REVISIÓN', valor: k.en_revision, icon: Clock, color: '#B45309' },
          { label: 'RECHAZADOS', valor: k.rechazados, icon: AlertTriangle, color: k.rechazados > 0 ? '#A00000' : '#9E9E9E' },
          { label: 'CONSID. ABIERTAS', valor: k.consid_abiertas, icon: AlertTriangle, color: k.consid_abiertas > 0 ? '#B45309' : '#166534' },
          { label: 'BLOQUEANTES', valor: k.bloqueantes, icon: AlertTriangle, color: k.bloqueantes > 0 ? '#FF0000' : '#166534' },
        ].map(kp => {
          const Icon = kp.icon;
          return (
            <div key={kp.label} style={{ borderRadius: 14, border: kp.label === 'BLOQUEANTES' && k.bloqueantes > 0 ? '2px solid #FF0000' : '2px solid #EEEEEE', backgroundColor: 'white', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 8.5, fontWeight: 900, color: '#757575', letterSpacing: 0.5 }}>
                <Icon style={{ width: 11, height: 11, color: kp.color }} /> {kp.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: kp.color, marginTop: 2 }}>{kp.valor}</div>
            </div>
          );
        })}
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        {([['consideraciones', `Consideraciones (${data.consideraciones.length})`], ['docs', `Documentos Aconex (${data.docs.length})`]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 14px', borderRadius: 999, fontSize: 11, fontWeight: 900, cursor: 'pointer', border: tab === t ? '2px solid #FF0000' : '2px solid #EEEEEE', backgroundColor: tab === t ? '#FF0000' : 'white', color: tab === t ? 'white' : '#33475B' }}>{label}</button>
        ))}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <Search style={{ width: 13, height: 13, position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" style={{ paddingLeft: 28, paddingRight: 12, paddingTop: 6, paddingBottom: 6, borderRadius: 999, border: '1px solid #E0E0E0', fontSize: 11, outline: 'none', width: 220 }} />
        </div>
      </div>

      {/* Consideraciones (feed IA) */}
      {tab === 'consideraciones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {consFiltradas.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#9E9E9E', fontSize: 12, fontStyle: 'italic', border: '2px dashed #EEEEEE', borderRadius: 14 }}>Sin consideraciones registradas para {titulo}. El feed diario de la IA Aconex las poblará aquí.</div>}
          {consFiltradas.map(c => {
            const sv = SEV_STYLE[c.severidad];
            const cerrada = c.estado === 'CERRADA';
            return (
              <div key={c.id} style={{ borderRadius: 12, border: `1px solid ${cerrada ? '#EEEEEE' : sv.bd}`, backgroundColor: cerrada ? '#FAFAFA' : 'white', padding: '12px 16px', opacity: cerrada ? 0.65 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 8.5, fontWeight: 900, padding: '3px 10px', borderRadius: 999, backgroundColor: sv.bg, color: sv.fg, border: `1px solid ${sv.bd}` }}>{sv.label}</span>
                  <span style={{ fontSize: 8.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, backgroundColor: '#F5F5F5', color: '#757575' }}>{c.tipo}</span>
                  {c.cwp_id && <span style={{ fontSize: 8.5, fontWeight: 900, padding: '3px 10px', borderRadius: 999, backgroundColor: '#FEE2E2', color: '#A00000', fontFamily: 'monospace' }}>{c.cwp_id}{c.iwp_id ? ` · ${c.iwp_id}` : ''}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: '#9E9E9E' }}>{fecha(c.fecha_reporte)}{c.fecha_limite ? ` · límite ${fecha(c.fecha_limite)}` : ''} · {c.estado}</span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1A1A', marginTop: 6 }}>{c.titulo}</div>
                {c.detalle && <div style={{ fontSize: 11, color: '#33475B', marginTop: 3, lineHeight: 1.45 }}>{c.detalle}</div>}
                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 9.5, color: '#757575', flexWrap: 'wrap', alignItems: 'center' }}>
                  {c.n_cmdic && <span style={{ fontFamily: 'monospace' }}>{c.n_cmdic}</span>}
                  {c.responsable && <span>{c.responsable}</span>}
                  {Array.isArray(c.metadata?.documentos) && c.metadata.documentos.map((doc: any, di: number) => (
                    <a key={di}
                      href={doc.n_cmdic ? docFileUrl(doc.n_cmdic) : doc.hipervinculo}
                      target="_blank" rel="noreferrer" title={doc.archivo ?? doc.n_cmdic}
                      onClick={e => { const href = (e.currentTarget as HTMLAnchorElement).href; if (href.startsWith('file:')) { e.preventDefault(); navigator.clipboard?.writeText(decodeURIComponent(href.replace('file:///', '')).replace(/\//g, '\\')); (e.currentTarget as HTMLElement).textContent = '✓ ruta copiada'; } }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999, backgroundColor: '#F5F5F5', color: '#33475B', border: '1px solid #E0E0E0', textDecoration: 'none', cursor: 'pointer' }}>
                      📄 {doc.n_cmdic ?? doc.archivo ?? 'documento'}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Documentos Aconex */}
      {tab === 'docs' && (
        <div style={{ borderRadius: 12, border: '1px solid #EEEEEE', overflow: 'hidden', backgroundColor: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ backgroundColor: '#FAFAFA', borderBottom: '2px solid #FF0000' }}>
                {['N° CMDIC', 'N° Interno', 'Título', 'Tipo', 'Rev', 'Estado Aconex', 'CWP', 'Modificado'].map(h => (
                  <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 900, fontSize: 9.5, color: '#33475B', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docsFiltrados.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 48, textAlign: 'center', color: '#9E9E9E', fontStyle: 'italic' }}>Sin documentos clasificados en este departamento.</td></tr>
              )}
              {docsFiltrados.map(d => {
                const eb = estadoBadge(d.estado_aconex);
                const cwp = d.cwp_id_exacto ?? d.cwp_sugerido;
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid #F5F5F5' }}>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 10, whiteSpace: 'nowrap' }}>
                      {d.tieneArchivo ? (
                        <a href={docFileUrl(d.n_cmdic)} target="_blank" rel="noreferrer" title="Abrir PDF local"
                          style={{ color: '#A00000', fontWeight: 700, textDecoration: 'none', borderBottom: '1px dotted #A00000' }}>
                          📄 {d.n_cmdic}
                        </a>
                      ) : d.n_cmdic}
                    </td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 10, whiteSpace: 'nowrap', color: d.n_interno ? '#33475B' : '#CCCCCC' }}>{d.n_interno ?? '—'}</td>
                    <td style={{ padding: '7px 10px', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.titulo ?? ''}>
                      {d.tieneArchivo && d.titulo ? (
                        <a href={docFileUrl(d.n_cmdic)} target="_blank" rel="noreferrer" title={`${d.titulo} — abrir PDF local`}
                          style={{ color: '#1A1A1A', textDecoration: 'none' }}>
                          {d.titulo}
                        </a>
                      ) : d.titulo}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 10, color: '#757575', whiteSpace: 'nowrap' }}>{d.tipo_doc}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 10 }}>{d.rev ?? '—'}</td>
                    <td style={{ padding: '7px 10px' }}><span style={{ fontSize: 9, fontWeight: 700, padding: '2px 10px', borderRadius: 999, backgroundColor: eb.bg, color: eb.fg, whiteSpace: 'nowrap' }}>{eb.label}</span></td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 9.5, color: d.cwp_id_exacto ? '#166534' : '#B45309' }}>{cwp ?? '—'}{cwp && !d.cwp_id_exacto ? ' (sug.)' : ''}</td>
                    <td style={{ padding: '7px 10px', fontSize: 10, color: '#757575', whiteSpace: 'nowrap' }}>{fecha(d.fecha_modificacion)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
