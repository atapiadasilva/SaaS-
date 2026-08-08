-- ─────────────────────────────────────────────────────────────────────────────
-- APLICADA el 2026-08-02 en el proyecto lsoesbsrlfingfckozsq
-- (migración `wfp_iwp_partida_llave_bmp`). Se conserva como registro.
--
-- Completa 02-wfp-apertura-iwp.sql: la línea del banco de cantidades no es "un item"
-- sino un item dentro de una partida del programa.
--
-- Salió de mirar el dato real. En el CWP 312101.D001 el item 3.1.38 aparece cuatro veces,
-- una por elemento físico:
--
--   3.1.38  P333-…-41-0023  Moldaje  - Fundación Anillo Exterior (Anillo C)     331 m³
--   3.1.38  P333-…-42-0011  Hormigón - Fundación Núcleo (Anillo A)              205 m³
--   3.1.38  P333-…-42-0017  Hormigón - Fundación Anillo Intermedio (Anillo B)   871 m³
--   3.1.38  P333-…-42-0024  Hormigón - Fundación Anillo Exterior (Anillo C)   1.384 m³
--
-- Agregarlas por item las convertiría en una sola línea de 2.792 m³ con la descripción de
-- la primera, y el quiebre saldría ciego a los frentes. Manteniéndolas separadas, cada
-- línea del banco ya es un frente de trabajo: los IWP salen con nombres que un capataz
-- reconoce y el descuento se hace contra el frente correcto.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mining_iwp_partida
  ADD COLUMN IF NOT EXISTS partida_bmp TEXT;

COMMENT ON COLUMN public.mining_iwp_partida.partida_bmp IS
  'Partida del programa a la que pertenece la cantidad. Junto con item forma la llave del descuento contra el banco del CWP.';

DROP INDEX IF EXISTS public.idx_iwp_partida_item;
CREATE INDEX IF NOT EXISTS idx_iwp_partida_llave
  ON public.mining_iwp_partida (project_id, item, partida_bmp);
