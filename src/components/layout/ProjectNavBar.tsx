'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pickaxe, CalendarRange, CalendarClock, Link2, Receipt, ShieldCheck, Leaf, HardHat, Truck, Users, LayoutDashboard, BarChart3, Split, LayoutGrid, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const MODULE_NAV = {
  panel:            { label: 'Panel',          icon: LayoutDashboard, path: 'panel' },
  mineria:          { label: 'AWP Minería',    icon: Pickaxe,       path: 'mineria' },
  apertura:         { label: 'Apertura',       icon: Split,         path: 'mineria/apertura' },
  planificacion:    { label: 'Planificación',  icon: CalendarRange, path: 'planificacion' },
  trisemanal:       { label: 'Trisemanal',     icon: CalendarClock, path: 'trisemanal' },
  recursos:         { label: 'Recursos',       icon: BarChart3,     path: 'recursos' },
  conciliacion:     { label: 'Conciliación',   icon: Link2,         path: 'conciliacion' },
  'estado-pago':    { label: 'Estado de Pago', icon: Receipt,       path: 'estado-pago' },
  calidad:          { label: 'Calidad',        icon: ShieldCheck,   path: 'calidad' },
  'medio-ambiente': { label: 'M. Ambiente',    icon: Leaf,          path: 'medio-ambiente' },
  sso:              { label: 'SSO',            icon: HardHat,       path: 'sso' },
  equipos:          { label: 'Equipos',        icon: Truck,         path: 'equipos' },
  rrhh:             { label: 'RRHH',           icon: Users,         path: 'rrhh' },
} as const;

// Los cinco dashboards de departamento son destinos secundarios (todos montan
// DeptoDashboard): agrupados en un desplegable, la barra baja de 14 pastillas a
// 9 y deja de cortarse en pantallas angostas (el header es overflow-hidden).
const DEPARTAMENTOS = ['calidad', 'medio-ambiente', 'sso', 'equipos', 'rrhh'] as const;

interface Props {
  orgSlug:          string;
  projectId:        string;
  activeModuleKeys: string[];
}

export function ProjectNavBar({ orgSlug, projectId, activeModuleKeys }: Props) {
  const pathname = usePathname();
  const [deptosAbierto, setDeptosAbierto] = useState(false);
  const base = `/${orgSlug}/projects/${projectId}`;

  const esDepto = (key: string) => (DEPARTAMENTOS as readonly string[]).includes(key);
  // Setup vive como engranaje en el header (lo pinta el layout), no como pastilla.
  const pillKeys  = activeModuleKeys.filter(k => k !== 'setup' && !esDepto(k));
  const deptoKeys = activeModuleKeys.filter(esDepto);

  // Hay módulos que cuelgan de otro (`mineria/apertura` vive bajo `mineria`), así que marcar
  // como activo todo lo que sea prefijo encendería los dos a la vez. Gana el más específico:
  // el href más largo que calce con la ruta actual.
  const activo = activeModuleKeys
    .map(key => MODULE_NAV[key as keyof typeof MODULE_NAV])
    .filter(Boolean)
    .map(mod => `${base}/${mod.path}`)
    .filter(href => pathname === href || pathname.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0];

  const deptoActivo = deptoKeys.find(k => `${base}/${MODULE_NAV[k as keyof typeof MODULE_NAV].path}` === activo);

  const pillBase = 'flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-black uppercase tracking-wide transition whitespace-nowrap';
  const pillOff  = 'text-[#757575] hover:text-[#A00000] hover:bg-red-50 border border-transparent';
  const pillOn   = 'bg-[#FF0000] text-white shadow-[0_2px_10px_rgba(255,0,0,0.3)]';

  return (
    <nav className="flex items-center gap-1">
      {pillKeys.map(key => {
        const mod = MODULE_NAV[key as keyof typeof MODULE_NAV];
        if (!mod) return null;
        const Icon = mod.icon;
        const href = `${base}/${mod.path}`;
        return (
          <Link key={key} href={href} className={cn(pillBase, href === activo ? pillOn : pillOff)}>
            <Icon className="w-3.5 h-3.5" />
            {mod.label}
          </Link>
        );
      })}

      {deptoKeys.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setDeptosAbierto(v => !v)}
            className={cn(pillBase, deptoActivo ? pillOn : pillOff)}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            {deptoActivo ? MODULE_NAV[deptoActivo as keyof typeof MODULE_NAV].label : 'Departamentos'}
            <ChevronDown className={cn('w-3 h-3 transition-transform', deptosAbierto && 'rotate-180')} />
          </button>

          {deptosAbierto && (
            <>
              {/* Clic afuera cierra el menú */}
              <div className="fixed inset-0 z-20" onClick={() => setDeptosAbierto(false)} />
              <div className="absolute right-0 top-full mt-2 z-30 bg-white border border-[#EEEEEE] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] py-1.5 min-w-[190px]">
                {deptoKeys.map(key => {
                  const mod = MODULE_NAV[key as keyof typeof MODULE_NAV];
                  const Icon = mod.icon;
                  const href = `${base}/${mod.path}`;
                  const isActive = href === activo;
                  return (
                    <Link
                      key={key}
                      href={href}
                      onClick={() => setDeptosAbierto(false)}
                      className={cn(
                        'flex items-center gap-2.5 px-4 py-2 text-[11px] font-black uppercase tracking-wide transition',
                        isActive ? 'text-[#FF0000] bg-red-50' : 'text-[#757575] hover:text-[#A00000] hover:bg-red-50'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {mod.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
