"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, UploadCloud, Building2, Crown, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Database, OrgPlan } from "@/lib/supabase/types";

type Org = Database["public"]["Tables"]["organizations"]["Row"] & {
  projectCount: number;
  memberCount: number;
};

interface CreateOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (org: Org) => void;
}

const PLANS: { id: OrgPlan; name: string; limitText: string; icon: React.ElementType; color: string }[] = [
  { id: "starter", name: "Starter", limitText: "1 Proyecto", icon: Building2, color: "bg-muted" },
  { id: "pro", name: "Pro", limitText: "Hasta 5 Proyectos", icon: Zap, color: "bg-accent" },
  { id: "enterprise", name: "Enterprise", limitText: "Proyectos Ilimitados", icon: Crown, color: "bg-primary" },
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CreateOrgModal({ isOpen, onClose, onCreated }: CreateOrgModalProps) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<OrgPlan>("pro");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    let logoUrl: string | null = null;

    try {
      // 1. Subir logo si existe
      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const path = `${slugify(orgName)}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("org-logos")
          .upload(path, logoFile, { upsert: true });

        if (uploadError) throw new Error(`Logo: ${uploadError.message}`);

        const { data: urlData } = supabase.storage
          .from("org-logos")
          .getPublicUrl(path);
        logoUrl = urlData.publicUrl;
      }

      // 2. Crear organización via RPC (atómico: org + member owner)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rpcClient = supabase as any;
      const { data: newOrgId, error: rpcError } = await rpcClient.rpc(
        "create_organization",
        {
          org_name: orgName,
          org_slug: slugify(orgName),
          org_plan: selectedPlan,
          org_logo_url: logoUrl,
        }
      );

      if (rpcError) throw new Error(rpcError.message);

      // 3. Obtener la org recién creada
      const { data: newOrgData, error: fetchError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", newOrgId as string)
        .single();

      if (fetchError) throw new Error(fetchError.message);

      const newOrg = newOrgData as Database["public"]["Tables"]["organizations"]["Row"];

      onCreated?.({
        ...newOrg,
        projectCount: 0,
        memberCount: 1,
      });

      // Reset form
      setOrgName("");
      setLogoFile(null);
      setLogoPreview(null);
      setSelectedPlan("pro");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/40 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-2xl font-bold text-primary">Añadir Nueva Empresa</h2>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="p-6 space-y-8">
            {/* Logo */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-3">
                Logo de la Empresa
              </label>
              <div className="flex items-center gap-6">
                <div className="relative w-32 h-32 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/50 overflow-hidden group">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center p-4">
                      <UploadCloud className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <span className="text-xs text-muted-foreground font-medium">Subir Imagen</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {logoPreview && (
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition cursor-pointer">
                      <span className="text-white text-xs font-semibold">Cambiar Logo</span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-foreground font-medium">Dimensiones sugeridas</p>
                  <p className="text-xs text-muted-foreground">Formato cuadrado (ej. 400x400), fondo transparente o blanco. Soporta JPG, PNG, o WebP.</p>
                </div>
              </div>
            </div>

            {/* Nombre */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Nombre de la Organización
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Constructora Sur"
                className="w-full px-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
              {orgName && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  URL: <span className="font-mono text-primary">/{slugify(orgName)}/dashboard</span>
                </p>
              )}
            </div>

            {/* Planes */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-3">
                Selecciona un Plan (Usuarios ilimitados en todos)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLANS.map((plan) => (
                  <button
                    type="button"
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={cn(
                      "flex flex-col items-center p-4 rounded-xl border-2 transition-all text-center",
                      selectedPlan === plan.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-muted-foreground bg-white"
                    )}
                  >
                    <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mb-3 text-white shadow-inner", plan.color)}>
                      <plan.icon className="w-6 h-6" />
                    </div>
                    <h3 className={cn("font-bold", selectedPlan === plan.id ? "text-primary" : "text-foreground")}>
                      {plan.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">{plan.limitText}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Acciones */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-6 py-2.5 rounded-lg text-foreground font-medium hover:bg-muted transition disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition shadow-sm flex items-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Building2 className="w-4 h-4" />
                )}
                {loading ? "Creando..." : "Crear Empresa"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
