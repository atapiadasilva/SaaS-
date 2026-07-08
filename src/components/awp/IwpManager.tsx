'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Plus, AlertTriangle, X, Trash2 } from 'lucide-react';
import IwpDetail from './IwpDetail';

export interface IwpViewerBridge {
  captureScope?: (name: string) => Promise<string | null>;
  selectElements?: (dbIds: number[]) => void;
  getScreenshot?: () => Promise<string | null>;
  getSelectedMonikers?: () => Promise<string[]>;
}

interface ProgTask { id: string; n: string; hh: number | null; s: string | null; e: string | null; code: string | null }

interface Props {
  projectId: string;
  cwp: { cwp: string; disc?: string; nombre?: string; prog?: { tasks?: ProgTask[] } | null };
  viewer?: IwpViewerBridge;
}

const num = (v: number | null | undefined) => v == null ? '—' : Math.round(v).toLocaleString('es-CL');
const fecha = (s: string | null) => s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) : '—';

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  Planificado: { bg: '#EFF6FF', fg: '#1D4ED8' },
  PLANIFICADO: { bg: '#EFF6FF', fg: '#1D4ED8' },
  LISTO_PARA_TRABAJO: { bg: '#ECFDF5', fg: '#047857' },
  EN_EJECUCION: { bg: '#FEF3C7', fg: '#B45309' },
  COMPLETADO: { bg: '#F3F4F6', fg: '#374151' },
};

