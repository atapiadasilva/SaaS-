"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, ArrowRight, Building2, AlertCircle, Eye, EyeOff, UserPlus, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const handleResetPassword = async () => {
    if (!email) { setError("Ingresa tu correo para restablecer la contraseña."); return; }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      });
      if (error) setError(error.message);
      else setResetSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Error de conexión.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Tiempo de espera agotado. Verifica tu conexión e intenta de nuevo.")), 15000)
    );

    try {
      const supabase = createClient();

      if (mode === "register") {
        const { data, error } = await Promise.race([
          supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } }),
          timeout,
        ]);
        if (error) {
          setError(error.message);
        } else if (data.user && data.user.identities?.length === 0) {
          setError("Ya existe una cuenta con ese correo. Inicia sesión o usa '¿Olvidaste tu contraseña?'.");
        } else {
          setSuccess("¡Cuenta creada! Revisa tu email para confirmar tu cuenta, luego inicia sesión.");
        }
      } else {
        const { error } = await Promise.race([
          supabase.auth.signInWithPassword({ email, password }),
          timeout,
        ]);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            setError("Correo o contraseña incorrectos. ¿Olvidaste tu contraseña?");
          } else if (error.message.includes("Email not confirmed")) {
            setError("Confirma tu email antes de iniciar sesión. Revisa tu bandeja.");
          } else if (error.message.includes("rate limit") || error.message.includes("over_email_send_rate_limit")) {
            setError("Demasiados intentos. Espera unos minutos e intenta de nuevo.");
          } else {
            setError(error.message);
          }
        } else {
          window.location.href = "/organizaciones";
          return;
        }
      }
    } catch (err: any) {
      setError(err?.message ?? "Error de conexión. Verifica tu red e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-2xl">D</span>
          </div>
          <div>
            <h1 className="text-primary font-bold text-2xl tracking-tight">Datos AWP</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Central de Proyectos</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {resetSent ? (
            <motion.div
              key="reset-sent"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-xl border border-border p-8 text-center"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-3">Revisa tu email</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Te enviamos un link para restablecer tu contraseña a <strong>{email}</strong>.
              </p>
              <button
                onClick={() => { setResetSent(false); setError(null); }}
                className="text-sm text-primary hover:underline font-medium"
              >
                Volver al inicio de sesión
              </button>
            </motion.div>
          ) : success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-xl border border-border p-8 text-center"
            >
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-accent" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-3">¡Revisa tu email!</h2>
              <p className="text-muted-foreground text-sm mb-6">{success}</p>
              <button
                onClick={() => { setSuccess(null); setMode("login"); }}
                className="text-sm text-primary hover:underline font-medium"
              >
                Ir al inicio de sesión
              </button>
            </motion.div>
          ) : (
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="bg-white rounded-2xl shadow-xl border border-border overflow-hidden"
            >
              {/* Tabs */}
              <div className="grid grid-cols-2 border-b border-border">
                <button
                  onClick={() => { setMode("login"); setError(null); }}
                  className={cn(
                    "py-4 text-sm font-semibold flex items-center justify-center gap-2 transition",
                    mode === "login"
                      ? "text-primary border-b-2 border-primary bg-primary/5"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LogIn className="w-4 h-4" />
                  Iniciar Sesión
                </button>
                <button
                  onClick={() => { setMode("register"); setError(null); }}
                  className={cn(
                    "py-4 text-sm font-semibold flex items-center justify-center gap-2 transition",
                    mode === "register"
                      ? "text-primary border-b-2 border-primary bg-primary/5"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <UserPlus className="w-4 h-4" />
                  Crear Cuenta
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-5">
                <div className="mb-2">
                  <h2 className="text-xl font-bold text-foreground">
                    {mode === "login" ? "Bienvenido de vuelta" : "Crear nueva cuenta"}
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {mode === "login"
                      ? "Ingresa tus credenciales para acceder."
                      : "Registra tu cuenta para comenzar."}
                  </p>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      required
                      placeholder="tu@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition text-sm"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      placeholder={mode === "register" ? "Mínimo 6 caracteres" : "Tu contraseña"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Reset password (solo en modo login) */}
                {mode === "login" && (
                  <div className="text-right -mt-2">
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      className="text-xs text-muted-foreground hover:text-primary transition"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm"
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {mode === "login" ? "Entrar" : "Crear Cuenta"}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-xs text-muted-foreground mt-8 flex items-center justify-center gap-1.5">
          <Building2 className="w-3 h-3" />
          Plataforma AWP para gestión de proyectos de construcción
        </p>
      </div>
    </div>
  );
}
