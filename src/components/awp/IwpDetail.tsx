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
}

const fecha = (s: string | null) => s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) : '—';
const num = (v: number | null | undefined) => v == null ? '—' : Math.round(v).toLocaleString('es-CL');

export default function IwpDetail({ projectId, iwpId, onClose }: Props) {
  const [data, setData] = useState<IwpData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageInput, setImageInput] = useState('');
  const [imageType, setImageType] = useState<'scope_3d' | 'plano' | 'foto'>('scope_3d');
  const [tab, setTab] = useState<'resumen' | 'gantt' | 'constraints' | 'imagenes'>('resumen');

  useEffect(() => {
    fetch(`/api/mining-iwp?project_id=${projectId}&iwp_id=${iwpId}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(setData)
      .catch(e => setError(e.message));
  }, [projectId, iwpId]);

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
        {(['resumen', 'gantt', 'constraints', 'imagenes'] as const).map(t => (
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
                  {c.cleared ? <CheckCircle2 style={{ width: 14, height: 14, color: '#166534' }} /> : <AlertCircle style={{ width: 14, height: 14, color: '#B45309' }} />}
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1A1A1A' }}>{c.tipo}</span>
                  <span style={{ fontSize: 9, color: '#757575', marginLeft: 'auto' }}>{c.cleared ? '✓ Despejado' : `vence ${fecha(c.fecha_necesaria)}`}</span>
                </div>
                <div style={{ fontSize: 10, color: '#33475B' }}>{c.descripcion}</div>
              </div>
            ))}
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
