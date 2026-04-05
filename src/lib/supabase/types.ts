export type OrgRole = 'owner' | 'admin' | 'member'
export type OrgPlan = 'starter' | 'pro' | 'enterprise'

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
      }
      projects: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          updated_at?: string
        }
      }
      nodes: {
        Row: {
          id: string
          project_id: string
          type: string
          data: Record<string, unknown>
          position_x: number | null
          position_y: number | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          type: string
          data?: Record<string, unknown>
          position_x?: number | null
          position_y?: number | null
          created_at?: string
        }
        Update: {
          type?: string
          data?: Record<string, unknown>
          position_x?: number | null
          position_y?: number | null
        }
      }
      edges: {
        Row: {
          id: string
          project_id: string
          source_node_id: string
          target_node_id: string
          label: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          source_node_id: string
          target_node_id: string
          label?: string | null
          created_at?: string
        }
        Update: {
          label?: string | null
        }
      }
    }
    Functions: {
      create_organization: {
        Args: {
          org_name: string
          org_slug: string
          org_plan: OrgPlan
          org_logo_url?: string | null
        }
        Returns: string
      }
    }
  }
}
