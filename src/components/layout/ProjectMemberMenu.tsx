'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserCircle, LogOut, ChevronDown } from 'lucide-react';

export function ProjectMemberMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-[#0C1E4F]/10 flex items-center justify-center text-[#0C1E4F] font-black text-xs">
          {email[0]?.toUpperCase() ?? '?'}
        </div>
        <span className="text-xs font-semibold text-slate-600 max-w-[140px] truncate hidden sm:block">
          {email}
        </span>
        <ChevronDown size={12} className="text-slate-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 top-full mt-1 bg-white rounded-2xl border border-slate-100 shadow-xl py-1 min-w-[200px]">
            <div className="px-4 py-2.5 border-b border-slate-50">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cuenta</p>
              <p className="text-xs font-semibold text-slate-700 truncate mt-0.5">{email}</p>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-60"
            >
              <LogOut size={13} />
              {loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
