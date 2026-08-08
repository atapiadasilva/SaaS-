'use client';

// Catálogo de turnos y cuadrillas.
//
// Es un dato maestro chico pero decisivo: el producto de una cuadrilla por su turno es el
// tamaño objetivo del IWP. Cambiar acá un 14×14 por un 7×7 cambia el quiebre de todos los
// CWP que se aperturen después.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Plus, Trash2, Users, Clock, ArrowLeft, Star, Pencil, Check, X } from 'lucide-react';

interface Turno {
  id: string; codigo: string; nombre: string | null;
  dias_trabajo: number; dias_descanso: number; horas_dia: number;
  es_default: boolean; activo: boolean;
}
interface Rol { rol: string; cantidad: number }
interface Cuadrilla {
  id: string; codigo: string; nombre: string | null; disciplina_cod: string | null;
  composicion: Rol[] | null; n_personas: number; turno_id: string | null;
  factor_productividad: number; activa: boolean; observacion: string | null;
}

const ROJO = '#FF0000';
const num = (v: number) => Math.round(v).toLocaleString('es-CL');

export default function CuadrillasPage() {
  const params = useParams();
  const projectId = params.project_id as string;
  const orgSlug = params.org_slug as string;

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [disciplinas, setDisciplinas] = useState<{ cod: string; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    fetch(`/api/mining-cuadrilla?project_id=${projectId}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(d => {
        setTurnos(d.turnos ?? []);
        setCuadrillas(d.cuadrillas ?? []);
        setError(null);
      })
      .catch(e => setError(String(e.message ?? e)))
      .finally(() => setCargando(false));
  }, [projectId]);

  useEffect(() => {
    cargar();
    fetch(`/api/mining-recursos?project_id=${projectId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setDisciplinas((d?.disciplinas ?? []).map((x: any) => ({ cod: x.disciplina_cod, nombre: x.disciplina }))))
      .catch(() => {});
  }, [cargar, projectId]);

  const llamar = async (metodo: string, body: any) => {
    setError(null);
    const res = await fetch('/api/mining-cuadrilla', {
      method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) { setError((await res.json())?.error ?? 'Error'); return false; }
    cargar();
    return true;
  };

  const borrar = async (tipo: 'turno' | 'cuadrilla', id: string, nombre: string) => {
    if (!window.confirm(`¿Eliminar ${nombre}? Si ya hay IWP que lo usan, se desactiva en vez de borrarse.`)) return;
    const res = await fetch(`/api/mining-cuadrilla?project_id=${projectId}&tipo=${tipo}&id=${id}`, { method: 'DELETE' });
    if (!res.ok) { setError((await res.json())?.error ?? 'Error'); return; }
    cargar();
  };

  if (cargando) return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 40, color: '#757575', fontSize: 13 }}><Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> Cargando catálogo…</div>;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Link href={`/${orgSlug}/projects/${projectId}/recursos`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#757575', textDecoration: 'none', marginBottom: 10 }}>
        <ArrowLeft style={{ width: 13, height: 13 }} /> Recursos y dotación
      </Link>

      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#1A1A1A', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
        <Users style={{ width: 24, height: 24, color: ROJO }} /> Turnos y <span style={{ color: ROJO }}>cuadrillas</span>
      </h1>
      <p style={{ fontSize: 11.5, color: '#757575', marginTop: 4, marginBottom: 18, maxWidth: 720, lineHeight: 1.5 }}>
        Una cuadrilla por su turno da la capacidad de un ciclo, y esa capacidad es el tamaño objetivo del IWP.
        La rutina de apertura de CWP usa estos números para proponer el quiebre.
      </p>

      {error && <div style={{ fontSize: 11.5, color: '#A00000', marginBottom: 12, padding: '8px 12px', borderRadius: 8, backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1fr) minmax(420px, 1.3fr)', gap: 18, alignItems: 'start' }}>
        <TurnosPanel
          turnos={turnos} projectId={projectId}
          onGuardar={llamar} onBorrar={(id, nombre) => borrar('turno', id, nombre)}
        />
        <CuadrillasPanel
          cuadrillas={cuadrillas} turnos={turnos} disciplinas={disciplinas} projectId={projectId}
          onGuardar={llamar} onBorrar={(id, nombre) => borrar('cuadrilla', id, nombre)}
        />
      </div>
    </div>
  );
}

// ─── Turnos ──────────────────────────────────────────────────────────────────

function TurnosPanel({ turnos, projectId, onGuardar, onBorrar }: {
  turnos: Turno[]; projectId: string;
  onGuardar: (metodo: string, body: any) => Promise<boolean>;
  onBorrar: (id: string, nombre: string) => void;
}) {
  const [nuevo, setNuevo] = useState(false);
  const [f, setF] = useState({ codigo: '', nombre: '', dias_trabajo: '7', dias_descanso: '7', horas_dia: '11' });
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    setGuardando(true);
    const ok = await onGuardar('POST', {
      project_id: projectId, tipo: 'turno', codigo: f.codigo, nombre: f.nombre || null,
      dias_trabajo: Number(f.dias_trabajo), dias_descanso: Number(f.dias_descanso), horas_dia: Number(f.horas_dia),
    });
    setGuardando(false);
    if (ok) { setNuevo(false); setF({ codigo: '', nombre: '', dias_trabajo: '7', dias_descanso: '7', horas_dia: '11' }); }
  };

  return (
    <section style={panel}>
      <div style={cabecera}>
        <Clock style={{ width: 15, height: 15, color: ROJO }} />
        <span style={{ fontSize: 12.5, fontWeight: 900, color: '#1A1A1A' }}>Regímenes de turno ({turnos.length})</span>
        <button onClick={() => setNuevo(v => !v)} style={{ ...btnMini, marginLeft: 'auto' }}>
          {nuevo ? <X style={{ width: 12, height: 12 }} /> : <Plus style={{ width: 12, height: 12 }} />} {nuevo ? 'Cancelar' : 'Nuevo'}
        </button>
      </div>

      {nuevo && (
        <div style={{ padding: 12, borderBottom: '1px solid #EEEEEE', backgroundColor: '#FAFAFA', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Campo label="Código"><input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} placeholder="14X14" style={input} /></Campo>
          <Campo label="Nombre"><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Turno 14×14" style={input} /></Campo>
          <Campo label="Días de trabajo"><input type="number" min={1} value={f.dias_trabajo} onChange={e => setF({ ...f, dias_trabajo: e.target.value })} style={input} /></Campo>
          <Campo label="Días de descanso"><input type="number" min={0} value={f.dias_descanso} onChange={e => setF({ ...f, dias_descanso: e.target.value })} style={input} /></Campo>
          <Campo label="Horas por día"><input type="number" min={1} step={0.5} value={f.horas_dia} onChange={e => setF({ ...f, horas_dia: e.target.value })} style={input} /></Campo>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={crear} disabled={guardando} style={{ ...btnPri, width: '100%', justifyContent: 'center' }}>
              {guardando && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />} Crear turno
            </button>
          </div>
          <div style={{ gridColumn: '1 / -1', fontSize: 9.5, color: '#757575' }}>
            Una persona entrega <b>{(Number(f.dias_trabajo) || 0) * (Number(f.horas_dia) || 0)} HH</b> por ciclo.
          </div>
        </div>
      )}

      <div>
        {turnos.map(t => (
          <div key={t.id} style={{ ...fila, opacity: t.activo ? 1 : 0.5 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 900, color: '#1A1A1A' }}>{t.codigo}</span>
                {t.es_default && <span title="Turno por defecto del proyecto"><Star style={{ width: 12, height: 12, color: '#F59E0B', fill: '#F59E0B' }} /></span>}
                {!t.activo && <span style={{ fontSize: 8.5, color: '#9E9E9E' }}>inactivo</span>}
              </div>
              <div style={{ fontSize: 10, color: '#757575' }}>
                {t.dias_trabajo}×{t.dias_descanso} · {t.horas_dia} h/día · <b>{num(t.dias_trabajo * t.horas_dia)} HH por persona/ciclo</b>
              </div>
            </div>
            {!t.es_default && (
              <button title="Marcar como turno por defecto" onClick={() => onGuardar('PATCH', { project_id: projectId, tipo: 'turno', id: t.id, es_default: true })} style={btnIcono}>
                <Star style={{ width: 13, height: 13, color: '#BDBDBD' }} />
              </button>
            )}
            <button title="Eliminar" onClick={() => onBorrar(t.id, t.codigo)} style={btnIcono}>
              <Trash2 style={{ width: 13, height: 13, color: '#BDBDBD' }} />
            </button>
          </div>
        ))}
        {turnos.length === 0 && <div style={vacio}>Sin turnos. Crea al menos uno para poder dimensionar cuadrillas.</div>}
      </div>
    </section>
  );
}

// ─── Cuadrillas ──────────────────────────────────────────────────────────────

function CuadrillasPanel({ cuadrillas, turnos, disciplinas, projectId, onGuardar, onBorrar }: {
  cuadrillas: Cuadrilla[]; turnos: Turno[]; disciplinas: { cod: string; nombre: string }[]; projectId: string;
  onGuardar: (metodo: string, body: any) => Promise<boolean>;
  onBorrar: (id: string, nombre: string) => void;
}) {
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const vacia = { codigo: '', nombre: '', disciplina_cod: '', turno_id: turnos[0]?.id ?? '', factor: '1' };
  const [f, setF] = useState(vacia);
  const [roles, setRoles] = useState<Rol[]>([{ rol: 'Capataz', cantidad: 1 }]);
  const [guardando, setGuardando] = useState(false);

  const personas = roles.reduce((s, r) => s + (Number(r.cantidad) || 0), 0);
  const turno = turnos.find(t => t.id === f.turno_id);
  const capacidad = turno ? Math.round(personas * turno.dias_trabajo * turno.horas_dia * (Number(f.factor) || 1)) : 0;

  const crear = async () => {
    setGuardando(true);
    const ok = await onGuardar('POST', {
      project_id: projectId, tipo: 'cuadrilla', codigo: f.codigo, nombre: f.nombre || null,
      disciplina_cod: f.disciplina_cod || null, composicion: roles.filter(r => r.rol.trim() && r.cantidad > 0),
      n_personas: personas, turno_id: f.turno_id || null, factor_productividad: Number(f.factor) || 1,
    });
    setGuardando(false);
    if (ok) { setNuevo(false); setF(vacia); setRoles([{ rol: 'Capataz', cantidad: 1 }]); }
  };

  return (
    <section style={panel}>
      <div style={cabecera}>
        <Users style={{ width: 15, height: 15, color: ROJO }} />
        <span style={{ fontSize: 12.5, fontWeight: 900, color: '#1A1A1A' }}>Cuadrillas tipo ({cuadrillas.length})</span>
        <button onClick={() => setNuevo(v => !v)} disabled={turnos.length === 0} style={{ ...btnMini, marginLeft: 'auto', opacity: turnos.length === 0 ? 0.5 : 1 }}>
          {nuevo ? <X style={{ width: 12, height: 12 }} /> : <Plus style={{ width: 12, height: 12 }} />} {nuevo ? 'Cancelar' : 'Nueva'}
        </button>
      </div>

      {nuevo && (
        <div style={{ padding: 12, borderBottom: '1px solid #EEEEEE', backgroundColor: '#FAFAFA' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <Campo label="Código"><input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} placeholder="CUAD-EST-01" style={input} /></Campo>
            <Campo label="Nombre"><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Montaje estructura" style={input} /></Campo>
            <Campo label="Disciplina">
              <select value={f.disciplina_cod} onChange={e => setF({ ...f, disciplina_cod: e.target.value })} style={input}>
                <option value="">Todas</option>
                {disciplinas.map(d => <option key={d.cod} value={d.cod}>{d.cod} — {d.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Turno">
              <select value={f.turno_id} onChange={e => setF({ ...f, turno_id: e.target.value })} style={input}>
                {turnos.map(t => <option key={t.id} value={t.id}>{t.codigo} · {t.horas_dia} h × {t.dias_trabajo} d</option>)}
              </select>
            </Campo>
            <Campo label="Factor de productividad">
              <input type="number" min={0.1} max={2} step={0.05} value={f.factor} onChange={e => setF({ ...f, factor: e.target.value })} style={input} />
            </Campo>
          </div>

          <div style={{ fontSize: 9.5, fontWeight: 900, color: '#757575', textTransform: 'uppercase', marginBottom: 6 }}>Composición</div>
          {roles.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px auto', gap: 6, marginBottom: 5 }}>
              <input value={r.rol} onChange={e => setRoles(roles.map((x, j) => j === i ? { ...x, rol: e.target.value } : x))} placeholder="Rol" style={input} />
              <input type="number" min={0} value={r.cantidad} onChange={e => setRoles(roles.map((x, j) => j === i ? { ...x, cantidad: Number(e.target.value) } : x))} style={input} />
              <button onClick={() => setRoles(roles.filter((_, j) => j !== i))} style={btnIcono}><Trash2 style={{ width: 12, height: 12, color: '#BDBDBD' }} /></button>
            </div>
          ))}
          <button onClick={() => setRoles([...roles, { rol: '', cantidad: 1 }])} style={{ ...btnMini, marginTop: 2 }}>
            <Plus style={{ width: 11, height: 11 }} /> Agregar rol
          </button>

          <div style={{ marginTop: 12, padding: '9px 11px', borderRadius: 8, backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: '#991B1B' }}>CAPACIDAD POR CICLO — TAMAÑO OBJETIVO DEL IWP</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#1A1A1A' }}>{num(capacidad)} HH</div>
            <div style={{ fontSize: 9.5, color: '#7F1D1D' }}>
              {personas} personas{turno ? ` × ${turno.horas_dia} h × ${turno.dias_trabajo} días` : ''}{Number(f.factor) !== 1 ? ` × factor ${f.factor}` : ''}
            </div>
          </div>

          <button onClick={crear} disabled={guardando || personas === 0} style={{ ...btnPri, marginTop: 10, width: '100%', justifyContent: 'center', opacity: personas === 0 ? 0.5 : 1 }}>
            {guardando && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />} Crear cuadrilla
          </button>
        </div>
      )}

      <div>
        {cuadrillas.map(c => {
          const t = turnos.find(x => x.id === c.turno_id);
          const cap = t ? Math.round(c.n_personas * t.dias_trabajo * t.horas_dia * c.factor_productividad) : null;
          const enEdicion = editando === c.id;
          return (
            <div key={c.id} style={{ ...fila, opacity: c.activa ? 1 : 0.5, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 900, color: '#1A1A1A' }}>{c.codigo}</span>
                  {c.disciplina_cod && <span style={{ fontSize: 8.5, fontWeight: 800, padding: '1px 6px', borderRadius: 999, backgroundColor: '#F3F4F6', color: '#374151' }}>{c.disciplina_cod}</span>}
                  {!c.activa && <span style={{ fontSize: 8.5, color: '#9E9E9E' }}>inactiva</span>}
                </div>
                <div style={{ fontSize: 10, color: '#757575' }}>
                  {c.nombre ? `${c.nombre} · ` : ''}{c.n_personas} personas · {t?.codigo ?? 'sin turno'}
                  {c.factor_productividad !== 1 && ` · factor ${c.factor_productividad}`}
                </div>
                {Array.isArray(c.composicion) && c.composicion.length > 0 && (
                  <div style={{ fontSize: 9.5, color: '#9E9E9E', marginTop: 2 }}>
                    {c.composicion.map(r => `${r.cantidad} ${r.rol}`).join(' · ')}
                  </div>
                )}
                {enEdicion && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <select defaultValue={c.turno_id ?? ''} onChange={e => onGuardar('PATCH', { project_id: projectId, tipo: 'cuadrilla', id: c.id, turno_id: e.target.value || null })} style={{ ...input, width: 190 }}>
                      <option value="">Sin turno</option>
                      {turnos.map(x => <option key={x.id} value={x.id}>{x.codigo} · {x.horas_dia} h × {x.dias_trabajo} d</option>)}
                    </select>
                    <input type="number" min={1} defaultValue={c.n_personas} onBlur={e => onGuardar('PATCH', { project_id: projectId, tipo: 'cuadrilla', id: c.id, n_personas: Number(e.target.value) })} style={{ ...input, width: 80 }} />
                    <button onClick={() => setEditando(null)} style={btnIcono}><Check style={{ width: 13, height: 13, color: '#16A34A' }} /></button>
                  </div>
                )}
              </div>
              {cap != null && (
                <div style={{ textAlign: 'right', marginRight: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: ROJO }}>{num(cap)}</div>
                  <div style={{ fontSize: 8, color: '#9E9E9E' }}>HH / IWP</div>
                </div>
              )}
              {!enEdicion && (
                <button title="Editar turno y dotación" onClick={() => setEditando(c.id)} style={btnIcono}>
                  <Pencil style={{ width: 13, height: 13, color: '#BDBDBD' }} />
                </button>
              )}
              <button title="Eliminar" onClick={() => onBorrar(c.id, c.codigo)} style={btnIcono}>
                <Trash2 style={{ width: 13, height: 13, color: '#BDBDBD' }} />
              </button>
            </div>
          );
        })}
        {cuadrillas.length === 0 && (
          <div style={vacio}>
            Sin cuadrillas. La apertura de CWP no puede dimensionar paquetes hasta que exista al menos una.
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const panel: React.CSSProperties = { border: '1px solid #EEEEEE', borderRadius: 14, backgroundColor: 'white', overflow: 'hidden' };
const cabecera: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, padding: '11px 14px', borderBottom: '1px solid #EEEEEE', backgroundColor: '#FAFAFA' };
const fila: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #F5F5F5' };
const vacio: React.CSSProperties = { padding: '24px 14px', fontSize: 11, color: '#9E9E9E', fontStyle: 'italic', lineHeight: 1.5 };
const input: React.CSSProperties = { display: 'block', width: '100%', padding: '6px 9px', fontSize: 11, border: '1px solid #E5E7EB', borderRadius: 8, outline: 'none', backgroundColor: 'white' };
const btnPri: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 11, fontWeight: 800, backgroundColor: ROJO, color: 'white', border: 'none', borderRadius: 9, cursor: 'pointer' };
const btnMini: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 10, fontWeight: 700, backgroundColor: 'white', color: '#374151', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer' };
const btnIcono: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 5, display: 'inline-flex' };

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 9, fontWeight: 900, color: '#757575', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>{label}</span>
      {children}
    </label>
  );
}
