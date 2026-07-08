'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bot, Loader2, RefreshCw, CheckCircle2, XCircle, Phone, Plus, Trash2, ShieldCheck, Eye, QrCode, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type Status = 'connected' | 'connecting' | 'disconnected' | 'unreachable' | null;
type Rol = 'admin' | 'lector';
interface BotUsuario { id: string; telefono: string; nombre: string | null; rol: Rol; created_at: string; }
interface BotInvite { id: string; token: string; rol: Rol; nombre: string | null; usado_por_telefono: string | null; used_at: string | null; created_at: string; expires_at: string; }

export default function BotConfigPage() {
  const { org_slug, project_id } = useParams<{ org_slug: string; project_id: string }>();
  const [status, setStatus] = useState<Status>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [usuarios, setUsuarios] = useState<BotUsuario[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(true);
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoRol, setNuevoRol] = useState<Rol>('lector');
  const [adding, setAdding] = useState(false);
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/bot/status');
      const d = await r.json();
      setStatus(d.status ?? 'unreachable');
    } catch {
      setStatus('unreachable');
    }
  }, []);

  const refreshQr = useCallback(async () => {
    setLoadingQr(true);
    try {
      const r = await fetch('/api/bot/qr');
      const d = await r.json();
      setQrDataUrl(d.qrDataUrl ?? null);
    } finally {
      setLoadingQr(false);
    }
  }, []);

  // Estado: poll cada 5s. QR: solo mientras no esté conectado, refrescado cada 25s
  // (Baileys invalida el QR rápido, por eso necesita renovarse solo).
  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 5000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  useEffect(() => {
    if (status === 'connected' || status === null) {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      setQrDataUrl(null);
      return;
    }
    refreshQr();
    qrIntervalRef.current = setInterval(refreshQr, 25000);
    return () => { if (qrIntervalRef.current) clearInterval(qrIntervalRef.current); };
  }, [status, refreshQr]);

  const refreshUsuarios = useCallback(async () => {
    if (!project_id) return;
    setLoadingUsuarios(true);
    try {
      const r = await fetch(`/api/bot/usuarios?project_id=${project_id}`);
      const d = await r.json();
      setUsuarios(d.usuarios ?? []);
    } finally {
      setLoadingUsuarios(false);
    }
  }, [project_id]);

  useEffect(() => { refreshUsuarios(); }, [refreshUsuarios]);

  const onAddUsuario = async () => {
    const telefonoLimpio = nuevoTelefono.replace(/[^0-9]/g, '');
    if (!telefonoLimpio) return;
    setAdding(true);
    try {
      await fetch('/api/bot/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, telefono: telefonoLimpio, nombre: nuevoNombre.trim(), rol: nuevoRol }),
      });
      setNuevoTelefono('');
      setNuevoNombre('');
      setNuevoRol('lector');
      await refreshUsuarios();
    } finally {
      setAdding(false);
    }
  };

  const onDeleteUsuario = async (id: string) => {
    await fetch(`/api/bot/usuarios?id=${id}`, { method: 'DELETE' });
    await refreshUsuarios();
  };

  const [invites, setInvites] = useState<BotInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [genRol, setGenRol] = useState<Rol>('lector');
  const [genNombre, setGenNombre] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [currentInvite, setCurrentInvite] = useState<{ qrDataUrl: string; waLink: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshInvites = useCallback(async () => {
    if (!project_id) return;
    setLoadingInvites(true);
    try {
      const r = await fetch(`/api/bot/invites?project_id=${project_id}`);
      const d = await r.json();
      setInvites(d.invites ?? []);
    } finally {
      setLoadingInvites(false);
    }
  }, [project_id]);

  useEffect(() => { refreshInvites(); }, [refreshInvites]);

  const onGenerateInvite = async () => {
    setGenerating(true);
    setGenError(null);
    setCurrentInvite(null);
    try {
      const r = await fetch('/api/bot/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id, rol: genRol, nombre: genNombre.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setGenError(d.error || 'No se pudo generar la invitación.'); return; }
      setCurrentInvite({ qrDataUrl: d.qrDataUrl, waLink: d.waLink });
      setGenNombre('');
      await refreshInvites();
    } finally {
      setGenerating(false);
    }
  };

  const onRevokeInvite = async (id: string) => {
    await fetch(`/api/bot/invites?id=${id}`, { method: 'DELETE' });
    await refreshInvites();
  };

  const onCopyLink = () => {
    if (!currentInvite) return;
    navigator.clipboard.writeText(currentInvite.waLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pendingInvites = invites.filter(i => !i.used_at && new Date(i.expires_at) > new Date());

  return (
    <div className="h-full flex flex-col -m-6 bg-[#EEF2F7]">
      <div className="bg-gradient-to-br from-[#08203F] to-[#1565C0] text-white px-6 py-3 flex items-center gap-3 shrink-0">
        <Link
          href={`/${org_slug}/projects/${project_id}/mineria`}
          className="p-1.5 rounded bg-white/10 hover:bg-white/20 transition shrink-0"
          title="Volver a Explorador CWP"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-[15px] font-extrabold flex items-center gap-2"><Bot className="w-4 h-4" /> Configuración del Bot de WhatsApp</h1>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5 max-w-2xl">
        {/* Estado de conexión */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-extrabold text-slate-700 uppercase tracking-wide">Estado de conexión</h2>
            <button onClick={refreshStatus} className="text-slate-400 hover:text-slate-600" title="Actualizar estado">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <StatusBadge status={status} />
          {status === 'unreachable' && (
            <p className="text-[11.5px] text-slate-500 mt-2">
              No se pudo contactar al servidor del bot (lukeserver). Verifica la conexión SSH desde esta máquina.
            </p>
          )}
        </div>

        {/* Vinculación QR */}
        {status !== 'connected' && status !== 'unreachable' && status !== null && (
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col items-center gap-3">
            <h2 className="text-[13px] font-extrabold text-slate-700 uppercase tracking-wide self-start">Vincular WhatsApp</h2>
            <p className="text-[11.5px] text-slate-500 self-start">
              Escanea este código desde <b>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</b>, con el número que quieras dedicar al bot. Se renueva solo cada ~25s mientras no lo escaneas.
            </p>
            <div className="w-[280px] h-[280px] flex items-center justify-center border border-slate-100 rounded-lg bg-slate-50">
              {loadingQr && !qrDataUrl ? (
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              ) : qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="QR de vinculación WhatsApp" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[11px] text-slate-400">Sin QR disponible</span>
              )}
            </div>
            <button
              onClick={refreshQr}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Generar QR nuevo
            </button>
          </div>
        )}

        {/* Invitar usuario nuevo por QR */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-[13px] font-extrabold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1.5"><QrCode className="w-4 h-4" /> Invitar usuario por QR</h2>
          <p className="text-[11.5px] text-slate-500 mb-3">
            Genera un QR, la persona lo escanea con la cámara de su celular (no con WhatsApp), se le abre un chat con jAIme con un mensaje listo para enviar — al mandarlo queda registrada sola, con el rol que elijas.
          </p>

          <div className="flex items-center gap-2 mb-4">
            <input
              value={genNombre} onChange={e => setGenNombre(e.target.value)}
              placeholder="Nombre (opcional)"
              className="flex-1 px-2.5 py-2 text-[12px] border border-slate-300 rounded-lg outline-none focus:border-blue-500"
            />
            <select
              value={genRol} onChange={e => setGenRol(e.target.value as Rol)}
              className="px-2 py-2 text-[12px] font-semibold border border-slate-300 rounded-lg outline-none"
            >
              <option value="lector">Lector</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={onGenerateInvite} disabled={generating}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg px-3 py-2 text-[12px] font-bold shrink-0"
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
              Generar QR
            </button>
          </div>

          {genError && <p className="text-[11.5px] text-red-600 font-semibold mb-3">{genError}</p>}

          {currentInvite && (
            <div className="flex flex-col items-center gap-2 border border-slate-100 rounded-lg p-4 mb-4 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentInvite.qrDataUrl} alt="QR de invitación" className="w-[220px] h-[220px]" />
              <button onClick={onCopyLink} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 hover:underline">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado' : 'Copiar link wa.me'}
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {loadingInvites ? (
              <div className="flex items-center gap-2 text-[11.5px] text-slate-400 py-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…</div>
            ) : pendingInvites.length === 0 ? null : (
              <>
                <span className="text-[10px] font-extrabold uppercase text-slate-400">Invitaciones pendientes</span>
                {pendingInvites.map(inv => (
                  <div key={inv.id} className="flex items-center gap-2 border border-slate-100 rounded-lg px-3 py-2">
                    <span className="text-[11.5px] font-mono text-slate-600">{inv.token}</span>
                    {inv.nombre && <span className="text-[11px] text-slate-400 truncate">{inv.nombre}</span>}
                    <span className={cn(
                      'ml-auto text-[9.5px] font-extrabold px-2 py-0.5 rounded-full',
                      inv.rol === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                    )}>
                      {inv.rol === 'admin' ? 'Admin' : 'Lector'}
                    </span>
                    <button onClick={() => onRevokeInvite(inv.id)} className="text-slate-300 hover:text-red-500 shrink-0" title="Revocar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Usuarios autorizados (admin / lector) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-[13px] font-extrabold text-slate-700 uppercase tracking-wide mb-1">Usuarios autorizados</h2>
          <p className="text-[11.5px] text-slate-500 mb-3">
            <b>Admin</b> puede pedirle al bot que actualice o cargue datos. <b>Lector</b> solo puede consultar/visualizar — cualquier intento de escritura se rechaza. Números que no estén en esta lista son ignorados por el bot.
          </p>

          <div className="flex flex-col gap-1.5 mb-4">
            {loadingUsuarios ? (
              <div className="flex items-center gap-2 text-[11.5px] text-slate-400 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…</div>
            ) : usuarios.length === 0 ? (
              <p className="text-[11.5px] text-slate-400 italic py-2">Sin usuarios autorizados todavía.</p>
            ) : usuarios.map(u => (
              <div key={u.id} className="flex items-center gap-2 border border-slate-100 rounded-lg px-3 py-2">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-[12px] font-mono text-slate-700">{u.telefono}</span>
                {u.nombre && <span className="text-[11px] text-slate-400 truncate">{u.nombre}</span>}
                <span className={cn(
                  'ml-auto inline-flex items-center gap-1 text-[9.5px] font-extrabold px-2 py-0.5 rounded-full',
                  u.rol === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                )}>
                  {u.rol === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {u.rol === 'admin' ? 'Admin' : 'Lector'}
                </span>
                <button onClick={() => onDeleteUsuario(u.id)} className="text-slate-300 hover:text-red-500 shrink-0" title="Quitar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
            <input
              value={nuevoTelefono} onChange={e => setNuevoTelefono(e.target.value)}
              placeholder="+56 9 1234 5678"
              className="w-[160px] px-2.5 py-2 text-[12px] border border-slate-300 rounded-lg outline-none focus:border-blue-500"
            />
            <input
              value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
              placeholder="Nombre (opcional)"
              className="flex-1 px-2.5 py-2 text-[12px] border border-slate-300 rounded-lg outline-none focus:border-blue-500"
            />
            <select
              value={nuevoRol} onChange={e => setNuevoRol(e.target.value as Rol)}
              className="px-2 py-2 text-[12px] font-semibold border border-slate-300 rounded-lg outline-none"
            >
              <option value="lector">Lector</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={onAddUsuario} disabled={adding || !nuevoTelefono.trim()}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg px-3 py-2 text-[12px] font-bold shrink-0"
            >
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === null) {
    return <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Consultando…</span>;
  }
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    connected: { label: 'Conectado', cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    connecting: { label: 'Conectando / esperando QR', cls: 'bg-amber-100 text-amber-700', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
    disconnected: { label: 'Desconectado', cls: 'bg-slate-200 text-slate-600', icon: <XCircle className="w-3.5 h-3.5" /> },
    unreachable: { label: 'Servidor no disponible', cls: 'bg-red-100 text-red-700', icon: <XCircle className="w-3.5 h-3.5" /> },
  };
  const m = map[status] ?? map.disconnected;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-full', m.cls)}>
      {m.icon} {m.label}
    </span>
  );
}
