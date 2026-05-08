'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Database, CalendarDays, Layers, Box, FileText, Users, ShieldCheck, MonitorPlay, GitBranch, Target, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

// Catálogo local de módulos — los iconos no pueden pasar de Server a Client Component
const MODULE_NAV: Record<string, { label: string; icon: React.ElementType; path: string }> = {
  awp:       { label: 'Datos AWP',     icon: Database,        path: 'cwp'       },
  programa:  { label: 'Programa',      icon: CalendarDays,    path: 'programa'  },
  cwp:       { label: 'CWP Explorer',  icon: Layers,          path: 'cwp'       },
  '4d':      { label: 'Secuenciador 4D', icon: LayoutDashboard, path: '4d'       },
  bim:       { label: 'Visor BIM',     icon: Box,             path: 'bim'       },
  vistas3d:  { label: 'Vistas 3D',     icon: MonitorPlay,     path: 'vistas3d'  },
  tidp:      { label: 'TIDP',           icon: GitBranch,       path: 'tidp'      },
  '90dias':  { label: 'Plan 90 Días',  icon: Target,          path: '90dias'    },
  documents: { label: 'Documentos',    icon: FileText,        path: 'documents' },
  team:      { label: 'Equipo',        icon: Users,           path: 'team'      },
  roles:     { label: 'Roles',         icon: ShieldCheck,     path: 'roles'     },
  model:     { label: 'Datos Modelo',  icon: Cpu,             path: 'model'     },
};

interface Props {
  orgSlug: string;
  projectId: string;
  activeModuleKeys: string[];
}

export function ProjectNavBar({ orgSlug, projectId, activeModuleKeys }: Props) {
  const pathname = usePathname();
  const base = `/${orgSlug}/projects/${projectId}`;

  const linkCls = (href: string) =>
    cn(
      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide transition whitespace-nowrap shrink-0',
      pathname === href || pathname.startsWith(href + '/')
        ? 'bg-primary/10 text-primary'
        : 'text-slate-500 hover:bg-muted'
    );

  return (
    <nav className="flex items-center gap-1 flex-1 justify-center overflow-x-auto">
      <Link href={base} className={linkCls(base)}>
        <LayoutDashboard className="w-3.5 h-3.5" />
        Resumen
      </Link>

      {activeModuleKeys.length > 0 && (
        <div className="w-px h-5 bg-border mx-1 shrink-0" />
      )}

      {activeModuleKeys.map(key => {
        const mod = MODULE_NAV[key];
        if (!mod) return null;
        const Icon = mod.icon;
        const href = `${base}/${mod.path}`;
        return (
          <Link key={key} href={href} className={linkCls(href)}>
            <Icon className="w-3.5 h-3.5" />
            {mod.label}
          </Link>
        );
      })}
    </nav>
  );
}
