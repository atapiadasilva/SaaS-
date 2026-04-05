-- Supabase Multi-tenant SaaS SQL Schema

-- 1. Organizations Table
CREATE TABLE public.organizations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT, -- Almacenamiento local o S3 para el logo de la empresa
    plan TEXT DEFAULT 'starter', -- Planes: 'starter' (1 proy.), 'pro' (5 proy.), 'enterprise' (Ilimitado)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Organization Members (Junction table linking users to organizations)
CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE public.organization_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.org_role DEFAULT 'member' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(organization_id, user_id)
);

-- 3. Projects Table (Tenant-scoped entities)
CREATE TABLE public.projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    stage TEXT DEFAULT 'licitacion' NOT NULL,
    active_modules JSONB DEFAULT '{"cwp": false, "4d": false, "bim": false, "documents": false}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3.5. Project Members (Junction table linking users to projects with granular roles)
CREATE TYPE public.project_role AS ENUM ('admin', 'editor', 'viewer');

CREATE TABLE public.project_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.project_role DEFAULT 'viewer' NOT NULL,
    module_access JSONB DEFAULT '{}'::jsonb, -- e.g., {"cwp": "edit", "4d": "view"}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(project_id, user_id)
);

-- 4. Nodes / Data Elements (For the relational matrix)
CREATE TABLE public.nodes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT, -- Importado de AWP: Nombre del Excel o Nodo
    source_type TEXT DEFAULT 'excel',
    data_headers JSONB,
    type TEXT NOT NULL DEFAULT 'custom',
    data JSONB DEFAULT '{}'::jsonb NOT NULL,
    position_x FLOAT DEFAULT 0,
    position_y FLOAT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Relationships / Edges (Connecting nodes)
CREATE TABLE public.edges (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    source_node_id UUID REFERENCES public.nodes(id) ON DELETE CASCADE NOT NULL,
    target_node_id UUID REFERENCES public.nodes(id) ON DELETE CASCADE NOT NULL,
    source_column TEXT,
    target_column TEXT,
    relationship_type TEXT DEFAULT '1:N',
    label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ======================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ======================================================

-- Activar RLS en todas las tablas
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edges ENABLE ROW LEVEL SECURITY;

-- Función helper en schema PUBLIC (auth schema no tiene permisos de escritura)
CREATE OR REPLACE FUNCTION public.user_organizations()
RETURNS SETOF UUID AS $$
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Políticas para 'organizations'
CREATE POLICY "Users can view their organizations"
    ON public.organizations FOR SELECT
    USING (id IN (SELECT public.user_organizations()));

-- Políticas de 'organization_members'
CREATE POLICY "Members can view other members"
    ON public.organization_members FOR SELECT
    USING (organization_id IN (SELECT public.user_organizations()));

-- Políticas de 'projects'
CREATE POLICY "Users can view projects in their orgs"
    ON public.projects FOR SELECT
    USING (organization_id IN (SELECT public.user_organizations()));

CREATE POLICY "Users can create projects in their orgs"
    ON public.projects FOR INSERT
    WITH CHECK (organization_id IN (SELECT public.user_organizations()));

CREATE POLICY "Users can update projects in their orgs"
    ON public.projects FOR UPDATE
    USING (organization_id IN (SELECT public.user_organizations()));

CREATE POLICY "Users can delete projects in their orgs"
    ON public.projects FOR DELETE
    USING (organization_id IN (SELECT public.user_organizations()));

-- Políticas de 'project_members'
CREATE POLICY "Users can view project members if they belong to the org"
    ON public.project_members FOR SELECT
    USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));

CREATE POLICY "Admins can manage project members"
    ON public.project_members FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            JOIN public.projects p ON p.organization_id = om.organization_id
            WHERE om.user_id = auth.uid() 
            AND om.role IN ('admin', 'owner')
            AND p.id = project_id
        )
        OR 
        EXISTS (
            SELECT 1 FROM public.project_members pm 
            WHERE pm.project_id = project_members.project_id 
            AND pm.user_id = auth.uid() 
            AND pm.role = 'admin'
        )
    );

-- Políticas de 'nodes' & 'edges'
CREATE POLICY "Users have access to nodes via projects"
    ON public.nodes FOR ALL
    USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));

CREATE POLICY "Users have access to edges via projects"
    ON public.edges FOR ALL
    USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));
