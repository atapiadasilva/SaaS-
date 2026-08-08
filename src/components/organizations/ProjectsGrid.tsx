'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight, CheckCircle2, FileSearch2, Hammer, Star,
} from 'lucide-react';
import { MODULE_BY_KEY, resolverModulos } from '@/lib/modules';

// La tarjeta anterior mostraba un catálogo de módulos de la generación previa
// ("Ingesta", "Gemelo Digital", "Plan 30 Días"…) cuyos enlaces apuntaban a rutas
// eliminadas. Ahora muestra los módulos reales de `projects.active_modules`
// (fuente única: src/lib/modules.ts) y toda la tarjeta abre el proyecto.

type Stage = 'licitacion' | 'operacion' | 'cierre';

const STAGE_CFG: Record<Stage, { label: string; icon: any; color: string; bg: string; border: string; dot: string }> = {
  licitacion: { label: 'Licitación', icon: FileSearch2,  color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500' },
  operacion:  { label: 'Operación',  icon: Hammer,       color: 'text-primary',     bg: 'bg-primary/5',  border: 'border-primary/20',  dot: 'bg-primary' },
  cierre:     { label: 'Cierre',     icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};

function ProjectCard({
  project, orgSlug, isFavorite, onToggleFavorite,
}: {
  project: { id: string; name: string; stage: Stage; created_at: string; active_modules: unknown };
  orgSlug: string;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  const stage = STAGE_CFG[project.stage] ?? STAGE_CFG.operacion;
  // Módulos reales del proyecto (Panel y Setup van siempre: no aportan en el chip)
  const modulos = resolverModulos(project.active_modules)
    .filter(k => k !== 'panel' && k !== 'setup')
    .map(k => MODULE_BY_KEY[k]?.label)
    .filter(Boolean);

  return (
    <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-[#FF0000]/25 transition-all group">
      {/* Toda la tarjeta abre el proyecto */}
      <Link
        href={`/${orgSlug}/projects/${project.id}`}
        className="absolute inset-0 z-0 rounded-2xl"
        aria-label={`Abrir ${project.name}`}
      />

      <div className="px-4 pt-3.5 pb-3 border-b border-slate-50 flex items-start justify-between gap-2 pointer-events-none">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-[#1A1A1A] truncate group-hover:text-[#A00000] transition-colors">
            {project.name}
          </p>
          <p className="text-[9px] text-slate-400 font-medium mt-0.5">
            {new Date(project.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 pointer-events-auto relative z-10">
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

          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${stage.bg} ${stage.color} border ${stage.border}`}>
            <span className={`w-1 h-1 rounded-full ${stage.dot}`} />
            {stage.label}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 pointer-events-none">
        {modulos.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {modulos.map(label => (
              <span key={label} className="px-2 py-1 rounded-full bg-[#F6F6F6] text-[#757575] text-[9px] font-black uppercase tracking-wide">
                {label}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-slate-400">Sin módulos AWP activos — se habilitan en Setup tras cargar datos.</p>
        )}

        <div className="mt-3 flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-[#FF0000] opacity-0 group-hover:opacity-100 transition-opacity">
          Abrir proyecto <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
}

export default function ProjectsGrid({
  projects,
  orgSlug,
}: {
  projects: {
    id: string;
    name: string;
    stage: string;
    created_at: string;
    active_modules: unknown;
    module_config?: Record<string, unknown>;
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
          isFavorite={favorites.has(p.id)}
          onToggleFavorite={toggleFavorite}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
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
