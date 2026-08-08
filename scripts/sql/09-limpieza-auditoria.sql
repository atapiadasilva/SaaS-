-- 09 · Limpieza de la auditoría 2026-08-08 (cuarta limpieza, lado base de datos)
-- APLICADO el 2026-08-08 (migración `limpieza_auditoria_2026_08_08`).
-- Criterio: nada con datos se borra — se mueve al esquema `archivo`, que PostgREST
-- no expone y que se revierte con `ALTER TABLE archivo.x SET SCHEMA public`.
-- Solo se DROPea lo que está vacío Y sin una sola referencia en el código.
-- Evidencia caso a caso en docs/LIMPIEZA.md (sección 2026-08-08).

begin;

-- ── 1 · Esquema de archivo ────────────────────────────────────────────────────
create schema if not exists archivo;

-- ── 2 · Respaldos de agosto: fuera del esquema público ───────────────────────
alter table public._respaldo_doc_aconex_puerto_20260804  set schema archivo;
alter table public._respaldo_elementos_puerto_20260803   set schema archivo;
alter table public._respaldo_planos_puerto_20260804      set schema archivo;
alter table public._respaldo_programa_mc_20260803        set schema archivo;

-- ── 3 · Capa AWP previa al modelo minero, con datos pero sin código ──────────
-- (mining_awp_linea y mining_awp_equipo SÍ viven: los lee mining-sistemas/detalle
--  y mining_swp_resumen. mining_awp_pid no lo lee nadie — verificado también en
--  la definición de mining_swp_resumen, que arma los P&ID desde mining_awp_linea.)
alter table public.mining_awp_pid          set schema archivo;
alter table public.mining_bmp_partidas     set schema archivo;
alter table public.mining_condiciones      set schema archivo;
alter table public.mining_doc_referencia   set schema archivo;
alter table public.mining_epr              set schema archivo;
alter table public.mining_mapeo_area_cwa   set schema archivo;
alter table public.mining_obras_crosswalk  set schema archivo;
alter table public.mining_partidas         set schema archivo;
alter table public.mining_pwp              set schema archivo;

-- ── 4 · El bot: experimento sin código en el repo, último mensaje 2026-06-26 ─
alter table public.bot_tools_dinamicas  set schema archivo;
alter table public.mining_bot_invites   set schema archivo;
alter table public.mining_bot_mensajes  set schema archivo;
alter table public.mining_bot_usuarios  set schema archivo;
drop function if exists public.mining_bot_schema_map();

-- ── 5 · Vacías y sin código: estas sí se van ─────────────────────────────────
-- (sin CASCADE a propósito: si algo dependiera de ellas, la transacción falla)
drop table public.mining_awp_linea_equipo;
drop table public.mining_awp_piping_elemento;
drop table public.mining_iwp_elemento;          -- su API se eliminó en esta misma limpieza

-- ── 6 · Funciones y vista sin un solo llamador ───────────────────────────────
-- Las tres funciones eran SECURITY DEFINER expuestas por REST a cualquier usuario
-- autenticado (warning del linter de Supabase): borrarlas también cierra eso.
drop function public.set_bim_linker_key(uuid, text, jsonb);
drop function public.extract_cwp_combinations(uuid, text, text, text, text, text, text, text);
drop function public.create_organization(text, text, text, text);
drop view public.v_mining_brechas;

-- ── 7 · Enums del diseño ISO 19650 que ninguna columna usa ───────────────────
-- tidp_discipline se conserva: es el candidato para project_members.departamento
-- (brecha nº1 de docs/MODELO_DATOS.md).
drop type public.cde_status;
drop type public.constraint_status;
drop type public.constraint_type;
drop type public.deliverable_type;
drop type public.tidp_status;

-- ── 8 · Log de cambios: archivar la carga masiva ─────────────────────────────
-- 178.406 de 178.469 filas eran cargas por script/pintado masivo de jun–jul 2026.
-- Se archivan (no se pierden) y el log vivo queda con la actividad real de usuarios.
create table archivo.mining_cambios_log_carga_junjul as
  select * from public.mining_cambios_log where creado_en < '2026-08-01';
delete from public.mining_cambios_log where creado_en < '2026-08-01';

commit;
