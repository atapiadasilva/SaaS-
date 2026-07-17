import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProjectNavBar } from "@/components/layout/ProjectNavBar";
import { HiloLogo, HiloWave } from "@/components/brand/Hilo";

const MINING_MODULES = ['panel', 'mineria', 'planificacion', 'trisemanal', 'recursos', 'calidad', 'medio-ambiente', 'sso', 'equipos', 'rrhh', 'conciliacion', 'estado-pago'];

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
    .select("id, name, stage, organizations(id, slug, name)")
    .eq("id", project_id)
    .single();

  if (pError || !project || project.organizations?.slug !== org_slug) {
    redirect("/organizaciones");
  }

  const activeModules = [...MINING_MODULES, 'setup'];

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <header className="relative bg-white border-b-2 border-[#FF0000] sticky top-0 z-10 px-6 py-2.5 flex items-center gap-4 overflow-hidden">
        {/* Hilo decorativo de fondo */}
        <HiloWave className="absolute right-0 top-0 h-full w-[420px]" opacity={0.14} />

        {/* Logo Hilo Digital */}
        <div className="flex items-center gap-2.5 shrink-0 relative">
          <HiloLogo size={34} />
          <div>
            <div className="font-display text-[13px] font-bold text-[#1A1A1A] leading-none">
              HILO <span className="text-[#FF0000]">DIGITAL</span>
            </div>
            <div className="text-[8px] text-[#757575] leading-none tracking-[0.18em] uppercase mt-0.5">{project.name}</div>
          </div>
        </div>

        {/* Nav centrado */}
        <div className="flex-1 flex justify-center relative">
          <ProjectNavBar
            orgSlug={org_slug}
            projectId={project_id}
            activeModuleKeys={activeModules}
          />
        </div>

        {/* Stage badge */}
        <div className="shrink-0 relative">
          <span className="px-2.5 py-1 bg-white border border-[#FF0000]/40 text-[#A00000] text-[9px] font-black rounded-full uppercase tracking-wider">
            {project.stage}
          </span>
        </div>
      </header>

      <div className="p-6 flex-1 overflow-auto bg-white">
        {children}
      </div>
    </div>
  );
}
