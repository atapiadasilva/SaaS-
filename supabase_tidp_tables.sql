-- ============================================================
-- MÓDULO TIDP (Hilo Digital / ISO 19650-2)
-- Correr en Supabase SQL Editor después de supabase_schema.sql
-- ============================================================

-- ENUMS

CREATE TYPE public.tidp_discipline AS ENUM (
  'Oficina Técnica',
  'Terreno',
  'Calidad',
  'Medio Ambiente',
  'Prevención de Riesgos',
  'Equipos',
  'Recursos Humanos',
  'Administración',
  'Contratos',
  'Bodega',
  'Topografía',
  'Laboratorio'
);

CREATE TYPE public.tidp_status AS ENUM ('DRAFT', 'CURRENT', 'SUPERSEDED');

CREATE TYPE public.deliverable_type AS ENUM (
  'DRAWING', 'SPECIFICATION', 'BIM_MODEL', 'SCHEDULE',
  'REPORT', 'PROCEDURE', 'CERTIFICATE', 'OTHER'
);

CREATE TYPE public.cde_status AS ENUM ('WIP', 'SHARED', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE public.constraint_type AS ENUM (
  'ENGINEERING', 'MATERIALS', 'EQUIPMENT', 'LABOR', 'SAFETY', 'PREREQUISITE'
);

CREATE TYPE public.constraint_status AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

CREATE TYPE public.project_phase AS ENUM (
  'Diseño', 'Construcción', 'Comisionamiento', 'Operación'
);

-- ============================================================
-- 1. DEPARTMENTS (por organización, reutilizables entre proyectos)
-- ============================================================
CREATE TABLE public.departments (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL,
  leader_role   TEXT,
  scope         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(organization_id, code)
);

-- ============================================================
-- 2. TASK TEAMS (por proyecto)
-- ============================================================
CREATE TABLE public.task_teams (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id       UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  department_id    UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  discipline       public.tidp_discipline,
  leader_name      TEXT,
  leader_email     TEXT,
  client_counterpart TEXT,
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 3. MILESTONES (hitos del proyecto)
-- ============================================================
CREATE TABLE public.milestones (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  code        TEXT NOT NULL,
  description TEXT NOT NULL,
  target_date DATE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, code)
);

-- ============================================================
-- 4. TIDPs
-- ============================================================
CREATE TABLE public.tidps (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  task_team_id    UUID REFERENCES public.task_teams(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  issue_date      DATE,
  version         TEXT NOT NULL DEFAULT '1.0',
  author          TEXT,
  status          public.tidp_status DEFAULT 'DRAFT' NOT NULL,
  replaces_tidp_id UUID REFERENCES public.tidps(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, code, version)
);

-- ============================================================
-- 5. DELIVERABLES (entregables de información)
-- ============================================================
CREATE TABLE public.deliverables (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tidp_id             UUID REFERENCES public.tidps(id) ON DELETE CASCADE NOT NULL,
  project_id          UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  milestone_id        UUID REFERENCES public.milestones(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  iso_code            TEXT NOT NULL,           -- Código ISO 19650
  type                public.deliverable_type NOT NULL DEFAULT 'OTHER',
  loin_geometric      TEXT,                    -- e.g., "LOD 300"
  loin_alphanumeric   TEXT,
  planned_date        DATE,
  actual_date         DATE,
  responsible         TEXT,
  cde_status          public.cde_status DEFAULT 'WIP' NOT NULL,
  cde_file_reference  TEXT,
  bim_guid            TEXT,                    -- GUID IFC del elemento BIM vinculado
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 6. DELIVERABLE VERSIONS (historial de versiones)
-- ============================================================
CREATE TABLE public.deliverable_versions (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  deliverable_id    UUID REFERENCES public.deliverables(id) ON DELETE CASCADE NOT NULL,
  version_label     TEXT NOT NULL,
  version_number    INTEGER NOT NULL,
  date              DATE NOT NULL,
  author            TEXT,
  comments          TEXT,
  cde_file_reference TEXT,
  cde_status        public.cde_status NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 7. CONSTRAINTS (restricciones sobre entregables)
-- ============================================================
CREATE TABLE public.tidp_constraints (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id            UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  deliverable_id        UUID REFERENCES public.deliverables(id) ON DELETE CASCADE,
  description           TEXT NOT NULL,
  type                  public.constraint_type NOT NULL,
  resolution_owner      TEXT,
  resolution_owner_email TEXT,
  commitment_date       DATE,
  status                public.constraint_status DEFAULT 'OPEN' NOT NULL,
  closure_comment       TEXT,
  closed_date           DATE,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 8. CONSTRAINT HISTORY (auditoría de cambios de estado)
-- ============================================================
CREATE TABLE public.constraint_history (
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

-- ============================================================
-- 9. NOTIFICATION SETTINGS
-- ============================================================
CREATE TABLE public.tidp_notification_settings (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  setting_name    TEXT NOT NULL,
  days_before_due INTEGER NOT NULL DEFAULT 7,
  enabled         BOOLEAN DEFAULT true NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_task_teams_project    ON public.task_teams(project_id);
CREATE INDEX idx_tidps_project         ON public.tidps(project_id);
CREATE INDEX idx_tidps_task_team       ON public.tidps(task_team_id);
CREATE INDEX idx_deliverables_tidp     ON public.deliverables(tidp_id);
CREATE INDEX idx_deliverables_project  ON public.deliverables(project_id);
CREATE INDEX idx_deliverables_milestone ON public.deliverables(milestone_id);
CREATE INDEX idx_deliverables_cde      ON public.deliverables(cde_status);
CREATE INDEX idx_constraints_project   ON public.tidp_constraints(project_id);
CREATE INDEX idx_constraints_deliverable ON public.tidp_constraints(deliverable_id);
CREATE INDEX idx_constraint_history    ON public.constraint_history(constraint_id);
CREATE INDEX idx_milestones_project    ON public.milestones(project_id);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE public.departments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_teams                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tidps                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverables               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverable_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tidp_constraints           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.constraint_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tidp_notification_settings ENABLE ROW LEVEL SECURITY;

-- Helper: el usuario pertenece a la organización del proyecto
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

-- Helper: el usuario es admin del proyecto u org
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

-- Departments: acceso por org membership
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

-- Task Teams, TIDPs, Milestones, Deliverables, etc.: acceso por project
DO $$
DECLARE
  t TEXT;
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

-- Deliverable versions y constraint history: acceso vía join
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
