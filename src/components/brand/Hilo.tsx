'use client';

// ─── Hilo Digital · elementos de marca ───────────────────────────────────────
// El "hilo" rojo es la metáfora central: un dato que viaja trazable de punta a
// punta (ingeniería → programa → paquete → cuadrilla). Fondo siempre blanco.

/** Isotipo H en cápsula roja. */
export function HiloLogo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl shrink-0 select-none"
      style={{ width: size, height: size, background: 'linear-gradient(135deg,#FF0000 0%,#A00000 100%)' }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none">
        <path d="M7 4 v16 M17 4 v16" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M7 13 c4 0 6 -2 10 -2" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** Onda de hilos rojos con nodos — decoración de headers (absoluta, no interactiva). */
export function HiloWave({ className = '', opacity = 1 }: { className?: string; opacity?: number }) {
  return (
    <svg
      viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden
      className={`pointer-events-none ${className}`} style={{ opacity }}
    >
      <path d="M0,70 C120,20 240,110 380,60 S560,40 600,55" stroke="#FF0000" strokeWidth="2.2" fill="none" opacity=".85" />
      <path d="M0,85 C140,45 260,95 400,75 S560,65 600,72" stroke="#FF0000" strokeWidth="1" fill="none" opacity=".4" />
      <path d="M0,55 C130,95 280,25 420,55 S560,85 600,60" stroke="#BDBDBD" strokeWidth="1" fill="none" opacity=".5" />
      <path d="M0,95 C160,65 300,105 440,85 S570,75 600,82" stroke="#FF0000" strokeWidth=".7" fill="none" opacity=".25" />
      <circle cx="380" cy="60" r="4" fill="#FF0000" />
      <circle cx="120" cy="47" r="3" fill="#FF0000" opacity=".7" />
      <circle cx="240" cy="88" r="2.5" fill="#BDBDBD" />
      <circle cx="500" cy="50" r="2.5" fill="#A00000" opacity=".8" />
      <circle cx="560" cy="70" r="3.5" fill="#FF0000" opacity=".5" />
      <circle cx="60" cy="62" r="2" fill="#757575" opacity=".6" />
      <circle cx="440" cy="85" r="2" fill="#FF0000" opacity=".45" />
    </svg>
  );
}

/** Hilo de trazabilidad horizontal: nodos etiquetados unidos por el hilo rojo.
 *  Úsalo para mostrar jerarquías (CWA → CV → CWP → EWP) o flujos de datos. */
export function HiloTrace({ nodes }: { nodes: { label: string; value: string; muted?: boolean }[] }) {
  return (
    <div className="flex items-center gap-0 flex-wrap">
      {nodes.map((n, i) => (
        <div key={i} className="flex items-center">
          {i > 0 && (
            <div className="relative w-7 h-px mx-1" style={{ borderTop: '1.5px solid rgba(255,0,0,.45)' }} />
          )}
          <div className="flex items-center gap-1.5">
            <span className={n.muted ? 'hilo-dot hilo-dot--gray' : i === nodes.length - 1 ? 'hilo-dot' : 'hilo-dot hilo-dot--open'} />
            <div className="leading-tight">
              <div className="text-[8px] font-bold uppercase tracking-widest text-[#BDBDBD]">{n.label}</div>
              <div className="text-[11px] font-mono font-bold text-[#1A1A1A]">{n.value}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
