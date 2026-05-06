'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  User, Mail, Lock, Save, ArrowLeft, Loader2,
  Check, AlertCircle, Eye, EyeOff, Building2
} from 'lucide-react';

type Section = 'profile' | 'password';

export default function PerfilPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading]       = useState(true);
  const [email, setEmail]           = useState('');
  const [fullName, setFullName]     = useState('');
  const [section, setSection]       = useState<Section>('profile');

  // Profile save
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  // Password change
  const [currentPassword, setCurrentPassword]   = useState('');
  const [newPassword, setNewPassword]           = useState('');
  const [confirmPassword, setConfirmPassword]   = useState('');
  const [showNew, setShowNew]                   = useState(false);
  const [showConfirm, setShowConfirm]           = useState(false);
  const [savingPassword, setSavingPassword]     = useState(false);
  const [passwordMsg, setPasswordMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return; }
      setEmail(user.email ?? '');
      setFullName(user.user_metadata?.full_name ?? '');
      setLoading(false);
    });
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });
    setSavingProfile(false);
    setProfileMsg(
      error
        ? { ok: false, text: error.message }
        : { ok: true,  text: 'Perfil actualizado correctamente.' }
    );
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 6) {
      setPasswordMsg({ ok: false, text: 'La nueva contraseña debe tener mínimo 6 caracteres.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: 'Las contraseñas no coinciden.' });
      return;
    }

    setSavingPassword(true);

    // Re-autenticar primero para validar contraseña actual
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInErr) {
      setSavingPassword(false);
      setPasswordMsg({ ok: false, text: 'Contraseña actual incorrecta.' });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      setPasswordMsg({ ok: false, text: error.message });
    } else {
      setPasswordMsg({ ok: true, text: 'Contraseña actualizada correctamente.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const initials = fullName
    ? fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : email[0]?.toUpperCase() ?? '?';

  return (
    <div className="min-h-screen bg-muted/10">
      {/* Top bar */}
      <header className="bg-white border-b border-border px-8 py-4 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-base font-black text-primary">Mi Perfil</h1>
          <p className="text-xs text-muted-foreground">Gestiona tu cuenta personal</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-8 space-y-6">
        {/* Avatar + nombre */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-6 flex items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-primary font-black text-2xl shrink-0">
            {initials}
          </div>
          <div>
            <p className="text-xl font-black text-foreground">{fullName || 'Sin nombre'}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
              <Mail className="w-3.5 h-3.5" />
              {email}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
              <Building2 className="w-3.5 h-3.5" />
              Plataforma AWP
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/30 p-1 rounded-xl w-fit border border-border">
          {(['profile', 'password'] as Section[]).map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                section === s
                  ? 'bg-white text-primary shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'profile' ? <User className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {s === 'profile' ? 'Información' : 'Contraseña'}
            </button>
          ))}
        </div>

        {/* ─── Sección: Información ──────────────────────────── */}
        {section === 'profile' && (
          <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl border border-border shadow-sm p-6 space-y-5">
            <h2 className="text-base font-bold text-foreground">Información personal</h2>

            {/* Nombre */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Nombre completo
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Tu nombre completo"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition text-sm"
                />
              </div>
            </div>

            {/* Email (solo lectura) */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Correo electrónico <span className="text-muted-foreground font-normal text-xs">(no editable)</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-muted/30 text-muted-foreground text-sm cursor-not-allowed"
                />
              </div>
            </div>

            {profileMsg && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-semibold ${
                profileMsg.ok
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-destructive/10 text-destructive border border-destructive/10'
              }`}>
                {profileMsg.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {profileMsg.text}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition shadow-sm disabled:opacity-60 text-sm"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {savingProfile ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}

        {/* ─── Sección: Contraseña ───────────────────────────── */}
        {section === 'password' && (
          <form onSubmit={handleChangePassword} className="bg-white rounded-2xl border border-border shadow-sm p-6 space-y-5">
            <h2 className="text-base font-bold text-foreground">Cambiar contraseña</h2>

            {/* Contraseña actual */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Contraseña actual
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  required
                  placeholder="Tu contraseña actual"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition text-sm"
                />
              </div>
            </div>

            {/* Nueva contraseña */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Nueva contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirmar contraseña */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Confirmar nueva contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="Repite la nueva contraseña"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className={`w-full pl-10 pr-10 py-3 rounded-xl border focus:ring-2 outline-none transition text-sm ${
                    confirmPassword && confirmPassword !== newPassword
                      ? 'border-destructive focus:ring-destructive/20 focus:border-destructive'
                      : 'border-border focus:border-primary focus:ring-primary/20'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && confirmPassword !== newPassword && (
                <p className="text-xs text-destructive mt-1 font-semibold">Las contraseñas no coinciden</p>
              )}
            </div>

            {passwordMsg && (
              <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-semibold ${
                passwordMsg.ok
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-destructive/10 text-destructive border border-destructive/10'
              }`}>
                {passwordMsg.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {passwordMsg.text}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingPassword}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition shadow-sm disabled:opacity-60 text-sm"
              >
                {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {savingPassword ? 'Actualizando...' : 'Cambiar contraseña'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
