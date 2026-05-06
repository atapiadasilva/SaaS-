'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Building2, Users, ShieldCheck, Mail, Lock,
  Eye, EyeOff, ArrowRight, Loader2, CheckCircle2,
  AlertCircle, UserPlus, LogIn,
} from 'lucide-react';

type Mode = 'login' | 'register';

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin:  { label: 'Administrador', color: 'text-rose-700 bg-rose-50 border-rose-200' },
  editor: { label: 'Editor',        color: 'text-blue-700 bg-blue-50 border-blue-200' },
  viewer: { label: 'Visualizador',  color: 'text-slate-600 bg-slate-50 border-slate-200' },
};

interface InviteInfo {
  valid: boolean;
  expired: boolean;
  exhausted: boolean;
  role: string;
  label: string | null;
  project_name: string;
  org_name: string;
  org_slug: string;
}

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [info, setInfo]         = useState<InviteInfo | null>(null);
  const [infoError, setInfoError] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(true);

  const [authedUser, setAuthedUser] = useState<{ id: string; email: string } | null>(null);
  const [mode, setMode]             = useState<Mode>('login');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError]   = useState<string | null>(null);

  const [accepting, setAccepting]   = useState(false);
  const [accepted, setAccepted]     = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [projectId, setProjectId]   = useState('');

  // 1. Cargar info del token
  useEffect(() => {
    fetch(`/api/invite/info?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setInfoError(true); }
        else { setInfo(d); }
      })
      .catch(() => setInfoError(true))
      .finally(() => setLoadingInfo(false));
  }, [token]);

  // 2. Verificar si ya hay sesión activa
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setAuthedUser({ id: user.id, email: user.email ?? '' });
    });
  }, []);

  // Auth: login o registro
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    const supabase = createClient();

    if (mode === 'register') {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setAuthError(error.message);
      } else if (data.user?.identities?.length === 0) {
        setAuthError('Ya existe una cuenta con ese correo. Inicia sesión.');
      } else if (data.session) {
        // Supabase confirmación automática desactivada — hay sesión de inmediato
        setAuthedUser({ id: data.user!.id, email: data.user!.email ?? '' });
      } else {
        setAuthError('Revisa tu correo y confirma tu cuenta antes de continuar.');
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setAuthError('Correo o contraseña incorrectos.');
        } else if (error.message.includes('Email not confirmed')) {
          setAuthError('Confirma tu email primero. Revisa tu bandeja de entrada.');
        } else {
          setAuthError(error.message);
        }
      } else if (data.user) {
        setAuthedUser({ id: data.user.id, email: data.user.email ?? '' });
      }
    }

    setAuthLoading(false);
  };

  // Aceptar invitación
  const handleAccept = async () => {
    setAccepting(true);
    setAcceptError(null);

    const res = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();

    if (!res.ok) {
      setAcceptError(data.error ?? 'Error al aceptar la invitación');
    } else {
      setAccepted(true);
      setProjectId(data.project_id);
      // Redirigir al proyecto después de 2s
      setTimeout(() => {
        router.push(`/${data.org_slug}/projects/${data.project_id}`);
      }, 2000);
    }
    setAccepting(false);
  };

  const roleCfg = info ? (ROLE_LABELS[info.role] ?? ROLE_LABELS.viewer) : null;

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (loadingInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0C1E4F]/5 to-blue-50">
        <Loader2 className="animate-spin text-[#0C1E4F]" size={32} />
      </div>
    );
  }

  // ─── Token inválido ───────────────────────────────────────────────────────────

  if (infoError || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0C1E4F]/5 to-blue-50 p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-10 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto">
            <AlertCircle size={28} className="text-rose-500" />
          </div>
          <h1 className="text-xl font-black text-slate-800">Link inválido</h1>
          <p className="text-slate-500 text-sm">Este link de invitación no existe o fue revocado.</p>
        </div>
      </div>
    );
  }

  // ─── Token expirado / agotado ─────────────────────────────────────────────────

  if (!info.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0C1E4F]/5 to-blue-50 p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-10 max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto">
            <AlertCircle size={28} className="text-amber-500" />
          </div>
          <h1 className="text-xl font-black text-slate-800">
            {info.expired ? 'Link expirado' : 'Cupo agotado'}
          </h1>
          <p className="text-slate-500 text-sm">
            {info.expired
              ? 'Este link de invitación ya venció. Solicita uno nuevo al administrador del proyecto.'
              : 'Este link alcanzó su límite de usos. Solicita uno nuevo.'}
          </p>
        </div>
      </div>
    );
  }

  // ─── Aceptado con éxito ───────────────────────────────────────────────────────

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0C1E4F]/5 to-blue-50 p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-10 max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} className="text-emerald-500" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">¡Bienvenido al proyecto!</h1>
            <p className="text-slate-500 text-sm mt-1">Te estamos redirigiendo...</p>
          </div>
          <Loader2 className="animate-spin text-[#0C1E4F] mx-auto" size={20} />
        </div>
      </div>
    );
  }

  // ─── Main ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0C1E4F]/5 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[#0C1E4F] flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-xl">D</span>
          </div>
          <div>
            <p className="text-[#0C1E4F] font-black text-lg tracking-tight leading-none">Datos AWP</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Central de Proyectos</p>
          </div>
        </div>

        {/* Invite card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">

          {/* Header */}
          <div className="bg-[#0C1E4F] px-8 py-6 text-white">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-1">
              Invitación al proyecto
            </p>
            <h1 className="text-2xl font-black leading-tight">{info.project_name}</h1>
            {info.label && (
              <p className="text-blue-200 text-sm mt-0.5">{info.label}</p>
            )}
            <div className="flex items-center gap-3 mt-4">
              <div className="flex items-center gap-1.5 text-blue-200 text-xs font-semibold">
                <Building2 size={13} />
                {info.org_name}
              </div>
              <div className="w-px h-3 bg-blue-400/40" />
              {roleCfg && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${roleCfg.color}`}>
                  <ShieldCheck size={10} />
                  Rol: {roleCfg.label}
                </span>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="p-8">

            {/* Si ya hay sesión */}
            {authedUser ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-9 h-9 rounded-xl bg-[#0C1E4F]/10 flex items-center justify-center text-[#0C1E4F] font-black text-sm shrink-0">
                    {authedUser.email[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-700 truncate">{authedUser.email}</p>
                    <p className="text-[10px] text-slate-400">Sesión activa</p>
                  </div>
                </div>

                <p className="text-sm text-slate-600">
                  Únete a <strong>{info.project_name}</strong> con el rol de{' '}
                  <strong>{roleCfg?.label}</strong>.
                </p>

                {acceptError && (
                  <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 text-sm font-semibold">
                    <AlertCircle size={15} className="shrink-0" />
                    {acceptError}
                  </div>
                )}

                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#0C1E4F] text-white font-black rounded-2xl hover:bg-blue-700 transition disabled:opacity-60 text-sm uppercase tracking-wide"
                >
                  {accepting
                    ? <><Loader2 size={16} className="animate-spin" /> Procesando...</>
                    : <><Users size={16} /> Unirme al proyecto</>
                  }
                </button>

                <button
                  onClick={() => { createClient().auth.signOut(); setAuthedUser(null); }}
                  className="w-full text-[11px] text-slate-400 hover:text-slate-600 transition font-semibold"
                >
                  Usar otra cuenta
                </button>
              </div>
            ) : (
              /* Form login/register */
              <div className="space-y-5">
                <p className="text-sm text-slate-600">
                  Para unirte a <strong>{info.project_name}</strong>, inicia sesión o crea una cuenta.
                </p>

                {/* Mode tabs */}
                <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                  {(['login', 'register'] as Mode[]).map(m => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setAuthError(null); }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide transition ${
                        mode === m
                          ? 'bg-white text-[#0C1E4F] shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {m === 'login' ? <LogIn size={12} /> : <UserPlus size={12} />}
                      {m === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleAuth} className="space-y-3">
                  {/* Email */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                      Correo electrónico
                    </label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                      <input
                        type="email"
                        required
                        autoFocus
                        placeholder="usuario@empresa.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                      Contraseña
                    </label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                      <input
                        type={showPwd ? 'text' : 'password'}
                        required
                        minLength={6}
                        placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(!showPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                      >
                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  {authError && (
                    <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 text-xs font-semibold">
                      <AlertCircle size={13} className="shrink-0" />
                      {authError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[#0C1E4F] text-white font-black rounded-2xl hover:bg-blue-700 transition disabled:opacity-60 text-sm uppercase tracking-wide"
                  >
                    {authLoading
                      ? <Loader2 size={16} className="animate-spin" />
                      : <ArrowRight size={16} />
                    }
                    {authLoading
                      ? 'Procesando...'
                      : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'
                    }
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 font-semibold">
          Este link fue generado por el equipo de {info.org_name}
        </p>
      </div>
    </div>
  );
}
