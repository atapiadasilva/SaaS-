'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Box, Database, FileText, Users, ShieldCheck, CalendarDays,
  GitBranch, Target, ArrowRight, CheckCircle2, FileSearch2,
  Hammer, ChevronRight, Settings2, AlertTriangle, Lock, Star, Pickaxe,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import type { BimConfig } from '@/components/modules/BimConfigModal';

const BimConfigModal = dynamic(() => import('@/components/modules/BimConfigModal'), { ssr: false });

// ─── Module catalog ───────────────────────────────────────────────────────────

const MODULES = [
  {
    id: 'awp',
    name: 'Ingesta',
    desc: 'Consola AWP · Importador, mapa nodal, integridad',
    icon: Database,
    path: 'cwp',
    color: 'text-[#0C1E4F]',
    bg: 'bg-[#0C1E4F]/8',
    ring: 'ring-[#0C1E4F]/20',
    dot: 'bg-[#0C1E4F]',
    requiresConfig: false,
  },
  {
    id: 'mineria',
    name: 'Minería',
    desc: 'Control de Proyecto y Avances',
    icon: Pickaxe,
    path: 'mineria',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    ring: 'ring-amber-200',
    dot: 'bg-amber-500',
    requiresConfig: false,
  },
  {
    id: 'programa',
    name: 'Programa',
    desc: 'Carta Gantt · WBS · HH por disciplina',
    icon: CalendarDays,
    path: 'programa',
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    ring: 'ring-sky-200',
    dot: 'bg-sky-500',
    requiresConfig: false,
  },
  {
    id: 'tidp',
    name: 'Gemelo Digital',
    desc: 'ISO 19650-2 · Planes de Entrega de Información',
    icon: GitBranch,
    path: 'tidp',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    ring: 'ring-violet-200',
    dot: 'bg-violet-500',
    requiresConfig: false,
  },
  {
    id: '90dias',
    name: 'Plan 30 Días',
    desc: 'Lookahead · Restricciones · Vinculación BIM',
    icon: Target,
    path: '30dias',
    color: 'text-fuchsia-600',
    bg: 'bg-fuchsia-50',
    ring: 'ring-fuchsia-200',
    dot: 'bg-fuchsia-500',
    requiresConfig: false,
  },
  {
    id: 'bim',
    name: 'Vista 3D',
    desc: 'Modelos 3D vinculados a ACC · Autodesk Platform Services',
    icon: Box,
    path: 'bim',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    dot: 'bg-emerald-500',
    requiresConfig: true,
  },
  {
    id: 'documents',
    name: 'Documentos',
    desc: 'Repositorio con control de versiones y flujos de aprobación',
    icon: FileText,
    path: 'documents',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    ring: 'ring-rose-200',
    dot: 'bg-rose-500',
    requiresConfig: false,
  },
  {
    id: 'team',
    name: 'Equipo',
    desc: 'Usuarios, roles y permisos por módulo',
    icon: Users,
    path: 'team',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    ring: 'ring-teal-200',
    dot: 'bg-teal-500',
    requiresConfig: false,
  },
  {
    id: 'roles',
    name: 'Roles',
    desc: 'Define qué puede ver o editar cada rol',
    icon: ShieldCheck,
    path: 'roles',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    ring: 'ring-indigo-200',
    dot: 'bg-indigo-500',
    requiresConfig: false,
  },
];

// ─── Stage config ─────────────────────────────────────────────────────────────

type Stage = 'licitacion' | 'operacion' | 'cierre';

