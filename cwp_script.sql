-- 6. Componentes del Módulo AWP (Migrados)
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
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(project_id, cwp_code)
);

ALTER TABLE public.cwp_master ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Users can manage cwp_master if they have project access" ON public.cwp_master FOR ALL USING (
        project_id IN (SELECT id FROM public.projects WHERE organization_id IN (SELECT public.user_organizations()))
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- RPC Function para Extractor de Excel Dinámico de AWP
CREATE OR REPLACE FUNCTION public.extract_cwp_combinations(
    p_entity_id UUID,
    p_cwp_col TEXT,
    p_desc_col TEXT DEFAULT NULL,
    p_disc_col TEXT DEFAULT NULL,
    p_ewp_col TEXT DEFAULT NULL,
    p_pwp_col TEXT DEFAULT NULL,
    p_area_col TEXT DEFAULT NULL,
    p_tags_col TEXT DEFAULT NULL
)
RETURNS TABLE (
    cwp_code TEXT,
    cwp_description TEXT,
    discipline TEXT,
    ewp_code TEXT,
    pwp_code TEXT,
    area TEXT,
    tags TEXT,
    row_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH extracted_data AS (
        SELECT 
            jsonb_array_elements(data)->>p_cwp_col AS cwp_code_extracted,
            CASE WHEN p_desc_col IS NOT NULL THEN jsonb_array_elements(data)->>p_desc_col ELSE NULL END AS cwp_description_extracted,
            CASE WHEN p_disc_col IS NOT NULL THEN jsonb_array_elements(data)->>p_disc_col ELSE NULL END AS discipline_extracted,
            CASE WHEN p_ewp_col IS NOT NULL THEN jsonb_array_elements(data)->>p_ewp_col ELSE NULL END AS ewp_code_extracted,
            CASE WHEN p_pwp_col IS NOT NULL THEN jsonb_array_elements(data)->>p_pwp_col ELSE NULL END AS pwp_code_extracted,
            CASE WHEN p_area_col IS NOT NULL THEN jsonb_array_elements(data)->>p_area_col ELSE NULL END AS area_extracted,
            CASE WHEN p_tags_col IS NOT NULL THEN jsonb_array_elements(data)->>p_tags_col ELSE NULL END AS tags_extracted
        FROM public.nodes
        WHERE id = p_entity_id
    )
    SELECT
        cwp_code_extracted AS cwp_code,
        MAX(cwp_description_extracted) AS cwp_description,
        MAX(discipline_extracted) AS discipline,
        MAX(ewp_code_extracted) AS ewp_code,
        MAX(pwp_code_extracted) AS pwp_code,
        MAX(area_extracted) AS area,
        MAX(tags_extracted) AS tags,
        COUNT(*) AS row_count
    FROM extracted_data
    WHERE cwp_code_extracted IS NOT NULL AND cwp_code_extracted <> ''
    GROUP BY cwp_code_extracted
    ORDER BY cwp_code_extracted;
END;
$function$;
