export type DataType = 'text' | 'number' | 'date' | 'boolean';

export interface Node {
  id: string;
  project_id: string;
  name: string;
  source_type: string;
  type: string;
  data_headers: string[];
  data: any[];
  position_x: number;
  position_y: number;
  created_at: string;
}

export interface Edge {
  id: string;
  project_id: string;
  source_node_id: string;
  target_node_id: string;
  source_column: string;
  target_column: string;
  relationship_type: '1:1' | '1:N' | 'N:1';
  label: string;
  created_at?: string;
}

// ── Legacy Compatibility ──────────────────────────────────────────────────
export type Entity = Node;
export type Relationship = Edge;

export interface EntityWithAttributes extends Node {
  attributes: any[]; // Mantener por compatibilidad con código antiguo
}

export interface RelationshipWithAttrs extends Edge {
  parent_attr?: { entity_id: string; name: string };
  child_attr?: { entity_id: string; name: string };
}

/** custom_views row as stored in Supabase */
export interface CustomView {
  id: string;
  name: string;
  entity_id: string;
  columns: string[];
  filter_key: string | null;
  project_id: string | null;
  table_name: string | null;
  is_global: boolean;
  entity_name: string | null;
  created_at: string;
  definition?: any;
}
