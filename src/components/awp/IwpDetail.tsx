'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, Plus, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';

interface IwpData {
  iwp: any;
  actividades: any[];
  constraints: any[];
  progreso: any[];
}

interface Props {
  projectId: string;
  iwpId: string;
  onClose?: () => void;
  onChanged?: () => void;
}

const fecha = (s: string | null) => s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) : '—';
const num = (v: number | null | undefined) => v == null ? '—' : Math.round(v).toLocaleString('es-CL');
const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function IwpDetail({ projectId, iwpId, onClose, onChanged }: Props) {
  const [data, setData] = useState<IwpData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageInput, setImageInput] = useState('');
  const [imageType, setImageType] = useState<'scope_3d' | 'plano' | 'foto'>('scope_3d');
  const [tab, setTab] = useState<'resumen' | 'gantt' | 'constraints' | 'avance' | 'imagenes'>('resumen');

  // Avance
  const [pasos, setPasos] = useState<any[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [manualPct, setManualPct] = useState('');
  const [hhReales, setHhReales] = useState('');
  const [observacion, setObservacion] = useState('');
  const [savingAvance, setSavingAvance] = useState(false);

  // Constraints
  const [consTipo, setConsTipo] = useState('IFC');
  const [consDesc, setConsDesc] = useState('');
  const [consFecha, setConsFecha] = useState('');
  const [savingCons, setSavingCons] = useState(false);

  const reload = () => {
    fetch(`/api/mining-iwp?project_id=${projectId}&iwp_id=${iwpId}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(setData)
      .catch(e => setError(e.message));
  };

  useEffect(() => { setData(null); setPasos(null); setChecked(new Set()); reload(); }, [projectId, iwpId]);

  // Cargar pasos de ponderación cuando se conoce el CWP del IWP
  useEffect(() => {
    if (!data?.iwp?.cwp_id || pasos !== null) return;
    fetch(`/api/mining-iwp-progreso?project_id=${projectId}&cwp_id=${encodeURIComponent(data.iwp.cwp_id)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(d => setPasos(d.pasos ?? []))
      .catch(() => setPasos([]));
  }, [data?.iwp?.cwp_id, projectId, pasos]);

  const handleToggleConstraint = async (c: any) => {
    try {
      const res = await fetch('/api/mining-iwp-constraint', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, constraint_id: c.id, cleared: !c.cleared }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      reload(); onChanged?.();
    } catch (e) { setError(String(e)); }
  };

  const handleAddConstraint = async () => {
    if (!consTipo.trim()) return;
    setSavingCons(true);
    try {
      const res = await fetch('/api/mining-iwp-constraint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, iwp_id: iwpId, tipo: consTipo, descripcion: consDesc || null, fecha_necesaria: consFecha || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setConsDesc(''); setConsFecha('');
      reload(); onChanged?.();
    } catch (e) { setError(String(e)); }
    finally { setSavingCons(false); }
  };

  const handleReportarAvance = async () => {
    setSavingAvance(true);
    try {
      const usaPasos = (pasos?.length ?? 0) > 0;
      const body: any = {
        project_id: projectId, iwp_id: iwpId, fecha_reporte: hoyISO(),
        hh_reales_acum: hhReales ? Number(hhReales) : null,
        observacion: observacion || null,
      };
      if (usaPasos) {
        body.pasos_completados = Array.from(checked);
        body.pasos_disponibles_total = pasos!.map((p: any) => p.id);
      } else {
        if (manualPct === '') throw new Error('Ingresa el % de avance');
        body.avance_fisico_pct_manual = Number(manualPct);
      }
      const res = await fetch('/api/mining-iwp-progreso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setObservacion('');
      reload(); onChanged?.();
    } catch (e) { setError(String(e)); }
    finally { setSavingAvance(false); }
  };

  const handleAddImage = async () => {
    if (!imageInput.trim()) return;
    if (!data) return;
    const imgs = (data.iwp.imagenes || []).concat({ url: imageInput, tipo: imageType, nombre: `${imageType} ${new Date().toLocaleDateString()}`, fecha_carga: new Date().toISOString() });
    try {
      const res = await fetch('/api/mining-iwp', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, iwp_id: iwpId, imagenes: imgs }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setData({ ...data, iwp: { ...data.iwp, imagenes: imgs } });
      setImageInput('');
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRemoveImage = async (idx: number) => {
    if (!data) return;
    const imgs = data.iwp.imagenes.filter((_: any, i: number) => i !== idx);
    try {
      const res = await fetch('/api/mining-iwp', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, iwp_id: iwpId, imagenes: imgs }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setData({ ...data, iwp: { ...data.iwp, imagenes: imgs } });
    } catch (e) {
      setError(String(e));
    }
  };

  if (error) return <div style={{ color: '#A00000', fontSize: 13, padding: 32 }}>{error}</div>;
  if (!data) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px 32px', color: '#757575', fontSize: 13 }}><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Cargando…</div>;

  const { iwp, actividades, constraints } = data;
  const duracion = iwp.fecha_fin_plan && iwp.fecha_inicio_plan ? Math.ceil((new Date(iwp.fecha_fin_plan).getTime() - new Date(iwp.fecha_inicio_plan).getTime()) / 86400000) : 0;
  const hoyCons = constraints.filter((c: any) => !c.cleared);

  return (
    <div style={{ borderRadius: 14, border: '2px solid #EEEEEE', backgroundColor: 'white', overflow: 'hidden' }}>
      <div style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #EEEEEE', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#1A1A1A' }}>{iwp.iwp_id}</div>
          <div style={{ fontSize: 10.5, color: '#757575' }}>{iwp.descripcion}</div>
        </div>
        {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}><X style={{ width: 18, height: 18, color: '#9E9E9E' }} /></button>}
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #FF0000', backgroundColor: '#FAFAFA' }}>
        {(['resumen', 'gantt', 'constraints', 'avance', 'imagenes'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '9px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', border: 'none', backgroundColor: tab === t ? 'white' : '#FAFAFA', color: tab === t ? '#FF0000' : '#757575', cursor: 'pointer', borderBottom: tab === t ? '2px solid #FF0000' : 'none' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px' }}>
        {tab === 'resumen' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {[
              { label: 'HH ESTIMADAS', val: num(iwp.hh_estimadas), color: '#1A1A1A' },
              { label: 'DURACIÓN', val: duracion + ' días', color: '#1A1A1A' },
              { label: 'AVANCE FÍSICO', val: iwp.avance_fisico_pct + '%', color: iwp.avance_fisico_pct >= 50 ? '#166534' : '#B45309' },
              { label: 'CREW', val: iwp.crew_size || '—', color: '#1A1A1A' },
              { label: 'INICIO', val: fecha(iwp.fecha_inicio_plan), color: '#1A1A1A' },
              { label: 'FIN', val: fecha(iwp.fecha_fin_plan), color: '#1A1A1A' },
            ].map((k, i) => (
              <div key={i} style={{ borderRadius: 10, border: '1px solid #EEEEEE', padding: '10px 12px' }}>
                <div style={{ fontSize: 8.5, fontWeight: 900, color: '#757575' }}>{k.label}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: k.color, marginTop: 4 }}>{k.val}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'gantt' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', marginBottom: 4 }}>Actividades ({actividades.length})</div>
            {actividades.length === 0 && <div style={{ fontSize: 11, color: '#9E9E9E', fontStyle: 'italic', padding: '16px 0' }}>Sin actividades.</div>}
            {actividades.map((a: any, i: number) => (
              <div key={i} style={{ borderRadius: 8, border: '1px solid #EEEEEE', padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1A1A1A' }}>{a.prog?.codigo ?? 'N/A'}</span>
                  <span style={{ fontSize: 10, color: '#9E9E9E', fontWeight: 700 }}>HH: {num(a.hh_asignadas_iwp)}</span>
                </div>
                <div style={{ fontSize: 10.5, color: '#33475B', marginBottom: 4 }}>{a.prog?.descripcion}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: '#757575' }}><Calendar style={{ width: 12, height: 12 }} /> {fecha(a.prog?.fecha_inicio)} → {fecha(a.prog?.fecha_fin)}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'constraints' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A' }}>Restricciones ({constraints.length})</span>
              {hoyCons.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#A00000', fontWeight: 700 }}><AlertCircle style={{ width: 12, height: 12 }} /> {hoyCons.length} abiertas</span>}
            </div>
            {constraints.map((c: any, i: number) => (
              <div key={i} style={{ borderRadius: 8, border: c.cleared ? '1px solid #E0E0E0' : '1px solid #FDE68A', backgroundColor: c.cleared ? '#FAFAFA' : 'white', padding: '10px 12px', opacity: c.cleared ? 0.65 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <button onClick={() => handleToggleConstraint(c)} title={c.cleared ? 'Reabrir' : 'Marcar despejado'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex' }}>
                    {c.cleared ? <CheckCircle2 style={{ width: 14, height: 14, color: '#166534' }} /> : <AlertCircle style={{ width: 14, height: 14, color: '#B45309' }} />}
                  </button>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1A1A1A' }}>{c.tipo}</span>
                  <span style={{ fontSize: 9, color: '#757575', marginLeft: 'auto' }}>{c.cleared ? `✓ Despejado ${c.despejado_por ? 'por ' + c.despejado_por : ''}` : `vence ${fecha(c.fecha_necesaria)}`}</span>
                </div>
                <div style={{ fontSize: 10, color: '#33475B' }}>{c.descripcion}</div>
              </div>
            ))}
            <div style={{ borderRadius: 8, border: '1px dashed #E0E0E0', padding: '10px 12px', marginTop: 4 }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, color: '#757575', textTransform: 'uppercase', marginBottom: 8 }}>Agregar restricción</div>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 130px auto', gap: 8 }}>
                <select value={consTipo} onChange={e => setConsTipo(e.target.value)} style={{ padding: '7px 8px', fontSize: 10.5, border: '1px solid #EEEEEE', borderRadius: 8 }}>
                  {['IFC', 'MATERIAL', 'PERMISO', 'EQUIPO', 'PREDECESORA', 'OTRO'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="text" value={consDesc} onChange={e => setConsDesc(e.target.value)} placeholder="Descripción" style={{ padding: '7px 10px', fontSize: 10.5, border: '1px solid #EEEEEE', borderRadius: 8 }} />
                <input type="date" value={consFecha} onChange={e => setConsFecha(e.target.value)} style={{ padding: '7px 8px', fontSize: 10.5, border: '1px solid #EEEEEE', borderRadius: 8 }} />
                <button onClick={handleAddConstraint} disabled={savingCons} style={{ padding: '7px 12px', fontSize: 10.5, fontWeight: 700, backgroundColor: '#FF0000', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}><Plus style={{ width: 12, height: 12 }} /></button>
              </div>
            </div>
          </div>
        )}

        {tab === 'avance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pasos === null && <div style={{ fontSize: 11, color: '#757575' }}>Cargando pasos de avance…</div>}

            {pasos !== null && pasos.length > 0 && (() => {
              const totalPeso = pasos.reduce((s: number, p: any) => s + Number(p.peso ?? 0), 0);
              const pesoChecked = pasos.filter((p: any) => checked.has(p.id)).reduce((s: number, p: any) => s + Number(p.peso ?? 0), 0);
              const pctLive = totalPeso > 0 ? Math.round((pesoChecked / totalPeso) * 10000) / 100 : 0;
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A' }}>Pasos de avance ({pasos.length})</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: pctLive >= 100 ? '#166534' : '#FF0000' }}>{pctLive}%</span>
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {pasos.map((p: any) => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: checked.has(p.id) ? '1px solid #BBF7D0' : '1px solid #F3F4F6', backgroundColor: checked.has(p.id) ? '#F0FDF4' : 'white', cursor: 'pointer' }}>
                        <input type="checkbox" checked={checked.has(p.id)} style={{ accentColor: '#16A34A' }}
                          onChange={() => setChecked(prev => { const n = new Set(prev); if (n.has(p.id)) { n.delete(p.id); } else { n.add(p.id); } return n; })} />
                        <span style={{ flex: 1, fontSize: 10.5, color: '#33475B' }}>{p.descripcion ?? p.paso ?? p.subitem ?? p.item_code}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#757575' }}>{Number(p.peso ?? 0)}%</span>
                      </label>
                    ))}
                  </div>
                </>
              );
            })()}

            {pasos !== null && pasos.length === 0 && (
              <div>
                <div style={{ fontSize: 10.5, color: '#92400E', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                  Esta disciplina aún no tiene pasos de ponderación cargados — registra el avance con % manual.
                </div>
                <label style={{ fontSize: 10, fontWeight: 900, color: '#757575', textTransform: 'uppercase' }}>% Avance físico
                  <input type="number" min={0} max={100} value={manualPct} onChange={e => setManualPct(e.target.value)}
                    style={{ display: 'block', width: 120, marginTop: 6, padding: '7px 10px', fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 8, fontWeight: 400 }} />
                </label>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10 }}>
              <label style={{ fontSize: 10, fontWeight: 900, color: '#757575', textTransform: 'uppercase' }}>HH reales acum.
                <input type="number" min={0} value={hhReales} onChange={e => setHhReales(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: 6, padding: '7px 10px', fontSize: 11.5, border: '1px solid #E5E7EB', borderRadius: 8, fontWeight: 400 }} />
              </label>
              <label style={{ fontSize: 10, fontWeight: 900, color: '#757575', textTransform: 'uppercase' }}>Observación
                <input type="text" value={observacion} onChange={e => setObservacion(e.target.value)} placeholder="Opcional"
                  style={{ display: 'block', width: '100%', marginTop: 6, padding: '7px 10px', fontSize: 11.5, border: '1px solid #E5E7EB', borderRadius: 8, fontWeight: 400 }} />
              </label>
            </div>
            <button onClick={handleReportarAvance} disabled={savingAvance}
              style={{ alignSelf: 'flex-start', padding: '9px 18px', fontSize: 11, fontWeight: 800, backgroundColor: savingAvance ? '#FCA5A5' : '#FF0000', color: 'white', border: 'none', borderRadius: 10, cursor: savingAvance ? 'default' : 'pointer' }}>
              {savingAvance ? 'Guardando…' : 'Registrar avance'}
            </button>

            {(data.progreso ?? []).length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 10.5, fontWeight: 900, color: '#757575', textTransform: 'uppercase', marginBottom: 6 }}>Historial</div>
                {(data.progreso ?? []).map((r: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 10.5, color: '#33475B', padding: '5px 0', borderBottom: '1px solid #F3F4F6' }}>
                    <span style={{ fontWeight: 700, color: '#1A1A1A' }}>{fecha(r.fecha_reporte)}</span>
                    <span style={{ fontWeight: 900, color: r.avance_fisico_pct >= 100 ? '#166534' : '#B45309' }}>{r.avance_fisico_pct}%</span>
                    {r.hh_reales_acum != null && <span>HH: {num(r.hh_reales_acum)}</span>}
                    <span style={{ color: '#9E9E9E', marginLeft: 'auto' }}>{r.reportado_por}</span>
                    {r.observacion && <span style={{ color: '#757575' }}>· {r.observacion}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'imagenes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10 }}>
              <input type="text" value={imageInput} onChange={e => setImageInput(e.target.value)} placeholder="URL imagen" style={{ padding: '8px 10px', fontSize: 11, border: '1px solid #EEEEEE', borderRadius: 8, outline: 'none' }} />
              <select value={imageType} onChange={e => setImageType(e.target.value as any)} style={{ padding: '8px 10px', fontSize: 11, border: '1px solid #EEEEEE', borderRadius: 8, outline: 'none' }}>
                <option value="scope_3d">Scope 3D</option>
                <option value="plano">Plano</option>
                <option value="foto">Foto</option>
              </select>
              <button onClick={handleAddImage} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, backgroundColor: '#FF0000', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}><Plus style={{ width: 12, height: 12 }} /></button>
            </div>
            {(iwp.imagenes ?? []).length === 0 && <div style={{ fontSize: 11, color: '#9E9E9E', fontStyle: 'italic', padding: '32px 16px', textAlign: 'center' }}>Sin imágenes.</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {(iwp.imagenes ?? []).map((img: any, i: number) => (
                <div key={i} style={{ borderRadius: 8, border: '1px solid #EEEEEE', overflow: 'hidden', backgroundColor: '#FAFAFA', position: 'relative' }}>
                  <img src={img.url} alt={img.nombre} style={{ width: '100%', height: 100, objectFit: 'cover' }} onError={(e: any) => e.target.style.display = 'none'} />
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#1A1A1A' }}>{img.tipo}</div>
                    <div style={{ fontSize: 8, color: '#757575' }}>{img.nombre}</div>
                  </div>
                  <button onClick={() => handleRemoveImage(i)} style={{ position: 'absolute', top: 4, right: 4, background: '#FFFFFF', border: 'none', borderRadius: 999, width: 18, height: 18, padding: 0, cursor: 'pointer' }}><X style={{ width: 12, height: 12, color: '#9E9E9E' }} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
