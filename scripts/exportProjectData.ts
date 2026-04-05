// Script para exportar datos del proyecto actual AWP y formatearlos
// para la carga directa en la nueva base de datos SaaS (Supabase)

import fs from "fs";
import path from "path";

interface AWPNode {
  id: string;
  type: string;
  data: Record<string, any>;
}

interface AWPEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export function generateExportPayload(projectId: string, nodes: AWPNode[], edges: AWPEdge[]) {
  console.log(`[Export] Procesando datos del proyecto AWP: ${projectId}...`);

  const payload = {
    nodes: nodes.map((n) => ({
      id: n.id,
      project_id: projectId,
      type: n.type,
      data: n.data,
      position_x: Math.random() * 500, // Coordenadas temporales
      position_y: Math.random() * 500,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      project_id: projectId,
      source_node_id: e.source,
      target_node_id: e.target,
      label: e.label || "Relación AWP",
    })),
  };

  const outputPath = path.resolve(__dirname, `../export_${projectId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

  console.log(`[Export] Éxito. Datos exportados en: ${outputPath}`);
  return payload;
}

// Ejemplo de uso:
// generateExportPayload("123e4567-e89b-12d3-a456-426614174000", [{id: "nodo-1", type: "cwp", data: {nombre: "CWP-01"}}], []);