const STAGE_CFG: Record<Stage, { label: string; icon: any; color: string; bg: string; border: string; dot: string }> = {
  licitacion: { label: 'Licitación', icon: FileSearch2, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' },
  operacion:  { label: 'Operación',  icon: Hammer,      color: 'text-primary',   bg: 'bg-primary/5', border: 'border-primary/20', dot: 'bg-primary' },
  cierre:     { label: 'Cierre',     icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};

// ─── Compact module chip (2-col grid) ────────────────────────────────────────

function CompactModuleChip({
  mod, orgSlug, projectId, isOwner, isConfigured, onConfigClick,
}: {
  mod: typeof MODULES[0];
  orgSlug: string;
  projectId: string;
  isOwner: boolean;
  isConfigured: boolean;
  onConfigClick: () => void;
}) {
  const Icon = mod.icon;
  const needsConfig = mod.requiresConfig && !isConfigured;

  const content = (
    <>
      <Icon size={12} className={mod.color} />
      <span className={`text-[10px] font-bold uppercase tracking-tight flex-1 truncate leading-none text-slate-700`}>
        {mod.name}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {needsConfig ? (
          isOwner ? (
            <span className="p-1 rounded bg-amber-100 text-amber-600 animate-pulse flex items-center gap-1 text-[9px] font-black uppercase">
              <Settings2 size={10} /> Configurar
            </span>
          ) : (
            <Lock size={10} className="text-slate-300" />
          )
        ) : (
          <span className={`p-0.5 rounded ${mod.bg} ${mod.color} group-hover:scale-110 transition-transform`}>
            <ArrowRight size={10} />
          </span>
        )}
      </div>
    </>
  );

  const className = `flex items-center gap-2 rounded-xl border px-3 py-2 transition-all cursor-pointer group hover:shadow-sm ${mod.bg} ring-1 ${mod.ring} border-transparent hover:ring-2`;

  if (needsConfig) {
    return (
      <button onClick={isOwner ? onConfigClick : undefined} className={className + (isOwner ? '' : ' cursor-not-allowed opacity-60')}>
        {content}
      </button>
    );
  }

  return (
    <Link href={`/${orgSlug}/projects/${projectId}/${mod.path}`} className={className}>
      {content}
    </Link>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

type ModuleConfig = Record<string, unknown>;

function ProjectCard({
  project, orgSlug, isOwner, isFavorite, onToggleFavorite,
}: {
  project: { id: string; name: string; stage: Stage; created_at: string; active_modules: Record<string, boolean>; module_config: ModuleConfig };
  orgSlug: string;
  isOwner: boolean;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  const [moduleConfig, setModuleConfig] = useState<ModuleConfig>(project.module_config ?? {});
  const [configModalOpen, setConfigModalOpen] = useState<string | null>(null);

  const stage = STAGE_CFG[project.stage] ?? STAGE_CFG.operacion;
  const getIsConfigured = (id: string) => {
    const mod = MODULES.find(m => m.id === id);
    if (!mod?.requiresConfig) return true;
    return !!(moduleConfig[id] as any)?.urn;
  };

  const handleBimSave = (cfg: BimConfig | null) => {
    setModuleConfig(prev => {
      const next = { ...prev };
      if (cfg) {
        next.bim = cfg;
      } else {
        delete next.bim;
      }
      return next;
    });
  };

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden group">
        {/* Header */}
        <div className="px-4 pt-3.5 pb-3 border-b border-slate-50 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/${orgSlug}/projects/${project.id}`}
              className="text-sm font-black text-[#0C1E4F] hover:text-blue-600 flex items-center gap-1 group/link"
            >
              <span className="truncate">{project.name}</span>
              <ChevronRight size={12} className="shrink-0 opacity-30 group-hover/link:opacity-100 group-hover/link:translate-x-0.5 transition-all" />
            </Link>
            <p className="text-[9px] text-slate-400 font-medium mt-0.5">
              {new Date(project.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Star */}
            <button
              onClick={() => onToggleFavorite(project.id)}
              title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              className={`p-1.5 rounded-lg transition-all ${
                isFavorite
                  ? 'text-amber-400 bg-amber-50 hover:bg-amber-100'
                  : 'text-slate-200 hover:text-amber-400 hover:bg-amber-50'
              }`}
            >
              <Star size={13} fill={isFavorite ? 'currentColor' : 'none'} strokeWidth={isFavorite ? 0 : 1.5} />
            </button>

            {/* Stage badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${stage.bg} ${stage.color} border ${stage.border}`}>
              <span className={`w-1 h-1 rounded-full ${stage.dot}`} />
              {stage.label}
            </span>
          </div>
        </div>

        {/* Modules grid */}
        <div className="px-3 pt-2 pb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Módulos Disponibles
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {MODULES.map(mod => (
              <CompactModuleChip
                key={mod.id}
                mod={mod}
                orgSlug={orgSlug}
                projectId={project.id}
                isOwner={isOwner}
                isConfigured={getIsConfigured(mod.id)}
                onConfigClick={() => setConfigModalOpen(mod.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {configModalOpen === 'bim' && (
        <BimConfigModal
          projectId={project.id}
          current={(moduleConfig.bim as BimConfig) ?? null}
          onSave={handleBimSave}
          onClose={() => setConfigModalOpen(null)}
        />
      )}
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ProjectsGrid({
  projects,
  orgSlug,
  isOwner = false,
}: {
  projects: {
    id: string;
    name: string;
    stage: string;
    created_at: string;
    active_modules: Record<string, boolean>;
    module_config: Record<string, unknown>;
  }[];
  orgSlug: string;
  isOwner?: boolean;
}) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`fav_projects_${orgSlug}`);
      if (raw) setFavorites(new Set(JSON.parse(raw)));
    } catch {}
  }, [orgSlug]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(`fav_projects_${orgSlug}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  if (projects.length === 0) return null;

  const favProjects   = projects.filter(p => favorites.has(p.id));
  const otherProjects = projects.filter(p => !favorites.has(p.id));

  const renderGrid = (list: typeof projects) => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {list.map(p => (
        <ProjectCard
          key={p.id}
          project={p as any}
          orgSlug={orgSlug}
          isOwner={isOwner}
          isFavorite={favorites.has(p.id)}
          onToggleFavorite={toggleFavorite}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Favoritos */}
      {favProjects.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Star size={13} className="text-amber-400" fill="currentColor" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-amber-600">Favoritos</h2>
            <span className="text-[9px] text-slate-400 font-semibold">({favProjects.length})</span>
          </div>
          {renderGrid(favProjects)}
        </section>
      )}

      {/* Todos los proyectos */}
      {otherProjects.length > 0 && (
        <section>
          {favProjects.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Todos los proyectos</h2>
              <span className="text-[9px] text-slate-400 font-semibold">({otherProjects.length})</span>
            </div>
          )}
          {renderGrid(otherProjects)}
        </section>
      )}
    </div>
  );
}
