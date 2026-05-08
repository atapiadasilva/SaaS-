import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings, ArrowLeft } from "lucide-react";
import { ProjectNavBar } from "@/components/layout/ProjectNavBar";
import { ProjectMemberMenu } from "@/components/layout/ProjectMemberMenu";
import { previewOrgRole, previewProjectRole } from "@/lib/rolePreview";
import { getPreviewRole } from "@/lib/rolePreviewServer";

const KNOWN_MODULE_KEYS = ['awp', 'programa', 'cwp', '4d', 'bim', 'vistas3d', 'tidp', '90dias', 'documents', 'team', 'roles', 'model'];

// Módulos que requieren ser admin del proyecto para aparecer en la nav
const ADMIN_ONLY_MODULES = ['team', 'roles'];

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
    .select("*, organizations(id, slug, name)")
    .eq("id", project_id)
    .single();

  if (pError || !project || project.organizations?.slug !== org_slug) {
    redirect("/organizaciones");
  }

  const { data: projectMember } = await (supabase as any)
    .from("project_members")
    .select("role")
    .eq("project_id", project_id)
    .eq("user_id", user.id)
    .single();

  const { data: orgMember } = await (supabase as any)
    .from("organization_members")
    .select("role")
    .eq("organization_id", project.organizations.id)
    .eq("user_id", user.id)
    .single();

  const realIsOwner = orgMember?.role === 'owner';

  // Sin acceso real de ningún tipo → fuera
  const hasRealAccess = !!projectMember || (orgMember && ['owner', 'admin'].includes(orgMember.role));
  if (!hasRealAccess) redirect("/organizaciones");

  // Preview (solo owner real puede activarlo)
  const preview = realIsOwner ? await getPreviewRole() : null;

  // Roles efectivos
  const effectiveOrgRole   = preview ? previewOrgRole(preview)   : (orgMember?.role ?? 'member');
  const effectiveIsOrgAdmin = effectiveOrgRole === 'owner' || effectiveOrgRole === 'admin';

  const effectiveProjectRole = preview
    ? previewProjectRole(preview)
    : (projectMember?.role ?? (effectiveIsOrgAdmin ? 'admin' : 'viewer'));

  const canAdminProject = effectiveProjectRole === 'admin' || effectiveIsOrgAdmin;

  // Módulos activos del proyecto
  const activeModules = (project.active_modules as Record<string, boolean>) || {};
  const activeModuleKeys = KNOWN_MODULE_KEYS.filter(k => {
    if (!activeModules[k] && !(k === 'vistas3d' && activeModules['bim']) && !(k === '4d' && activeModules['bim'])) return false;
    // Team y Roles solo visibles para admins del proyecto
    if (ADMIN_ONLY_MODULES.includes(k) && !canAdminProject) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-muted/5 flex flex-col">
      <header className="bg-white border-b border-border sticky top-0 z-10 px-6 py-3 flex items-center justify-between gap-4">

        {/* Left */}
        <div className="flex items-center gap-3 shrink-0">
          {effectiveIsOrgAdmin ? (
            <Link
              href={`/${org_slug}/proyectos`}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition"
              title="Volver a proyectos"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-[#0C1E4F] flex items-center justify-center shrink-0">
              <span className="text-white font-black text-sm">D</span>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-primary leading-none">{project.name}</h1>
              <span className="px-2 py-0.5 bg-accent/10 border border-accent/20 text-accent text-[9px] font-black rounded-full uppercase tracking-wider">
                {project.stage}
              </span>
            </div>
            {!effectiveIsOrgAdmin && (
              <p className="text-[9px] text-slate-400 font-semibold leading-none mt-0.5">
                {project.organizations.name}
              </p>
            )}
          </div>
        </div>

        {/* Center */}
        <ProjectNavBar
          orgSlug={org_slug}
          projectId={project_id}
          activeModuleKeys={activeModuleKeys}
        />

        {/* Right */}
        <div className="flex items-center gap-2 shrink-0">
          {canAdminProject && (
            <Link
              href={`/${org_slug}/projects/${project_id}/settings`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-muted transition text-slate-400"
            >
              <Settings className="w-3.5 h-3.5" />
              Config.
            </Link>
          )}
          {!effectiveIsOrgAdmin && (
            <ProjectMemberMenu email={user.email ?? ""} />
          )}
        </div>
      </header>

      <div className="p-8 flex-1">
        {children}
      </div>
    </div>
  );
}
