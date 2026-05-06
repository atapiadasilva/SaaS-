"use client";

import { use, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Check, AlertTriangle } from "lucide-react";

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { project_id } = use(params);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [accessError, setAccessError] = useState(false);
  const [message, setMessage] = useState("");

  const MODULES_DEF = [
    { id: "awp",       name: "Ingesta de Datos AWP" },
    { id: "programa",  name: "Programa Maestro" },
    { id: "bim",       name: "Visualización 3D (Visor BIM + Vistas 3D + 4D)" },
    { id: "tidp",      name: "Hilo Digital — TIDP (ISO 19650-2)" },
    { id: "90dias",    name: "Plan 90 Días (Lookahead + Restricciones)" },
    { id: "documents", name: "Documentos" },
    { id: "team",      name: "Gestión de Equipo" },
    { id: "roles",     name: "Configuración de Roles" },
  ];

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("active_modules")
        .eq("id", project_id)
        .single();

      if (error) {
        setAccessError(true);
      } else {
        setModules((data?.active_modules as Record<string, boolean>) || {});
      }
      setLoading(false);
    }
    loadData();
  }, [project_id]);

  const toggleModule = (id: string, value: boolean) => {
    setModules(prev => ({ ...prev, [id]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    const supabase = createClient();
    
    // Este UPDATE fallará si el usuario no tiene permisos según las reglas RLS (que deberíamos ajustar para obligar admin).
    // Por ahora, como es prototipo, se asume que si llega aquí, lo intenta.
    const { error } = await (supabase as any)
      .from("projects")
      .update({ active_modules: modules })
      .eq("id", project_id);
      
    if (error) {
      setMessage("Error al guardar: " + error.message);
    } else {
      setMessage("Configuración guardada exitosamente.");
    }
    setSaving(false);
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (accessError) return <div className="p-10 text-destructive font-bold flex gap-2"><AlertTriangle/> No tienes permisos para ver esto.</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-primary">Configuración del Proyecto</h2>
        <p className="text-muted-foreground mt-2">Apaga o enciende las herramientas que requiere el equipo.</p>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-border shadow-sm space-y-6">
        <h3 className="text-lg font-bold text-foreground">Módulos del Sistema</h3>
        
        <div className="divide-y divide-border border-t border-b border-border py-2">
          {MODULES_DEF.map((mod) => {
            const isEnabled = modules[mod.id] || false;
            return (
              <div key={mod.id} className="py-4 flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-foreground">{mod.name}</h4>
                  <p className="text-sm text-muted-foreground">Activa/Desactiva el entorno de {mod.name}.</p>
                </div>
                
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    value="" 
                    className="sr-only peer" 
                    checked={isEnabled}
                    onChange={(e) => toggleModule(mod.id, e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            );
          })}
        </div>

        {message && (
          <div className={`p-4 text-sm font-semibold rounded-lg ${message.includes("Error") ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-600 flex items-center gap-2"}`}>
            {!message.includes("Error") && <Check className="w-4 h-4" />}
            {message}
          </div>
        )}

        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition shadow-sm disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
