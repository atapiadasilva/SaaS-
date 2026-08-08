-- ─────────────────────────────────────────────────────────────────────────────
-- APLICADA el 2026-08-04 en el proyecto lsoesbsrlfingfckozsq
-- (migraciones `mesa_apertura_borrador` y `mesa_frentes_incluidos`). Se conserva como registro.
--
-- La selección de frentes es **opt-in** (`claves_incluidas`, vacío = nada elegido). Con
-- opt-out, no elegir era elegir el CWP completo, y eso invita a quebrar los 26 frentes de
-- una sentada — justo lo que la rutina de Pull Planning no hace: una sesión abre una tajada
-- y la siguiente abre otra.
--
-- Mesa de Trabajo · la sesión de Pull Planning como dato
--
-- El asistente de apertura era lineal: cuatro pasos hacia adelante y al final 56 paquetes
-- que nadie alcanzó a tocar uno por uno. Una sesión de Pull Planning real no funciona así —
-- el planificador prueba una estrategia, la descarta, fusiona dos paquetes chicos, divide
-- uno grande, renombra, corre fechas, y vuelve atrás. Eso necesita un borrador que dure más
-- que un modal y que dos personas puedan mirar a la vez.
--
--   mining_apertura_sesion    la sesión abierta sobre un CWP y sus parámetros de quiebre.
--                             Una sola abierta por CWP: si dos personas entran a la mesa,
--                             están editando lo mismo, que es justamente lo que se quiere
--                             en una sesión de planificación.
--   mining_iwp_borrador       cada paquete propuesto, con sus cantidades. Al publicar se
--                             convierte en mining_iwp + mining_iwp_partida.
--
-- `editado` es la bandera que hace que la mesa sea usable: al recalcular con otros
-- parámetros, los paquetes que una persona tocó a mano se respetan y sólo se regeneran los
-- que venían del motor. Sin eso, cambiar el objetivo de HH borraría media hora de trabajo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mining_apertura_sesion (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cwp_id              TEXT NOT NULL,
  estado              TEXT NOT NULL DEFAULT 'ABIERTA'
                        CHECK (estado IN ('ABIERTA', 'PUBLICADA', 'DESCARTADA')),
  -- Parámetros del quiebre. Son del ribbon de la mesa, no de un paso de asistente.
  cuadrilla_id        UUID REFERENCES public.mining_cuadrilla(id) ON DELETE SET NULL,
  turno_id            UUID REFERENCES public.mining_turno(id) ON DELETE SET NULL,
  hh_objetivo         NUMERIC,
  estrategia          TEXT NOT NULL DEFAULT 'hh',
  dimension_zona      TEXT,
  fecha_inicio        DATE,
  cuadrillas_paralelo INTEGER NOT NULL DEFAULT 1 CHECK (cuadrillas_paralelo > 0),
  claves_incluidas    JSONB NOT NULL DEFAULT '[]'::jsonb,
  abierta_por         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mining_apertura_sesion IS
  'Sesión de Pull Planning sobre un CWP: los parámetros del quiebre mientras se refina.';

-- Una sola sesión viva por CWP. Las publicadas y descartadas quedan como historia.
CREATE UNIQUE INDEX IF NOT EXISTS idx_apertura_sesion_abierta
  ON public.mining_apertura_sesion (project_id, cwp_id) WHERE estado = 'ABIERTA';

CREATE TABLE IF NOT EXISTS public.mining_iwp_borrador (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sesion_id          UUID NOT NULL REFERENCES public.mining_apertura_sesion(id) ON DELETE CASCADE,
  project_id         UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  secuencia          INTEGER NOT NULL,
  nombre             TEXT,
  limites_bateria    TEXT,
  grupo              TEXT,
  cuadrilla_id       UUID REFERENCES public.mining_cuadrilla(id) ON DELETE SET NULL,
  fecha_inicio_plan  DATE,
  fecha_fin_plan     DATE,
  dias               INTEGER,
  hh                 NUMERIC NOT NULL DEFAULT 0,
  -- [{clave,item,partida_bmp,descripcion,unidad,cantidad,hh_unidad,hh}]
  partidas           JSONB NOT NULL DEFAULT '[]'::jsonb,
  editado            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mining_iwp_borrador IS
  'Paquete propuesto dentro de una sesión de apertura. Al publicar pasa a mining_iwp + mining_iwp_partida.';
COMMENT ON COLUMN public.mining_iwp_borrador.editado IS
  'Lo tocó una persona. Al recalcular con otros parámetros se conserva en vez de regenerarse.';

CREATE INDEX IF NOT EXISTS idx_iwp_borrador_sesion
  ON public.mining_iwp_borrador (sesion_id, secuencia);

-- ── RLS multi-tenant (misma política que el resto de mining_*) ───────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mining_apertura_sesion', 'mining_iwp_borrador']
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
