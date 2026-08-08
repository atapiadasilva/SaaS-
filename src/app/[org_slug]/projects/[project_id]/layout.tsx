import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { ProjectNavBar } from "@/components/layout/ProjectNavBar";
import { HiloLogo, HiloWave } from "@/components/brand/Hilo";
import { resolverModulos } from "@/lib/modules";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { org_slug, project_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: project, error: pError } = await (supabase as any)
    .from("projects")
    .select("id, name, stage, active_modules, organizations(id, slug, name)")
    .eq("id", project_id)
    .single();

  if (pError || !project || project.organizations?.slug !== org_slug) {
    redirect("/organizaciones");
  }

  // Módulos visibles según la configuración del proyecto (Panel y Setup siempre presentes).
  const activeModules = resolverModulos(project.active_modules);

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <header className="relative bg-white border-b-2 border-[#FF0000] sticky top-0 z-10 px-6 py-2.5 flex items-center gap-4">
        {/* Hilo decorativo de fondo. El recorte va en este contenedor y no en el header,
            para que el desplegable de Departamentos pueda salirse de la barra. */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <HiloWave className="absolute right-0 top-0 h-full w-[420px]" opacity={0.14} />
        </div>

        {/* Logo Hilo Digital — clic vuelve a la organización */}
        <Link
          href={`/${org_slug}/dashboard`}
          title="Volver a la organización"
          className="flex items-center gap-2.5 shrink-0 relative hover:opacity-80 transition"
        >
          <HiloLogo size={34} />
          <div>
            <div className="font-display text-[13px] font-bold text-[#1A1A1A] leading-none">
              HILO <span className="text-[#FF0000]">DIGITAL</span>
            </div>
            <div className="text-[8px] text-[#757575] leading-none tracking-[0.18em] uppercase mt-0.5">{project.name}</div>
          </div>
        </Link>

        {/* Nav centrada. min-w-0 + scroll interno: si no cabe, se desliza dentro
            de la barra en vez de empujar el badge y el engranaje fuera de pantalla. */}
        <div className="flex-1 flex relative min-w-0 overflow-x-auto sin-scrollbar">
          <ProjectNavBar
            orgSlug={org_slug}
            projectId={project_id}
            activeModuleKeys={activeModules}
          />
        </div>

        {/* Stage + Setup */}
        <div className="shrink-0 relative flex items-center gap-2">
          <span className="px-2.5 py-1 bg-white border border-[#FF0000]/40 text-[#A00000] text-[9px] font-black rounded-full uppercase tracking-wider">
            {project.stage}
          </span>
          <Link
            href={`/${org_slug}/projects/${project_id}/setup`}
            title="Setup del proyecto"
            className="p-2 rounded-full text-[#757575] hover:text-[#A00000] hover:bg-red-50 transition"
          >
            <Settings2 className="w-4 h-4" />
          </Link>
        </div>
      </header>

      <div className="p-6 flex-1 overflow-auto bg-white">
        {children}
      </div>
    </div>
  );
}
