"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, LogOut, User } from "lucide-react";

export function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  };

  // Inicial del email para el avatar
  const initial = email.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-black/5 transition"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white font-bold text-sm shrink-0">
          {initial}
        </div>
        <div className="text-left hidden sm:block">
          <p className="text-xs font-semibold text-foreground leading-tight truncate max-w-[140px]">
            {email}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mi cuenta</p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-border rounded-xl shadow-lg overflow-hidden z-50">
          {/* Header del dropdown */}
          <div className="px-4 py-3 border-b border-border bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white font-bold">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{email}</p>
                <p className="text-xs text-muted-foreground">Cuenta activa</p>
              </div>
            </div>
          </div>

          {/* Opciones */}
          <div className="py-1">
            <button
              disabled
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground cursor-not-allowed opacity-60"
            >
              <User className="w-4 h-4" />
              Perfil
            </button>
          </div>

          <div className="border-t border-border py-1">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
