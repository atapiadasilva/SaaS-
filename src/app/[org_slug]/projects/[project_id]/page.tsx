import { createClient } from "@/lib/supabase/server";
import {
  Box, Database, Users, ShieldCheck, ArrowRight,
  FileSpreadsheet, Calendar, CheckCircle2,
  AlertCircle, Activity, Layers, GitBranch,
  MonitorPlay, LayoutDashboard, FileText, Target,
} from "lucide-react";
import Link from "next/link";

// ─── Module catalog ───────────────────────────────────────────────────────────

const MODULES_INFO: Record<string, {
  title: string; icon: any; desc: string; path: string;
  color: string; bg: string; border: string;
}> = {
  awp: {
    title: "Ingesta de Datos AWP",
    icon: Database,
    desc: "Importador Excel, mapa nodal, integridad del dato y matriz de control.",
    path: "cwp",
    color: "text-[#0C1E4F]",
    bg: "bg-blue-50",
    border: "border-blue-100",
  },
  programa: {
    title: "Programa Maestro",
    icon: Calendar,
    desc: "Carta Gantt con WBS, HH por disciplina y avance de obra.",
    path: "programa",
    color: "text-sky-600",
    bg: "bg-sky-50",
    border: "border-sky-100",
  },
  bim: {
    title: "Visualización 3D",
    icon: Box,
    desc: "Modelos 3D vinculados a Autodesk Platform Services.",
    path: "bim",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
  },
  team: {
    title: "Gestión de Equipo",
    icon: Users,
    desc: "Usuarios, roles y permisos por módulo del proyecto.",
    path: "team",
    color: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-100",
  },
  '4d': {
    title: "Secuenciador 4D",
    icon: LayoutDashboard,
    desc: "Vincula el modelo BIM con el programa para simular la construcción en el tiempo.",
    path: "4d",
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-100",
  },
  vistas3d: {
    title: "Vistas 3D",
    icon: MonitorPlay,
    desc: "Vistas guardadas del modelo BIM con filtros y estados de avance.",
    path: "vistas3d",
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    border: "border-cyan-100",
  },
  tidp: {
    title: "Hilo Digital — TIDP",
    icon: GitBranch,
    desc: "Planes de Entrega de Información según ISO 19650-2.",
    path: "tidp",
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-100",
  },
  '90dias': {
    title: "Plan 90 Días",
    icon: Target,
    desc: "Lookahead a 3 meses con Gantt filtrado, vinculación BIM y captura rápida de restricciones.",
    path: "90dias",
    color: "text-fuchsia-600",
    bg: "bg-fuchsia-50",
    border: "border-fuchsia-100",
  },
  documents: {
    title: "Documentos",
    icon: FileText,
    desc: "Repositorio de documentos del proyecto con control de versiones.",
    path: "documents",
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-100",
  },
  roles: {
    title: "Configuración de Roles",
    icon: ShieldCheck,
    desc: "Define qué puede ver o editar cada rol en el proyecto.",
    path: "roles",
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-100",
  },
};

