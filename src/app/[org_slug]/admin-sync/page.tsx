import { requireOrgAdmin } from "@/lib/guards";
import { createClient } from "@/lib/supabase/server";
import SyncForm from "./SyncForm";

export default async function AdminSyncPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;
  const { org: orgData } = await requireOrgAdmin(org_slug);
  const supabase = await createClient();

  const { data: projects } = await (supabase as any)
    .from("projects")
    .select("id, name")
    .eq("organization_id", orgData.id)
    .order("created_at", { ascending: true });

  const allProjects = (projects ?? []) as { id: string; name: string }[];

  return (
    <div className="p-10 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-black text-primary">Sincronización de Proyectos</h1>
        <p className="text-muted-foreground mt-2">
          Esta herramienta te permite mapear tus proyectos actuales a la <strong>lista oficial</strong> sin perder la data cargada. 
          Selecciona el nombre oficial en el selector para renombrar automáticamente el proyecto.
        </p>
      </div>

      <SyncForm projects={allProjects} />
    </div>
  );
}
