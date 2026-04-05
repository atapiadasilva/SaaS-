import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Settings, Users, LayoutDashboard, Database, ArrowLeft,
  Layers, Box, FileText, ShieldCheck, CalendarDays
} from "lucide-react";

// ─── Catálogo completo de módulos ─────────────────────────────────────────────

const MODULE_NAV: Record<string, { label: string; icon: any; path: string }> = {
  awp:       { label: "Datos AWP",      icon: Database,        path: "cwp"      },
  programa:  { label: "Programa",       icon: CalendarDays,    path: "programa" },
  cwp:       { label: "CWP Explorer",   icon: Layers,          path: "cwp"      },
  "4d":      { label: "Planeación 4D",  icon: LayoutDashboard, path: "4d"       },
  bim:       { label: "Visor BIM",      icon: Box,             path: "bim"      },
  documents: { label: "Documentos",     icon: FileText,        path: "documents"},
  team:      { label: "Equipo",         icon: Users,           path: "team"     },
  roles:     { label: "Roles",          icon: ShieldCheck,     path: "roles"    },
};

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
    .select("*, organizations(slug)")
    .eq("id", project_id)
    .single();

  if (pError || !project || project.organizations?.slug !== org_slug) {
    redirect(`/${org_slug}/dashboard`);
  }

  const { data: member } = await (supabase as any)
    .from("project_members")
    .select("role")
    .eq("project_id", project_id)
    .eq("user_id", user.id)
    .single();

  const role = member?.role || "viewer";
  const activeModules = (project.active_modules as Record<string, boolean>) || {};

  // Módulos activos: no explícitamente false
  const activeModuleKeys = Object.keys(MODULE_NAV).filter(k => activeModules[k] !== false);

  return (
    <div className="min-h-screen bg-muted/5 flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white border-b border-border sticky top-0 z-10 px-8 py-3 flex items-center justify-between gap-4">
        {/* Left: back + project name */}
        <div className="flex items-center gap-4 shrink-0">
          <Link
            href={`/${org_slug}/proyectos`}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-primary leading-none">{project.name}</h1>
              <span className="px-2 py-0.5 bg-accent/10 border border-accent/20 text-accent text-[9px] font-black rounded-full uppercase tracking-wider">
                {project.stage}
              </span>
            </div>
          </div>
        </div>

        {/* Center: active module links */}
        <nav className="flex items-center gap-1 flex-1 justify-center overflow-x-auto">
          {/* Resumen siempre visible */}
          <Link
            href={`/${org_slug}/projects/${project_id}`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-muted transition text-slate-500 whitespace-nowrap shrink-0"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Resumen
          </Link>

          {/* Separador */}
          <div className="w-px h-5 bg-border mx-1 shrink-0" />

          {/* Módulos activos dinámicos */}
          {activeModuleKeys.map(key => {
            const mod = MODULE_NAV[key];
            const Icon = mod.icon;
            return (
              <Link
                key={key}
                href={`/${org_slug}/projects/${project_id}/${mod.path}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-muted transition text-slate-500 whitespace-nowrap shrink-0"
              >
                <Icon className="w-3.5 h-3.5" />
                {mod.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: settings (solo admin) */}
        <div className="shrink-0">
          {(role === "admin" || role === "owner") && (
            <Link
              href={`/${org_slug}/projects/${project_id}/settings`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide hover:bg-muted transition text-slate-400"
            >
              <Settings className="w-3.5 h-3.5" />
              Config.
            </Link>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="p-8 flex-1">
        {children}
      </div>
    </div>
  );
}
