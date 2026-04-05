"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Users, FolderTree, ArrowRight, Building2,
  Pencil, X, UploadCloud, Loader2, Crown, Zap, Check,
} from "lucide-react";
import { CreateOrgModal } from "@/components/organizations/CreateOrgModal";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Database, OrgPlan } from "@/lib/supabase/types";

type Org = Database["public"]["Tables"]["organizations"]["Row"] & {
  projectCount: number;
  memberCount: number;
};

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLANS: { id: OrgPlan; name: string; limitText: string; icon: React.ElementType; color: string }[] = [
  { id: "starter",    name: "Starter",    limitText: "1 Proyecto",            icon: Building2, color: "bg-muted"    },
  { id: "pro",        name: "Pro",        limitText: "Hasta 5 Proyectos",     icon: Zap,       color: "bg-accent"   },
  { id: "enterprise", name: "Enterprise", limitText: "Proyectos Ilimitados",  icon: Crown,     color: "bg-primary"  },
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

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditOrgModal({
  org,
  onClose,
  onSaved,
}: {
  org: Org;
  onClose: () => void;
  onSaved: (updated: Org) => void;
}) {
  const [name, setName]           = useState(org.name);
  const [plan, setPlan]           = useState<OrgPlan>(org.plan as OrgPlan);
  const [logoFile, setLogoFile]   = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(org.logo_url ?? null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      let logoUrl = org.logo_url;

      if (logoFile) {
        const ext  = logoFile.name.split(".").pop();
        const path = `${slugify(name)}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("org-logos")
          .upload(path, logoFile, { upsert: true });
        if (upErr) throw new Error(`Logo: ${upErr.message}`);
        logoUrl = supabase.storage.from("org-logos").getPublicUrl(path).data.publicUrl;
      }

      const { error: updErr } = await (supabase as any)
        .from("organizations")
        .update({ name, plan, logo_url: logoUrl })
        .eq("id", org.id);

      if (updErr) throw new Error(updErr.message);

      onSaved({ ...org, name, plan, logo_url: logoUrl });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-bold text-primary">Editar Empresa</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">
          {/* Logo */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-3">Logo de la Empresa</label>
            <div className="flex items-center gap-5">
              {/* input oculto con id */}
              <input
                id="edit-logo-input"
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              {/* label actúa como botón, siempre clickeable */}
              <label
                htmlFor="edit-logo-input"
                className="relative w-28 h-28 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden group cursor-pointer shrink-0 hover:border-primary transition-colors"
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="preview" className="w-full h-full object-contain p-2 pointer-events-none" />
                ) : (
                  <div className="text-center pointer-events-none">
                    <UploadCloud className="w-7 h-7 text-muted-foreground mx-auto mb-1" />
                    <span className="text-[10px] text-muted-foreground font-medium">Subir imagen</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition pointer-events-none">
                  <div className="text-center">
                    <UploadCloud className="w-5 h-5 text-white mx-auto mb-1" />
                    <span className="text-white text-[10px] font-bold">Cambiar logo</span>
                  </div>
                </div>
              </label>
              <div className="text-sm text-muted-foreground leading-relaxed">
                Haz clic en la imagen para seleccionar un nuevo logo.<br />
                <span className="text-xs">Formatos: JPG, PNG, WebP. Recomendado cuadrado.</span>
              </div>
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Nombre de la Empresa</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition text-sm"
            />
          </div>

          {/* Plan */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-3">Plan</label>
            <div className="grid grid-cols-3 gap-3">
              {PLANS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlan(p.id)}
                  className={cn(
                    "flex flex-col items-center p-3 rounded-xl border-2 transition-all text-center",
                    plan === p.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-muted-foreground bg-white"
                  )}
                >
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center mb-2 text-white", p.color)}>
                    <p.icon className="w-4 h-4" />
                  </div>
                  <span className={cn("text-xs font-bold", plan === p.id ? "text-primary" : "text-foreground")}>
                    {p.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">{p.limitText}</span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg text-foreground font-medium hover:bg-muted transition text-sm disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition shadow-sm flex items-center gap-2 text-sm disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {loading ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

export function OrgsGrid({ orgs }: { orgs: Org[]; userEmail?: string }) {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingOrg, setEditingOrg]   = useState<Org | null>(null);
  const [orgList, setOrgList]         = useState(orgs);

  const handleOrgCreated = (newOrg: Org) => {
    setOrgList(prev => [newOrg, ...prev]);
  };

  const handleOrgSaved = (updated: Org) => {
    setOrgList(prev => prev.map(o => (o.id === updated.id ? { ...o, ...updated } : o)));
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground tracking-tight">Tus Empresas</h2>
          <p className="text-muted-foreground mt-1">Gestiona los espacios de trabajo AWP.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-primary text-white px-5 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition shadow-sm flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Añadir Empresa
        </button>
      </div>

      {orgList.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-2xl bg-muted/20">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Sin empresas aún</h3>
          <p className="text-muted-foreground text-sm mb-6">
            Crea tu primera empresa para comenzar a gestionar proyectos AWP.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="bg-primary text-white px-5 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition shadow-sm inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Crear Primera Empresa
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orgList.map(org => (
            <div
              key={org.id}
              className="bg-white border border-border rounded-2xl shadow-sm hover:shadow-md hover:border-primary/30 transition group flex flex-col h-full overflow-hidden"
            >
              {/* Banner logo a todo ancho */}
              <div className="relative w-full h-36 bg-muted/20 flex items-center justify-center overflow-hidden border-b border-border">
                {org.logo_url ? (
                  <img src={org.logo_url} alt={org.name} className="w-full h-full object-contain p-4" />
                ) : (
                  <Building2 className="w-12 h-12 text-muted-foreground/40" />
                )}

                {/* Botón editar — aparece al hover */}
                <button
                  onClick={() => setEditingOrg(org)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 border border-border shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-primary hover:text-white hover:border-primary"
                  title="Editar empresa"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-6 flex flex-col flex-1">
                {/* Nombre + Plan */}
                <div className="mb-6 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/${org.slug}/dashboard`} className="hover:underline decoration-primary/50">
                      <h3 className="font-bold text-lg text-foreground truncate">{org.name}</h3>
                    </Link>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-accent/10 text-accent uppercase tracking-wider">
                      Plan {PLAN_LABELS[org.plan] ?? org.plan}
                    </span>
                  </div>
                  <button
                    onClick={() => setEditingOrg(org)}
                    className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-primary transition"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6 mt-auto">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <FolderTree className="w-4 h-4" />
                      <span className="text-xs font-semibold uppercase">Proyectos</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">{org.projectCount}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Users className="w-4 h-4" />
                      <span className="text-xs font-semibold uppercase">Usuarios</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">{org.memberCount}</p>
                  </div>
                </div>

                <Link
                  href={`/${org.slug}/dashboard`}
                  className="w-full py-3 bg-secondary/5 hover:bg-secondary/10 text-secondary font-semibold rounded-xl flex items-center justify-center gap-2 transition"
                >
                  Entrar al Panel
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateOrgModal
        isOpen={isCreateOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleOrgCreated}
      />

      <AnimatePresence>
        {editingOrg && (
          <EditOrgModal
            org={editingOrg}
            onClose={() => setEditingOrg(null)}
            onSaved={handleOrgSaved}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
