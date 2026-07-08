-- ============================================================
-- MÓDULO MINING / AWP — Tablas completas
-- Correr DESPUÉS de supabase_schema.sql + supabase_awp_tables.sql
-- ============================================================

-- ============================================================
-- 0. Helpers reutilizables
-- ============================================================

-- Merge atómico de una clave dentro de projects.module_config (JSONB)
CREATE OR REPLACE FUNCTION public.merge_module_config(
  p_project_id UUID,
  p_key        TEXT,
  p_value      JSONB
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.projects
  SET module_config = COALESCE(module_config, '{}'::jsonb) || jsonb_build_object(p_key, p_value),
      updated_at = now()
  WHERE id = p_project_id;
END;
$$;

-- Agrega/actualiza una clave anidada dentro de projects.module_config[p_key][p_nested_key]
CREATE OR REPLACE FUNCTION public.set_bim_linker_key(
  p_project_id  UUID,
  p_key         TEXT,
  p_nested_key  TEXT,
  p_value       TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_nested JSONB;
BEGIN
  v_nested := COALESCE((SELECT module_config->p_key FROM public.projects WHERE id = p_project_id), '{}'::jsonb);
  v_nested := v_nested || jsonb_build_object(p_nested_key, p_value);
  PERFORM public.merge_module_config(p_project_id, p_key, v_nested);
END;
$$;

-- ============================================================
-- 1. Catálogo AWP: Disciplinas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_disciplinas (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  disciplina_cod  TEXT NOT NULL,
  disciplina_nombre TEXT,
  color           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, disciplina_cod)
);

-- ============================================================
-- 2. Catálogo AWP: CWA → CV → CWP (jerarquía de construcción)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_cwa (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  cwa_id      TEXT NOT NULL,
  cwa_nombre  TEXT,
  es_oficial  BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, cwa_id)
);

CREATE TABLE IF NOT EXISTS public.mining_cv (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  cv_id       TEXT NOT NULL,
  cv_nombre   TEXT,
  cwa_id      TEXT,
  es_oficial  BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, cv_id)
);

CREATE TABLE IF NOT EXISTS public.mining_cwp (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id          UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  cwp_id              TEXT NOT NULL,
  cwp_nombre          TEXT,
  disciplina          TEXT,
  disciplina_cod      TEXT,
  cwa_id              TEXT,
  cv_id               TEXT,
  ewp_id              TEXT,
  pwp_id              TEXT,
  alcance             TEXT,
  obra_tipo           TEXT,
  trabajo_tipo        TEXT,
  sitio               TEXT,
  tag_inicio          TEXT,
  tag_fin             TEXT,
  costo_oferta_clp    NUMERIC(18,2),
  fecha_inicio_plan   DATE,
  fecha_fin_plan      DATE,
  es_oficial          BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, cwp_id)
);

-- ============================================================
-- 3. SWP (System Work Package) — clasificación paralela a CWA/CV/CWP
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_swp (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  swp_id      TEXT NOT NULL,
  nombre_swp  TEXT,
  sistema     TEXT,
  es_oficial  BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, swp_id)
);

-- ============================================================
-- 4. PWP → CWP mapping (para vincular Partidas al CWP)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_pwp (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  pwp_id      TEXT NOT NULL,
  cwp_id      TEXT,
  nombre_pwp  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, pwp_id)
);

