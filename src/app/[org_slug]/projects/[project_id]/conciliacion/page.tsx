'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Search, X, ChevronRight, Link2, CheckCircle2, AlertTriangle, Flame, ArrowRight, Sparkles, Grid3x3, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import ItemizadoTable from '@/components/awp/ItemizadoTable';
import ConciliacionDiagrama from '@/components/awp/ConciliacionDiagrama';

type RelId = 'eco2_cwp' | 'item_bmp' | 'prog_cwp' | 'aconex_cwp';
type Vista = 'resumen' | 'eco2' | 'match' | 'diagrama';

interface Relacion {
  id: RelId; label: string; desc: string; origen: string; destino: string;
  total: number; ok: number; huerfanos: number; cobertura: number;
  salud: 'OK' | 'REVISAR' | 'CRITICO';
}
interface Detalle { huerfanos: any[]; candidatos: any[]; }

const fn = (v: number) => Math.round(v).toLocaleString('es-CL');
const fclp = (v: number) => '$' + Math.round(v).toLocaleString('es-CL');

function score(a: string, b: string): number {
  const wa = new Set(a.toUpperCase().split(/[^A-ZAEIOUÁÉÍÓÚÑ0-9]+/).filter(w => w.length > 3));
  const wb = new Set(b.toUpperCase().split(/[^A-ZAEIOUÁÉÍÓÚÑ0-9]+/).filter(w => w.length > 3));
  let s = 0;
  for (const w of wa) if (wb.has(w)) s++;
  return s;
}

const SALUD_STYLE = { OK: 'bg-green-50 text-green-700 border-green-200', REVISAR: 'bg-amber-50 text-amber-700 border-amber-200', CRITICO: 'bg-red-50 text-[#A00000] border-red-200' };

