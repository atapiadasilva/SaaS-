import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CreateProjectForm } from "./CreateProjectForm";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;
  const supabase = await createClient();

  // Obtener organization_id a partir del org_slug
  const { data: orgData } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", org_slug)
    .single();

  if (!orgData) {
    redirect("/organizaciones");
  }

  // Obtener el ID del usuario loggeado para ponerlo como admin inicial
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="p-10 max-w-4xl mx-auto">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          {orgData.name} › Proyectos
        </p>
        <h1 className="text-4xl font-bold text-primary">Crear Nuevo Proyecto</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Define la etapa inicial del ciclo de vida y activa los módulos que el equipo necesitará.
        </p>
      </div>

      <CreateProjectForm orgId={orgData.id} orgSlug={org_slug} userId={user.id} />
    </div>
  );
}
