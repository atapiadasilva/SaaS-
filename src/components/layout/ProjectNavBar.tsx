'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pickaxe, Settings2, CalendarRange, CalendarClock, Link2, Receipt, ShieldCheck, Leaf, HardHat, Truck, Users, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';

const MODULE_NAV = {
  panel:            { label: 'Panel',          icon: LayoutDashboard, path: 'panel' },
  mineria:          { label: 'AWP Minería',    icon: Pickaxe,       path: 'mineria' },
  planificacion:    { label: 'Planificación',  icon: CalendarRange, path: 'planificacion' },
  trisemanal:       { label: 'Trisemanal',     icon: CalendarClock, path: 'trisemanal' },
  calidad:          { label: 'Calidad',        icon: ShieldCheck,   path: 'calidad' },
  'medio-ambiente': { label: 'M. Ambiente',    icon: Leaf,          path: 'medio-ambiente' },
  sso:              { label: 'SSO',            icon: HardHat,       path: 'sso' },
  equipos:          { label: 'Equipos',        icon: Truck,         path: 'equipos' },
  rrhh:             { label: 'RRHH',           icon: Users,         path: 'rrhh' },
  conciliacion:     { label: 'Conciliación',   icon: Link2,         path: 'conciliacion' },
  'estado-pago':    { label: 'Estado de Pago', icon: Receipt,       path: 'estado-pago' },
  setup:            { label: 'Setup',          icon: Settings2,     path: 'setup' },
} as const;

interface Props {
  orgSlug:          string;
  projectId:        string;
  activeModuleKeys: string[];
}

export function ProjectNavBar({ orgSlug, projectId, activeModuleKeys }: Props) {
  const pathname = usePathname();
  const base = `/${orgSlug}/projects/${projectId}`;

  return (
    <nav className="flex items-center gap-1">
      {activeModuleKeys.map(key => {
        const mod = MODULE_NAV[key as keyof typeof MODULE_NAV];
        if (!mod) return null;
        const Icon = mod.icon;
        const href = `${base}/${mod.path}`;
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={key}
            href={href}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wide transition whitespace-nowrap',
              isActive
                ? 'bg-[#FF0000] text-white shadow-[0_2px_10px_rgba(255,0,0,0.3)]'
                : 'text-[#757575] hover:text-[#A00000] hover:bg-red-50 border border-transparent'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {mod.label}
          </Link>
        );
      })}
    </nav>
  );
}