-- ============================================================
-- 5. Elementos del modelo 3D
--    sp3d_moniker es el identificador primario; puede venir de
--    distintas columnas según el proyecto (ver column_mapping en
--    projects.module_config).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_elementos (
  id                      UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id              UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  sp3d_moniker            TEXT NOT NULL,
  name                    TEXT,
  descripcion             TEXT,
  tipo_elemento           TEXT,

  -- Clasificación AWP (jerarquía principal)
  cwa_id                  TEXT,
  cv_id                   TEXT,
  cwp_id                  TEXT,
  cwp_arbol               TEXT,
  cwp_fuente              TEXT,

  -- Clasificación SWP (paralela)
  swp_id                  TEXT,

  -- Clasificación de disciplina / especialidad
  disciplina              TEXT,
  disciplina_modelo       TEXT,
  disciplina_arbol        TEXT,
  especialidad_cod        TEXT,
  especialidad_nombre     TEXT,
  categoria_constructiva  TEXT,

  -- Atributos de ubicación / sistema
  sitio                   TEXT,
  sector                  TEXT,
  area_unidad             TEXT,
  sistema_servicio        TEXT,

  -- Atributos de clasificación / estado
  obra_tipo               TEXT,
  obra_raw                TEXT,
  obra_target             TEXT,
  alcance                 TEXT,
  estado                  TEXT,
  item_o_adicional        TEXT,

  -- Validación
  validado                TEXT,
  motivo_no_valido        TEXT,

  -- Vínculos / referencias cruzadas
  vinculo_nivel           TEXT,
  vinculo_fuente          TEXT,
  categoria_enlace        TEXT,

  -- BIM / ingeniería
  codigo_bmp              TEXT,
  bmp_nombre              TEXT,
  wbs                     TEXT,
  ewp_id                  TEXT,
  iwp_id                  TEXT,
  comwp_id                TEXT,
  pwp_elemento            TEXT,

  -- Datos de material / instalación
  material                TEXT,
  especificacion          TEXT,
  tag_equipo              TEXT,
  tag_unificado           TEXT,

  -- Piping / civil
  pipeline_linea          TEXT,
  spool                   TEXT,
  pid                     TEXT,
  isometrico              TEXT,

  -- Timestamps
  created_at              TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at              TIMESTAMPTZ DEFAULT now() NOT NULL,

  UNIQUE(project_id, sp3d_moniker)
);

CREATE INDEX IF NOT EXISTS idx_mining_elementos_project    ON public.mining_elementos(project_id);
CREATE INDEX IF NOT EXISTS idx_mining_elementos_cwp        ON public.mining_elementos(project_id, cwp_id);
CREATE INDEX IF NOT EXISTS idx_mining_elementos_cwa        ON public.mining_elementos(project_id, cwa_id);
CREATE INDEX IF NOT EXISTS idx_mining_elementos_swp        ON public.mining_elementos(project_id, swp_id);
CREATE INDEX IF NOT EXISTS idx_mining_elementos_disciplina ON public.mining_elementos(project_id, disciplina);
CREATE INDEX IF NOT EXISTS idx_mining_elementos_moniker    ON public.mining_elementos(project_id, sp3d_moniker);

-- ============================================================
-- 6. Planos / Documentos vinculados a CWP
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_planos (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id         UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  cwp_id             TEXT,
  codigo_documento   TEXT NOT NULL,
  descripcion        TEXT,
  tipo               TEXT,
  revision           TEXT,
  url_archivo        TEXT,
  created_at         TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, codigo_documento)
);

-- ============================================================
-- 7. Partidas / Itemizado (vinculado a PWP → CWP)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_partidas (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  pwp_id          TEXT,
  codigo          TEXT,
  descripcion     TEXT,
  obra            TEXT,
  unidad          TEXT,
  cantidad        NUMERIC(18,4),
  pu_clp          NUMERIC(18,2),
  total_clp       NUMERIC(18,2),
  guid_elemento   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mining_partidas_project ON public.mining_partidas(project_id);
CREATE INDEX IF NOT EXISTS idx_mining_partidas_pwp     ON public.mining_partidas(project_id, pwp_id);

-- ============================================================
-- 8. Programa / Actividades de construcción
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_programa (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id       UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  fuente           TEXT DEFAULT 'P333',   -- 'P333', 'P6', etc.
  cod_actividad    TEXT,
  nombre_actividad TEXT,
  cwp_id           TEXT,
  hh               NUMERIC(14,2),
  cantidad         NUMERIC(14,4),
  unidad           TEXT,
  fecha_inicio     DATE,
  fecha_fin        DATE,
  duracion_dias    INTEGER,
  avance_plan      NUMERIC(5,2),
  avance_real      NUMERIC(5,2),
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, fuente, cod_actividad)
);

CREATE INDEX IF NOT EXISTS idx_mining_programa_project ON public.mining_programa(project_id);
CREATE INDEX IF NOT EXISTS idx_mining_programa_cwp     ON public.mining_programa(project_id, cwp_id);

