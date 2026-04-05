"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileSearch2,
  Hammer,
  CheckCircle2,
  Loader2,
  Layers,
  LayoutDashboard,
  Box,
  FileText,
  Database
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Stage = "licitacion" | "operacion" | "cierre";

const STAGES: { key: Stage; label: string; sublabel: string; icon: React.ElementType; color: string }[] = [
  { key: "licitacion", label: "Licitación", sublabel: "Propuestas", icon: FileSearch2, color: "text-amber-700" },
  { key: "operacion", label: "Operación", sublabel: "Ejecución", icon: Hammer, color: "text-primary" },
  { key: "cierre", label: "Cierre", sublabel: "Liquidación", icon: CheckCircle2, color: "text-accent" },
];

const MODULES = [
  { id: "awp",       name: "Ingesta de Datos AWP",      description: "Importador Excel, mapa nodal relacional, integridad del dato y matriz de control.", icon: Database },
  { id: "programa",  name: "Programa Maestro",          description: "Carta Gantt interactiva con WBS, HH por disciplina y avance.", icon: Database },
  { id: "cwp",       name: "CWP Viewer",                description: "Gestión visual e información de Construction Work Packages.", icon: Layers },
  { id: "4d",        name: "Planeación 4D",             description: "Simulación de construcción vinculada a cronograma.", icon: LayoutDashboard },
  { id: "bim",       name: "Visor BIM",                 description: "Modelos 3D e inspección de ingeniería y obra.", icon: Box },
  { id: "documents", name: "Gestor Documental",         description: "Expedientes, planos y documentos del proyecto.", icon: FileText },
  { id: "team",      name: "Gestión de Equipo",         description: "Invita usuarios y define permisos de visualización o edición por módulo.", icon: FileText },
  { id: "roles",     name: "Configuración de Roles",    description: "Define qué puede ver o editar cada rol (admin, editor, visualizador).", icon: FileText },
];

export function CreateProjectForm({ orgId, orgSlug, userId }: { orgId: string; orgSlug: string; userId: string }) {
  const router = useRouter();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<Stage>("licitacion");
  const [activeModules, setActiveModules] = useState<Record<string, boolean>>({
    awp: true,
    programa: true,
    cwp: true,
    "4d": false,
    bim: false,
    documents: false,
    team: true,
    roles: true,
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleModule = (modId: string) => {
    setActiveModules(prev => ({ ...prev, [modId]: !prev[modId] }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    try {
      // 1. Crear Proyecto
      const { data: projectData, error: projectError } = await (supabase as any)
        .from("projects")
        .insert({
          organization_id: orgId,
          name,
          description,
          stage,
          active_modules: activeModules
        })
        .select("id")
        .single();

      if (projectError) throw new Error(`Error creando proyecto: ${projectError.message}`);

      const projectId = projectData.id;

      // 2. Agregar usuario creador como 'admin' en project_members
      const { error: memberError } = await (supabase as any)
        .from("project_members")
        .insert({
          project_id: projectId,
          user_id: userId,
          role: "admin",
          module_access: { all: true }
        });

      if (memberError) {
        console.warn("No se pudo añadir al creador como miembro. Error:", memberError.message);
        // NO anulamos la creación, pero es un aviso de que la DB tal vez tiene RLS bloqueando
      }

      // 3. Éxito: Redirigir al dashboard del proyecto
      router.push(`/${orgSlug}/projects/${projectId}`);
      router.refresh(); // Refrescar el caché
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Surgió un error desconocido");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleCreate} className="space-y-10">
      
      <div className="bg-white p-8 rounded-2xl border border-border shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-foreground">1. Datos Generales</h2>
        
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Nombre del Proyecto
          </label>
          <input
            type="text"
            required
            placeholder="Ej: Ampliación Planta Solar Arica"
            className="w-full px-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Descripción <span className="text-muted-foreground font-normal">(Opcional)</span>
          </label>
          <textarea
            placeholder="Alcance, objetivos o cliente..."
            rows={3}
            className="w-full px-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-border shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-foreground">2. Etapa del Ciclo de Vida</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STAGES.map((s) => (
            <button
              type="button"
              key={s.key}
              onClick={() => setStage(s.key)}
              className={cn(
                "flex flex-col items-center p-5 rounded-xl border-2 transition-all text-center",
                stage === s.key
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-muted-foreground bg-white"
              )}
            >
              <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mb-3 text-white shadow-inner bg-current", s.color)}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className={cn("font-bold", stage === s.key ? "text-primary" : "text-foreground")}>
                {s.label}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">{s.sublabel}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-border shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          3. Módulos Iniciales
          <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded-full">Se pueden cambiar después</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MODULES.map((mod) => {
            const isActive = activeModules[mod.id];
            return (
              <div 
                key={mod.id} 
                className={cn(
                  "flex items-start gap-4 p-4 rounded-xl border-2 transition cursor-pointer group",
                  isActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                )}
                onClick={() => toggleModule(mod.id)}
              >
                <div className={cn(
                  "mt-0.5 w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                  isActive ? "bg-primary border-primary text-white" : "border-muted-foreground/30 bg-white group-hover:border-primary/50"
                )}>
                  {isActive && <CheckCircle2 className="w-4 h-4" />}
                </div>
                
                <div>
                  <h4 className={cn("font-semibold", isActive ? "text-primary" : "text-foreground")}>
                    {mod.name}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">{mod.description}</p>
                </div>
                
                <div className="ml-auto text-muted-foreground/40 shrink-0">
                  <mod.icon className="w-8 h-8 opacity-50" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-xl text-sm font-semibold border border-destructive/20 text-center">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center bg-muted/20 p-6 rounded-2xl border border-border">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="px-6 py-2.5 rounded-lg text-foreground font-semibold hover:bg-muted transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-8 py-3 rounded-lg bg-primary text-white font-bold hover:bg-primary/95 transition shadow-sm flex items-center gap-2 text-lg disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 className="w-5 h-5 animate-spin" />}
          {loading ? "Creando..." : "Crear e Iniciar"}
        </button>
      </div>
      
    </form>
  );
}