export default function ConciliacionPage() {
  const params = useParams();
  const projectId = params.project_id as string;

  const [relaciones, setRelaciones] = useState<Relacion[] | null>(null);
  const [rel, setRel] = useState<RelId | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [orphan, setOrphan] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [vista, setVista] = useState<Vista>('resumen');
  const [stats, setStats] = useState<any | null>(null);

  const loadResumen = () => {
    fetch(`/api/mining-conciliacion?project_id=${projectId}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(d => { setRelaciones(d.relaciones); setStats(d.stats ?? null); })
      .catch(e => setError(e.message));
  };

  useEffect(() => { loadResumen(); }, [projectId]);

  const abrirRel = (r: RelId) => {
    setRel(r); setDetalle(null); setOrphan(null); setSearch(''); setNota('');
    fetch(`/api/mining-conciliacion?project_id=${projectId}&rel=${r}`)
      .then(async res => { const d = await res.json(); if (!res.ok) throw new Error(d?.error); return d; })
      .then(d => { setDetalle(d); if (d.huerfanos.length) setOrphan(d.huerfanos[0]); })
      .catch(e => setError(e.message));
  };

  const aplicar = async (target: string) => {
    if (!rel || !orphan) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/mining-conciliacion', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, rel, id: orphan.id, target, nota: nota || undefined }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error);
      setDetalle(prev => {
        if (!prev) return prev;
        const rest = prev.huerfanos.filter((h: any) => h.id !== orphan.id);
        setOrphan(rest[0] ?? null);
        return { ...prev, huerfanos: rest };
      });
      setDone(v => v + 1);
      setNota('');
      loadResumen();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const candidatos = useMemo(() => {
    if (!detalle || !orphan || !rel) return [];
    const q = search.trim().toUpperCase();
    const texto = orphan.nombre_actividad ?? orphan.descripcion ?? '';
    let pool = detalle.candidatos;
    if (q) pool = pool.filter((c: any) => JSON.stringify(c).toUpperCase().includes(q));

    const ranked = pool.map((c: any) => {
      let pts = 0;
      const razones: string[] = [];
      if (rel === 'item_bmp') {
        if (orphan.n_partida && c.partida && String(orphan.n_partida).startsWith(c.partida)) { pts += 20; razones.push('N° partida'); }
        const s = score(`${orphan.commodity ?? ''} ${orphan.descripcion ?? ''}`, `${c.commodity ?? ''} ${c.nombre ?? ''}`);
        pts += s; if (s > 0) razones.push(`${s} words`);
      } else if (rel === 'eco2_cwp') {
        if (orphan.area && c.disciplina) { if (score(orphan.area, c.disciplina) > 0) { pts += 5; razones.push('area match'); } }
        const s = score(`${orphan.descripcion}`, `${c.cwp_nombre} ${c.disciplina ?? ''}`);
        pts += s; if (s > 0) razones.push(`${s} words`);
      } else {
        const s = score(texto, `${c.cwp_nombre} ${c.disciplina ?? ''}`);
        pts += s; if (s > 0) razones.push(`${s} words`);
      }
      return { c, pts, razones };
    });
    ranked.sort((a, b) => b.pts - a.pts);
    return ranked.slice(0, 40);
  }, [detalle, orphan, rel, search]);

  const relActual = relaciones?.find(r => r.id === rel) ?? null;

  if (error && !relaciones) return <div style={{ color: '#A00000', fontSize: '13px', padding: '32px' }}>{error}</div>;
  if (!relaciones) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', paddingTop: '96px', color: '#757575', fontSize: '13px' }}><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Analizando…</div>;

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontWeight: 'bold', fontSize: '22px', color: '#1A1A1A' }}>CONCILIACIÓN <span style={{ color: '#FF0000' }}>DE DATOS</span></h1>
          <p style={{ fontSize: '11.5px', color: '#757575' }}>Itemizado, Bases de M&P, Programa, Aconex y tu Diccionario AWP (7 CWA + 69 CWP). {done > 0 && <span style={{ marginLeft: '12px', color: '#166534', fontWeight: 'bold' }}>✓ {done} matches</span>}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {([['resumen', 'Resumen'], ['eco2', 'Hoja del itemizado'], ['diagrama', 'Diagrama relacional']] as [Vista, string][]).map(([v, label]) => (
            <button key={v} onClick={() => { setVista(v); if (v !== 'match') { setRel(null); setDetalle(null); setOrphan(null); } }}
              style={{ padding: '7px 14px', borderRadius: '9999px', fontSize: '11px', fontWeight: 900, cursor: 'pointer', border: vista === v ? '2px solid #FF0000' : '2px solid #EEEEEE', backgroundColor: vista === v ? '#FF0000' : 'white', color: vista === v ? 'white' : '#33475B' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {vista === 'resumen' && (

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {relaciones.map(r => (
          <button key={r.id} onClick={() => { setVista(r.id === 'eco2_cwp' ? 'eco2' : 'match'); abrirRel(r.id); }} style={{ textAlign: 'left', padding: '16px', borderRadius: '16px', border: rel === r.id ? '2px solid #FF0000' : '2px solid #EEEEEE', backgroundColor: 'white', cursor: 'pointer', transition: 'all 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Link2 style={{ width: '14px', height: '14px', color: '#FF0000', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', fontWeight: '900', color: '#1A1A1A' }}>{r.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: '8.5px', fontWeight: '900', padding: '4px 8px', borderRadius: '9999px', border: '1px solid', ...(r.salud === 'OK' ? { backgroundColor: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' } : r.salud === 'REVISAR' ? { backgroundColor: '#fef3c7', color: '#b45309', borderColor: '#fde68a' } : { backgroundColor: '#fee2e2', color: '#a00000', borderColor: '#fecaca' }) }}>{r.salud}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div style={{ flex: 1, height: '5px', borderRadius: '9999px', backgroundColor: '#F5F5F5', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '9999px', backgroundColor: r.cobertura >= 98 ? '#22C55E' : r.cobertura >= 80 ? '#FBBF24' : '#FF0000', width: `${r.cobertura}%` }} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: '900', color: '#1A1A1A' }}>{r.cobertura}%</span>
            </div>
            <div style={{ fontSize: '9.5px', color: '#757575', display: 'flex', justifyContent: 'space-between' }}>
              <span>{fn(r.ok)} / {fn(r.total)}</span>
              <span style={{ fontWeight: 'bold', color: r.huerfanos > 0 ? '#A00000' : '#16A34A' }}>{r.huerfanos > 0 ? `${fn(r.huerfanos)} sueltas` : 'completo'}</span>
            </div>
          </button>
        ))}
      </div>
      )}

      {vista === 'eco2' && <ItemizadoTable projectId={projectId} />}

      {vista === 'diagrama' && <ConciliacionDiagrama stats={stats} relaciones={relaciones} />}

      {vista === 'match' && rel && (

        <div style={{ borderRadius: '16px', border: '2px solid #EEEEEE', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '2px solid #FF0000', display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: 'white' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1A1A1A' }}>BANCO DE MATCH — <span style={{ color: '#FF0000' }}>{relActual?.label}</span></div>
              <div style={{ fontSize: '10px', color: '#757575' }}>{relActual?.desc}</div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#757575' }}><span style={{ fontFamily: 'monospace' }}>{relActual?.origen}</span> <ArrowRight style={{ width: '12px', height: '12px', display: 'inline', color: '#FF0000' }} /> <span style={{ fontFamily: 'monospace' }}>{relActual?.destino}</span></div>
            <button onClick={() => { setRel(null); setDetalle(null); setOrphan(null); setVista('resumen'); }} style={{ padding: '6px', borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#757575' }}><X style={{ width: '16px', height: '16px' }} /></button>
          </div>

          {!detalle ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', paddingTop: '64px', paddingBottom: '64px', color: '#757575', fontSize: '12px' }}><Loader2 style={{ width: '16px', height: '16px' }} /> Cargando…</div>
          ) : detalle.huerfanos.length === 0 ? (
            <div style={{ paddingTop: '64px', paddingBottom: '64px', textAlign: 'center' }}><CheckCircle2 style={{ width: '32px', height: '32px', color: '#22C55E', margin: '0 auto 8px' }} /><div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1A1A1A' }}>Conciliado al 100%</div></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', borderRight: '1px solid #EEEEEE' }}>
              <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
                <div style={{ padding: '8px 16px', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', color: '#BDBDBD', position: 'sticky', top: 0, backgroundColor: 'white', borderBottom: '1px solid #F5F5F5' }}>{detalle.huerfanos.length} items sin CWP</div>
                {detalle.huerfanos.map((h: any, hi: number) => (
                  <button key={h.id ?? `${h.item}-${hi}`} onClick={() => { setOrphan(h); setSearch(''); }} style={{ width: '100%', textAlign: 'left', padding: '10px 16px', borderBottom: '1px solid #FAFAFA', border: orphan?.id === h.id ? '4px solid #FF0000' : 'none', backgroundColor: orphan?.id === h.id ? '#FEE2E2' : 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}>
                    <div style={{ fontSize: '11px', color: '#1A1A1A', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(rel === 'eco2_cwp' || rel === 'item_bmp') ? `Item ${h.item}${h.n_partida ? ` · ${h.n_partida}` : ''}` : (h.nombre_actividad ?? h.titulo ?? h.n_cmdic)}</div>
                    <div style={{ fontSize: '9px', color: '#757575', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '4px' }}>{(rel === 'eco2_cwp' || rel === 'item_bmp') ? h.descripcion : (h.task_id ?? h.cod_actividad ?? '')}</div>
                    {(rel === 'eco2_cwp' || rel === 'item_bmp') && <div style={{ fontSize: '8.5px', color: '#6B7280', marginTop: '4px' }}>{h.commodity ? `${h.commodity} | ` : ''}Area: {h.area} | {h.cantidad} {h.unidad}</div>}
                  </button>
                ))}
              </div>
              <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
                {!orphan ? (
                  <div style={{ paddingTop: '64px', paddingBottom: '64px', textAlign: 'center', color: '#757575', fontSize: '12px', fontStyle: 'italic' }}>Selecciona un item a la izquierda.</div>
                ) : (
                  <div>
                    <div style={{ padding: '12px 20px', backgroundColor: '#FAFAFA', borderBottom: '1px solid #EEEEEE', position: 'sticky', top: 0, zIndex: 10 }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#1A1A1A' }}>{(rel === 'eco2_cwp' || rel === 'item_bmp') ? `Item ${orphan.item}${orphan.n_partida ? ` · ${orphan.n_partida}` : ''}` : (orphan.nombre_actividad ?? orphan.titulo ?? '')}</div>
                      <div style={{ fontSize: '9.5px', color: '#757575', marginTop: '4px', fontFamily: 'monospace' }}>{(rel === 'eco2_cwp' || rel === 'item_bmp') ? orphan.descripcion : (orphan.task_id ?? orphan.cod_actividad ?? '')}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <Search style={{ width: '14px', height: '14px', position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#BDBDBD' }} />
                          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar CWP..." style={{ width: '100%', paddingLeft: '32px', paddingRight: '12px', paddingTop: '6px', paddingBottom: '6px', borderRadius: '9999px', border: '1px solid #E0E0E0', fontSize: '11px', backgroundColor: 'white', outline: 'none' }} />
                        </div>
                        <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota opcional" style={{ width: '240px', paddingLeft: '12px', paddingRight: '12px', paddingTop: '6px', paddingBottom: '6px', borderRadius: '9999px', border: '1px solid #E0E0E0', fontSize: '11px', backgroundColor: 'white', outline: 'none' }} />
                      </div>
                    </div>
                    {error && <div style={{ margin: '12px 20px 0', fontSize: '10.5px', color: '#A00000', backgroundColor: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px' }}>{error}</div>}
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {candidatos.map(({ c, pts, razones }, i) => (
                        <div key={(c.partida ?? c.cwp_id) + i} style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '8px', border: i === 0 && pts > 4 ? '1px solid rgba(255, 0, 0, 0.5)' : '1px solid #EEEEEE', padding: '12px', backgroundColor: i === 0 && pts > 4 ? 'rgba(254, 226, 226, 0.5)' : 'white', transition: 'all 0.2s' }}>
                          {i === 0 && pts > 4 && <Sparkles style={{ width: '14px', height: '14px', color: '#FF0000', flexShrink: 0 }} />}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: '900', color: '#1A1A1A' }}>{c.partida ?? c.cwp_id}</span>
                              <span style={{ fontSize: '10.5px', color: '#33475B', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre ?? c.cwp_nombre}</span>
                            </div>
                            <div style={{ fontSize: '9px', color: '#757575', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '4px' }}>{c.commodity ? `${c.commodity} · ` : ''}{c.pasos_fisico != null ? `${c.pasos_fisico} pasos físicos · ${c.hitos_financiero} hitos pago` : ''}{c.disciplina ?? ''}{razones.length > 0 && <span style={{ color: '#A00000', fontWeight: 'bold' }}> — {razones.join(' · ')}</span>}</div>
                          </div>
                          <button onClick={() => aplicar(String(c.partida ?? c.cwp_id))} disabled={saving} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#FF0000', color: 'white', fontSize: '10px', fontWeight: '900', borderRadius: '9999px', paddingLeft: '14px', paddingRight: '14px', paddingTop: '6px', paddingBottom: '6px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.4 : 1 }}>
                            <Link2 style={{ width: '12px', height: '12px' }} /> Machear
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}