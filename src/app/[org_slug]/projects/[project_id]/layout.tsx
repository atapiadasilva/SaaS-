import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProjectNavBar } from "@/components/layout/ProjectNavBar";

// Los 3 módulos AWP (edificación) — siempre visibles, sin activación en DB
const ACTIVE_MODULES = ['awp', 'lps', 'vistas'];
// Proyectos con data en mining_cwa usan el módulo de minería en vez de los de edificación
const MINING_MODULES = ['mineria'];

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

  const { count: miningCwaCount } = await (supabase as any)
    .from("mining_cwa")
    .select("cwa_id", { count: "exact", head: true })
    .eq("project_id", project_id);

  const activeModules = (miningCwaCount ?? 0) > 0 ? MINING_MODULES : ACTIVE_MODULES;

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      <header className="bg-[#0a1628] border-b border-white/5 sticky top-0 z-10 px-6 py-3 flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-black text-sm">D</span>
          </div>
          <div>
            <div className="text-[11px] font-black text-white leading-none">{project.name}</div>
            <div className="text-[8px] text-slate-500 leading-none uppercase tracking-widest">Datos AWP</div>
          </div>
        </div>

        {/* Nav centrado */}
        <div className="flex-1 flex justify-center">
          <ProjectNavBar
            orgSlug={org_slug}
            projectId={project_id}
            activeModuleKeys={activeModules}
          />
        </div>

        {/* Stage badge */}
        <div className="shrink-0">
          <span className="px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-black rounded-full uppercase tracking-wider">
            {project.stage}
          </span>
        </div>
      </header>

      <div className="p-6 flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
