-- Tablas Adicionales para el Módulo AWP

-- 1. sot_mappings: Persiste el mapeo de columnas de Excel a campos maestros de CWP
CREATE TABLE IF NOT EXISTS public.sot_mappings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    master_key TEXT NOT NULL,
    source_entity_id UUID REFERENCES public.nodes(id) ON DELETE CASCADE NOT NULL,
    source_attribute_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(project_id, master_key)
);

-- 2. cwp_master: Catálogo centralizado de Paquetes de Trabajo
CREATE TABLE IF NOT EXISTS public.cwp_master (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    cwp_code TEXT NOT NULL,
    cwp_description TEXT,
    discipline TEXT,
    ewp_code TEXT,
    pwp_code TEXT,
    area TEXT,
    tags TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(project_id, cwp_code)
);

-- 3. custom_views: Vistas personalizadas de la Super Tabla
CREATE TABLE IF NOT EXISTS public.custom_views (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    entity_id UUID REFERENCES public.nodes(id) ON DELETE CASCADE,
    columns JSONB DEFAULT '[]'::jsonb,
    filter_key TEXT,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    definition JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.sot_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cwp_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_views ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad (Basadas en pertenencia al proyecto/org)
CREATE POLICY "Users have access to sot_mappings via projects" ON public.sot_mappings FOR ALL USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));
CREATE POLICY "Users have access to cwp_master via projects" ON public.cwp_master FOR ALL USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));
CREATE POLICY "Users have access to custom_views via projects" ON public.custom_views FOR ALL USING (project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations())));