export default function IwpManager({ projectId, cwp }: Props) {
  const [iwps, setIwps] = useState<any[]>([]);
  const [cwpInfo, setCwpInfo] = useState<{ hh_planner: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIwp, setSelectedIwp] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    if (!cwp?.cwp) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/mining-iwp?project_id=${projectId}&cwp_id=${encodeURIComponent(cwp.cwp)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(d => { setIwps(d.iwps ?? []); setCwpInfo(d.cwp ?? null); setError(null); })
      .catch(e => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, [projectId, cwp?.cwp]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (iwpId: string) => {
    if (!window.confirm(`¿Eliminar ${iwpId}? Se borran sus actividades, constraints y reportes.`)) return;
    const res = await fetch(`/api/mining-iwp?project_id=${projectId}&iwp_id=${encodeURIComponent(iwpId)}`, { method: 'DELETE' });
    if (res.ok) { if (selectedIwp === iwpId) setSelectedIwp(null); load(); }
    else setError((await res.json())?.error ?? 'Error al eliminar');
  };

  const hhAsignadas = iwps.reduce((s, i) => s + (Number(i.hh_estimadas) || 0), 0);
  const hhCwp = Number(cwpInfo?.hh_planner) || 0;
  const excedido = hhCwp > 0 && hhAsignadas > hhCwp;
  const hoy14 = Date.now() + 14 * 86400000;

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: '#757575', fontSize: 13 }}><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Cargando IWPs…</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedIwp ? '1fr 1.2fr' : '1fr', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#1A1A1A' }}>IWP ({iwps.length})</div>
            <div style={{ fontSize: 10, color: excedido ? '#A00000' : '#757575', fontWeight: excedido ? 700 : 400 }}>
              HH asignadas: {num(hhAsignadas)}{hhCwp > 0 ? ` / ${num(hhCwp)} del CWP` : ''}
            </div>
          </div>
          <button onClick={() => setShowCreate(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 11, fontWeight: 800, backgroundColor: '#FF0000', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
            <Plus style={{ width: 13, height: 13 }} /> Nuevo IWP
          </button>
        </div>

        {excedido && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 10, borderRadius: 8, backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 10.5, color: '#92400E' }}>
            <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
            La suma de HH de los IWP supera el presupuesto del CWP.
          </div>
        )}
        {error && <div style={{ fontSize: 11, color: '#A00000', marginBottom: 8 }}>{error}</div>}
        {iwps.length === 0 && <div style={{ fontSize: 11, color: '#9E9E9E', fontStyle: 'italic', padding: '24px 0' }}>Este CWP aún no tiene IWPs. Crea el primero con las actividades del programa P333.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {iwps.map((iwp: any) => {
            const st = STATUS_COLOR[iwp.status] ?? { bg: '#F3F4F6', fg: '#374151' };
            const cons = iwp.constraints ?? { total: 0, despejados: 0 };
            const consPend = cons.total - cons.despejados;
            const riesgo = consPend > 0 && iwp.fecha_inicio_plan && new Date(iwp.fecha_inicio_plan).getTime() <= hoy14;
            const avance = Number(iwp.avance_fisico_pct) || 0;
            const sel = selectedIwp === iwp.iwp_id;
            return (
              <div key={iwp.iwp_id} onClick={() => setSelectedIwp(iwp.iwp_id)}
                style={{ borderRadius: 12, border: sel ? '2px solid #FF0000' : '1px solid #EEEEEE', backgroundColor: 'white', padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 900, color: '#1A1A1A' }}>{iwp.iwp_id}</span>
                  <span style={{ fontSize: 8.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, backgroundColor: st.bg, color: st.fg, textTransform: 'uppercase' }}>{String(iwp.status ?? '').replace(/_/g, ' ')}</span>
                  {riesgo && <span title="Inicia en menos de 14 días con constraints pendientes"><AlertTriangle style={{ width: 14, height: 14, color: '#B45309' }} /></span>}
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(iwp.iwp_id); }} title="Eliminar IWP"
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Trash2 style={{ width: 13, height: 13, color: '#BDBDBD' }} />
                  </button>
                </div>
                <div style={{ fontSize: 10.5, color: '#33475B', marginBottom: 8 }}>{iwp.descripcion}</div>
                <div style={{ height: 6, borderRadius: 999, backgroundColor: '#F3F4F6', overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ width: `${Math.min(100, avance)}%`, height: '100%', backgroundColor: avance >= 100 ? '#16A34A' : '#FF0000' }} />
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 9.5, color: '#757575' }}>
                  <span><b style={{ color: '#1A1A1A' }}>{avance}%</b> avance</span>
                  <span>HH: <b style={{ color: '#1A1A1A' }}>{num(iwp.hh_estimadas)}</b></span>
                  <span>{fecha(iwp.fecha_inicio_plan)} → {fecha(iwp.fecha_fin_plan)}</span>
                  <span style={{ marginLeft: 'auto', color: consPend > 0 ? '#B45309' : '#166534', fontWeight: 700 }}>
                    Constraints {cons.despejados}/{cons.total}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedIwp && (
        <IwpDetail projectId={projectId} iwpId={selectedIwp} onClose={() => setSelectedIwp(null)} onChanged={load} />
      )}

      {showCreate && (
        <CreateIwpModal
          projectId={projectId}
          cwpId={cwp.cwp}
          tasks={cwp.prog?.tasks ?? []}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateIwpModal({ projectId, cwpId, tasks, onClose, onCreated }: {
  projectId: string; cwpId: string; tasks: ProgTask[];
  onClose: () => void; onCreated: () => void;
}) {
  const [descripcion, setDescripcion] = useState('');
  const [fechaIni, setFechaIni] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [crew, setCrew] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // programa_id -> HH asignadas (seleccionada si existe la key)
  const [sel, setSel] = useState<Record<string, number>>({});

  const toggle = (t: ProgTask) => {
    setSel(prev => {
      const next = { ...prev };
      if (t.id in next) delete next[t.id];
      else next[t.id] = Number(t.hh) || 0;
      return next;
    });
  };

  const totalHH = useMemo(() => Object.values(sel).reduce((s, v) => s + (Number(v) || 0), 0), [sel]);

  const handleCreate = async () => {
    if (!descripcion.trim() || !fechaIni || !fechaFin) { setError('Completa descripción y fechas.'); return; }
    if (Object.keys(sel).length === 0) { setError('Selecciona al menos una actividad del programa.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/mining-iwp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, cwp_id: cwpId, descripcion: descripcion.trim(),
          fecha_inicio_plan: fechaIni, fecha_fin_plan: fechaFin,
          crew_size: crew ? Number(crew) : null,
          actividades: Object.entries(sel).map(([programa_id, hh]) => ({ programa_id, hh_asignadas_iwp: hh })),
        }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Error al crear IWP');
      onCreated();
    } catch (e: any) {
      setError(String(e.message ?? e));
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 'min(880px, 100%)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: 24, backgroundColor: 'white', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #EEEEEE' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#1A1A1A' }}>Nuevo IWP — {cwpId}</div>
            <div style={{ fontSize: 10.5, color: '#757575' }}>Asigna actividades del programa P333 y define el paquete de instalación.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}><X style={{ width: 18, height: 18, color: '#9E9E9E' }} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 0, flex: 1, minHeight: 0 }}>
          <div style={{ padding: 16, borderRight: '1px solid #EEEEEE', overflowY: 'auto' }}>
            <div style={{ fontSize: 10.5, fontWeight: 900, color: '#757575', textTransform: 'uppercase', marginBottom: 8 }}>Actividades P333 ({tasks.length})</div>
            {tasks.length === 0 && <div style={{ fontSize: 11, color: '#9E9E9E', fontStyle: 'italic' }}>Este CWP no tiene actividades de programa cargadas.</div>}
            {tasks.map(t => {
              const checked = t.id in sel;
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: checked ? '1px solid #FECACA' : '1px solid #F3F4F6', backgroundColor: checked ? '#FEF2F2' : 'white', marginBottom: 6 }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(t)} style={{ accentColor: '#FF0000', cursor: 'pointer' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#1A1A1A' }}>{t.code ?? '—'}</div>
                    <div style={{ fontSize: 10, color: '#33475B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.n}</div>
                  </div>
                  {checked ? (
                    <input type="number" min={0} value={sel[t.id]} onChange={e => setSel(prev => ({ ...prev, [t.id]: Number(e.target.value) }))}
                      style={{ width: 80, padding: '5px 8px', fontSize: 10.5, border: '1px solid #E5E7EB', borderRadius: 6, textAlign: 'right' }} />
                  ) : (
                    <span style={{ fontSize: 9.5, color: '#9E9E9E', width: 80, textAlign: 'right' }}>{num(t.hh)} HH</span>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
            <label style={{ fontSize: 10.5, fontWeight: 900, color: '#757575', textTransform: 'uppercase' }}>Descripción *
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3} placeholder="Alcance del paquete de instalación…"
                style={{ display: 'block', width: '100%', marginTop: 6, padding: '8px 10px', fontSize: 11.5, border: '1px solid #E5E7EB', borderRadius: 8, resize: 'vertical', fontWeight: 400, textTransform: 'none' }} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 10.5, fontWeight: 900, color: '#757575', textTransform: 'uppercase' }}>Inicio plan *
                <input type="date" value={fechaIni} onChange={e => setFechaIni(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 6, padding: '7px 10px', fontSize: 11.5, border: '1px solid #E5E7EB', borderRadius: 8, fontWeight: 400 }} />
              </label>
              <label style={{ fontSize: 10.5, fontWeight: 900, color: '#757575', textTransform: 'uppercase' }}>Fin plan *
                <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 6, padding: '7px 10px', fontSize: 11.5, border: '1px solid #E5E7EB', borderRadius: 8, fontWeight: 400 }} />
              </label>
            </div>
            <label style={{ fontSize: 10.5, fontWeight: 900, color: '#757575', textTransform: 'uppercase' }}>Crew (personas)
              <input type="number" min={0} value={crew} onChange={e => setCrew(e.target.value)} placeholder="Ej: 8"
                style={{ display: 'block', width: '100%', marginTop: 6, padding: '7px 10px', fontSize: 11.5, border: '1px solid #E5E7EB', borderRadius: 8, fontWeight: 400 }} />
            </label>
            <div style={{ marginTop: 'auto', borderRadius: 10, backgroundColor: '#FAFAFA', border: '1px solid #EEEEEE', padding: '10px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: '#757575' }}>HH ASIGNADAS AL IWP</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#1A1A1A' }}>{num(totalHH)}</div>
              <div style={{ fontSize: 9, color: '#9E9E9E' }}>{Object.keys(sel).length} actividad(es) seleccionada(s)</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderTop: '1px solid #EEEEEE', backgroundColor: '#FAFAFA' }}>
          {error && <span style={{ fontSize: 10.5, color: '#A00000', fontWeight: 700 }}>{error}</span>}
          <button onClick={onClose} style={{ marginLeft: 'auto', padding: '9px 16px', fontSize: 11, fontWeight: 700, backgroundColor: 'white', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 10, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleCreate} disabled={saving} style={{ padding: '9px 18px', fontSize: 11, fontWeight: 800, backgroundColor: saving ? '#FCA5A5' : '#FF0000', color: 'white', border: 'none', borderRadius: 10, cursor: saving ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
            Crear IWP
          </button>
        </div>
      </div>
    </div>
  );
}
