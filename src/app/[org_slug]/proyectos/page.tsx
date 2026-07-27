import { FolderOpen, Plus } from "lucide-react";
import Link from "next/link";
import ProjectsGrid from "@/components/organizations/ProjectsGrid";
import CarteraMadurez from "@/components/organizations/CarteraMadurez";
import { requireOrgAdmin } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";

export default async function ProyectosPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;
  const { org: orgData, orgRole } = await requireOrgAdmin(org_slug);
  const supabase = await createClient();
  const isOwner = orgRole === 'owner';

  const { data: projects } = await (supabase as any)
    .from("projects")
    .select("id, name, stage, created_at, active_modules, module_config")
    .eq("organization_id", orgData.id)
    .order("created_at", { ascending: false });

  const allProjects = (projects ?? []) as {
    id: string;
    name: string;
    stage: string;
    created_at: string;
    active_modules: Record<string, boolean>;
    module_config: Record<string, unknown>;
  }[];

  return (
    <div className="p-10 space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            {orgData.name}
          </p>
          <h1 className="text-3xl font-black text-primary">Proyectos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activa o desactiva los módulos de cada proyecto directamente desde aquí.
          </p>
        </div>
        <Link
          href={`/${org_slug}/projects/new`}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nuevo Proyecto
        </Link>
      </div>

      {allProjects.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-3xl bg-muted/20">
          <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Sin proyectos aún</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Crea tu primer proyecto para comenzar.
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
          <CarteraMadurez orgId={orgData.id} orgSlug={org_slug} />
        </>
      )}
    </div>
  );
}
