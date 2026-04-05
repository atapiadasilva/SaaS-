# Migración de la Matriz Relacional (Datos AWP) a ReactFlow SaaS

Este documento describe la arquitectura para migrar la matriz de datos y sus conexiones hacia la nueva aplicación SaaS usando `ReactFlow`.

## 1. Conceptos Clave

En "Datos AWP", la lógica se basaba en identificar elementos como Componentes de Proyecto CWP y relacionarlos mediante identificadores únicos. Para la nueva versión SaaS, hemos separado todo en:
- **Nodos (`nodes`)**: Cada archivo Excel (o fila procesada) representa un nodo.
- **Aristas (`edges`)**: Relaciones lógicas (CWA -> CWP -> Actividad Prisma).

## 2. Integración de ReactFlow

### A. Estructura de Nodos Personalizados
Crearemos Custom Nodes en ReactFlow para reflejar la terminología AWP:
```tsx
const nodeTypes = {
  cwa: CWANodeComponent,
  cwp: CWPNodeComponent,
  excelData: ExcelDataNodeComponent,
};
```

### B. Mapeo a la Base de Datos (Supabase)
Cada que un usuario arrastre un paquete de trabajo a la hoja de ReactFlow o cree una vinculación (Edge), guardaremos las coordenadas `position_x`, `position_y` y la relación `source_node_id -> target_node_id` directamente a Supabase asegurando aislar los datos a través del `project_id` de la organización.

## 3. Próximos pasos
1. Instalar la dependencia `@xyflow/react` (previamente `reactflow`).
2. Crear un componente interactivo `<RelationalMatrixCanvas />`.
3. Desplegar los hooks de tracción sincronizada de Supabase para actualización en tiempo real en la vista de Matriz Relacional.
