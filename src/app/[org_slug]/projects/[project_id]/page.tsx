import { createClient } from "@/lib/supabase/server";
import { Layers, LayoutDashboard, Box, FileText, Database, Users, ShieldCheck, ArrowRight } from "lucide-react";
import Link from "next/link";

const MODULES_INFO: Record<string, { title: string, icon: any, desc: string, path: string, color: string }> = {
  "awp":       { title: "Ingesta de Datos AWP",    icon: Database,       desc: "Importador, mapa nodal, integridad del dato y matriz control.", path: "cwp",       color: "text-[#0C1E4F]" },
  "programa":  { title: "Programa Maestro",        icon: Database,       desc: "Carta Gantt con WBS, HH por disciplina y avance de obra.",      path: "programa",  color: "text-sky-500" },
  "cwp":       { title: "CWP Viewer",              icon: Layers,         desc: "Explorador de paquetes y métricas asociadas.",                 path: "cwp",       color: "text-blue-500" },
  "4d":        { title: "Planeación 4D",           icon: LayoutDashboard,desc: "Simulación de línea base y pronóstico.",                       path: "4d",        color: "text-amber-500" },
  "bim":       { title: "Visor BIM",               icon: Box,            desc: "Modelos tridimensionales de ingeniería.",                      path: "bim",       color: "text-emerald-500" },
  "documents": { title: "Mis Documentos",          icon: FileText,       desc: "Gestor de oficios y reportes técnicos.",                       path: "documents", color: "text-purple-500" },
  "team":      { title: "Gestión de Equipo",       icon: Users,          desc: "Usuarios, roles y permisos por módulo.",                       path: "team",      color: "text-teal-500" },
  "roles":     { title: "Configuración de Roles",  icon: ShieldCheck,    desc: "Define qué puede ver o editar cada rol.",                      path: "roles",     color: "text-indigo-500" },
};

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { org_slug, project_id } = await params;
  const supabase = await createClient();

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("active_modules")
    .eq("id", project_id)
    .single();

  const activeModules = (project?.active_modules as Record<string, boolean>) || {};
  // Un módulo es "activo" si no está explícitamente puesto en false.
  // Esto hace que módulos nuevos aparezcan automáticamente en proyectos existentes.
  const activeKeys = Object.keys(MODULES_INFO).filter(k => activeModules[k] !== false);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="bg-gradient-to-br from-primary/10 to-transparent p-10 rounded-3xl border border-primary/10 shadow-sm relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <h2 className="text-3xl font-black text-primary mb-3">Bienvenido a la consola del proyecto</h2>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Desde aquí puedes navegar a los diferentes módulos activos. Utiliza la barra superior para explorar la información.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-bold text-foreground mb-4">Módulos Activos</h3>
        {activeKeys.length === 0 ? (
          <div className="p-10 border-2 border-dashed border-border rounded-xl text-center">
            <p className="text-muted-foreground">No hay módulos activos. Ve a configuración para prender opciones.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {activeKeys.map((key) => {
              const info = MODULES_INFO[key];
              if (!info) return null;
              
              return (
                <Link
                  key={key}
                  href={`/${org_slug}/projects/${project_id}/${info.path}`}
                  className="bg-white p-6 rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition group flex flex-col h-full relative overflow-hidden"
                >
                  <div className={`w-12 h-12 rounded-xl bg-muted/30 flex items-center justify-center mb-4 transition-colors group-hover:bg-primary/5 ${info.color}`}>
                    <info.icon className="w-6 h-6" />
                  </div>
                  <h4 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                    {info.title}
                  </h4>
                  <p className="text-sm text-muted-foreground mt-2 mb-6 flex-1">
                    {info.desc}
                  </p>
                  
                  <div className="mt-auto flex items-center text-sm font-semibold text-primary opacity-80 group-hover:opacity-100 transition-opacity">
                    Abrir módulo <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
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