// ─── Stage label ──────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  licitacion: { label: "Licitación",  color: "text-amber-600 bg-amber-50 border-amber-200",  dot: "bg-amber-400" },
  operacion:  { label: "Operación",   color: "text-emerald-600 bg-emerald-50 border-emerald-200", dot: "bg-emerald-400" },
  cierre:     { label: "Cierre",      color: "text-slate-600 bg-slate-100 border-slate-200",  dot: "bg-slate-400" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { org_slug, project_id } = await params;
  const supabase = await createClient();

  // Fetch all needed data in parallel
  const [projectRes, nodesRes, activitiesRes, membersRes] = await Promise.all([
    (supabase as any)
      .from("projects")
      .select("id, name, stage, description, active_modules, module_config, created_at, organizations(name)")
      .eq("id", project_id)
      .single(),
    (supabase as any)
      .from("nodes")
      .select("id, name, data_headers, data")
      .eq("project_id", project_id),
    (supabase as any)
      .from("program_activities")
      .select("id, status")
      .eq("project_id", project_id),
    (supabase as any)
      .from("project_members")
      .select("id, role")
      .eq("project_id", project_id),
  ]);

  const project       = projectRes.data;
  const nodes         = (nodesRes.data ?? []) as any[];
  const activities    = (activitiesRes.data ?? []) as any[];
  const members       = (membersRes.data ?? []) as any[];

  const activeModules = (project?.active_modules as Record<string, boolean>) ?? {};
  const activeKeys    = Object.keys(MODULES_INFO).filter(k => activeModules[k] !== false);

  // ── KPI calculations ────────────────────────────────────────────────────
  const totalRows = nodes.reduce((s: number, n: any) => s + (Array.isArray(n.data) ? n.data.length : 0), 0);
  const totalCols = nodes.reduce((s: number, n: any) => s + ((n.data_headers as string[])?.length ?? 0), 0);

  const bimConfig  = (project?.module_config as any)?.bim;
  const bimLinked  = !!(project?.module_config as any)?.bim_data;
  const hasBim     = !!bimConfig?.urn;

  const activitiesDone    = activities.filter((a: any) => a.status === 'done').length;
  const activitiesTotal   = activities.length;
  const ganttPct          = activitiesTotal ? Math.round((activitiesDone / activitiesTotal) * 100) : 0;

  const stageInfo  = STAGE_LABELS[project?.stage ?? 'licitacion'] ?? STAGE_LABELS.licitacion;
  const createdAt  = project?.created_at
    ? new Date(project.created_at).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#0C1E4F] to-[#1a3a7a] rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
        <div className="absolute -right-20 -top-20 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-8 bottom-0 w-40 h-40 bg-blue-400/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black ${stageInfo.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${stageInfo.dot}`} />
                {stageInfo.label}
              </span>
            </div>
            <h1 className="text-3xl font-black leading-tight mb-2">{project?.name ?? '…'}</h1>
            {project?.description && (
              <p className="text-white/60 text-sm max-w-xl">{project.description}</p>
            )}
            <p className="text-white/30 text-[11px] mt-3 font-bold">
              {(project?.organizations as any)?.name} · Creado {createdAt}
            </p>
          </div>

          {/* Quick stats right */}
          <div className="flex flex-wrap gap-4 shrink-0">
            {[
              { icon: Database,       label: 'Fuentes',    value: nodes.length },
              { icon: FileSpreadsheet,label: 'Filas AWP',  value: totalRows.toLocaleString('es') },
              { icon: Calendar,       label: 'Actividades',value: activitiesTotal },
              { icon: Users,          label: 'Miembros',   value: members.length },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-white/10 backdrop-blur rounded-2xl px-4 py-3 text-center min-w-[80px]">
                <Icon size={14} className="text-white/50 mx-auto mb-1" />
                <p className="text-lg font-black text-white leading-none">{value}</p>
                <p className="text-[9px] text-white/40 font-bold mt-0.5 uppercase tracking-wider">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* AWP data */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Layers size={18} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Datos AWP</p>
            <p className="text-2xl font-black text-[#0C1E4F] leading-none">{nodes.length}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{totalRows.toLocaleString('es')} filas · {totalCols} columnas</p>
          </div>
        </div>

        {/* Programa */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
            <Activity size={18} className="text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Programa</p>
            <p className="text-2xl font-black text-sky-700 leading-none">{activitiesTotal}</p>
            <div className="mt-1.5">
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-sky-400 rounded-full" style={{ width: `${ganttPct}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{ganttPct}% completado</p>
            </div>
          </div>
        </div>

        {/* BIM */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Box size={18} className="text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">BIM</p>
            {hasBim ? (
              <>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                  <p className="text-[11px] font-black text-emerald-700 truncate">{bimConfig.modelName ?? 'Modelo configurado'}</p>
                </div>
                <p className={`text-[10px] mt-0.5 font-bold ${bimLinked ? 'text-emerald-500' : 'text-amber-400'}`}>
                  {bimLinked ? '✓ Datos vinculados' : '○ Sin datos vinculados'}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-amber-400 shrink-0" />
                  <p className="text-[11px] font-black text-amber-600">Sin modelo</p>
                </div>
                <p className="text-[10px] text-slate-300 mt-0.5">Configura desde Visor BIM</p>
              </>
            )}
          </div>
        </div>

        {/* Team */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
            <Users size={18} className="text-teal-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Equipo</p>
            <p className="text-2xl font-black text-teal-700 leading-none">{members.length}</p>
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {(['admin', 'editor', 'viewer'] as const).map(role => {
                const cnt = members.filter((m: any) => m.role === role).length;
                if (!cnt) return null;
                const colors: Record<string, string> = { admin: 'bg-indigo-100 text-indigo-600', editor: 'bg-sky-100 text-sky-600', viewer: 'bg-slate-100 text-slate-500' };
                return (
                  <span key={role} className={`px-1.5 py-0.5 rounded-full text-[8px] font-black ${colors[role]}`}>
                    {cnt} {role}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modules grid ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-[#0C1E4F] uppercase tracking-wide">Módulos del Proyecto</h3>
          <p className="text-[10px] text-slate-400 font-bold">{activeKeys.length} activos</p>
        </div>

        {activeKeys.length === 0 ? (
          <div className="p-10 border-2 border-dashed border-border rounded-xl text-center">
            <p className="text-muted-foreground text-sm">Sin módulos activos. Ve a Configuración para habilitarlos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeKeys.map((key) => {
              const info = MODULES_INFO[key];
              if (!info) return null;
              const Icon = info.icon;
              return (
                <Link
                  key={key}
                  href={`/${org_slug}/projects/${project_id}/${info.path}`}
                  className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition group flex flex-col h-full relative overflow-hidden"
                >
                  <div className={`w-11 h-11 rounded-xl ${info.bg} border ${info.border} flex items-center justify-center mb-4`}>
                    <Icon className={`w-5 h-5 ${info.color}`} />
                  </div>
                  <h4 className="text-[13px] font-black text-slate-700 group-hover:text-[#0C1E4F] transition leading-tight">
                    {info.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-2 flex-1 leading-relaxed">{info.desc}</p>
                  <div className="mt-4 flex items-center text-[10px] font-black text-[#0C1E4F]/60 group-hover:text-[#0C1E4F] transition uppercase tracking-widest">
                    Abrir <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