-- ============================================================
-- 9. IWP (Installation Work Package)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_iwp (
  id                        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id                UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  iwp_id                    TEXT NOT NULL,
  cwp_id                    TEXT,
  descripcion               TEXT,
  hh_estimadas              NUMERIC(14,2),
  crew_size                 INTEGER,
  fecha_inicio_plan         DATE,
  fecha_fin_plan            DATE,
  duracion_dias             INTEGER,
  semana_ejecucion          TEXT,
  status                    TEXT DEFAULT 'planificado',
  fecha_ultima_actualizacion TIMESTAMPTZ DEFAULT now(),
  creado_por                TEXT,
  created_at                TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, iwp_id)
);

CREATE TABLE IF NOT EXISTS public.mining_iwp_actividad (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id          UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  iwp_id              TEXT NOT NULL,
  programa_id         UUID REFERENCES public.mining_programa(id) ON DELETE SET NULL,
  hh_asignadas_iwp    NUMERIC(14,2),
  cantidad_asignada   NUMERIC(14,4),
  unidad              TEXT,
  completado          BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.mining_iwp_constraint (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id   UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  iwp_id       TEXT NOT NULL,
  descripcion  TEXT NOT NULL,
  tipo         TEXT,
  responsable  TEXT,
  fecha_compromiso DATE,
  cleared      BOOLEAN DEFAULT FALSE,
  cleared_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.mining_iwp_progreso (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id        UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  iwp_id            TEXT NOT NULL,
  fecha             DATE NOT NULL,
  avance_porcentaje NUMERIC(5,2),
  hh_reales         NUMERIC(14,2),
  notas             TEXT,
  registrado_por    TEXT,
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 10. Revisión / Checklist de cobertura AWP
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_revision_estado (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id   UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  nivel        TEXT NOT NULL,   -- 'cwa' | 'cv' | 'cwp' | 'swp'
  codigo       TEXT NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'revisado' | 'con_problema'
  notas        TEXT,
  revisado_por TEXT,
  revisado_en  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, nivel, codigo)
);

-- ============================================================
-- 11. Log de cambios de clasificación (trazabilidad)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_cambios_log (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  sp3d_moniker    TEXT NOT NULL,
  campo           TEXT NOT NULL,    -- 'cwa_id' | 'cv_id' | 'cwp_id' | 'swp_id'
  valor_anterior  TEXT,
  valor_nuevo     TEXT,
  origen          TEXT,             -- 'revision_cwp', 'revision_cwa', etc.
  usuario_id      UUID,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mining_cambios_project ON public.mining_cambios_log(project_id);
CREATE INDEX IF NOT EXISTS idx_mining_cambios_moniker  ON public.mining_cambios_log(project_id, sp3d_moniker);

-- ============================================================
-- 12. Colores personalizados por CWP (para el visor 3D)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_colores (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  cwp_id      TEXT NOT NULL,
  color       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, cwp_id)
);

-- ============================================================
-- 13. Líneas y Equipos (para SWP / sistemas de proceso)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mining_awp_linea (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  swp_id      TEXT,
  linea_id    TEXT NOT NULL,
  descripcion TEXT,
  pid         TEXT,
  sistema     TEXT,
  subsistema  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, linea_id)
);

CREATE TABLE IF NOT EXISTS public.mining_awp_equipo (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  swp_id      TEXT,
  tag_equipo  TEXT NOT NULL,
  descripcion TEXT,
  sistema     TEXT,
  subsistema  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(project_id, tag_equipo)
);

-- ============================================================
-- 14. RLS — todas las tablas mining: acceso por proyecto
-- ============================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN VALUES
    ('mining_disciplinas'), ('mining_cwa'), ('mining_cv'), ('mining_cwp'),
    ('mining_swp'), ('mining_pwp'), ('mining_elementos'),
    ('mining_planos'), ('mining_partidas'), ('mining_programa'),
    ('mining_iwp'), ('mining_iwp_actividad'), ('mining_iwp_constraint'), ('mining_iwp_progreso'),
    ('mining_revision_estado'), ('mining_cambios_log'), ('mining_colores'),
    ('mining_awp_linea'), ('mining_awp_equipo')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('
      DO $inner$ BEGIN
        CREATE POLICY "%s_all" ON public.%I FOR ALL
          USING (project_id IN (
            SELECT id FROM public.projects
            WHERE organization_id IN (SELECT public.user_organizations())
          ));
      EXCEPTION WHEN duplicate_object THEN null; END $inner$;
    ', t, t);
  END LOOP;
END $$;

-- ============================================================
-- 15. RPC Functions
-- ============================================================

-- Cuenta de elementos por CWP (usada en /api/mining-data)
CREATE OR REPLACE FUNCTION public.mining_cwp_element_counts(p_project_id UUID)
RETURNS TABLE(cwp_id TEXT, n BIGINT) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT cwp_id, COUNT(*) AS n
  FROM public.mining_elementos
  WHERE project_id = p_project_id AND cwp_id IS NOT NULL
  GROUP BY cwp_id;
$$;

-- Bucket de elementos por nivel (CWA/CV/CWP/SWP) — usada en /api/mining-revision
CREATE OR REPLACE FUNCTION public.mining_elementos_nivel_buckets(
  p_project_id UUID,
  p_nivel      TEXT    -- 'cwa' | 'cv' | 'cwp' | 'swp'
)
RETURNS TABLE(codigo TEXT, n BIGINT) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF p_nivel = 'cwa' THEN
    RETURN QUERY SELECT cwa_id AS codigo, COUNT(*) AS n FROM public.mining_elementos
      WHERE project_id = p_project_id AND cwa_id IS NOT NULL GROUP BY cwa_id;
  ELSIF p_nivel = 'cv' THEN
    RETURN QUERY SELECT cv_id AS codigo, COUNT(*) AS n FROM public.mining_elementos
      WHERE project_id = p_project_id AND cv_id IS NOT NULL GROUP BY cv_id;
  ELSIF p_nivel = 'cwp' THEN
    RETURN QUERY SELECT cwp_id AS codigo, COUNT(*) AS n FROM public.mining_elementos
      WHERE project_id = p_project_id AND cwp_id IS NOT NULL GROUP BY cwp_id;
  ELSIF p_nivel = 'swp' THEN
    RETURN QUERY SELECT swp_id AS codigo, COUNT(*) AS n FROM public.mining_elementos
      WHERE project_id = p_project_id AND swp_id IS NOT NULL GROUP BY swp_id;
  END IF;
END;
$$;

-- Resumen SWP (sistemas → subsistemas con conteo de líneas, equipos y elementos)
-- Usada en /api/mining-sistemas
CREATE OR REPLACE FUNCTION public.mining_swp_resumen(p_project_id UUID)
RETURNS TABLE(
  sistema             TEXT,
  nombre_sistema      TEXT,
  swp_id              TEXT,
  nombre_swp          TEXT,
  n_lineas            BIGINT,
  n_equipos           BIGINT,
  n_elementos_modelo  BIGINT,
  pids                TEXT[]
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    s.sistema,
    s.sistema AS nombre_sistema,
    s.swp_id,
    s.nombre_swp,
    COUNT(DISTINCT l.linea_id) AS n_lineas,
    COUNT(DISTINCT e.tag_equipo) AS n_equipos,
    COUNT(DISTINCT el.sp3d_moniker) AS n_elementos_modelo,
    ARRAY_AGG(DISTINCT l.pid) FILTER (WHERE l.pid IS NOT NULL) AS pids
  FROM public.mining_swp s
  LEFT JOIN public.mining_awp_linea l
    ON l.project_id = s.project_id AND l.swp_id = s.swp_id
  LEFT JOIN public.mining_awp_equipo e
    ON e.project_id = s.project_id AND e.swp_id = s.swp_id
  LEFT JOIN public.mining_elementos el
    ON el.project_id = s.project_id AND el.swp_id = s.swp_id
  WHERE s.project_id = p_project_id
  GROUP BY s.sistema, s.swp_id, s.nombre_swp
  ORDER BY s.sistema, s.swp_id;
$$;

-- Filtros disponibles para mining_elementos (valores únicos por columna)
-- Usada en /api/mining-elementos/filtros
CREATE OR REPLACE FUNCTION public.mining_elementos_filtros(p_project_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'disciplinas',   (SELECT jsonb_agg(DISTINCT disciplina ORDER BY disciplina)   FROM public.mining_elementos WHERE project_id = p_project_id AND disciplina IS NOT NULL),
    'sectores',      (SELECT jsonb_agg(DISTINCT sector ORDER BY sector)           FROM public.mining_elementos WHERE project_id = p_project_id AND sector IS NOT NULL),
    'especialidades',(SELECT jsonb_agg(DISTINCT especialidad_cod ORDER BY especialidad_cod) FROM public.mining_elementos WHERE project_id = p_project_id AND especialidad_cod IS NOT NULL),
    'categorias',    (SELECT jsonb_agg(DISTINCT categoria_constructiva ORDER BY categoria_constructiva) FROM public.mining_elementos WHERE project_id = p_project_id AND categoria_constructiva IS NOT NULL),
    'sitios',        (SELECT jsonb_agg(DISTINCT sitio ORDER BY sitio)             FROM public.mining_elementos WHERE project_id = p_project_id AND sitio IS NOT NULL),
    'sistemas',      (SELECT jsonb_agg(DISTINCT sistema_servicio ORDER BY sistema_servicio) FROM public.mining_elementos WHERE project_id = p_project_id AND sistema_servicio IS NOT NULL),
    'obras_tipo',    (SELECT jsonb_agg(DISTINCT obra_tipo ORDER BY obra_tipo)     FROM public.mining_elementos WHERE project_id = p_project_id AND obra_tipo IS NOT NULL),
    'estados',       (SELECT jsonb_agg(DISTINCT estado ORDER BY estado)           FROM public.mining_elementos WHERE project_id = p_project_id AND estado IS NOT NULL)
  );
$$;

-- Salud del proyecto: cobertura de datos por entidad (para el Health Dashboard)
CREATE OR REPLACE FUNCTION public.project_data_health(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_result JSONB := '{}'::JSONB;
  v_total_elementos BIGINT;
  v_con_cwp BIGINT;
  v_con_guid BIGINT;
  v_con_disc BIGINT;
  v_total_cwp BIGINT;
  v_total_partidas BIGINT;
  v_total_planos BIGINT;
  v_total_programa BIGINT;
  v_total_iwp BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total_elementos FROM public.mining_elementos WHERE project_id = p_project_id;
  SELECT COUNT(*) INTO v_con_cwp FROM public.mining_elementos WHERE project_id = p_project_id AND cwp_id IS NOT NULL AND cwp_id != '';
  SELECT COUNT(*) INTO v_con_guid FROM public.mining_elementos WHERE project_id = p_project_id AND sp3d_moniker IS NOT NULL AND sp3d_moniker != '';
  SELECT COUNT(*) INTO v_con_disc FROM public.mining_elementos WHERE project_id = p_project_id AND disciplina IS NOT NULL AND disciplina != '';
  SELECT COUNT(*) INTO v_total_cwp FROM public.mining_cwp WHERE project_id = p_project_id;
  SELECT COUNT(*) INTO v_total_partidas FROM public.mining_partidas WHERE project_id = p_project_id;
  SELECT COUNT(*) INTO v_total_planos FROM public.mining_planos WHERE project_id = p_project_id;
  SELECT COUNT(*) INTO v_total_programa FROM public.mining_programa WHERE project_id = p_project_id;
  SELECT COUNT(*) INTO v_total_iwp FROM public.mining_iwp WHERE project_id = p_project_id;

  RETURN jsonb_build_object(
    'elementos', jsonb_build_object(
      'total', v_total_elementos,
      'con_cwp', v_con_cwp,
      'con_guid', v_con_guid,
      'con_disciplina', v_con_disc,
      'pct_cwp', CASE WHEN v_total_elementos > 0 THEN ROUND(100.0 * v_con_cwp / v_total_elementos, 1) ELSE 0 END,
      'pct_guid', CASE WHEN v_total_elementos > 0 THEN ROUND(100.0 * v_con_guid / v_total_elementos, 1) ELSE 0 END,
      'pct_disciplina', CASE WHEN v_total_elementos > 0 THEN ROUND(100.0 * v_con_disc / v_total_elementos, 1) ELSE 0 END
    ),
    'cwp',      jsonb_build_object('total', v_total_cwp),
    'partidas', jsonb_build_object('total', v_total_partidas),
    'planos',   jsonb_build_object('total', v_total_planos),
    'programa', jsonb_build_object('total', v_total_programa),
    'iwp',      jsonb_build_object('total', v_total_iwp)
  );
END;
$$;

-- ============================================================
-- 16. Agregar columnas a projects para soportar proyectos externos
--     sin hardcodear en project-constants.ts
-- ============================================================
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS external_code TEXT,
  ADD COLUMN IF NOT EXISTS module_config JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_projects_external_code ON public.projects(external_code);
