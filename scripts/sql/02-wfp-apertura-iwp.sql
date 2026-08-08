-- ─────────────────────────────────────────────────────────────────────────────
-- APLICADA el 2026-08-02 en el proyecto lsoesbsrlfingfckozsq
-- (migración `wfp_apertura_iwp`). Se conserva como registro.
-- Ver también 03-iwp-partida-llave-bmp.sql, que la completa.
--
-- WFP · Apertura de CWP en IWP (rutina de Pull Planning)
--
-- El corazón del Workface Planning: tomar un CWP validado y quebrarlo en paquetes
-- de instalación que una sola cuadrilla cierre dentro de un ciclo de turno.
--
-- Lo que faltaba en la base para poder hacerlo:
--
--   mining_turno        el régimen de turno del proyecto (7x7, 14x14, 6x1…). Es lo
--                       que convierte HH en días y en personas. Hay muchos y cambian
--                       por contrato, así que vive como dato, no como constante.
--   mining_cuadrilla    la cuadrilla tipo por disciplina. Su capacidad por ciclo
--                       (personas × horas/día × días de trabajo) ES el tamaño
--                       objetivo del IWP — no un número mágico de 1.000 HH.
--   mining_iwp_partida  las cantidades del itemizado que cada IWP se lleva. Sin esto
--                       el banco del CWP no se descuenta y la apertura es decorativa.
--
-- Más las columnas que el IWP necesita para ser un paquete real y no un formulario:
-- qué cuadrilla lo ejecuta, en qué turno, en qué orden y con qué límites de batería.
--
-- Aplicar con el MCP de Supabase (migración `wfp_apertura_iwp`) o en el SQL editor
-- del proyecto lsoesbsrlfingfckozsq. Es idempotente: se puede correr dos veces.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Régimen de turno ──────────────────────────────────────────────────────
-- hh_ciclo_persona = dias_trabajo × horas_dia. Un 14x14 a 11 h da 154 HH por
-- persona por ciclo; un 7x7 a 12 h da 84. De ahí sale todo lo demás.
CREATE TABLE IF NOT EXISTS public.mining_turno (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id     UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  codigo         TEXT NOT NULL,
  nombre         TEXT,
  dias_trabajo   INTEGER NOT NULL CHECK (dias_trabajo > 0),
  dias_descanso  INTEGER NOT NULL DEFAULT 0 CHECK (dias_descanso >= 0),
  horas_dia      NUMERIC NOT NULL CHECK (horas_dia > 0),
  es_default     BOOLEAN NOT NULL DEFAULT FALSE,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, codigo)
);

COMMENT ON TABLE public.mining_turno IS
  'Regímenes de turno del proyecto (7x7, 14x14, 6x1…). Convierten HH en días y personas.';
COMMENT ON COLUMN public.mining_turno.dias_trabajo IS
  'Días efectivamente trabajados del ciclo. Es el plazo máximo en que un IWP debe cerrarse.';

-- ── 2. Cuadrillas tipo ───────────────────────────────────────────────────────
-- composicion: [{"rol":"Capataz","cantidad":1}, {"rol":"Soldador","cantidad":4}, …]
-- n_personas se mantiene aparte porque se puede declarar sin desglosar los roles.
CREATE TABLE IF NOT EXISTS public.mining_cuadrilla (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id           UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  codigo               TEXT NOT NULL,
  nombre               TEXT,
  disciplina_cod       TEXT,
  composicion          JSONB NOT NULL DEFAULT '[]'::jsonb,
  n_personas           INTEGER NOT NULL DEFAULT 0 CHECK (n_personas >= 0),
  turno_id             UUID REFERENCES public.mining_turno(id) ON DELETE SET NULL,
  factor_productividad NUMERIC NOT NULL DEFAULT 1.0 CHECK (factor_productividad > 0),
  activa               BOOLEAN NOT NULL DEFAULT TRUE,
  observacion          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, codigo)
);

COMMENT ON TABLE public.mining_cuadrilla IS
  'Cuadrillas tipo por disciplina. Su capacidad por ciclo de turno define el tamaño objetivo del IWP.';
COMMENT ON COLUMN public.mining_cuadrilla.factor_productividad IS
  'Ajuste al rendimiento teórico del itemizado. 0.85 = la cuadrilla rinde 15% menos que la base de M&P.';

