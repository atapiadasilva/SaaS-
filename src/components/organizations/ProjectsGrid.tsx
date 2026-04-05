'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Layers, LayoutDashboard, Box, FileText, Database,
  Users, ShieldCheck, CalendarDays,
  ArrowRight, CheckCircle2, FileSearch2, Hammer, ChevronRight
} from 'lucide-react';

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
  },
  {
    id: 'cwp',
    name: 'CWP Viewer',
    desc: 'Explorador de paquetes y métricas asociadas',
    icon: Layers,
    path: 'cwp',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    ring: 'ring-blue-200',
    dot: 'bg-blue-500',
  },
  {
    id: '4d',
    name: 'Planeación 4D',
    desc: 'Simulación de línea base y pronóstico',
    icon: LayoutDashboard,
    path: '4d',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    ring: 'ring-amber-200',
    dot: 'bg-amber-500',
  },
  {
    id: 'bim',
    name: 'Visor BIM',
    desc: 'Modelos tridimensionales de ingeniería',
    icon: Box,
    path: 'bim',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  {
    id: 'documents',
    name: 'Gestor Documental',
    desc: 'Oficios, reportes y archivos técnicos',
    icon: FileText,
    path: 'documents',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    ring: 'ring-purple-200',
    dot: 'bg-purple-500',
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(!checked); }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-[#0C1E4F]' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
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
}: {
  mod: typeof MODULES[0];
  enabled: boolean;
  orgSlug: string;
  projectId: string;
  onToggle: (id: string, val: boolean) => void;
}) {
  const Icon = mod.icon;

  return (
    <div
      className={`relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all ${
        enabled
          ? `${mod.bg} ring-1 ${mod.ring} border-transparent`
          : 'bg-slate-50 border-slate-100 opacity-50'
      }`}
    >
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${enabled ? mod.bg : 'bg-white'}`}>
        <Icon size={14} className={enabled ? mod.color : 'text-slate-300'} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-[10px] font-black uppercase tracking-tight leading-none truncate ${enabled ? 'text-slate-800' : 'text-slate-400'}`}>
          {mod.name}
        </p>
        <p className="text-[9px] text-slate-400 font-medium mt-0.5 leading-tight truncate">{mod.desc}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Toggle checked={enabled} onChange={(v) => onToggle(mod.id, v)} />
        {enabled && (
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

function ProjectCard({
  project,
  orgSlug,
}: {
  project: { id: string; name: string; stage: Stage; created_at: string; active_modules: Record<string, boolean> };
  orgSlug: string;
}) {
  const [modules, setModules] = useState<Record<string, boolean>>(project.active_modules ?? {});
  const [saving, setSaving] = useState<string | null>(null);
  const stage = STAGE_CFG[project.stage] ?? STAGE_CFG.operacion;

  // Si una clave de módulo no existe en active_modules se trata como activa (true)
  // Esto hace que módulos nuevos aparezcan habilitados en proyectos existentes.
  const isEnabled = (id: string) => modules[id] !== false;

  const activeCount = MODULES.filter(m => isEnabled(m.id)).length;

  const handleToggle = async (modId: string, value: boolean) => {
    const next = { ...modules, [modId]: value };
    setModules(next);
    setSaving(modId);
    const supabase = createClient();
    await supabase.from('projects').update({ active_modules: next }).eq('id', project.id);
    setSaving(null);
  };

  return (
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
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ProjectsGrid({
  projects,
  orgSlug,
}: {
  projects: { id: string; name: string; stage: string; created_at: string; active_modules: Record<string, boolean> }[];
  orgSlug: string;
}) {
  if (projects.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {projects.map(p => (
        <ProjectCard key={p.id} project={p as any} orgSlug={orgSlug} />
      ))}
    </div>
  );
}
