'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Zap, ClipboardList, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

const MODULE_NAV = {
  costanera: { label: 'AWP Costanera', icon: Zap,          path: 'costanera' },
  lps:       { label: 'LPS + AWP',     icon: ClipboardList, path: 'lps'      },
  vistas:    { label: 'Vistas AWP',    icon: Eye,           path: 'vistas'   },
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
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide transition whitespace-nowrap',
              isActive
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'text-slate-500 hover:text-white hover:bg-white/5 border border-transparent'
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
