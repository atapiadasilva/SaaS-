'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Box, Database, FileText, Users, ShieldCheck, CalendarDays,
  GitBranch, Target, ArrowRight, CheckCircle2, FileSearch2,
  Hammer, ChevronRight, Settings2, AlertTriangle, Lock, Star,
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
    name: 'Hilo Digital',
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
    name: 'Plan 90 Días',
    desc: 'Lookahead · Restricciones · Vinculación BIM',
    icon: Target,
    path: '90dias',
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

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) onChange(!checked); }}
      disabled={disabled}
      title={disabled ? 'Configura el módulo primero' : undefined}
      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        disabled ? 'bg-slate-200 cursor-not-allowed opacity-50' : checked ? 'bg-[#0C1E4F]' : 'bg-slate-200'
      }`}
    >
      <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform duration-200 ${
        checked && !disabled ? 'translate-x-3.5' : 'translate-x-0.5'
      }`} />
    </button>
  );
}

// ─── Compact module chip (2-col grid) ────────────────────────────────────────

function CompactModuleChip({
  mod, enabled, orgSlug, projectId, onToggle, isOwner, isConfigured, onConfigClick,
}: {
  mod: typeof MODULES[0];
  enabled: boolean;
  orgSlug: string;
  projectId: string;
  onToggle: (id: string, val: boolean) => void;
  isOwner: boolean;
  isConfigured: boolean;
  onConfigClick: () => void;
}) {
  const Icon = mod.icon;
  const toggleBlocked = mod.requiresConfig && !isConfigured;
  const active = enabled && !toggleBlocked;

  return (
    <div className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 transition-all ${
      active ? `${mod.bg} ring-1 ${mod.ring} border-transparent` : 'bg-slate-50 border-slate-100 opacity-50'
    }`}>
      <Icon size={11} className={active ? mod.color : 'text-slate-300'} />
      <span className={`text-[9px] font-bold uppercase tracking-tight flex-1 truncate leading-none ${
        active ? 'text-slate-700' : 'text-slate-400'
      }`}>
        {mod.name}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        {isOwner && mod.requiresConfig && !isConfigured && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onConfigClick(); }}
            className="p-0.5 rounded bg-amber-100 text-amber-600 hover:bg-amber-200 animate-pulse"
          >
            <Settings2 size={9} />
          </button>
        )}
        {!isOwner && mod.requiresConfig && !isConfigured && (
          <Lock size={8} className="text-slate-300" />
        )}
        <Toggle checked={enabled} onChange={(v) => onToggle(mod.id, v)} disabled={toggleBlocked} />
        {active && (
          <Link
            href={`/${orgSlug}/projects/${projectId}/${mod.path}`}
            onClick={(e) => e.stopPropagation()}
            className={`p-0.5 rounded ${mod.bg} ${mod.color} hover:scale-110 transition-transform`}
          >
            <ArrowRight size={9} />
          </Link>
        )}
      </div>
    </div>
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
  const [modules, setModules] = useState<Record<string, boolean>>(project.active_modules ?? {});
  const [moduleConfig, setModuleConfig] = useState<ModuleConfig>(project.module_config ?? {});
  const [saving, setSaving] = useState<string | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState<string | null>(null);

  const stage = STAGE_CFG[project.stage] ?? STAGE_CFG.operacion;
  const isEnabled = (id: string) => modules[id] !== false;
  const getIsConfigured = (id: string) => {
    const mod = MODULES.find(m => m.id === id);
    if (!mod?.requiresConfig) return true;
    return !!(moduleConfig[id] as any)?.urn;
  };

  const activeCount = MODULES.filter(m => isEnabled(m.id) && !(m.requiresConfig && !getIsConfigured(m.id))).length;

  const handleToggle = async (modId: string, value: boolean) => {
    const mod = MODULES.find(m => m.id === modId);
    if (mod?.requiresConfig && !getIsConfigured(modId) && value) return;
    const next = { ...modules, [modId]: value };
    setModules(next);
    setSaving(modId);
    const supabase = createClient();
    await (supabase as any).from('projects').update({ active_modules: next }).eq('id', project.id);
    setSaving(null);
  };

  const handleBimSave = (cfg: BimConfig | null) => {
    setModuleConfig(prev => {
      const next = { ...prev };
      if (cfg) {
        next.bim = cfg;
      } else {
        delete next.bim;
        setModules(prev2 => {
          const next2 = { ...prev2, bim: false };
          const supabase = createClient();
          (supabase as any).from('projects').update({ active_modules: next2 }).eq('id', project.id);
          return next2;
        });
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
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
              Módulos · <span className="text-[#0C1E4F]">{activeCount}</span>/{MODULES.length} activos
            </p>
            {saving && <p className="text-[8px] text-blue-500 animate-pulse">Guardando…</p>}
          </div>

          <div className="grid grid-cols-2 gap-1">
            {MODULES.map(mod => (
              <CompactModuleChip
                key={mod.id}
                mod={mod}
                enabled={isEnabled(mod.id)}
                orgSlug={orgSlug}
                projectId={project.id}
                onToggle={handleToggle}
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
