"use client";

import { useState } from "react";
import { OFFICIAL_PROJECTS_SEED as OFFICIAL_PROJECTS } from "@/lib/project-constants";
import { renameProject, deleteProject } from "./actions";

export default function SyncForm({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleRename = async (projectId: string, newName: string) => {
    if (!newName) return;
    setLoading(projectId);
    try {
      await renameProject(projectId, newName);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (!confirm("¿Seguro que quieres eliminar este proyecto?")) return;
    setLoading(projectId);
    try {
      await deleteProject(projectId);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b">
            <th className="pb-3 font-semibold">Nombre Actual en BD</th>
            <th className="pb-3 font-semibold">Asignar a Oficial</th>
            <th className="pb-3 font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-b last:border-0">
              <td className="py-4 text-sm font-medium">{p.name}</td>
              <td className="py-4">
                <select
                  className="border rounded px-3 py-2 text-sm bg-gray-50"
                  onChange={(e) => handleRename(p.id, e.target.value)}
                  disabled={loading === p.id}
                  defaultValue={
                    OFFICIAL_PROJECTS.find((op) => op.name === p.name)?.name || ""
                  }
                >
                  <option value="" disabled>
                    Selecciona un proyecto oficial...
                  </option>
                  {OFFICIAL_PROJECTS.map((op) => (
                    <option key={op.external_code} value={op.name}>
                      {op.name} ({op.external_code})
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-4">
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={loading === p.id}
                  className="text-red-500 hover:text-red-700 text-sm font-semibold"
                >
                  {loading === p.id ? "Cargando..." : "Eliminar"}
                </button>
              </td>
            </tr>
          ))}
          {projects.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-center text-muted-foreground">
                No tienes proyectos creados en esta organización.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
