'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Database, BarChart3, FileText, Calendar, Layers, Cpu } from 'lucide-react';

interface EntityHealth {
  loaded: boolean;
  total: number;
  pct_cwp?: number;
  pct_guid?: number;
  pct_disciplina?: number;
}

interface ViewHealth {
  vista: string;
  status: 'ready' | 'partial' | 'blocked';
  missingRequired: string[];
  missingOptional: string[];
}

interface HealthData {
  entities: Record<string, EntityHealth>;
  views: ViewHealth[];
  columnMapping: Record<string, string> | null;
  externalCode: string | null;
}

const ENTITY_META: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  elementos:  { label: 'Elementos 3D',  icon: Cpu,      description: 'Ítems del modelo BIM con identificadores únicos (SP3D_MONIKER/GUID)' },
  cwp:        { label: 'CWP / Catálogo',icon: Layers,   description: 'Jerarquía CWA → CV → CWP del proyecto' },
  partidas:   { label: 'Itemizado',     icon: Database, description: 'Partidas de costo vinculadas a PWP' },
  planos:     { label: 'Planos',        icon: FileText, description: 'Documentos y planos vinculados a CWP' },
  programa:   { label: 'Programa',      icon: Calendar, description: 'Actividades de construcción con fechas y HH' },
  iwp:        { label: 'IWP',           icon: BarChart2,description: 'Paquetes de trabajo de instalación' },
};

// Fallback for BarChart2 (lucide uses BarChart3)
function BarChart2(props: React.SVGProps<SVGSVGElement>) {
  return <BarChart3 {...props} />;
}

const VIEW_LABELS: Record<string, string> = {
  vista_3d:       'Vista 3D (BIM)',
  vista_cwp:      'Explorador CWP',
  itemizado:      'Itemizado / Partidas',
  planos:         'Planos y Documentos',
  gantt:          'Gantt / Programa',
  iwp:            'IWP Manager',
  revision_cwa:   'Revisión CWA/CV/CWP',
  sistemas_swp:   'Sistemas / SWP',
  kpi_dashboard:  'KPI Dashboard',
};

const STATUS_COLORS = {
  ready:   'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  partial: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  blocked: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const STATUS_LABELS = {
  ready:   'Lista',
  partial: 'Parcial',
  blocked: 'Sin datos',
};

function StatusIcon({ status }: { status: ViewHealth['status'] }) {
  if (status === 'ready')   return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === 'partial') return <AlertCircle  className="w-4 h-4 text-amber-400" />;
  return <XCircle className="w-4 h-4 text-red-400" />;
}

function CoverageBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-[10px] text-slate-400 w-8 text-right">{value}%</span>
    </div>
  );
}

export function ProjectHealthDashboard({ projectId }: { projectId: string }) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/project-health?project_id=${projectId}`)
      .then(r => r.json())
      .then(d => { setHealth(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
        Calculando cobertura de datos…
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="flex items-center justify-center py-16 text-red-400 text-sm">
        Error al cargar datos de salud: {error}
      </div>
    );
  }

  const ready   = health.views.filter(v => v.status === 'ready').length;
  const partial = health.views.filter(v => v.status === 'partial').length;
  const blocked = health.views.filter(v => v.status === 'blocked').length;
  const totalViews = health.views.length;

  return (
    <div className="space-y-6">
      {/* Resumen global */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-emerald-400">{ready}</div>
          <div className="text-[11px] text-slate-400 uppercase tracking-wide mt-1">Vistas listas</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-amber-400">{partial}</div>
          <div className="text-[11px] text-slate-400 uppercase tracking-wide mt-1">Parciales</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-red-400">{blocked}</div>
          <div className="text-[11px] text-slate-400 uppercase tracking-wide mt-1">Sin datos</div>
        </div>
      </div>

      {/* Entidades cargadas */}
      <div>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-3">
          Datos por entidad
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(health.entities).map(([key, entity]) => {
            const meta = ENTITY_META[key];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <div
                key={key}
                className={`rounded-xl border p-4 ${entity.loaded ? 'bg-white/3 border-white/8' : 'bg-white/2 border-white/5 opacity-60'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${entity.loaded ? 'bg-indigo-500/20' : 'bg-white/5'}`}>
                      <Icon className={`w-3.5 h-3.5 ${entity.loaded ? 'text-indigo-400' : 'text-slate-600'}`} />
                    </div>
                    <div>
                      <div className="text-[12px] font-bold text-white">{meta.label}</div>
                      <div className="text-[10px] text-slate-500">{entity.total.toLocaleString()} registros</div>
                    </div>
                  </div>
                  {entity.loaded
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-400/60 shrink-0" />
                  }
                </div>
                {entity.loaded && key === 'elementos' && (
                  <div className="space-y-1 mt-3">
                    {entity.pct_cwp !== undefined && (
                      <div>
                        <div className="text-[10px] text-slate-500 mb-0.5">Cobertura CWP</div>
                        <CoverageBar value={entity.pct_cwp} color={entity.pct_cwp >= 80 ? 'bg-emerald-500' : entity.pct_cwp >= 40 ? 'bg-amber-500' : 'bg-red-500'} />
                      </div>
                    )}
                    {entity.pct_guid !== undefined && (
                      <div>
                        <div className="text-[10px] text-slate-500 mb-0.5">Cobertura GUID</div>
                        <CoverageBar value={entity.pct_guid} color={entity.pct_guid >= 80 ? 'bg-emerald-500' : 'bg-amber-500'} />
                      </div>
                    )}
                    {entity.pct_disciplina !== undefined && (
                      <div>
                        <div className="text-[10px] text-slate-500 mb-0.5">Cobertura Disciplina</div>
                        <CoverageBar value={entity.pct_disciplina} color={entity.pct_disciplina >= 80 ? 'bg-emerald-500' : 'bg-amber-500'} />
                      </div>
                    )}
                  </div>
                )}
                {!entity.loaded && (
                  <div className="text-[10px] text-slate-600 mt-1">{meta.description}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Estado de las vistas */}
      <div>
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-3">
          Estado de las vistas ({ready}/{totalViews} listas)
        </h3>
        <div className="space-y-2">
          {health.views.map(view => (
            <div
              key={view.vista}
              className={`flex items-center justify-between p-3 rounded-xl border ${STATUS_COLORS[view.status]}`}
            >
              <div className="flex items-center gap-2.5">
                <StatusIcon status={view.status} />
                <div>
                  <div className="text-[12px] font-semibold">{VIEW_LABELS[view.vista] ?? view.vista}</div>
                  {view.missingRequired.length > 0 && (
                    <div className="text-[10px] opacity-70 mt-0.5">
                      Falta: {view.missingRequired.join(', ')}
                    </div>
                  )}
                  {view.status === 'ready' && view.missingOptional.length > 0 && (
                    <div className="text-[10px] opacity-60 mt-0.5">
                      Opcional sin cargar: {view.missingOptional.join(', ')}
                    </div>
                  )}
                </div>
              </div>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${STATUS_COLORS[view.status]}`}>
                {STATUS_LABELS[view.status]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
