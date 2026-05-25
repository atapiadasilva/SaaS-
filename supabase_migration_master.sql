-- ============================================================
-- MASTER MIGRATION — Run this single file in Supabase SQL Editor
-- Replaces: supabase_schema.sql + supabase_additions.sql +
--           supabase_awp_tables.sql + supabase_tidp_tables.sql
-- Safe to re-run: uses IF NOT EXISTS and EXCEPTION handlers
-- ============================================================

-- Required extension for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS (safe: catches duplicate_object)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.project_role AS ENUM ('admin', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tidp_discipline AS ENUM (
    'Oficina Técnica', 'Terreno', 'Calidad', 'Medio Ambiente',
    'Prevención de Riesgos', 'Equipos', 'Recursos Humanos',
    'Administración', 'Contratos', 'Bodega', 'Topografía', 'Laboratorio'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tidp_status AS ENUM ('DRAFT', 'CURRENT', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.deliverable_type AS ENUM (
    'DRAWING', 'SPECIFICATION', 'BIM_MODEL', 'SCHEDULE',
    'REPORT', 'PROCEDURE', 'CERTIFICATE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cde_status AS ENUM ('WIP', 'SHARED', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.constraint_type AS ENUM (
    'ENGINEERING', 'MATERIALS', 'EQUIPMENT', 'LABOR', 'SAFETY', 'PREREQUISITE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.constraint_status AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.project_phase AS ENUM (
    'Diseño', 'Construcción', 'Comisionamiento', 'Operación'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- BASE TABLES (supabase_schema.sql)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT UNIQUE NOT NULL,
    logo_url   TEXT,
    plan       TEXT DEFAULT 'starter',
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role            public.org_role DEFAULT 'member' NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.projects (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    stage           TEXT DEFAULT 'licitacion' NOT NULL,
    active_modules  JSONB DEFAULT '{"cwp": false, "4d": false, "bim": false, "documents": false}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_members (
    id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id    UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role          public.project_role DEFAULT 'viewer' NOT NULL,
    module_access JSONB DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.nodes (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id   UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    name         TEXT,
    source_type  TEXT DEFAULT 'excel',
    data_headers JSONB,
    type         TEXT NOT NULL DEFAULT 'custom',
    data         JSONB DEFAULT '{}'::jsonb NOT NULL,
    position_x   FLOAT DEFAULT 0,
    position_y   FLOAT DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.edges (
    id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id        UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    source_node_id    UUID REFERENCES public.nodes(id) ON DELETE CASCADE NOT NULL,
    target_node_id    UUID REFERENCES public.nodes(id) ON DELETE CASCADE NOT NULL,
    source_column     TEXT,
    target_column     TEXT,
    relationship_type TEXT DEFAULT '1:N',
    label             TEXT,
    created_at        TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- ============================================================
-- AWP TABLES (supabase_awp_tables.sql)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sot_mappings (
    id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id           UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    master_key           TEXT NOT NULL,
    source_entity_id     UUID REFERENCES public.nodes(id) ON DELETE CASCADE NOT NULL,
    source_attribute_name TEXT NOT NULL,
    created_at           TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(project_id, master_key)
);

CREATE TABLE IF NOT EXISTS public.cwp_master (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    cwp_code        TEXT NOT NULL,
    cwp_description TEXT,
    discipline      TEXT,
    ewp_code        TEXT,
    pwp_code        TEXT,
    area            TEXT,
    tags            TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(project_id, cwp_code)
);

CREATE TABLE IF NOT EXISTS public.custom_views (
    id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name       TEXT NOT NULL,
    entity_id  UUID REFERENCES public.nodes(id) ON DELETE CASCADE,
    columns    JSONB DEFAULT '[]'::jsonb,
    filter_key TEXT,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    definition JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- ============================================================
-- TIDP TABLES (supabase_tidp_tables.sql)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.departments (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    name            TEXT NOT NULL,
    code            TEXT NOT NULL,
    leader_role     TEXT,
    scope           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.task_teams (
    id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id         UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    department_id      UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    name               TEXT NOT NULL,
    discipline         public.tidp_discipline,
    leader_name        TEXT,
    leader_email       TEXT,
    client_counterpart TEXT,
    created_at         TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.milestones (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    code        TEXT NOT NULL,
    description TEXT NOT NULL,
    target_date DATE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(project_id, code)
);

CREATE TABLE IF NOT EXISTS public.tidps (
    id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id       UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    task_team_id     UUID REFERENCES public.task_teams(id) ON DELETE CASCADE NOT NULL,
    name             TEXT NOT NULL,
    code             TEXT NOT NULL,
    issue_date       DATE,
    version          TEXT NOT NULL DEFAULT '1.0',
    author           TEXT,
    status           public.tidp_status DEFAULT 'DRAFT' NOT NULL,
    replaces_tidp_id UUID REFERENCES public.tidps(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(project_id, code, version)
);

CREATE TABLE IF NOT EXISTS public.deliverables (
    id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tidp_id            UUID REFERENCES public.tidps(id) ON DELETE CASCADE NOT NULL,
    project_id         UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    milestone_id       UUID REFERENCES public.milestones(id) ON DELETE SET NULL,
    name               TEXT NOT NULL,
    iso_code           TEXT NOT NULL,
    type               public.deliverable_type NOT NULL DEFAULT 'OTHER',
    loin_geometric     TEXT,
    loin_alphanumeric  TEXT,
    planned_date       DATE,
    actual_date        DATE,
    responsible        TEXT,
    cde_status         public.cde_status DEFAULT 'WIP' NOT NULL,
    cde_file_reference TEXT,
    bim_guid           TEXT,
    created_at         TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.deliverable_versions (
    id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    deliverable_id     UUID REFERENCES public.deliverables(id) ON DELETE CASCADE NOT NULL,
    version_label      TEXT NOT NULL,
    version_number     INTEGER NOT NULL,
    date               DATE NOT NULL,
    author             TEXT,
    comments           TEXT,
    cde_file_reference TEXT,
    cde_status         public.cde_status NOT NULL,
    created_at         TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tidp_constraints (
    id                     UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id             UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    deliverable_id         UUID REFERENCES public.deliverables(id) ON DELETE CASCADE,
    description            TEXT NOT NULL,
    type                   public.constraint_type NOT NULL,
    resolution_owner       TEXT,
    resolution_owner_email TEXT,
    commitment_date        DATE,
    status                 public.constraint_status DEFAULT 'OPEN' NOT NULL,
    closure_comment        TEXT,
    closed_date            DATE,
    created_at             TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.constraint_history (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    constraint_id   UUID REFERENCES public.tidp_constraints(id) ON DELETE CASCADE NOT NULL,
    history_label   TEXT,
    change_date     TIMESTAMPTZ DEFAULT now() NOT NULL,
    version_number  INTEGER,
    changed_by      TEXT,
    previous_status public.constraint_status,
    new_status      public.constraint_status NOT NULL,
    comments        TEXT,
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tidp_notification_settings (
    id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id    UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    setting_name  TEXT NOT NULL,
    days_before_due INTEGER NOT NULL DEFAULT 7,
    enabled       BOOLEAN DEFAULT true NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_task_teams_project      ON public.task_teams(project_id);
CREATE INDEX IF NOT EXISTS idx_tidps_project           ON public.tidps(project_id);
CREATE INDEX IF NOT EXISTS idx_tidps_task_team         ON public.tidps(task_team_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_tidp       ON public.deliverables(tidp_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_project    ON public.deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_milestone  ON public.deliverables(milestone_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_cde        ON public.deliverables(cde_status);
CREATE INDEX IF NOT EXISTS idx_constraints_project     ON public.tidp_constraints(project_id);
CREATE INDEX IF NOT EXISTS idx_constraints_deliverable ON public.tidp_constraints(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_constraint_history      ON public.constraint_history(constraint_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project      ON public.milestones(project_id);

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE public.organizations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nodes                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edges                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sot_mappings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cwp_master                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_views                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_teams                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tidps                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverables                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverable_versions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tidp_constraints            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.constraint_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tidp_notification_settings  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PATCH: ensure critical columns exist on pre-existing tables
-- (handles partial previous migrations where IF NOT EXISTS skipped creation)
-- ============================================================
ALTER TABLE public.projects          ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.projects          ADD COLUMN IF NOT EXISTS description      TEXT;
ALTER TABLE public.projects          ADD COLUMN IF NOT EXISTS stage            TEXT DEFAULT 'licitacion';
ALTER TABLE public.projects          ADD COLUMN IF NOT EXISTS active_modules   JSONB DEFAULT '{"cwp": false, "4d": false, "bim": false, "documents": false}'::jsonb;
ALTER TABLE public.projects          ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT timezone('utc', now());

ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.project_members   ADD COLUMN IF NOT EXISTS project_id    UUID REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.project_members   ADD COLUMN IF NOT EXISTS user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.project_members   ADD COLUMN IF NOT EXISTS module_access  JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.nodes             ADD COLUMN IF NOT EXISTS project_id     UUID REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.edges             ADD COLUMN IF NOT EXISTS project_id     UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Atomically sets a top-level key in projects.module_config
CREATE OR REPLACE FUNCTION public.merge_module_config(
  p_project_id UUID,
  p_key        TEXT,
  p_value      JSONB
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.projects
  SET module_config = jsonb_set(
    COALESCE(module_config, '{}'::jsonb),
    ARRAY[p_key],
    COALESCE(p_value, 'null'::jsonb),
    true
  )
  WHERE id = p_project_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.merge_module_config(UUID, TEXT, JSONB) TO authenticated;

-- Atomically sets a nested key inside projects.module_config->'bim_linker'
CREATE OR REPLACE FUNCTION public.set_bim_linker_key(
  p_project_id UUID,
  p_key        TEXT,
  p_value      JSONB
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.projects
  SET module_config = jsonb_set(
    COALESCE(module_config, '{}'::jsonb),
    ARRAY['bim_linker', p_key],
    COALESCE(p_value, 'null'::jsonb),
    true
  )
  WHERE id = p_project_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_bim_linker_key(UUID, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_organizations()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER AS $$
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_has_project_access(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid()
    UNION
    SELECT 1 FROM public.projects pr
    JOIN public.organization_members om ON om.organization_id = pr.organization_id
    WHERE pr.id = p_project_id AND om.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.user_is_project_admin(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid() AND pm.role = 'admin'
    UNION
    SELECT 1 FROM public.projects pr
    JOIN public.organization_members om ON om.organization_id = pr.organization_id
    WHERE pr.id = p_project_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.create_organization(
  org_name     TEXT,
  org_slug     TEXT,
  org_plan     TEXT DEFAULT 'starter',
  org_logo_url TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_org_id UUID;
BEGIN
  INSERT INTO public.organizations (name, slug, plan, logo_url)
  VALUES (org_name, org_slug, org_plan, org_logo_url)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, auth.uid(), 'owner');

  RETURN new_org_id;
END;
$$;

-- ============================================================
-- RLS POLICIES (drop-and-recreate for idempotency)
-- ============================================================

-- organizations
DROP POLICY IF EXISTS "Users can view their organizations"  ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations"      ON public.organizations;
CREATE POLICY "Users can view their organizations"  ON public.organizations FOR SELECT
    USING (id IN (SELECT public.user_organizations()));
CREATE POLICY "Users can create organizations"      ON public.organizations FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- organization_members
DROP POLICY IF EXISTS "Members can view other members" ON public.organization_members;
CREATE POLICY "Members can view other members" ON public.organization_members FOR SELECT
    USING (organization_id IN (SELECT public.user_organizations()));

-- projects
DROP POLICY IF EXISTS "Users can view projects in their orgs"   ON public.projects;
DROP POLICY IF EXISTS "Users can create projects in their orgs" ON public.projects;
DROP POLICY IF EXISTS "Users can update projects in their orgs" ON public.projects;
DROP POLICY IF EXISTS "Users can delete projects in their orgs" ON public.projects;
CREATE POLICY "Users can view projects in their orgs"   ON public.projects FOR SELECT
    USING (organization_id IN (SELECT public.user_organizations()));
CREATE POLICY "Users can create projects in their orgs" ON public.projects FOR INSERT
    WITH CHECK (organization_id IN (SELECT public.user_organizations()));
CREATE POLICY "Users can update projects in their orgs" ON public.projects FOR UPDATE
    USING (organization_id IN (SELECT public.user_organizations()));
CREATE POLICY "Users can delete projects in their orgs" ON public.projects FOR DELETE
    USING (organization_id IN (SELECT public.user_organizations()));

-- project_members
DROP POLICY IF EXISTS "Users can view project members if they belong to the org" ON public.project_members;
DROP POLICY IF EXISTS "Admins can manage project members"                        ON public.project_members;
CREATE POLICY "Users can view project members if they belong to the org"
    ON public.project_members FOR SELECT
    USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));
CREATE POLICY "Admins can manage project members"
    ON public.project_members FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            JOIN public.projects p ON p.organization_id = om.organization_id
            WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'owner') AND p.id = project_id
        )
        OR EXISTS (
            SELECT 1 FROM public.project_members pm
            WHERE pm.project_id = project_members.project_id AND pm.user_id = auth.uid() AND pm.role = 'admin'
        )
    );

-- nodes & edges
DROP POLICY IF EXISTS "Users have access to nodes via projects" ON public.nodes;
DROP POLICY IF EXISTS "Users have access to edges via projects" ON public.edges;
CREATE POLICY "Users have access to nodes via projects" ON public.nodes FOR ALL
    USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));
CREATE POLICY "Users have access to edges via projects" ON public.edges FOR ALL
    USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));

-- AWP tables
DROP POLICY IF EXISTS "Users have access to sot_mappings via projects" ON public.sot_mappings;
DROP POLICY IF EXISTS "Users have access to cwp_master via projects"   ON public.cwp_master;
DROP POLICY IF EXISTS "Users have access to custom_views via projects"  ON public.custom_views;
CREATE POLICY "Users have access to sot_mappings via projects" ON public.sot_mappings FOR ALL
    USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));
CREATE POLICY "Users have access to cwp_master via projects"   ON public.cwp_master FOR ALL
    USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));
CREATE POLICY "Users have access to custom_views via projects"  ON public.custom_views FOR ALL
    USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));

-- departments
DROP POLICY IF EXISTS "dept_select" ON public.departments;
DROP POLICY IF EXISTS "dept_insert" ON public.departments;
DROP POLICY IF EXISTS "dept_update" ON public.departments;
CREATE POLICY "dept_select" ON public.departments FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = departments.organization_id AND om.user_id = auth.uid()
    ));
CREATE POLICY "dept_insert" ON public.departments FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = departments.organization_id
          AND om.user_id = auth.uid() AND om.role IN ('owner','admin')
    ));
CREATE POLICY "dept_update" ON public.departments FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = departments.organization_id
          AND om.user_id = auth.uid() AND om.role IN ('owner','admin')
    ));

-- TIDP project-scoped tables (generated block)
DO $$
DECLARE
  t   TEXT;
  col TEXT;
BEGIN
  FOR t, col IN VALUES
    ('task_teams',                 'project_id'),
    ('milestones',                 'project_id'),
    ('tidps',                      'project_id'),
    ('deliverables',               'project_id'),
    ('tidp_constraints',           'project_id'),
    ('tidp_notification_settings', 'project_id')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%s', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%s', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%s', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%s', t, t);
    EXECUTE format('
      CREATE POLICY "%s_select" ON public.%s FOR SELECT
        USING (public.user_has_project_access(%I));
      CREATE POLICY "%s_insert" ON public.%s FOR INSERT
        WITH CHECK (public.user_has_project_access(%I));
      CREATE POLICY "%s_update" ON public.%s FOR UPDATE
        USING (public.user_has_project_access(%I));
      CREATE POLICY "%s_delete" ON public.%s FOR DELETE
        USING (public.user_is_project_admin(%I));
    ', t, t, col, t, t, col, t, t, col, t, t, col);
  END LOOP;
END $$;

-- deliverable_versions
DROP POLICY IF EXISTS "delver_select" ON public.deliverable_versions;
DROP POLICY IF EXISTS "delver_insert" ON public.deliverable_versions;
CREATE POLICY "delver_select" ON public.deliverable_versions FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.deliverables d
        WHERE d.id = deliverable_versions.deliverable_id
          AND public.user_has_project_access(d.project_id)
    ));
CREATE POLICY "delver_insert" ON public.deliverable_versions FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.deliverables d
        WHERE d.id = deliverable_versions.deliverable_id
          AND public.user_has_project_access(d.project_id)
    ));

-- constraint_history
DROP POLICY IF EXISTS "conhist_select" ON public.constraint_history;
DROP POLICY IF EXISTS "conhist_insert" ON public.constraint_history;
CREATE POLICY "conhist_select" ON public.constraint_history FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.tidp_constraints c
        WHERE c.id = constraint_history.constraint_id
          AND public.user_has_project_access(c.project_id)
    ));
CREATE POLICY "conhist_insert" ON public.constraint_history FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.tidp_constraints c
        WHERE c.id = constraint_history.constraint_id
          AND public.user_has_project_access(c.project_id)
    ));

-- ============================================================
-- STORAGE (supabase_additions.sql)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Logos publicly accessible"    ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload logos"  ON storage.objects;
DROP POLICY IF EXISTS "Users can update their logos" ON storage.objects;
CREATE POLICY "Logos publicly accessible"    ON storage.objects FOR SELECT
    USING (bucket_id = 'org-logos');
CREATE POLICY "Auth users can upload logos"  ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'org-logos' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update their logos" ON storage.objects FOR UPDATE
    USING (bucket_id = 'org-logos' AND auth.role() = 'authenticated');
