export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type OrgRole      = 'owner' | 'admin' | 'member'
export type OrgPlan      = 'starter' | 'pro' | 'enterprise'
export type ProjectRole  = 'admin' | 'editor' | 'viewer'
export type ProjectStage = 'licitacion' | 'operacion' | 'cierre'
export type AccessLevel  = 'edit' | 'view' | 'none'

// TIDP / Hilo Digital types
export type TidpDiscipline =
  | 'Oficina Técnica' | 'Terreno' | 'Calidad' | 'Medio Ambiente'
  | 'Prevención de Riesgos' | 'Equipos' | 'Recursos Humanos'
  | 'Administración' | 'Contratos' | 'Bodega' | 'Topografía' | 'Laboratorio'

export type TidpStatus        = 'DRAFT' | 'CURRENT' | 'SUPERSEDED'
export type DeliverableType   = 'DRAWING' | 'SPECIFICATION' | 'BIM_MODEL' | 'SCHEDULE' | 'REPORT' | 'PROCEDURE' | 'CERTIFICATE' | 'OTHER'
export type CdeStatus         = 'WIP' | 'SHARED' | 'PUBLISHED' | 'ARCHIVED'
export type ConstraintType    = 'ENGINEERING' | 'MATERIALS' | 'EQUIPMENT' | 'LABOR' | 'SAFETY' | 'PREREQUISITE'
export type ConstraintStatus  = 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
export type ProjectPhase      = 'Diseño' | 'Construcción' | 'Comisionamiento' | 'Operación'

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          logo_url: string | null
          plan: OrgPlan
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          logo_url?: string | null
          plan?: OrgPlan
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          slug?: string
          logo_url?: string | null
          plan?: OrgPlan
          updated_at?: string
        }
        Relationships: []
      }

      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: OrgRole
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: OrgRole
          created_at?: string
        }
        Update: {
          role?: OrgRole
        }
        Relationships: []
      }

      projects: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          stage: ProjectStage
          active_modules: Record<string, boolean>
          role_permissions: Record<string, Record<string, AccessLevel>>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          stage?: ProjectStage
          active_modules?: Record<string, boolean>
          role_permissions?: Record<string, Record<string, AccessLevel>>
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          stage?: ProjectStage
          active_modules?: Record<string, boolean>
          role_permissions?: Record<string, Record<string, AccessLevel>>
          updated_at?: string
        }
        Relationships: []
      }

      project_members: {
        Row: {
          id: string
          project_id: string
          user_id: string
          role: ProjectRole
          module_access: Record<string, AccessLevel>
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          role?: ProjectRole
          module_access?: Record<string, AccessLevel>
          created_at?: string
        }
        Update: {
          role?: ProjectRole
          module_access?: Record<string, AccessLevel>
        }
        Relationships: []
      }

      nodes: {
        Row: {
          id: string
          project_id: string
          name: string | null
          source_type: string
          data_headers: Json | null
          type: string
          data: Record<string, unknown>
          position_x: number | null
          position_y: number | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name?: string | null
          source_type?: string
          data_headers?: Record<string, unknown> | null
          type?: string
          data?: Record<string, unknown>
          position_x?: number | null
          position_y?: number | null
          created_at?: string
        }
        Update: {
          name?: string | null
          source_type?: string
          data_headers?: Record<string, unknown> | null
          type?: string
          data?: Record<string, unknown>
          position_x?: number | null
          position_y?: number | null
        }
        Relationships: []
      }

      edges: {
        Row: {
          id: string
          project_id: string
          source_node_id: string
          target_node_id: string
          source_column: string | null
          target_column: string | null
          relationship_type: string
          label: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          source_node_id: string
          target_node_id: string
          source_column?: string | null
          target_column?: string | null
          relationship_type?: string
          label?: string | null
          created_at?: string
        }
        Update: {
          source_column?: string | null
          target_column?: string | null
          relationship_type?: string
          label?: string | null
        }
        Relationships: []
      }

      sot_mappings: {
        Row: {
          id: string
          project_id: string
          master_key: string
          source_entity_id: string
          source_attribute_name: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          master_key: string
          source_entity_id: string
          source_attribute_name: string
          created_at?: string
        }
        Update: {
          master_key?: string
          source_entity_id?: string
          source_attribute_name?: string
        }
        Relationships: []
      }

      cwp_master: {
        Row: {
          id: string
          project_id: string
          cwp_code: string
          cwp_description: string | null
          discipline: string | null
          ewp_code: string | null
          pwp_code: string | null
          area: string | null
          tags: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          cwp_code: string
          cwp_description?: string | null
          discipline?: string | null
          ewp_code?: string | null
          pwp_code?: string | null
          area?: string | null
          tags?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          cwp_code?: string
          cwp_description?: string | null
          discipline?: string | null
          ewp_code?: string | null
          pwp_code?: string | null
          area?: string | null
          tags?: string | null
          is_active?: boolean
        }
        Relationships: []
      }

      custom_views: {
        Row: {
          id: string
          name: string
          entity_id: string | null
          columns: unknown[]
          filter_key: string | null
          project_id: string | null
          definition: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          entity_id?: string | null
          columns?: unknown[]
          filter_key?: string | null
          project_id?: string | null
          definition?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          name?: string
          entity_id?: string | null
          columns?: unknown[]
          filter_key?: string | null
          definition?: Record<string, unknown> | null
        }
        Relationships: []
      }

      departments: {
        Row: {
          id: string
          organization_id: string
          name: string
          code: string
          leader_role: string | null
          scope: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          code: string
          leader_role?: string | null
          scope?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          code?: string
          leader_role?: string | null
          scope?: string | null
        }
        Relationships: []
      }

      task_teams: {
        Row: {
          id: string
          project_id: string
          department_id: string | null
          name: string
          discipline: TidpDiscipline | null
          leader_name: string | null
          leader_email: string | null
          client_counterpart: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          department_id?: string | null
          name: string
          discipline?: TidpDiscipline | null
          leader_name?: string | null
          leader_email?: string | null
          client_counterpart?: string | null
          created_at?: string
        }
        Update: {
          department_id?: string | null
          name?: string
          discipline?: TidpDiscipline | null
          leader_name?: string | null
          leader_email?: string | null
          client_counterpart?: string | null
        }
        Relationships: []
      }

      milestones: {
        Row: {
          id: string
          project_id: string
          code: string
          description: string
          target_date: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          code: string
          description: string
          target_date: string
          created_at?: string
        }
        Update: {
          code?: string
          description?: string
          target_date?: string
        }
        Relationships: []
      }

      tidps: {
        Row: {
          id: string
          project_id: string
          task_team_id: string
          name: string
          code: string
          issue_date: string | null
          version: string
          author: string | null
          status: TidpStatus
          replaces_tidp_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          task_team_id: string
          name: string
          code: string
          issue_date?: string | null
          version?: string
          author?: string | null
          status?: TidpStatus
          replaces_tidp_id?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          code?: string
          issue_date?: string | null
          version?: string
          author?: string | null
          status?: TidpStatus
          replaces_tidp_id?: string | null
        }
        Relationships: []
      }

      deliverables: {
        Row: {
          id: string
          tidp_id: string
          project_id: string
          milestone_id: string | null
          name: string
          iso_code: string
          type: DeliverableType
          loin_geometric: string | null
          loin_alphanumeric: string | null
          planned_date: string | null
          actual_date: string | null
          responsible: string | null
          cde_status: CdeStatus
          cde_file_reference: string | null
          bim_guid: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tidp_id: string
          project_id: string
          milestone_id?: string | null
          name: string
          iso_code: string
          type?: DeliverableType
          loin_geometric?: string | null
          loin_alphanumeric?: string | null
          planned_date?: string | null
          actual_date?: string | null
          responsible?: string | null
          cde_status?: CdeStatus
          cde_file_reference?: string | null
          bim_guid?: string | null
          created_at?: string
        }
        Update: {
          milestone_id?: string | null
          name?: string
          iso_code?: string
          type?: DeliverableType
          loin_geometric?: string | null
          loin_alphanumeric?: string | null
          planned_date?: string | null
          actual_date?: string | null
          responsible?: string | null
          cde_status?: CdeStatus
          cde_file_reference?: string | null
          bim_guid?: string | null
        }
        Relationships: []
      }

      deliverable_versions: {
        Row: {
          id: string
          deliverable_id: string
          version_label: string
          version_number: number
          date: string
          author: string | null
          comments: string | null
          cde_file_reference: string | null
          cde_status: CdeStatus
          created_at: string
        }
        Insert: {
          id?: string
          deliverable_id: string
          version_label: string
          version_number: number
          date: string
          author?: string | null
          comments?: string | null
          cde_file_reference?: string | null
          cde_status: CdeStatus
          created_at?: string
        }
        Update: {
          version_label?: string
          comments?: string | null
          cde_file_reference?: string | null
          cde_status?: CdeStatus
        }
        Relationships: []
      }

      tidp_constraints: {
        Row: {
          id: string
          project_id: string
          deliverable_id: string | null
          description: string
          type: ConstraintType
          resolution_owner: string | null
          resolution_owner_email: string | null
          commitment_date: string | null
          status: ConstraintStatus
          closure_comment: string | null
          closed_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          deliverable_id?: string | null
          description: string
          type: ConstraintType
          resolution_owner?: string | null
          resolution_owner_email?: string | null
          commitment_date?: string | null
          status?: ConstraintStatus
          closure_comment?: string | null
          closed_date?: string | null
          created_at?: string
        }
        Update: {
          deliverable_id?: string | null
          description?: string
          type?: ConstraintType
          resolution_owner?: string | null
          resolution_owner_email?: string | null
          commitment_date?: string | null
          status?: ConstraintStatus
          closure_comment?: string | null
          closed_date?: string | null
        }
        Relationships: []
      }

      constraint_history: {
        Row: {
          id: string
          constraint_id: string
          history_label: string | null
          change_date: string
          version_number: number | null
          changed_by: string | null
          previous_status: ConstraintStatus | null
          new_status: ConstraintStatus
          comments: string | null
          created_at: string
        }
        Insert: {
          id?: string
          constraint_id: string
          history_label?: string | null
          change_date?: string
          version_number?: number | null
          changed_by?: string | null
          previous_status?: ConstraintStatus | null
          new_status: ConstraintStatus
          comments?: string | null
          created_at?: string
        }
        Update: {
          comments?: string | null
        }
        Relationships: []
      }

      tidp_notification_settings: {
        Row: {
          id: string
          project_id: string
          setting_name: string
          days_before_due: number
          enabled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          setting_name: string
          days_before_due?: number
          enabled?: boolean
          created_at?: string
        }
        Update: {
          setting_name?: string
          days_before_due?: number
          enabled?: boolean
        }
        Relationships: []
      }

      program_activities: {
        Row: {
          id: string
          project_id: string
          wbs_code: string
          description: string | null
          cwp_code: string | null
          ewp_code: string | null
          pwp_code: string | null
          discipline: string | null
          hh: number
          start_date: string | null
          end_date: string | null
          progress: number
          is_summary: boolean
          is_milestone: boolean
          is_critical: boolean
          float_days: number | null
          parent_wbs: string | null
          program_source: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          wbs_code: string
          description?: string | null
          cwp_code?: string | null
          ewp_code?: string | null
          pwp_code?: string | null
          discipline?: string | null
          hh?: number
          start_date?: string | null
          end_date?: string | null
          progress?: number
          is_summary?: boolean
          is_milestone?: boolean
          is_critical?: boolean
          float_days?: number | null
          parent_wbs?: string | null
          program_source?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          wbs_code?: string
          description?: string | null
          cwp_code?: string | null
          ewp_code?: string | null
          pwp_code?: string | null
          discipline?: string | null
          hh?: number
          start_date?: string | null
          end_date?: string | null
          progress?: number
          is_summary?: boolean
          is_milestone?: boolean
          is_critical?: boolean
          float_days?: number | null
          parent_wbs?: string | null
          program_source?: string | null
          sort_order?: number
        }
        Relationships: []
      }

    }

    Views: Record<string, never>

    Functions: {
      create_organization: {
        Args: {
          org_name: string
          org_slug: string
          org_plan?: string
          org_logo_url?: string | null
        }
        Returns: string
      }
      user_organizations: {
        Args: Record<PropertyKey, never>
        Returns: { organization_id: string }[]
      }
    }

    Enums: {
      org_role:         OrgRole
      org_plan:         OrgPlan
      project_role:     ProjectRole
      tidp_discipline:  TidpDiscipline
      tidp_status:      TidpStatus
      deliverable_type: DeliverableType
      cde_status:       CdeStatus
      constraint_type:  ConstraintType
      constraint_status: ConstraintStatus
      project_phase:    ProjectPhase
    }

    CompositeTypes: Record<string, never>
  }
}