CREATE INDEX IF NOT EXISTS idx_cuadrilla_project_disc
  ON public.mining_cuadrilla (project_id, disciplina_cod) WHERE activa;

-- ── 3. Cantidades que se lleva cada IWP ──────────────────────────────────────
-- Es la contraparte de mining_iwp_actividad: aquélla vincula el IWP al programa,
-- ésta al itemizado. El saldo del CWP = banco de cantidades − suma de esta tabla.
CREATE TABLE IF NOT EXISTS public.mining_iwp_partida (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id         UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  iwp_id             TEXT NOT NULL,
  origen             TEXT NOT NULL DEFAULT 'itemizado',  -- 'mc' | 'itemizado'
  item               TEXT NOT NULL,
  descripcion        TEXT,
  unidad             TEXT,
  cantidad_asignada  NUMERIC NOT NULL DEFAULT 0,
  hh_unidad          NUMERIC,
  hh_asignadas       NUMERIC NOT NULL DEFAULT 0,
  cantidad_ejecutada NUMERIC NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, iwp_id)
    REFERENCES public.mining_iwp (project_id, iwp_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.mining_iwp_partida IS
  'Cantidades del itemizado/MC asignadas a un IWP. Lo que se descuenta del banco del CWP.';
COMMENT ON COLUMN public.mining_iwp_partida.hh_unidad IS
  'Rendimiento HH/unidad con el que se calcularon las HH al momento de aperturar. Se congela.';

CREATE INDEX IF NOT EXISTS idx_iwp_partida_iwp
  ON public.mining_iwp_partida (project_id, iwp_id);
CREATE INDEX IF NOT EXISTS idx_iwp_partida_item
  ON public.mining_iwp_partida (project_id, item);

-- ── 4. El IWP como paquete ejecutable ────────────────────────────────────────
ALTER TABLE public.mining_iwp
  ADD COLUMN IF NOT EXISTS cuadrilla_id      UUID REFERENCES public.mining_cuadrilla(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS turno_id          UUID REFERENCES public.mining_turno(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS secuencia         INTEGER,
  ADD COLUMN IF NOT EXISTS takt_dias         NUMERIC,
  ADD COLUMN IF NOT EXISTS limites_bateria   TEXT,
  ADD COLUMN IF NOT EXISTS origen_apertura   TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS estrategia_quiebre TEXT;

COMMENT ON COLUMN public.mining_iwp.secuencia IS
  'Orden de ejecución dentro del CWP. Define la cascada de fechas y la línea de balance.';
COMMENT ON COLUMN public.mining_iwp.limites_bateria IS
  'Paso 5 del Pull Planning: hasta dónde llega este IWP y dónde empieza el siguiente.';
COMMENT ON COLUMN public.mining_iwp.origen_apertura IS
  '''manual'' = creado a mano; ''asistente'' = salió de la rutina de apertura del CWP.';

-- ── 5. RLS multi-tenant (misma política que el resto de mining_*) ────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mining_turno', 'mining_cuadrilla', 'mining_iwp_partida']
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

-- ── 6. Semilla de turnos habituales en minería chilena ───────────────────────
-- Solo para proyectos que aún no tengan ninguno. El 4x3 (6 días × 11 h) es el que
-- ya asumía /api/mining-recursos, así que queda como default para no cambiar cifras.
INSERT INTO public.mining_turno (project_id, codigo, nombre, dias_trabajo, dias_descanso, horas_dia, es_default)
SELECT p.id, v.codigo, v.nombre, v.dias_trabajo, v.dias_descanso, v.horas_dia, v.es_default
FROM public.projects p
CROSS JOIN (VALUES
  ('6X1',   'Semanal 6×1 · 11 h',  6,  1, 11, TRUE),
  ('7X7',   'Turno 7×7 · 12 h',    7,  7, 12, FALSE),
  ('14X14', 'Turno 14×14 · 11 h', 14, 14, 11, FALSE),
  ('10X10', 'Turno 10×10 · 11 h', 10, 10, 11, FALSE),
  ('4X3',   'Turno 4×3 · 10 h',    4,  3, 10, FALSE)
) AS v(codigo, nombre, dias_trabajo, dias_descanso, horas_dia, es_default)
WHERE NOT EXISTS (
  SELECT 1 FROM public.mining_turno t WHERE t.project_id = p.id
)
ON CONFLICT (project_id, codigo) DO NOTHING;
