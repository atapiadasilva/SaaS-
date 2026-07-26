"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileSearch2, Hammer, CheckCircle2, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { MODULE_CATALOG, modulosPorDefecto, type ModuleKey, type ModuleCategory } from "@/lib/modules";

type Stage = "licitacion" | "operacion" | "cierre";

const STAGES: { key: Stage; label: string; sublabel: string; icon: React.ElementType; color: string }[] = [
  { key: "licitacion", label: "Licitación", sublabel: "Propuesta / estudio", icon: FileSearch2, color: "text-amber-600" },
  { key: "operacion", label: "Operación", sublabel: "Construcción / ejecución", icon: Hammer, color: "text-primary" },
  { key: "cierre", label: "Cierre", sublabel: "Liquidación", icon: CheckCircle2, color: "text-accent" },
];

const CAT_LABEL: Record<ModuleCategory, string> = { nucleo: 'Núcleo', awp: 'Gestión AWP', departamentos: 'Departamentos' };
const PLAN_LIMITS: Record<string, number> = { starter: 1, pro: 5, enterprise: Infinity };

export function CreateProjectForm({
  orgId, orgSlug, userId, orgPlan = 'starter', projectCount = 0,
}: {
  orgId: string; orgSlug: string; userId: string; orgPlan?: string; projectCount?: number;
}) {
  const router = useRouter();
  const planLimit = PLAN_LIMITS[orgPlan] ?? 1;
  const limitReached = projectCount >= planLimit;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [externalCode, setExternalCode] = useState("");
  const [stage, setStage] = useState<Stage>("operacion");
  const [active, setActive] = useState<Set<ModuleKey>>(new Set(modulosPorDefecto("operacion")));
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al cambiar de etapa, re-sugerir los módulos por defecto (si el usuario aún no los tocó a mano)
  useEffect(() => {
    if (!touched) setActive(new Set(modulosPorDefecto(stage)));
  }, [stage, touched]);

  const toggle = (key: ModuleKey, alwaysOn?: boolean) => {
    if (alwaysOn) return;
    setTouched(true);
    setActive(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (limitReached) {
      setError(`Tu plan ${orgPlan} permite máximo ${planLimit} proyecto${planLimit !== 1 ? 's' : ''}. Actualiza el plan para continuar.`);
      return;
    }
    setLoading(true); setError(null);
    const supabase = createClient();
    try {
      const modules = MODULE_CATALOG.filter(m => active.has(m.key) || m.alwaysOn).map(m => m.key);
      const { data: projectData, error: projectError } = await (supabase as any)
        .from("projects").insert({
          organization_id: orgId, name, description, stage,
          active_modules: modules,
          module_config: externalCode ? { external_code: externalCode } : {},
        }).select("id").single();
      if (projectError) throw new Error(`Error creando proyecto: ${projectError.message}`);

      const projectId = projectData.id;
      const { error: memberError } = await (supabase as any).from("project_members")
        .insert({ project_id: projectId, user_id: userId, role: "admin", module_access: { all: true } });
      if (memberError) console.warn("No se pudo añadir al creador como miembro:", memberError.message);

      // Ir directo al Setup (onboarding) del proyecto recién creado
      router.push(`/${orgSlug}/projects/${projectId}/setup`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Surgió un error desconocido");
      setLoading(false);
    }
  };

  const byCat = (c: ModuleCategory) => MODULE_CATALOG.filter(m => m.category === c);

  return (
    <form onSubmit={handleCreate} className="space-y-8">
      <div className="bg-white p-8 rounded-2xl border border-border shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-foreground">1. Datos generales</h2>
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Nombre del proyecto</label>
            <input type="text" required placeholder="Ej: Ampliación Planta Solar Arica"
              className="w-full px-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Código externo <span className="text-muted-foreground font-normal">(P6/SmartPlant, opcional)</span></label>
            <input type="text" placeholder="Ej: EIMI00417, PRC25031"
              className="w-full px-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition font-mono text-sm"
              value={externalCode} onChange={(e) => setExternalCode(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Descripción <span className="text-muted-foreground font-normal">(opcional)</span></label>
          <textarea placeholder="Alcance, cliente/mandante, ubicación…" rows={2}
            className="w-full px-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition resize-none"
            value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-border shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-foreground">2. Etapa del ciclo de vida</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STAGES.map((s) => (
            <button type="button" key={s.key} onClick={() => setStage(s.key)}
              className={cn("flex flex-col items-center p-5 rounded-xl border-2 transition-all text-center",
                stage === s.key ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-muted-foreground bg-white")}>
              <div className={cn("w-11 h-11 rounded-full flex items-center justify-center mb-3 bg-current", s.color)}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className={cn("font-bold", stage === s.key ? "text-primary" : "text-foreground")}>{s.label}</h3>
              <p className="text-xs text-muted-foreground mt-1">{s.sublabel}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-border shadow-sm space-y-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          3. Módulos activos
          <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-1 rounded-full">Sugeridos según la etapa · se cambian después en Setup</span>
        </h2>
        {(['nucleo', 'awp', 'departamentos'] as ModuleCategory[]).map(cat => (
          <div key={cat}>
            <div className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-2">{CAT_LABEL[cat]}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {byCat(cat).map(mod => {
                const on = active.has(mod.key) || mod.alwaysOn;
                return (
                  <div key={mod.key} onClick={() => toggle(mod.key, mod.alwaysOn)}
                    className={cn("flex items-start gap-3 p-3.5 rounded-xl border-2 transition group",
                      mod.alwaysOn ? "cursor-default" : "cursor-pointer",
                      on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30")}>
                    <div className={cn("mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0",
                      on ? "bg-primary border-primary text-white" : "border-muted-foreground/30 bg-white")}>
                      {mod.alwaysOn ? <Lock className="w-3 h-3" /> : on && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                    <div>
                      <h4 className={cn("font-semibold text-[13px]", on ? "text-primary" : "text-foreground")}>{mod.label}
                        {mod.requiereDatos && <span className="ml-1.5 text-[9px] font-normal text-muted-foreground">requiere datos</span>}
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{mod.descripcion}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error && <div className="p-4 bg-destructive/10 text-destructive rounded-xl text-sm font-semibold border border-destructive/20 text-center">{error}</div>}

      <div className="flex justify-between items-center bg-muted/20 p-6 rounded-2xl border border-border">
        <button type="button" onClick={() => router.back()} disabled={loading} className="px-6 py-2.5 rounded-lg text-foreground font-semibold hover:bg-muted transition">Cancelar</button>
        <button type="submit" disabled={loading} className="px-8 py-3 rounded-lg bg-primary text-white font-bold hover:bg-primary/95 transition shadow-sm flex items-center gap-2 text-lg disabled:opacity-60">
          {loading && <Loader2 className="w-5 h-5 animate-spin" />}
          {loading ? "Creando…" : "Crear y configurar"}
        </button>
      </div>
    </form>
  );
}
