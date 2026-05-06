'use client';

import { useState } from 'react';
import { Eye, ChevronDown, X, RefreshCw } from 'lucide-react';
import type { PreviewRole } from '@/lib/rolePreview';
import { PREVIEW_ROLES } from '@/lib/rolePreview';

interface Props {
  currentPreview: PreviewRole | null;
}

export function RolePreviewSwitcher({ currentPreview }: Props) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const current = PREVIEW_ROLES.find(r => r.id === currentPreview) ?? null;

  const apply = (role: PreviewRole | null) => {
    setSwitching(true);
    if (role) {
      document.cookie = `__role_preview=${role}; path=/; max-age=86400; SameSite=Lax`;
    } else {
      document.cookie = `__role_preview=; path=/; max-age=0`;
    }
    window.location.reload();
  };

  return (
    <div className="fixed top-3 right-4 z-[9999] flex items-center gap-2">

      {/* Badge de modo preview */}
      {currentPreview && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg animate-pulse">
          <Eye size={9} />
          Modo Preview
        </div>
      )}

      {/* Selector */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border shadow-lg text-[11px] font-black uppercase tracking-wide transition-all ${
            current
              ? current.color
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          {switching ? (
            <RefreshCw size={12} className="animate-spin" />
          ) : (
            <Eye size={12} />
          )}
          <span>{current ? current.label : 'Vista como...'}</span>
          <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-20 top-full mt-2 bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden min-w-[240px]">

              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-50 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Preview de rol</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">Solo desarrollo · no afecta la DB</p>
                </div>
                <button onClick={() => setOpen(false)} className="p-1 text-slate-300 hover:text-slate-500">
                  <X size={13} />
                </button>
              </div>

              {/* Opciones */}
              <div className="p-2 space-y-1">
                {PREVIEW_ROLES.map(role => {
                  const isActive = currentPreview === role.id;
                  return (
                    <button
                      key={role.id}
                      onClick={() => { apply(role.id); setOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        isActive
                          ? `${role.color} shadow-sm`
                          : 'border-transparent hover:bg-slate-50 hover:border-slate-100'
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${role.dot}`} />
                      <div>
                        <p className={`text-[11px] font-black ${isActive ? '' : 'text-slate-700'}`}>
                          {role.label}
                        </p>
                        <p className="text-[9px] text-slate-400 font-medium">{role.sublabel}</p>
                      </div>
                      {isActive && (
                        <span className="ml-auto text-[8px] font-black uppercase tracking-widest opacity-60">
                          Activo
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Reset */}
              {currentPreview && (
                <div className="p-2 pt-0">
                  <button
                    onClick={() => { apply(null); setOpen(false); }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-black text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all uppercase tracking-wide"
                  >
                    <X size={10} />
                    Salir del modo preview
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
