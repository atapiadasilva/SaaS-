"use client";

import { use, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, UserPlus, ShieldAlert, Check } from "lucide-react";

type ProjectMember = {
  id: string;
  user_id: string;
  role: "admin" | "editor" | "viewer";
  module_access: Record<string, string>;
  // Omitimos details reales de user_id por seguridad RLS
};

export default function ProjectMembersPage({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { project_id } = use(params);
  
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUserId, setNewUserId] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const loadMembers = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("project_members")
      .select("*")
      .eq("project_id", project_id);
    
    if (data) setMembers(data as ProjectMember[]);
    setLoading(false);
  };

  useEffect(() => {
    loadMembers();
  }, [project_id]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId) return;
    setAdding(true);
    setError("");

    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("project_members")
      .insert({
        project_id,
        user_id: newUserId,
        role: "viewer",
        module_access: { all: "view" }
      });

    if (insertError) {
      setError(insertError.message);
    } else {
      setNewUserId("");
      await loadMembers();
    }
    setAdding(false);
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("project_members")
      .update({ role: newRole })
      .eq("id", memberId);
    
    if (!error) loadMembers();
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-primary">Equipo del Proyecto</h2>
        <p className="text-muted-foreground mt-2">Gestiona el acceso y los niveles de permiso para cada integrante.</p>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
        <form onSubmit={handleAddMember} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-foreground mb-2">
              Añadir Integrante (User ID UUID)
            </label>
            <input
              type="text"
              placeholder="Ingresa el UUID del usuario..."
              className="w-full px-4 py-2.5 rounded-lg border border-border focus:border-primary outline-none transition"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="px-6 py-2.5 rounded-lg bg-primary text-white font-semibold flex items-center gap-2 hover:bg-primary/90 transition disabled:opacity-50"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Agregar
          </button>
        </form>
        {error && <p className="text-destructive text-sm mt-3">{error}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/30 border-b border-border">
            <tr>
              <th className="px-6 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">ID de Usuario</th>
              <th className="px-6 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Rol en Proyecto</th>
              <th className="px-6 py-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Acceso Básico</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map(member => (
              <tr key={member.id} className="hover:bg-muted/10 transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-foreground truncate max-w-[200px]" title={member.user_id}>
                  {member.user_id}
                </td>
                <td className="px-6 py-4">
                  <select 
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    className="bg-muted/30 border border-border text-foreground text-sm rounded-lg focus:ring-primary focus:border-primary block w-auto p-2"
                  >
                    <option value="admin">Administrador</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Visualizador</option>
                  </select>
                </td>
                <td className="px-6 py-4">
                  {member.role === 'admin' ? (
                    <span className="flex items-center gap-1.5 text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full w-fit">
                      <ShieldAlert className="w-4 h-4" /> Todo Permitido
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-muted-foreground font-semibold bg-muted/30 px-2.5 py-1 rounded-full w-fit">
                      <Check className="w-4 h-4" /> Según rol global
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                  No se encontraron miembros para este proyecto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
