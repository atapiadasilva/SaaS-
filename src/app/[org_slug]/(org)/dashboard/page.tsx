import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireOrgAdmin } from "@/lib/guards";

export const dynamic = 'force-dynamic';
import {
  FileSearch2,
  Hammer,
  CheckCircle2,
  FolderOpen,
  ArrowRight,
  Plus
} from "lucide-react";
import Link from "next/link";
import ProjectsGrid from "@/components/organizations/ProjectsGrid";
import CarteraMadurez from "@/components/organizations/CarteraMadurez";

type Stage = "licitacion" | "operacion" | "cierre";

const STAGES: {
  key: Stage;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  dot: string;
}[] = [
  {
    key: "licitacion",
    label: "Licitación",
    sublabel: "Propuestas y ofertas activas",
    icon: FileSearch2,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  {
    key: "operacion",
    label: "Operación",
    sublabel: "Proyectos en ejecución",
    icon: Hammer,
    color: "text-primary",
    bg: "bg-primary/5",
    border: "border-primary/20",
    dot: "bg-primary",
  },
  {
    key: "cierre",
    label: "Cierre",
    sublabel: "Entrega y liquidación",
    icon: CheckCircle2,
    color: "text-accent",
    bg: "bg-accent/5",
    border: "border-accent/20",
    dot: "bg-accent",
  },
];

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;
  const { orgRole } = await requireOrgAdmin(org_slug);
  const isOwner = orgRole === 'owner';
  const supabase = await createClient();

  const { data: orgData } = await supabase
    .from("organizations")
    .select("id, name, plan")
    .eq("slug", org_slug)
    .single();

  if (!orgData) redirect("/organizaciones");
  const org = orgData as { id: string; name: string; plan: string };

  // Traer todos los proyectos con su etapa
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, stage, created_at, active_modules, module_config")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });

  const allProjects = ((projects ?? []) as unknown) as {
    id: string;
    name: string;
    stage: Stage;
    created_at: string;
    active_modules: Record<string, boolean>;
    module_config: Record<string, unknown>;
  }[];

  const countByStage = (stage: Stage) =>
    allProjects.filter((p) => p.stage === stage).length;

  const total = allProjects.length;

  const PLAN_LABELS: Record<string, string> = {
    starter: "Starter",
    pro: "Pro",
    enterprise: "Enterprise",
  };

  return (
    <div className="p-10 space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            {org.name}
          </p>
          <h1 className="text-4xl font-bold text-primary">{org.name}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Gestión de Información · Plan{" "}
            <span className="font-semibold text-accent">
              {PLAN_LABELS[org.plan] ?? org.plan}
            </span>
          </p>
        </div>

        {/* Total proyectos */}
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Total proyectos
          </p>
          <p className="text-5xl font-black text-primary">{total}</p>
        </div>
      </div>

      {/* Barra de ciclo de vida */}
      <div className="relative">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-4">
          Ciclo de vida del proyecto
        </p>

        {/* Pipeline visual */}
        <div className="flex items-stretch gap-0 rounded-2xl overflow-hidden border border-border shadow-sm">
          {STAGES.map((stage, i) => {
            const count = countByStage(stage.key);
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div
                key={stage.key}
                className={`flex-1 ${stage.bg} p-6 relative ${i < STAGES.length - 1 ? "border-r border-border" : ""}`}
              >
                {/* Número de etapa */}
                <span className="text-xs font-bold text-muted-foreground/50 absolute top-4 right-4">
                  0{i + 1}
                </span>

                <div className={`w-11 h-11 rounded-xl ${stage.bg} ${stage.border} border-2 flex items-center justify-center mb-4`}>
                  <stage.icon className={`w-5 h-5 ${stage.color}`} />
                </div>

                <h2 className={`text-lg font-bold ${stage.color}`}>
                  {stage.label}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 mb-4">
                  {stage.sublabel}
                </p>

                <div className="flex items-end justify-between">
                  <div>
                    <p className={`text-4xl font-black ${stage.color}`}>
                      {count}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {count === 1 ? "proyecto" : "proyectos"}
                    </p>
                  </div>
                  {total > 0 && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${stage.bg} ${stage.border} border ${stage.color}`}>
                      {pct}%
                    </span>
                  )}
                </div>

                {/* Barra de progreso interna */}
                <div className="mt-4 h-1.5 rounded-full bg-black/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stage.dot} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Flechas de flujo */}
        <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 translate-y-4 pointer-events-none">
          <ArrowRight className="w-5 h-5 text-border" />
        </div>
        <div className="absolute top-1/2 left-2/3 -translate-x-1/2 -translate-y-1/2 translate-y-4 pointer-events-none">
          <ArrowRight className="w-5 h-5 text-border" />
        </div>
      </div>

      {/* Lista de proyectos recientes o empty state */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
            Proyectos recientes
          </p>
          <Link
            href={`/${org_slug}/projects/new`}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo Proyecto
          </Link>
        </div>

        {total === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl bg-muted/20">
            <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Sin proyectos aún
            </h3>
            <p className="text-muted-foreground text-sm mb-6">
              Crea tu primer proyecto para comenzar a gestionar el ciclo de vida.
            </p>
            <Link
              href={`/${org_slug}/projects/new`}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Crear Proyecto
            </Link>
          </div>
        ) : (
          <>
            <ProjectsGrid projects={allProjects} orgSlug={org_slug} isOwner={isOwner} />
            <div className="mt-10">
              <CarteraMadurez orgId={org.id} orgSlug={org_slug} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
