export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_bim_links: {
        Row: {
          activity_id: string
          bim_guid: string
          created_at: string
          created_by: string | null
          element_name: string | null
          element_type: string | null
          id: string
          project_id: string
        }
        Insert: {
          activity_id: string
          bim_guid: string
          created_at?: string
          created_by?: string | null
          element_name?: string | null
          element_type?: string | null
          id?: string
          project_id: string
        }
        Update: {
          activity_id?: string
          bim_guid?: string
          created_at?: string
          created_by?: string | null
          element_name?: string | null
          element_type?: string | null
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_bim_links_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "program_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_bim_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_requirements: {
        Row: {
          activity_id: string
          closed_date: string | null
          comments: string | null
          created_at: string
          description: string
          due_date: string | null
          id: string
          priority: string
          project_id: string
          responsible: string | null
          status: string
          type: string
        }
        Insert: {
          activity_id: string
          closed_date?: string | null
          comments?: string | null
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          priority?: string
          project_id: string
          responsible?: string | null
          status?: string
          type?: string
        }
        Update: {
          activity_id?: string
          closed_date?: string | null
          comments?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          priority?: string
          project_id?: string
          responsible?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_requirements_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "program_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_tools_dinamicas: {
        Row: {
          codigo_javascript: string
          created_at: string
          descripcion: string
          esquema_json: Json
          id: string
          nombre_funcion: string
          project_id: string
          requiere_admin: boolean
        }
        Insert: {
          codigo_javascript: string
          created_at?: string
          descripcion: string
          esquema_json?: Json
          id?: string
          nombre_funcion: string
          project_id: string
          requiere_admin?: boolean
        }
        Update: {
          codigo_javascript?: string
          created_at?: string
          descripcion?: string
          esquema_json?: Json
          id?: string
          nombre_funcion?: string
          project_id?: string
          requiere_admin?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bot_tools_dinamicas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      constraint_history: {
        Row: {
          change_date: string
          changed_by: string | null
          comments: string | null
          constraint_id: string
          created_at: string
          history_label: string | null
          id: string
          new_status: Database["public"]["Enums"]["constraint_status"]
          previous_status:
            | Database["public"]["Enums"]["constraint_status"]
            | null
          version_number: number | null
        }
        Insert: {
          change_date?: string
          changed_by?: string | null
          comments?: string | null
          constraint_id: string
          created_at?: string
          history_label?: string | null
          id?: string
          new_status: Database["public"]["Enums"]["constraint_status"]
          previous_status?:
            | Database["public"]["Enums"]["constraint_status"]
            | null
          version_number?: number | null
        }
        Update: {
          change_date?: string
          changed_by?: string | null
          comments?: string | null
          constraint_id?: string
          created_at?: string
          history_label?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["constraint_status"]
          previous_status?:
            | Database["public"]["Enums"]["constraint_status"]
            | null
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "constraint_history_constraint_id_fkey"
            columns: ["constraint_id"]
            isOneToOne: false
            referencedRelation: "tidp_constraints"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_views: {
        Row: {
          columns: Json | null
          created_at: string
          definition: Json | null
          entity_id: string | null
          filter_key: string | null
          id: string
          name: string
          project_id: string | null
        }
        Insert: {
          columns?: Json | null
          created_at?: string
          definition?: Json | null
          entity_id?: string | null
          filter_key?: string | null
          id?: string
          name: string
          project_id?: string | null
        }
        Update: {
          columns?: Json | null
          created_at?: string
          definition?: Json | null
          entity_id?: string | null
          filter_key?: string | null
          id?: string
          name?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_views_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_views_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cwp_master: {
        Row: {
          area: string | null
          created_at: string
          cwp_code: string
          cwp_description: string | null
          discipline: string | null
          ewp_code: string | null
          id: string
          is_active: boolean | null
          project_id: string
          pwp_code: string | null
          sort_order: number | null
          tags: string | null
        }
        Insert: {
          area?: string | null
          created_at?: string
          cwp_code: string
          cwp_description?: string | null
          discipline?: string | null
          ewp_code?: string | null
          id?: string
          is_active?: boolean | null
          project_id: string
          pwp_code?: string | null
          sort_order?: number | null
          tags?: string | null
        }
        Update: {
          area?: string | null
          created_at?: string
          cwp_code?: string
          cwp_description?: string | null
          discipline?: string | null
          ewp_code?: string | null
          id?: string
          is_active?: boolean | null
          project_id?: string
          pwp_code?: string | null
          sort_order?: number | null
          tags?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cwp_master_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverable_versions: {
        Row: {
          author: string | null
          cde_file_reference: string | null
          cde_status: Database["public"]["Enums"]["cde_status"]
          comments: string | null
          created_at: string
          date: string
          deliverable_id: string
          id: string
          version_label: string
          version_number: number
        }
        Insert: {
          author?: string | null
          cde_file_reference?: string | null
          cde_status: Database["public"]["Enums"]["cde_status"]
          comments?: string | null
          created_at?: string
          date: string
          deliverable_id: string
          id?: string
          version_label: string
          version_number: number
        }
        Update: {
          author?: string | null
          cde_file_reference?: string | null
          cde_status?: Database["public"]["Enums"]["cde_status"]
          comments?: string | null
          created_at?: string
          date?: string
          deliverable_id?: string
          id?: string
          version_label?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_versions_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          actual_date: string | null
          bim_guid: string | null
          cde_file_reference: string | null
          cde_status: Database["public"]["Enums"]["cde_status"]
          created_at: string
          id: string
          iso_code: string
          loin_alphanumeric: string | null
          loin_geometric: string | null
          milestone_id: string | null
          name: string
          planned_date: string | null
          project_id: string
          responsible: string | null
          tidp_id: string
          type: Database["public"]["Enums"]["deliverable_type"]
        }
        Insert: {
          actual_date?: string | null
          bim_guid?: string | null
          cde_file_reference?: string | null
          cde_status?: Database["public"]["Enums"]["cde_status"]
          created_at?: string
          id?: string
          iso_code: string
          loin_alphanumeric?: string | null
          loin_geometric?: string | null
          milestone_id?: string | null
          name: string
          planned_date?: string | null
          project_id: string
          responsible?: string | null
          tidp_id: string
          type?: Database["public"]["Enums"]["deliverable_type"]
        }
        Update: {
          actual_date?: string | null
          bim_guid?: string | null
          cde_file_reference?: string | null
          cde_status?: Database["public"]["Enums"]["cde_status"]
          created_at?: string
          id?: string
          iso_code?: string
          loin_alphanumeric?: string | null
          loin_geometric?: string | null
          milestone_id?: string | null
          name?: string
          planned_date?: string | null
          project_id?: string
          responsible?: string | null
          tidp_id?: string
          type?: Database["public"]["Enums"]["deliverable_type"]
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_tidp_id_fkey"
            columns: ["tidp_id"]
            isOneToOne: false
            referencedRelation: "tidps"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          id: string
          leader_role: string | null
          name: string
          organization_id: string
          scope: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          leader_role?: string | null
          name: string
          organization_id: string
          scope?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          leader_role?: string | null
          name?: string
          organization_id?: string
          scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      edges: {
        Row: {
          created_at: string
          id: string
          label: string | null
          project_id: string
          relationship_type: string | null
          source_column: string | null
          source_node_id: string
          target_column: string | null
          target_node_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          project_id: string
          relationship_type?: string | null
          source_column?: string | null
          source_node_id: string
          target_column?: string | null
          target_node_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          project_id?: string
          relationship_type?: string | null
          source_column?: string | null
          source_node_id?: string
          target_column?: string | null
          target_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          project_id: string
          target_date: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          id?: string
          project_id: string
          target_date: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          project_id?: string
          target_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_avance_pasos: {
        Row: {
          actualizado_por: string | null
          id: string
          item: string
          pct: number
          ponderacion_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          actualizado_por?: string | null
          id?: string
          item: string
          pct?: number
          ponderacion_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          actualizado_por?: string | null
          id?: string
          item?: string
          pct?: number
          ponderacion_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_avance_pasos_ponderacion_id_fkey"
            columns: ["ponderacion_id"]
            isOneToOne: false
            referencedRelation: "mining_ponderaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mining_avance_pasos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_awp_equipo: {
        Row: {
          area: string | null
          cwa_codigo: string | null
          cwp_codigo: string | null
          descripcion: string | null
          disciplina_codigo: string | null
          espec_tecnica: string | null
          n_lineas_mismo_pid: number | null
          n_monikers: number | null
          pid_codigo: string | null
          pid_valido: boolean | null
          project_id: string
          sistema: string | null
          subsistema_codigo: string | null
          tag: string
          tag_base: string | null
          tipo_cod: string | null
          tipo_desc_ref: string | null
        }
        Insert: {
          area?: string | null
          cwa_codigo?: string | null
          cwp_codigo?: string | null
          descripcion?: string | null
          disciplina_codigo?: string | null
          espec_tecnica?: string | null
          n_lineas_mismo_pid?: number | null
          n_monikers?: number | null
          pid_codigo?: string | null
          pid_valido?: boolean | null
          project_id: string
          sistema?: string | null
          subsistema_codigo?: string | null
          tag: string
          tag_base?: string | null
          tipo_cod?: string | null
          tipo_desc_ref?: string | null
        }
        Update: {
          area?: string | null
          cwa_codigo?: string | null
          cwp_codigo?: string | null
          descripcion?: string | null
          disciplina_codigo?: string | null
          espec_tecnica?: string | null
          n_lineas_mismo_pid?: number | null
          n_monikers?: number | null
          pid_codigo?: string | null
          pid_valido?: boolean | null
          project_id?: string
          sistema?: string | null
          subsistema_codigo?: string | null
          tag?: string
          tag_base?: string | null
          tipo_cod?: string | null
          tipo_desc_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_awp_equipo_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_awp_linea: {
        Row: {
          area: string | null
          codigo: string
          cwa_codigo: string | null
          cwp_codigo: string | null
          longitud_m: number | null
          n_canalizaciones: number | null
          n_elementos: number | null
          n_eq_electricos: number | null
          n_eq_mecanicos: number | null
          n_instrumentos: number | null
          n_isometricos: number | null
          n_spools: number | null
          nps: string | null
          peso_kg: number | null
          pid_codigo: string | null
          pid_valido: boolean | null
          project_id: string
          servicio: string | null
          sistema: string | null
          subsistema_principal: string | null
          subsistemas_asociados: string | null
        }
        Insert: {
          area?: string | null
          codigo: string
          cwa_codigo?: string | null
          cwp_codigo?: string | null
          longitud_m?: number | null
          n_canalizaciones?: number | null
          n_elementos?: number | null
          n_eq_electricos?: number | null
          n_eq_mecanicos?: number | null
          n_instrumentos?: number | null
          n_isometricos?: number | null
          n_spools?: number | null
          nps?: string | null
          peso_kg?: number | null
          pid_codigo?: string | null
          pid_valido?: boolean | null
          project_id: string
          servicio?: string | null
          sistema?: string | null
          subsistema_principal?: string | null
          subsistemas_asociados?: string | null
        }
        Update: {
          area?: string | null
          codigo?: string
          cwa_codigo?: string | null
          cwp_codigo?: string | null
          longitud_m?: number | null
          n_canalizaciones?: number | null
          n_elementos?: number | null
          n_eq_electricos?: number | null
          n_eq_mecanicos?: number | null
          n_instrumentos?: number | null
          n_isometricos?: number | null
          n_spools?: number | null
          nps?: string | null
          peso_kg?: number | null
          pid_codigo?: string | null
          pid_valido?: boolean | null
          project_id?: string
          servicio?: string | null
          sistema?: string | null
          subsistema_principal?: string | null
          subsistemas_asociados?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_awp_linea_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_awp_linea_equipo: {
        Row: {
          descripcion: string | null
          disciplina: string | null
          id: number
          linea_codigo: string | null
          pid_codigo: string | null
          project_id: string
          subsistema_equipo: string | null
          subsistema_linea: string | null
          tag_equipo: string | null
          tipo: string | null
          vinculo: string | null
        }
        Insert: {
          descripcion?: string | null
          disciplina?: string | null
          id?: number
          linea_codigo?: string | null
          pid_codigo?: string | null
          project_id: string
          subsistema_equipo?: string | null
          subsistema_linea?: string | null
          tag_equipo?: string | null
          tipo?: string | null
          vinculo?: string | null
        }
        Update: {
          descripcion?: string | null
          disciplina?: string | null
          id?: number
          linea_codigo?: string | null
          pid_codigo?: string | null
          project_id?: string
          subsistema_equipo?: string | null
          subsistema_linea?: string | null
          tag_equipo?: string | null
          tipo?: string | null
          vinculo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_awp_linea_equipo_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_awp_pid: {
        Row: {
          area: string | null
          codigo: string
          project_id: string
          valido: boolean
        }
        Insert: {
          area?: string | null
          codigo: string
          project_id: string
          valido?: boolean
        }
        Update: {
          area?: string | null
          codigo?: string
          project_id?: string
          valido?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "mining_awp_pid_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_awp_piping_elemento: {
        Row: {
          clase: string | null
          cwa_codigo: string | null
          cwp_codigo: string | null
          isometrico: string | null
          linea_codigo: string | null
          longitud_m: number | null
          moniker: string
          nps: string | null
          peso_kg: number | null
          pid_codigo: string | null
          project_id: string
          spool: string | null
        }
        Insert: {
          clase?: string | null
          cwa_codigo?: string | null
          cwp_codigo?: string | null
          isometrico?: string | null
          linea_codigo?: string | null
          longitud_m?: number | null
          moniker: string
          nps?: string | null
          peso_kg?: number | null
          pid_codigo?: string | null
          project_id: string
          spool?: string | null
        }
        Update: {
          clase?: string | null
          cwa_codigo?: string | null
          cwp_codigo?: string | null
          isometrico?: string | null
          linea_codigo?: string | null
          longitud_m?: number | null
          moniker?: string
          nps?: string | null
          peso_kg?: number | null
          pid_codigo?: string | null
          project_id?: string
          spool?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_awp_piping_elemento_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_bmp_partidas: {
        Row: {
          alcance: string | null
          antecedentes: string | null
          base_medicion_pago: string | null
          codigo_partida: string
          disciplina: string | null
          disciplina_cod: string | null
          exclusiones: string | null
          n_hitos: number | null
          nombre_partida: string | null
          observaciones: string | null
          project_id: string
          seccion: string | null
          suma_pct: number | null
          suministros: string | null
          tipo_partida: string | null
          unidad: string | null
        }
        Insert: {
          alcance?: string | null
          antecedentes?: string | null
          base_medicion_pago?: string | null
          codigo_partida: string
          disciplina?: string | null
          disciplina_cod?: string | null
          exclusiones?: string | null
          n_hitos?: number | null
          nombre_partida?: string | null
          observaciones?: string | null
          project_id: string
          seccion?: string | null
          suma_pct?: number | null
          suministros?: string | null
          tipo_partida?: string | null
          unidad?: string | null
        }
        Update: {
          alcance?: string | null
          antecedentes?: string | null
          base_medicion_pago?: string | null
          codigo_partida?: string
          disciplina?: string | null
          disciplina_cod?: string | null
          exclusiones?: string | null
          n_hitos?: number | null
          nombre_partida?: string | null
          observaciones?: string | null
          project_id?: string
          seccion?: string | null
          suma_pct?: number | null
          suministros?: string | null
          tipo_partida?: string | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_bmp_partidas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_bot_invites: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          nombre: string | null
          project_id: string
          rol: string
          token: string
          usado_por_telefono: string | null
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          nombre?: string | null
          project_id: string
          rol?: string
          token: string
          usado_por_telefono?: string | null
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          nombre?: string | null
          project_id?: string
          rol?: string
          token?: string
          usado_por_telefono?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_bot_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_bot_mensajes: {
        Row: {
          contenido: string
          created_at: string
          id: string
          project_id: string
          rol: string
          telefono: string
          tipo_mensaje: string
        }
        Insert: {
          contenido: string
          created_at?: string
          id?: string
          project_id: string
          rol: string
          telefono: string
          tipo_mensaje?: string
        }
        Update: {
          contenido?: string
          created_at?: string
          id?: string
          project_id?: string
          rol?: string
          telefono?: string
          tipo_mensaje?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_bot_mensajes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_bot_usuarios: {
        Row: {
          created_at: string
          id: string
          nombre: string | null
          project_id: string
          rol: string
          telefono: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre?: string | null
          project_id: string
          rol?: string
          telefono: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string | null
          project_id?: string
          rol?: string
          telefono?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_bot_usuarios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_cambios_log: {
        Row: {
          campo: string
          creado_en: string
          id: number
          origen: string
          project_id: string
          sp3d_moniker: string
          usuario_id: string | null
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          campo: string
          creado_en?: string
          id?: number
          origen?: string
          project_id: string
          sp3d_moniker: string
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          campo?: string
          creado_en?: string
          id?: number
          origen?: string
          project_id?: string
          sp3d_moniker?: string
          usuario_id?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_cambios_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_colores_codigo: {
        Row: {
          codigo: string
          color: string
          nivel: string
          project_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          codigo: string
          color: string
          nivel: string
          project_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          codigo?: string
          color?: string
          nivel?: string
          project_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_colores_codigo_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_condiciones: {
        Row: {
          concepto: string | null
          fuente: string | null
          id: string
          project_id: string
          regla: string | null
        }
        Insert: {
          concepto?: string | null
          fuente?: string | null
          id?: string
          project_id: string
          regla?: string | null
        }
        Update: {
          concepto?: string | null
          fuente?: string | null
          id?: string
          project_id?: string
          regla?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_condiciones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_consideraciones: {
        Row: {
          created_at: string
          cwp_id: string | null
          depto: string
          detalle: string | null
          estado: string
          fecha_limite: string | null
          fecha_reporte: string
          fuente: string
          id: string
          iwp_id: string | null
          metadata: Json | null
          n_cmdic: string | null
          project_id: string
          responsable: string | null
          severidad: string
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          cwp_id?: string | null
          depto: string
          detalle?: string | null
          estado?: string
          fecha_limite?: string | null
          fecha_reporte?: string
          fuente?: string
          id?: string
          iwp_id?: string | null
          metadata?: Json | null
          n_cmdic?: string | null
          project_id: string
          responsable?: string | null
          severidad?: string
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          cwp_id?: string | null
          depto?: string
          detalle?: string | null
          estado?: string
          fecha_limite?: string | null
          fecha_reporte?: string
          fuente?: string
          id?: string
          iwp_id?: string | null
          metadata?: Json | null
          n_cmdic?: string | null
          project_id?: string
          responsable?: string | null
          severidad?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_consideraciones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_cv: {
        Row: {
          area: string | null
          cv_id: string
          cv_nombre: string | null
          cwa_id: string | null
          es_oficial: boolean
          fecha_fin: string | null
          fecha_inicio: string | null
          hh_total: number | null
          n_cwp: number | null
          project_id: string
        }
        Insert: {
          area?: string | null
          cv_id: string
          cv_nombre?: string | null
          cwa_id?: string | null
          es_oficial?: boolean
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hh_total?: number | null
          n_cwp?: number | null
          project_id: string
        }
        Update: {
          area?: string | null
          cv_id?: string
          cv_nombre?: string | null
          cwa_id?: string | null
          es_oficial?: boolean
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hh_total?: number | null
          n_cwp?: number | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_cv_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_cwa: {
        Row: {
          area: string | null
          contrato: string | null
          cwa_id: string
          cwa_nombre: string | null
          duracion_dias: number | null
          es_oficial: boolean
          fecha_fin: string | null
          fecha_inicio: string | null
          hh_total: number | null
          n_cv: number | null
          n_cwp: number | null
          project_id: string
        }
        Insert: {
          area?: string | null
          contrato?: string | null
          cwa_id: string
          cwa_nombre?: string | null
          duracion_dias?: number | null
          es_oficial?: boolean
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hh_total?: number | null
          n_cv?: number | null
          n_cwp?: number | null
          project_id: string
        }
        Update: {
          area?: string | null
          contrato?: string | null
          cwa_id?: string
          cwa_nombre?: string | null
          duracion_dias?: number | null
          es_oficial?: boolean
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hh_total?: number | null
          n_cv?: number | null
          n_cwp?: number | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_cwa_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_cwp: {
        Row: {
          activity_id_ifc: string | null
          alcance: string | null
          area_contrato: string | null
          costo_oferta_clp: number | null
          cv_id: string | null
          cwa_id: string | null
          cwp_id: string
          cwp_nombre: string | null
          disciplina: string | null
          disciplina_cod: string | null
          disciplina_grupo: string | null
          es_oficial: boolean
          ewp_id: string | null
          fecha_fin: string | null
          fecha_ifc: string | null
          fecha_ini: string | null
          hh_planner: number | null
          hito_contractual: string | null
          pct_hh_cwa: number | null
          pct_hh_proyecto: number | null
          project_id: string
          ruta_critica: boolean | null
          status_cwp: string | null
          suministro: string | null
        }
        Insert: {
          activity_id_ifc?: string | null
          alcance?: string | null
          area_contrato?: string | null
          costo_oferta_clp?: number | null
          cv_id?: string | null
          cwa_id?: string | null
          cwp_id: string
          cwp_nombre?: string | null
          disciplina?: string | null
          disciplina_cod?: string | null
          disciplina_grupo?: string | null
          es_oficial?: boolean
          ewp_id?: string | null
          fecha_fin?: string | null
          fecha_ifc?: string | null
          fecha_ini?: string | null
          hh_planner?: number | null
          hito_contractual?: string | null
          pct_hh_cwa?: number | null
          pct_hh_proyecto?: number | null
          project_id: string
          ruta_critica?: boolean | null
          status_cwp?: string | null
          suministro?: string | null
        }
        Update: {
          activity_id_ifc?: string | null
          alcance?: string | null
          area_contrato?: string | null
          costo_oferta_clp?: number | null
          cv_id?: string | null
          cwa_id?: string | null
          cwp_id?: string
          cwp_nombre?: string | null
          disciplina?: string | null
          disciplina_cod?: string | null
          disciplina_grupo?: string | null
          es_oficial?: boolean
          ewp_id?: string | null
          fecha_fin?: string | null
          fecha_ifc?: string | null
          fecha_ini?: string | null
          hh_planner?: number | null
          hito_contractual?: string | null
          pct_hh_cwa?: number | null
          pct_hh_proyecto?: number | null
          project_id?: string
          ruta_critica?: boolean | null
          status_cwp?: string | null
          suministro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_cwp_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_disciplinas: {
        Row: {
          commodity: string | null
          disciplina_cod: string
          disciplina_nombre: string | null
          grupo_mineria: string | null
          hoja_itemizado: string | null
          project_id: string
          tipo_trabajo: string | null
        }
        Insert: {
          commodity?: string | null
          disciplina_cod: string
          disciplina_nombre?: string | null
          grupo_mineria?: string | null
          hoja_itemizado?: string | null
          project_id: string
          tipo_trabajo?: string | null
        }
        Update: {
          commodity?: string | null
          disciplina_cod?: string
          disciplina_nombre?: string | null
          grupo_mineria?: string | null
          hoja_itemizado?: string | null
          project_id?: string
          tipo_trabajo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_disciplinas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_doc_aconex: {
        Row: {
          archivo: string | null
          categoria: string | null
          cwa_id: string | null
          cwp_id_exacto: string | null
          cwp_sugerido: string | null
          disciplina_doc: string | null
          disciplina_id: string | null
          estado_aconex: string | null
          ext: string | null
          fecha_modificacion: string | null
          funcion: string | null
          id: string
          n_bechtel: string | null
          n_cmdic: string | null
          origen: string | null
          project_id: string
          rev: string | null
          sector: string | null
          tipo_doc: string | null
          titulo: string | null
        }
        Insert: {
          archivo?: string | null
          categoria?: string | null
          cwa_id?: string | null
          cwp_id_exacto?: string | null
          cwp_sugerido?: string | null
          disciplina_doc?: string | null
          disciplina_id?: string | null
          estado_aconex?: string | null
          ext?: string | null
          fecha_modificacion?: string | null
          funcion?: string | null
          id?: string
          n_bechtel?: string | null
          n_cmdic?: string | null
          origen?: string | null
          project_id: string
          rev?: string | null
          sector?: string | null
          tipo_doc?: string | null
          titulo?: string | null
        }
        Update: {
          archivo?: string | null
          categoria?: string | null
          cwa_id?: string | null
          cwp_id_exacto?: string | null
          cwp_sugerido?: string | null
          disciplina_doc?: string | null
          disciplina_id?: string | null
          estado_aconex?: string | null
          ext?: string | null
          fecha_modificacion?: string | null
          funcion?: string | null
          id?: string
          n_bechtel?: string | null
          n_cmdic?: string | null
          origen?: string | null
          project_id?: string
          rev?: string | null
          sector?: string | null
          tipo_doc?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_doc_aconex_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_doc_referencia: {
        Row: {
          doc_bechtel: string | null
          doc_cmdic: string | null
          en_aconex: boolean | null
          en_carpeta: boolean | null
          id: string
          project_id: string
          titulo: string | null
        }
        Insert: {
          doc_bechtel?: string | null
          doc_cmdic?: string | null
          en_aconex?: boolean | null
          en_carpeta?: boolean | null
          id?: string
          project_id: string
          titulo?: string | null
        }
        Update: {
          doc_bechtel?: string | null
          doc_cmdic?: string | null
          en_aconex?: boolean | null
          en_carpeta?: boolean | null
          id?: string
          project_id?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_doc_referencia_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_dotacion: {
        Row: {
          actividades: Json | null
          documentos: Json | null
          equipos: Json | null
          fecha: string
          id: string
          mod_hd: number | null
          mod_hh_acum: number | null
          mod_hh_dia: number | null
          moi_hd: number | null
          moi_hh_acum: number | null
          moi_hh_dia: number | null
          n_cmdic: string | null
          observaciones: string | null
          project_id: string
        }
        Insert: {
          actividades?: Json | null
          documentos?: Json | null
          equipos?: Json | null
          fecha: string
          id?: string
          mod_hd?: number | null
          mod_hh_acum?: number | null
          mod_hh_dia?: number | null
          moi_hd?: number | null
          moi_hh_acum?: number | null
          moi_hh_dia?: number | null
          n_cmdic?: string | null
          observaciones?: string | null
          project_id: string
        }
        Update: {
          actividades?: Json | null
          documentos?: Json | null
          equipos?: Json | null
          fecha?: string
          id?: string
          mod_hd?: number | null
          mod_hh_acum?: number | null
          mod_hh_dia?: number | null
          moi_hd?: number | null
          moi_hh_acum?: number | null
          moi_hh_dia?: number | null
          n_cmdic?: string | null
          observaciones?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_dotacion_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_elemento_codigo: {
        Row: {
          codigo: string
          project_id: string
          sp3d_moniker: string
        }
        Insert: {
          codigo: string
          project_id: string
          sp3d_moniker: string
        }
        Update: {
          codigo?: string
          project_id?: string
          sp3d_moniker?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_elemento_codigo_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mining_elemento_codigo_project_id_sp3d_moniker_fkey"
            columns: ["project_id", "sp3d_moniker"]
            isOneToOne: false
            referencedRelation: "mining_elementos"
            referencedColumns: ["project_id", "sp3d_moniker"]
          },
        ]
      }
      mining_elementos: {
        Row: {
          alcance: string | null
          area_unidad: string | null
          avance_pct: number | null
          bmp_nombre: string | null
          categoria_constructiva: string | null
          categoria_enlace: string | null
          codigo_bmp: string | null
          comwp_id: string | null
          cv_id: string | null
          cwa_id: string | null
          cwp_arbol: string | null
          cwp_fuente: string | null
          cwp_id: string | null
          descripcion: string | null
          diametro_in: number | null
          disciplina: string | null
          disciplina_arbol: string | null
          disciplina_modelo: string | null
          elevacion: number | null
          especialidad_cod: string | null
          especialidad_nombre: string | null
          especificacion: string | null
          estado: string | null
          este: number | null
          ewp_id: string | null
          guid_modelo: string | null
          isometrico: string | null
          item_o_adicional: string | null
          iwp_id: string | null
          longitud_m: number | null
          material: string | null
          motivo_no_valido: string | null
          name: string | null
          norte: number | null
          obra_raw: string | null
          obra_target: string | null
          obra_tipo: string | null
          peso_kg: number | null
          pid: string | null
          pipeline_linea: string | null
          project_id: string
          pwp_elemento: string | null
          requiere_alta_sp3d: boolean
          sector: string | null
          sistema_servicio: string | null
          sitio: string | null
          sp3d_moniker: string
          spool: string | null
          swp_id: string | null
          tag_equipo: string | null
          tag_unificado: string | null
          tiene_bmp: string | null
          tiene_itemizado: string | null
          tipo_elemento: string | null
          valid_espacial: string | null
          validado: string | null
          vinculo_fuente: string | null
          vinculo_nivel: string | null
          volumen_m3: number | null
          wbs: string | null
        }
        Insert: {
          alcance?: string | null
          area_unidad?: string | null
          avance_pct?: number | null
          bmp_nombre?: string | null
          categoria_constructiva?: string | null
          categoria_enlace?: string | null
          codigo_bmp?: string | null
          comwp_id?: string | null
          cv_id?: string | null
          cwa_id?: string | null
          cwp_arbol?: string | null
          cwp_fuente?: string | null
          cwp_id?: string | null
          descripcion?: string | null
          diametro_in?: number | null
          disciplina?: string | null
          disciplina_arbol?: string | null
          disciplina_modelo?: string | null
          elevacion?: number | null
          especialidad_cod?: string | null
          especialidad_nombre?: string | null
          especificacion?: string | null
          estado?: string | null
          este?: number | null
          ewp_id?: string | null
          guid_modelo?: string | null
          isometrico?: string | null
          item_o_adicional?: string | null
          iwp_id?: string | null
          longitud_m?: number | null
          material?: string | null
          motivo_no_valido?: string | null
          name?: string | null
          norte?: number | null
          obra_raw?: string | null
          obra_target?: string | null
          obra_tipo?: string | null
          peso_kg?: number | null
          pid?: string | null
          pipeline_linea?: string | null
          project_id: string
          pwp_elemento?: string | null
          requiere_alta_sp3d?: boolean
          sector?: string | null
          sistema_servicio?: string | null
          sitio?: string | null
          sp3d_moniker: string
          spool?: string | null
          swp_id?: string | null
          tag_equipo?: string | null
          tag_unificado?: string | null
          tiene_bmp?: string | null
          tiene_itemizado?: string | null
          tipo_elemento?: string | null
          valid_espacial?: string | null
          validado?: string | null
          vinculo_fuente?: string | null
          vinculo_nivel?: string | null
          volumen_m3?: number | null
          wbs?: string | null
        }
        Update: {
          alcance?: string | null
          area_unidad?: string | null
          avance_pct?: number | null
          bmp_nombre?: string | null
          categoria_constructiva?: string | null
          categoria_enlace?: string | null
          codigo_bmp?: string | null
          comwp_id?: string | null
          cv_id?: string | null
          cwa_id?: string | null
          cwp_arbol?: string | null
          cwp_fuente?: string | null
          cwp_id?: string | null
          descripcion?: string | null
          diametro_in?: number | null
          disciplina?: string | null
          disciplina_arbol?: string | null
          disciplina_modelo?: string | null
          elevacion?: number | null
          especialidad_cod?: string | null
          especialidad_nombre?: string | null
          especificacion?: string | null
          estado?: string | null
          este?: number | null
          ewp_id?: string | null
          guid_modelo?: string | null
          isometrico?: string | null
          item_o_adicional?: string | null
          iwp_id?: string | null
          longitud_m?: number | null
          material?: string | null
          motivo_no_valido?: string | null
          name?: string | null
          norte?: number | null
          obra_raw?: string | null
          obra_target?: string | null
          obra_tipo?: string | null
          peso_kg?: number | null
          pid?: string | null
          pipeline_linea?: string | null
          project_id?: string
          pwp_elemento?: string | null
          requiere_alta_sp3d?: boolean
          sector?: string | null
          sistema_servicio?: string | null
          sitio?: string | null
          sp3d_moniker?: string
          spool?: string | null
          swp_id?: string | null
          tag_equipo?: string | null
          tag_unificado?: string | null
          tiene_bmp?: string | null
          tiene_itemizado?: string | null
          tipo_elemento?: string | null
          valid_espacial?: string | null
          validado?: string | null
          vinculo_fuente?: string | null
          vinculo_nivel?: string | null
          volumen_m3?: number | null
          wbs?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_elementos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_epr: {
        Row: {
          cwa_propuesta: string | null
          cwp_propuesto: string | null
          disciplina_propuesta: string | null
          en_aconex: boolean | null
          id: string
          info_aprob: string | null
          item_eco02b: string | null
          motivo_emision: string | null
          n_cmdic: string | null
          n_esed: string | null
          project_id: string
          titulo: string | null
        }
        Insert: {
          cwa_propuesta?: string | null
          cwp_propuesto?: string | null
          disciplina_propuesta?: string | null
          en_aconex?: boolean | null
          id?: string
          info_aprob?: string | null
          item_eco02b?: string | null
          motivo_emision?: string | null
          n_cmdic?: string | null
          n_esed?: string | null
          project_id: string
          titulo?: string | null
        }
        Update: {
          cwa_propuesta?: string | null
          cwp_propuesto?: string | null
          disciplina_propuesta?: string | null
          en_aconex?: boolean | null
          id?: string
          info_aprob?: string | null
          item_eco02b?: string | null
          motivo_emision?: string | null
          n_cmdic?: string | null
          n_esed?: string | null
          project_id?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_epr_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_equipos: {
        Row: {
          acreditado: boolean | null
          descripcion: string
          dias_registrado: number | null
          horas_mantencion: number | null
          horas_operando: number | null
          horas_standby: number | null
          id: string
          marca: string | null
          metadata: Json | null
          modelo: string | null
          operador: string | null
          patente_codigo: string | null
          primera_vez_visto: string | null
          project_id: string
          ultima_vez_visto: string | null
        }
        Insert: {
          acreditado?: boolean | null
          descripcion: string
          dias_registrado?: number | null
          horas_mantencion?: number | null
          horas_operando?: number | null
          horas_standby?: number | null
          id?: string
          marca?: string | null
          metadata?: Json | null
          modelo?: string | null
          operador?: string | null
          patente_codigo?: string | null
          primera_vez_visto?: string | null
          project_id: string
          ultima_vez_visto?: string | null
        }
        Update: {
          acreditado?: boolean | null
          descripcion?: string
          dias_registrado?: number | null
          horas_mantencion?: number | null
          horas_operando?: number | null
          horas_standby?: number | null
          id?: string
          marca?: string | null
          metadata?: Json | null
          modelo?: string | null
          operador?: string | null
          patente_codigo?: string | null
          primera_vez_visto?: string | null
          project_id?: string
          ultima_vez_visto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_equipos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_estudio_aconex: {
        Row: {
          categoria: string
          created_at: string
          data: Json
          documentos: Json | null
          id: string
          n_cmdic: string | null
          project_id: string
          titulo: string | null
        }
        Insert: {
          categoria: string
          created_at?: string
          data: Json
          documentos?: Json | null
          id?: string
          n_cmdic?: string | null
          project_id: string
          titulo?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string
          data?: Json
          documentos?: Json | null
          id?: string
          n_cmdic?: string | null
          project_id?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_estudio_aconex_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_ewp_ifc: {
        Row: {
          activity_id_ifc: string | null
          cwp_id: string
          documento_ifc: string | null
          fecha_ifc_plan: string | null
          fecha_ifc_real: string | null
          id: string
          liberado: boolean
          observacion: string | null
          project_id: string
        }
        Insert: {
          activity_id_ifc?: string | null
          cwp_id: string
          documento_ifc?: string | null
          fecha_ifc_plan?: string | null
          fecha_ifc_real?: string | null
          id?: string
          liberado?: boolean
          observacion?: string | null
          project_id: string
        }
        Update: {
          activity_id_ifc?: string | null
          cwp_id?: string
          documento_ifc?: string | null
          fecha_ifc_plan?: string | null
          fecha_ifc_real?: string | null
          id?: string
          liberado?: boolean
          observacion?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_ewp_ifc_project_id_cwp_id_fkey"
            columns: ["project_id", "cwp_id"]
            isOneToOne: false
            referencedRelation: "mining_cwp"
            referencedColumns: ["project_id", "cwp_id"]
          },
        ]
      }
      mining_hitos: {
        Row: {
          hito: string | null
          id: string
          multa: string | null
          numero: number | null
          plazo_dias: number | null
          project_id: string
        }
        Insert: {
          hito?: string | null
          id?: string
          multa?: string | null
          numero?: number | null
          plazo_dias?: number | null
          project_id: string
        }
        Update: {
          hito?: string | null
          id?: string
          multa?: string | null
          numero?: number | null
          plazo_dias?: number | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_hitos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_itemizado: {
        Row: {
          area: string | null
          cantidad: number | null
          commodity: string | null
          cwa_id: string | null
          cwp_id: string | null
          cwps_via_mc: string | null
          descripcion: string | null
          descripcion_codigo: string | null
          hh_item: number | null
          hh_unidad: number | null
          id: string
          item: string
          n_partida: string | null
          obra: string | null
          p_total_clp: number | null
          partida_bmp: string | null
          project_id: string
          pu_clp: number | null
          tipo_partida: string | null
          unidad: string | null
          vinculado: boolean | null
          wbs: string | null
        }
        Insert: {
          area?: string | null
          cantidad?: number | null
          commodity?: string | null
          cwa_id?: string | null
          cwp_id?: string | null
          cwps_via_mc?: string | null
          descripcion?: string | null
          descripcion_codigo?: string | null
          hh_item?: number | null
          hh_unidad?: number | null
          id?: string
          item: string
          n_partida?: string | null
          obra?: string | null
          p_total_clp?: number | null
          partida_bmp?: string | null
          project_id: string
          pu_clp?: number | null
          tipo_partida?: string | null
          unidad?: string | null
          vinculado?: boolean | null
          wbs?: string | null
        }
        Update: {
          area?: string | null
          cantidad?: number | null
          commodity?: string | null
          cwa_id?: string | null
          cwp_id?: string | null
          cwps_via_mc?: string | null
          descripcion?: string | null
          descripcion_codigo?: string | null
          hh_item?: number | null
          hh_unidad?: number | null
          id?: string
          item?: string
          n_partida?: string | null
          obra?: string | null
          p_total_clp?: number | null
          partida_bmp?: string | null
          project_id?: string
          pu_clp?: number | null
          tipo_partida?: string | null
          unidad?: string | null
          vinculado?: boolean | null
          wbs?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_itemizado_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_iwp: {
        Row: {
          avance_fisico_pct: number
          constraint_cleared: boolean
          creado_por: string | null
          crew_size: number | null
          cwp_id: string
          descripcion: string | null
          descripcion_scope: string | null
          duracion_dias: number | null
          fecha_creacion: string
          fecha_fin_plan: string | null
          fecha_inicio_plan: string | null
          fecha_ultima_actualizacion: string
          hh_estimadas: number | null
          hh_reales_acum: number
          imagen_scope: string | null
          imagenes: Json | null
          iwp_id: string
          project_id: string
          semana_ejecucion: string | null
          status: string
        }
        Insert: {
          avance_fisico_pct?: number
          constraint_cleared?: boolean
          creado_por?: string | null
          crew_size?: number | null
          cwp_id: string
          descripcion?: string | null
          descripcion_scope?: string | null
          duracion_dias?: number | null
          fecha_creacion?: string
          fecha_fin_plan?: string | null
          fecha_inicio_plan?: string | null
          fecha_ultima_actualizacion?: string
          hh_estimadas?: number | null
          hh_reales_acum?: number
          imagen_scope?: string | null
          imagenes?: Json | null
          iwp_id: string
          project_id: string
          semana_ejecucion?: string | null
          status?: string
        }
        Update: {
          avance_fisico_pct?: number
          constraint_cleared?: boolean
          creado_por?: string | null
          crew_size?: number | null
          cwp_id?: string
          descripcion?: string | null
          descripcion_scope?: string | null
          duracion_dias?: number | null
          fecha_creacion?: string
          fecha_fin_plan?: string | null
          fecha_inicio_plan?: string | null
          fecha_ultima_actualizacion?: string
          hh_estimadas?: number | null
          hh_reales_acum?: number
          imagen_scope?: string | null
          imagenes?: Json | null
          iwp_id?: string
          project_id?: string
          semana_ejecucion?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_iwp_project_id_cwp_id_fkey"
            columns: ["project_id", "cwp_id"]
            isOneToOne: false
            referencedRelation: "mining_cwp"
            referencedColumns: ["project_id", "cwp_id"]
          },
        ]
      }
      mining_iwp_actividad: {
        Row: {
          cantidad_asignada: number | null
          completado: boolean
          hh_asignadas_iwp: number | null
          id: string
          iwp_id: string
          programa_id: string
          project_id: string
          unidad: string | null
        }
        Insert: {
          cantidad_asignada?: number | null
          completado?: boolean
          hh_asignadas_iwp?: number | null
          id?: string
          iwp_id: string
          programa_id: string
          project_id: string
          unidad?: string | null
        }
        Update: {
          cantidad_asignada?: number | null
          completado?: boolean
          hh_asignadas_iwp?: number | null
          id?: string
          iwp_id?: string
          programa_id?: string
          project_id?: string
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_iwp_actividad_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "mining_programa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mining_iwp_actividad_project_id_iwp_id_fkey"
            columns: ["project_id", "iwp_id"]
            isOneToOne: false
            referencedRelation: "mining_iwp"
            referencedColumns: ["project_id", "iwp_id"]
          },
        ]
      }
      mining_iwp_constraint: {
        Row: {
          cleared: boolean
          descripcion: string | null
          despejado_por: string | null
          ewp_id: string | null
          fecha_cleared: string | null
          fecha_necesaria: string | null
          id: string
          iwp_id: string
          nota: string | null
          project_id: string
          suministro_id: string | null
          tipo: string
        }
        Insert: {
          cleared?: boolean
          descripcion?: string | null
          despejado_por?: string | null
          ewp_id?: string | null
          fecha_cleared?: string | null
          fecha_necesaria?: string | null
          id?: string
          iwp_id: string
          nota?: string | null
          project_id: string
          suministro_id?: string | null
          tipo: string
        }
        Update: {
          cleared?: boolean
          descripcion?: string | null
          despejado_por?: string | null
          ewp_id?: string | null
          fecha_cleared?: string | null
          fecha_necesaria?: string | null
          id?: string
          iwp_id?: string
          nota?: string | null
          project_id?: string
          suministro_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_iwp_constraint_ewp_id_fkey"
            columns: ["ewp_id"]
            isOneToOne: false
            referencedRelation: "mining_ewp_ifc"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mining_iwp_constraint_project_id_iwp_id_fkey"
            columns: ["project_id", "iwp_id"]
            isOneToOne: false
            referencedRelation: "mining_iwp"
            referencedColumns: ["project_id", "iwp_id"]
          },
          {
            foreignKeyName: "mining_iwp_constraint_suministro_id_fkey"
            columns: ["suministro_id"]
            isOneToOne: false
            referencedRelation: "mining_suministro"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_iwp_elemento: {
        Row: {
          asignado_por: string | null
          fecha_asignacion: string | null
          id: string
          iwp_id: string
          moniker: string
          nombre: string | null
          project_id: string
        }
        Insert: {
          asignado_por?: string | null
          fecha_asignacion?: string | null
          id?: string
          iwp_id: string
          moniker: string
          nombre?: string | null
          project_id: string
        }
        Update: {
          asignado_por?: string | null
          fecha_asignacion?: string | null
          id?: string
          iwp_id?: string
          moniker?: string
          nombre?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_iwp_elemento_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_iwp_progreso: {
        Row: {
          avance_financiero_pct: number | null
          avance_fisico_pct: number | null
          completado: boolean
          fecha_reporte: string
          hh_reales_acum: number | null
          id: string
          iwp_id: string
          observacion: string | null
          ponderacion_id: string | null
          project_id: string
          reportado_por: string | null
        }
        Insert: {
          avance_financiero_pct?: number | null
          avance_fisico_pct?: number | null
          completado?: boolean
          fecha_reporte: string
          hh_reales_acum?: number | null
          id?: string
          iwp_id: string
          observacion?: string | null
          ponderacion_id?: string | null
          project_id: string
          reportado_por?: string | null
        }
        Update: {
          avance_financiero_pct?: number | null
          avance_fisico_pct?: number | null
          completado?: boolean
          fecha_reporte?: string
          hh_reales_acum?: number | null
          id?: string
          iwp_id?: string
          observacion?: string | null
          ponderacion_id?: string | null
          project_id?: string
          reportado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_iwp_progreso_ponderacion_id_fkey"
            columns: ["ponderacion_id"]
            isOneToOne: false
            referencedRelation: "mining_ponderaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mining_iwp_progreso_project_id_iwp_id_fkey"
            columns: ["project_id", "iwp_id"]
            isOneToOne: false
            referencedRelation: "mining_iwp"
            referencedColumns: ["project_id", "iwp_id"]
          },
        ]
      }
      mining_mapeo_area_cwa: {
        Row: {
          area_wbs: string | null
          cwa_id: string | null
          id: string
          observacion: string | null
          project_id: string
        }
        Insert: {
          area_wbs?: string | null
          cwa_id?: string | null
          id?: string
          observacion?: string | null
          project_id: string
        }
        Update: {
          area_wbs?: string | null
          cwa_id?: string | null
          id?: string
          observacion?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_mapeo_area_cwa_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_mc: {
        Row: {
          cantidad_item: number | null
          cwp_id: string | null
          estado_vinculo: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          hh_actividad: number | null
          hh_item: number | null
          id: string
          id_antiguo: string | null
          item_eco2: string | null
          nombre_actividad: string | null
          project_id: string
          rendimiento: number | null
          task_id: string
        }
        Insert: {
          cantidad_item?: number | null
          cwp_id?: string | null
          estado_vinculo?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hh_actividad?: number | null
          hh_item?: number | null
          id?: string
          id_antiguo?: string | null
          item_eco2?: string | null
          nombre_actividad?: string | null
          project_id: string
          rendimiento?: number | null
          task_id: string
        }
        Update: {
          cantidad_item?: number | null
          cwp_id?: string | null
          estado_vinculo?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          hh_actividad?: number | null
          hh_item?: number | null
          id?: string
          id_antiguo?: string | null
          item_eco2?: string | null
          nombre_actividad?: string | null
          project_id?: string
          rendimiento?: number | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_mc_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_obras_crosswalk: {
        Row: {
          codigos: string | null
          cwp_id: string
          n_codigos: number | null
          obra_tipo: string
          project_id: string
        }
        Insert: {
          codigos?: string | null
          cwp_id: string
          n_codigos?: number | null
          obra_tipo: string
          project_id: string
        }
        Update: {
          codigos?: string | null
          cwp_id?: string
          n_codigos?: number | null
          obra_tipo?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_obras_crosswalk_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_partidas: {
        Row: {
          cantidad: number | null
          codigo: string | null
          descripcion: string | null
          guid_elemento: string | null
          id: string
          obra: string | null
          project_id: string
          pu_clp: number | null
          pwp_id: string | null
          total_clp: number | null
          unidad: string | null
        }
        Insert: {
          cantidad?: number | null
          codigo?: string | null
          descripcion?: string | null
          guid_elemento?: string | null
          id?: string
          obra?: string | null
          project_id: string
          pu_clp?: number | null
          pwp_id?: string | null
          total_clp?: number | null
          unidad?: string | null
        }
        Update: {
          cantidad?: number | null
          codigo?: string | null
          descripcion?: string | null
          guid_elemento?: string | null
          id?: string
          obra?: string | null
          project_id?: string
          pu_clp?: number | null
          pwp_id?: string | null
          total_clp?: number | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_partidas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_planos: {
        Row: {
          codigo_documento: string | null
          confianza: string | null
          cwp_id: string | null
          descripcion: string | null
          ewp_id: string | null
          id: string
          project_id: string
          tipo: string | null
        }
        Insert: {
          codigo_documento?: string | null
          confianza?: string | null
          cwp_id?: string | null
          descripcion?: string | null
          ewp_id?: string | null
          id?: string
          project_id: string
          tipo?: string | null
        }
        Update: {
          codigo_documento?: string | null
          confianza?: string | null
          cwp_id?: string | null
          descripcion?: string | null
          ewp_id?: string | null
          id?: string
          project_id?: string
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_planos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_ponderaciones: {
        Row: {
          commodity: string | null
          hito: string
          id: string
          item_code: string
          item_nombre: string | null
          orden: number | null
          peso: number
          project_id: string
          subitem_code: string | null
          subitem_nombre: string | null
          tipo: string | null
        }
        Insert: {
          commodity?: string | null
          hito: string
          id?: string
          item_code: string
          item_nombre?: string | null
          orden?: number | null
          peso: number
          project_id: string
          subitem_code?: string | null
          subitem_nombre?: string | null
          tipo?: string | null
        }
        Update: {
          commodity?: string | null
          hito?: string
          id?: string
          item_code?: string
          item_nombre?: string | null
          orden?: number | null
          peso?: number
          project_id?: string
          subitem_code?: string | null
          subitem_nombre?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_ponderaciones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_programa: {
        Row: {
          cantidad: number | null
          cod_actividad: string | null
          cv_id: string | null
          cwa_id: string | null
          cwp_id: string | null
          duracion_dias: number | null
          en_mc: boolean | null
          fecha_fin: string | null
          fecha_inicio: string | null
          fuente: string | null
          hh: number | null
          id: string
          id_antiguo: string | null
          iwp_codigo: string | null
          nombre_actividad: string | null
          project_id: string
          sector: string | null
          tipo: string | null
          unidad: string | null
          wbs: string | null
        }
        Insert: {
          cantidad?: number | null
          cod_actividad?: string | null
          cv_id?: string | null
          cwa_id?: string | null
          cwp_id?: string | null
          duracion_dias?: number | null
          en_mc?: boolean | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fuente?: string | null
          hh?: number | null
          id?: string
          id_antiguo?: string | null
          iwp_codigo?: string | null
          nombre_actividad?: string | null
          project_id: string
          sector?: string | null
          tipo?: string | null
          unidad?: string | null
          wbs?: string | null
        }
        Update: {
          cantidad?: number | null
          cod_actividad?: string | null
          cv_id?: string | null
          cwa_id?: string | null
          cwp_id?: string | null
          duracion_dias?: number | null
          en_mc?: boolean | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          fuente?: string | null
          hh?: number | null
          id?: string
          id_antiguo?: string | null
          iwp_codigo?: string | null
          nombre_actividad?: string | null
          project_id?: string
          sector?: string | null
          tipo?: string | null
          unidad?: string | null
          wbs?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_programa_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_pwp: {
        Row: {
          commodity: string | null
          costo_clp: number | null
          cwp_id: string | null
          ewp_id: string | null
          project_id: string
          pwp_id: string
        }
        Insert: {
          commodity?: string | null
          costo_clp?: number | null
          cwp_id?: string | null
          ewp_id?: string | null
          project_id: string
          pwp_id: string
        }
        Update: {
          commodity?: string | null
          costo_clp?: number | null
          cwp_id?: string | null
          ewp_id?: string | null
          project_id?: string
          pwp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_pwp_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_revision_estado: {
        Row: {
          codigo: string
          estado: string
          nivel: string
          notas: string | null
          project_id: string
          revisado_en: string | null
          revisado_por: string | null
        }
        Insert: {
          codigo: string
          estado?: string
          nivel: string
          notas?: string | null
          project_id: string
          revisado_en?: string | null
          revisado_por?: string | null
        }
        Update: {
          codigo?: string
          estado?: string
          nivel?: string
          notas?: string | null
          project_id?: string
          revisado_en?: string | null
          revisado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_revision_estado_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_suministro: {
        Row: {
          cwp_id: string
          descripcion_material: string | null
          fecha_entrega_plan: string | null
          fecha_entrega_real: string | null
          id: string
          liberado: boolean
          numero_po: string | null
          observacion: string | null
          project_id: string
          proveedor: string | null
        }
        Insert: {
          cwp_id: string
          descripcion_material?: string | null
          fecha_entrega_plan?: string | null
          fecha_entrega_real?: string | null
          id?: string
          liberado?: boolean
          numero_po?: string | null
          observacion?: string | null
          project_id: string
          proveedor?: string | null
        }
        Update: {
          cwp_id?: string
          descripcion_material?: string | null
          fecha_entrega_plan?: string | null
          fecha_entrega_real?: string | null
          id?: string
          liberado?: boolean
          numero_po?: string | null
          observacion?: string | null
          project_id?: string
          proveedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_suministro_project_id_cwp_id_fkey"
            columns: ["project_id", "cwp_id"]
            isOneToOne: false
            referencedRelation: "mining_cwp"
            referencedColumns: ["project_id", "cwp_id"]
          },
        ]
      }
      mining_swp: {
        Row: {
          es_oficial: boolean
          nombre_sistema: string | null
          nombre_swp: string | null
          project_id: string
          sistema: string | null
          swp_id: string
        }
        Insert: {
          es_oficial?: boolean
          nombre_sistema?: string | null
          nombre_swp?: string | null
          project_id: string
          sistema?: string | null
          swp_id: string
        }
        Update: {
          es_oficial?: boolean
          nombre_sistema?: string | null
          nombre_swp?: string | null
          project_id?: string
          sistema?: string | null
          swp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mining_swp_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mining_swp_subsistemas: {
        Row: {
          cv_id: string | null
          cwa_id: string | null
          cwp_id: string | null
          ewp_id: string | null
          id: string
          project_id: string
          sistema: string | null
          subsistema_id: string | null
          subsistema_nombre: string | null
          swp_id: string | null
        }
        Insert: {
          cv_id?: string | null
          cwa_id?: string | null
          cwp_id?: string | null
          ewp_id?: string | null
          id?: string
          project_id: string
          sistema?: string | null
          subsistema_id?: string | null
          subsistema_nombre?: string | null
          swp_id?: string | null
        }
        Update: {
          cv_id?: string | null
          cwa_id?: string | null
          cwp_id?: string | null
          ewp_id?: string | null
          id?: string
          project_id?: string
          sistema?: string | null
          subsistema_id?: string | null
          subsistema_nombre?: string | null
          swp_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mining_swp_subsistemas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      model_data_versions: {
        Row: {
          columns_imported: string[] | null
          created_at: string | null
          file_name: string | null
          id: string
          is_active: boolean | null
          match_key: string
          matched_count: number | null
          name: string
          project_id: string
          row_count: number | null
        }
        Insert: {
          columns_imported?: string[] | null
          created_at?: string | null
          file_name?: string | null
          id?: string
          is_active?: boolean | null
          match_key: string
          matched_count?: number | null
          name: string
          project_id: string
          row_count?: number | null
        }
        Update: {
          columns_imported?: string[] | null
          created_at?: string | null
          file_name?: string | null
          id?: string
          is_active?: boolean | null
          match_key?: string
          matched_count?: number | null
          name?: string
          project_id?: string
          row_count?: number | null
        }
        Relationships: []
      }
      model_elements: {
        Row: {
          element_id: string
          id: string
          project_id: string
          raw_versions: Json | null
          updated_at: string | null
        }
        Insert: {
          element_id: string
          id?: string
          project_id: string
          raw_versions?: Json | null
          updated_at?: string | null
        }
        Update: {
          element_id?: string
          id?: string
          project_id?: string
          raw_versions?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      nodes: {
        Row: {
          created_at: string
          data: Json
          data_headers: Json | null
          id: string
          name: string | null
          position_x: number | null
          position_y: number | null
          project_id: string
          source_type: string | null
          type: string
        }
        Insert: {
          created_at?: string
          data?: Json
          data_headers?: Json | null
          id?: string
          name?: string | null
          position_x?: number | null
          position_y?: number | null
          project_id: string
          source_type?: string | null
          type: string
        }
        Update: {
          created_at?: string
          data?: Json
          data_headers?: Json | null
          id?: string
          name?: string | null
          position_x?: number | null
          position_y?: number | null
          project_id?: string
          source_type?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "nodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          plan: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          plan?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      program_activities: {
        Row: {
          created_at: string
          cwp_code: string | null
          description: string | null
          discipline: string | null
          end_date: string | null
          ewp_code: string | null
          float_days: number | null
          hh: number | null
          id: string
          is_critical: boolean
          is_milestone: boolean
          is_summary: boolean | null
          parent_wbs: string | null
          program_source: string | null
          progress: number | null
          project_id: string
          pwp_code: string | null
          sort_order: number | null
          start_date: string | null
          status: string | null
          wbs_code: string
        }
        Insert: {
          created_at?: string
          cwp_code?: string | null
          description?: string | null
          discipline?: string | null
          end_date?: string | null
          ewp_code?: string | null
          float_days?: number | null
          hh?: number | null
          id?: string
          is_critical?: boolean
          is_milestone?: boolean
          is_summary?: boolean | null
          parent_wbs?: string | null
          program_source?: string | null
          progress?: number | null
          project_id: string
          pwp_code?: string | null
          sort_order?: number | null
          start_date?: string | null
          status?: string | null
          wbs_code: string
        }
        Update: {
          created_at?: string
          cwp_code?: string | null
          description?: string | null
          discipline?: string | null
          end_date?: string | null
          ewp_code?: string | null
          float_days?: number | null
          hh?: number | null
          id?: string
          is_critical?: boolean
          is_milestone?: boolean
          is_summary?: boolean | null
          parent_wbs?: string | null
          program_source?: string | null
          progress?: number | null
          project_id?: string
          pwp_code?: string | null
          sort_order?: number | null
          start_date?: string | null
          status?: string | null
          wbs_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_invitations: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          label: string | null
          max_uses: number | null
          project_id: string
          role: string
          token: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number | null
          project_id: string
          role?: string
          token?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number | null
          project_id?: string
          role?: string
          token?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          module_access: Json | null
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_access?: Json | null
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module_access?: Json | null
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active_modules: Json | null
          created_at: string
          description: string | null
          id: string
          module_config: Json | null
          name: string
          organization_id: string
          stage: string | null
          updated_at: string
        }
        Insert: {
          active_modules?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          module_config?: Json | null
          name: string
          organization_id: string
          stage?: string | null
          updated_at?: string
        }
        Update: {
          active_modules?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          module_config?: Json | null
          name?: string
          organization_id?: string
          stage?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sot_mappings: {
        Row: {
          created_at: string
          id: string
          master_key: string
          project_id: string
          source_attribute_name: string
          source_entity_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          master_key: string
          project_id: string
          source_attribute_name: string
          source_entity_id: string
        }
        Update: {
          created_at?: string
          id?: string
          master_key?: string
          project_id?: string
          source_attribute_name?: string
          source_entity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sot_mappings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sot_mappings_source_entity_id_fkey"
            columns: ["source_entity_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      task_teams: {
        Row: {
          client_counterpart: string | null
          created_at: string
          department_id: string | null
          discipline: Database["public"]["Enums"]["tidp_discipline"] | null
          id: string
          leader_email: string | null
          leader_name: string | null
          name: string
          project_id: string
        }
        Insert: {
          client_counterpart?: string | null
          created_at?: string
          department_id?: string | null
          discipline?: Database["public"]["Enums"]["tidp_discipline"] | null
          id?: string
          leader_email?: string | null
          leader_name?: string | null
          name: string
          project_id: string
        }
        Update: {
          client_counterpart?: string | null
          created_at?: string
          department_id?: string | null
          discipline?: Database["public"]["Enums"]["tidp_discipline"] | null
          id?: string
          leader_email?: string | null
          leader_name?: string | null
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_teams_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tidp_constraints: {
        Row: {
          closed_date: string | null
          closure_comment: string | null
          commitment_date: string | null
          created_at: string
          deliverable_id: string | null
          description: string
          id: string
          project_id: string
          resolution_owner: string | null
          resolution_owner_email: string | null
          status: Database["public"]["Enums"]["constraint_status"]
          type: Database["public"]["Enums"]["constraint_type"]
        }
        Insert: {
          closed_date?: string | null
          closure_comment?: string | null
          commitment_date?: string | null
          created_at?: string
          deliverable_id?: string | null
          description: string
          id?: string
          project_id: string
          resolution_owner?: string | null
          resolution_owner_email?: string | null
          status?: Database["public"]["Enums"]["constraint_status"]
          type: Database["public"]["Enums"]["constraint_type"]
        }
        Update: {
          closed_date?: string | null
          closure_comment?: string | null
          commitment_date?: string | null
          created_at?: string
          deliverable_id?: string | null
          description?: string
          id?: string
          project_id?: string
          resolution_owner?: string | null
          resolution_owner_email?: string | null
          status?: Database["public"]["Enums"]["constraint_status"]
          type?: Database["public"]["Enums"]["constraint_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tidp_constraints_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tidp_constraints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tidp_notification_settings: {
        Row: {
          created_at: string
          days_before_due: number
          enabled: boolean
          id: string
          project_id: string
          setting_name: string
        }
        Insert: {
          created_at?: string
          days_before_due?: number
          enabled?: boolean
          id?: string
          project_id: string
          setting_name: string
        }
        Update: {
          created_at?: string
          days_before_due?: number
          enabled?: boolean
          id?: string
          project_id?: string
          setting_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tidp_notification_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tidps: {
        Row: {
          author: string | null
          code: string
          created_at: string
          id: string
          issue_date: string | null
          name: string
          project_id: string
          replaces_tidp_id: string | null
          status: Database["public"]["Enums"]["tidp_status"]
          task_team_id: string
          version: string
        }
        Insert: {
          author?: string | null
          code: string
          created_at?: string
          id?: string
          issue_date?: string | null
          name: string
          project_id: string
          replaces_tidp_id?: string | null
          status?: Database["public"]["Enums"]["tidp_status"]
          task_team_id: string
          version?: string
        }
        Update: {
          author?: string | null
          code?: string
          created_at?: string
          id?: string
          issue_date?: string | null
          name?: string
          project_id?: string
          replaces_tidp_id?: string | null
          status?: Database["public"]["Enums"]["tidp_status"]
          task_team_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "tidps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tidps_replaces_tidp_id_fkey"
            columns: ["replaces_tidp_id"]
            isOneToOne: false
            referencedRelation: "tidps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tidps_task_team_id_fkey"
            columns: ["task_team_id"]
            isOneToOne: false
            referencedRelation: "task_teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_mining_brechas: {
        Row: {
          codigo: string | null
          cwp_id: string | null
          descripcion: string | null
          hh: number | null
          project_id: string | null
          tipo_brecha: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_organization: {
        Args: {
          org_logo_url?: string
          org_name: string
          org_plan?: string
          org_slug: string
        }
        Returns: string
      }
      extract_cwp_combinations: {
        Args: {
          p_area_col: string
          p_cwp_col: string
          p_desc_col: string
          p_disc_col: string
          p_entity_id: string
          p_ewp_col: string
          p_pwp_col: string
          p_tags_col: string
        }
        Returns: {
          area: string
          cwp_code: string
          cwp_description: string
          discipline: string
          ewp_code: string
          pwp_code: string
          row_count: number
          tags: string
        }[]
      }
      merge_module_config: {
        Args: { p_key: string; p_project_id: string; p_value: Json }
        Returns: undefined
      }
      mining_bot_schema_map: {
        Args: never
        Returns: {
          column_name: string
          data_type: string
          table_name: string
        }[]
      }
      mining_cwp_element_counts: {
        Args: { p_project_id: string }
        Returns: {
          cwp_id: string
          n: number
        }[]
      }
      mining_elementos_buckets: {
        Args: { p_project_id: string }
        Returns: {
          cwp_id: string
          en_catalogo: boolean
          n: number
        }[]
      }
      mining_elementos_filtros: {
        Args: { p_project_id: string }
        Returns: {
          columna: string
          n: number
          valor: string
        }[]
      }
      mining_elementos_nivel_buckets: {
        Args: { p_nivel: string; p_project_id: string }
        Returns: {
          codigo: string
          n: number
        }[]
      }
      mining_swp_resumen: {
        Args: { p_project_id: string }
        Returns: {
          n_elementos_modelo: number
          n_equipos: number
          n_lineas: number
          nombre_sistema: string
          nombre_swp: string
          pids: string[]
          sistema: string
          swp_id: string
        }[]
      }
      set_bim_linker_key: {
        Args: { p_key: string; p_project_id: string; p_value: Json }
        Returns: undefined
      }
      user_has_project_access: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      user_is_project_admin: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      user_organizations: { Args: never; Returns: string[] }
    }
    Enums: {
      cde_status: "WIP" | "SHARED" | "PUBLISHED" | "ARCHIVED"
      constraint_status: "OPEN" | "IN_PROGRESS" | "CLOSED"
      constraint_type:
        | "ENGINEERING"
        | "MATERIALS"
        | "EQUIPMENT"
        | "LABOR"
        | "SAFETY"
        | "PREREQUISITE"
      deliverable_type:
        | "DRAWING"
        | "SPECIFICATION"
        | "BIM_MODEL"
        | "SCHEDULE"
        | "REPORT"
        | "PROCEDURE"
        | "CERTIFICATE"
        | "OTHER"
      org_role: "owner" | "admin" | "member"
      project_role: "admin" | "editor" | "viewer"
      tidp_discipline:
        | "Oficina Técnica"
        | "Terreno"
        | "Calidad"
        | "Medio Ambiente"
        | "Prevención de Riesgos"
        | "Equipos"
        | "Recursos Humanos"
        | "Administración"
        | "Contratos"
        | "Bodega"
        | "Topografía"
        | "Laboratorio"
      tidp_status: "DRAFT" | "CURRENT" | "SUPERSEDED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cde_status: ["WIP", "SHARED", "PUBLISHED", "ARCHIVED"],
      constraint_status: ["OPEN", "IN_PROGRESS", "CLOSED"],
      constraint_type: [
        "ENGINEERING",
        "MATERIALS",
        "EQUIPMENT",
        "LABOR",
        "SAFETY",
        "PREREQUISITE",
      ],
      deliverable_type: [
        "DRAWING",
        "SPECIFICATION",
        "BIM_MODEL",
        "SCHEDULE",
        "REPORT",
        "PROCEDURE",
        "CERTIFICATE",
        "OTHER",
      ],
      org_role: ["owner", "admin", "member"],
      project_role: ["admin", "editor", "viewer"],
      tidp_discipline: [
        "Oficina Técnica",
        "Terreno",
        "Calidad",
        "Medio Ambiente",
        "Prevención de Riesgos",
        "Equipos",
        "Recursos Humanos",
        "Administración",
        "Contratos",
        "Bodega",
        "Topografía",
        "Laboratorio",
      ],
      tidp_status: ["DRAFT", "CURRENT", "SUPERSEDED"],
    },
  },
} as const

// --- Adiciones manuales (mantener al regenerar tipos con supabase gen types) ---
export type OrgPlan = 'starter' | 'pro' | 'enterprise'
