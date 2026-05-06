'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Box, Database, FileText,
  Users, ShieldCheck, CalendarDays, GitBranch, Target,
  ArrowRight, CheckCircle2, FileSearch2, Hammer, ChevronRight,
  Settings2, AlertTriangle, Lock,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import type { BimConfig } from '@/components/modules/BimConfigModal';

const BimConfigModal = dynamic(() => import('@/components/modules/BimConfigModal'), { ssr: false });

// ─── Module catalog ───────────────────────────────────────────────────────────

const MODULES = [
  {
    id: 'awp',
    name: 'Ingesta de Datos',
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
    name: 'Programa Maestro',
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
    name: 'Hilo Digital — TIDP',
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
    name: 'Visualización 3D',
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
    name: 'Gestión de Equipo',
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
    name: 'Configuración de Roles',
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
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        disabled
          ? 'bg-slate-200 cursor-not-allowed opacity-50'
          : checked ? 'bg-[#0C1E4F]' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked && !disabled ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// ─── Module chip ──────────────────────────────────────────────────────────────

function ModuleChip({
  mod,
  enabled,
  orgSlug,
  projectId,
  onToggle,
  isOwner,
  isConfigured,
  onConfigClick,
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
  // Si un módulo require config y no está configurado, el toggle está bloqueado
  const toggleBlocked = mod.requiresConfig && !isConfigured;

  return (
    <div
      className={`relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all ${
        enabled && !toggleBlocked
          ? `${mod.bg} ring-1 ${mod.ring} border-transparent`
          : 'bg-slate-50 border-slate-100 opacity-60'
      }`}
    >
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${enabled && !toggleBlocked ? mod.bg : 'bg-white'}`}>
        <Icon size={14} className={enabled && !toggleBlocked ? mod.color : 'text-slate-300'} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={`text-[10px] font-black uppercase tracking-tight leading-none truncate ${enabled && !toggleBlocked ? 'text-slate-800' : 'text-slate-400'}`}>
            {mod.name}
          </p>
          {/* Badge "Sin configurar" solo si owner y requiere config */}
          {mod.requiresConfig && !isConfigured && isOwner && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-[8px] font-black uppercase tracking-wide">
              <AlertTriangle size={8} />
              Sin configurar
            </span>
          )}
          {/* Icono de lock si no es owner y no está configurado */}
          {mod.requiresConfig && !isConfigured && !isOwner && (
            <Lock size={9} className="text-slate-300" />
          )}
        </div>
        <p className="text-[9px] text-slate-400 font-medium mt-0.5 leading-tight truncate">{mod.desc}</p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* Botón de configuración ⚙️ — solo para OWNER real y módulos configurables */}
        {isOwner && mod.requiresConfig && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onConfigClick(); }}
            title="Configurar módulo"
            className={`p-1.5 rounded-lg transition-all hover:scale-110 ${
              isConfigured
                ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                : 'bg-amber-100 text-amber-600 hover:bg-amber-200 animate-pulse'
            }`}
          >
            <Settings2 size={12} />
          </button>
        )}

        <Toggle
          checked={enabled}
          onChange={(v) => onToggle(mod.id, v)}
          disabled={toggleBlocked}
        />

        {enabled && !toggleBlocked && (
          <Link
            href={`/${orgSlug}/projects/${projectId}/${mod.path}`}
            className={`p-1 rounded-lg ${mod.bg} ${mod.color} hover:scale-110 transition-transform`}
            title={`Abrir ${mod.name}`}
          >
            <ArrowRight size={11} />
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

type ModuleConfig = Record<string, unknown>; // { bim?: BimConfig, ... }

function ProjectCard({
  project,
  orgSlug,
  isOwner,
}: {
  project: {
    id: string;
    name: string;
    stage: Stage;
    created_at: string;
    active_modules: Record<string, boolean>;
    module_config: ModuleConfig;
  };
  orgSlug: string;
  isOwner: boolean;
}) {
  const [modules, setModules] = useState<Record<string, boolean>>(project.active_modules ?? {});
  const [moduleConfig, setModuleConfig] = useState<ModuleConfig>(project.module_config ?? {});
  const [saving, setSaving] = useState<string | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState<string | null>(null); // modId abierto

  const stage = STAGE_CFG[project.stage] ?? STAGE_CFG.operacion;

  const isEnabled = (id: string) => modules[id] !== false;
  const getIsConfigured = (id: string) => {
    const mod = MODULES.find(m => m.id === id);
    if (!mod?.requiresConfig) return true; // No requiere → siempre true
    return !!(moduleConfig[id] as any)?.urn;
  };

  const activeCount = MODULES.filter(m => {
    if (!isEnabled(m.id)) return false;
    if (m.requiresConfig && !getIsConfigured(m.id)) return false;
    return true;
  }).length;

  const handleToggle = async (modId: string, value: boolean) => {
    // Extra guardia — no activar si no configurado
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
        // Si borramos la config, también desactivamos el módulo
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
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        {/* Card header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-50 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/${orgSlug}/projects/${project.id}`}
              className="text-base font-black text-[#0C1E4F] hover:text-blue-600 transition-colors flex items-center gap-1.5 group"
            >
              <span className="truncate">{project.name}</span>
              <ChevronRight size={14} className="shrink-0 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </Link>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
              {new Date(project.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${stage.bg} ${stage.color} border ${stage.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />
              {stage.label}
            </span>
          </div>
        </div>

        {/* Modules header */}
        <div className="px-6 pt-3 pb-1 flex items-center justify-between">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
            Módulos ({activeCount}/{MODULES.length} activos)
          </p>
          {saving && <p className="text-[9px] text-blue-500 font-bold animate-pulse">Guardando…</p>}
        </div>

        {/* Module chips */}
        <div className="px-4 pb-5 grid grid-cols-1 gap-1.5">
          {MODULES.map(mod => (
            <ModuleChip
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

      {/* Modal de configuración BIM */}
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
  if (projects.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {projects.map(p => (
        <ProjectCard key={p.id} project={p as any} orgSlug={orgSlug} isOwner={isOwner} />
      ))}
    </div>
  );
}
