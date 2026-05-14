-- ============================================================
-- SUPABASE ADDITIONS — Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Función atómica para crear organización + agregar al creador como owner
--    (Se ejecuta con SECURITY DEFINER para pasar el RLS)
CREATE OR REPLACE FUNCTION public.create_organization(
  org_name     TEXT,
  org_slug     TEXT,
  org_plan     TEXT DEFAULT 'starter',
  org_logo_url TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Insertar la organización
  INSERT INTO public.organizations (name, slug, plan, logo_url)
  VALUES (org_name, org_slug, org_plan, org_logo_url)
  RETURNING id INTO new_org_id;

  -- Agregar al usuario actual como owner
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, auth.uid(), 'owner');

  RETURN new_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Política INSERT para organizations (necesaria para que la función funcione)
--    La función usa SECURITY DEFINER, así que en realidad no es necesaria,
--    pero la dejamos por claridad y para futuros usos directos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organizations' AND policyname = 'Users can create organizations'
  ) THEN
    CREATE POLICY "Users can create organizations"
      ON public.organizations FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END
$$;

-- 3. Storage bucket para logos de organizaciones
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Logos publicly accessible'
  ) THEN
    CREATE POLICY "Logos publicly accessible"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'org-logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Auth users can upload logos'
  ) THEN
    CREATE POLICY "Auth users can upload logos"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'org-logos' AND auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Users can update their logos'
  ) THEN
    CREATE POLICY "Users can update their logos"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'org-logos' AND auth.role() = 'authenticated');
  END IF;
END
$$;

-- 4. Habilitar el envío de magic links desde localhost (desarrollo)
--    En Supabase Dashboard > Authentication > URL Configuration:
--    Agregar http://localhost:3000/auth/callback en "Redirect URLs"

-- ============================================================
-- RPCs para module_config (Vistas 3D / BIM Linker)
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- 5. merge_module_config: actualiza UN campo top-level de module_config
--    Uso: RPC('merge_module_config', { p_project_id, p_key, p_value })
CREATE OR REPLACE FUNCTION public.merge_module_config(
  p_project_id UUID,
  p_key        TEXT,
  p_value      JSONB
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.projects
  SET module_config = COALESCE(module_config, '{}') || jsonb_build_object(p_key, p_value)
  WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. set_bim_linker_key: actualiza UN campo dentro de module_config->'bim_linker'
--    Atómico — una sola query, sin leer antes. Ideal para guardar savedViews rápido.
--    Uso: RPC('set_bim_linker_key', { p_project_id, p_key, p_value })
CREATE OR REPLACE FUNCTION public.set_bim_linker_key(
  p_project_id UUID,
  p_key        TEXT,
  p_value      JSONB
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.projects
  SET module_config = jsonb_set(
    COALESCE(module_config, '{}'),
    ARRAY['bim_linker', p_key],
    COALESCE(p_value, 'null'::jsonb),
    true   -- create_missing = true
  )
  WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
