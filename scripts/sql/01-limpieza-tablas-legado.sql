-- APLICADA el 2026-08-02 en el proyecto lsoesbsrlfingfckozsq
-- (migración `limpieza_tablas_legado_pre_mining`). Se conserva como registro.
--
-- Elimina las 20 tablas del sistema anterior al modelo mining_*. Todas verificadas
-- con 0 filas, sin código que las use y sin llaves foráneas entrantes desde tablas
-- que se mantienen. Su código ya fue eliminado del repo en el mismo commit.
--
--   nodes / edges / sot_mappings / custom_views   <- grafo ReactFlow de la 1ª generación
--   program_activities + activity_bim_links + activity_requirements  <- /api/program*
--   model_data_versions / model_elements          <- /api/model-data, /api/model-versions
--   tidps + deliverables + task_teams + tidp_constraints
--     + deliverable_versions + constraint_history
--     + tidp_notification_settings                <- /api/catalog/activate (vocabulario TIDP)
--   project_invitations                           <- /api/invite + /invite/[token]
--                                                    (hoy se invita con
--                                                     supabase.auth.admin.inviteUserByEmail)
--   cwp_master / departments / milestones         <- vacías, sin código
--
-- activity_tags y program_bim_links ya no existían en la base: su código apuntaba
-- a tablas fantasma y habría reventado en runtime.
--
-- Para revertir hace falta un backup de Supabase; el DDL original está en
-- supabase_migration_master.sql y supabase_tidp_tables.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación previa (correr ANTES de cualquier borrado futuro de este tipo).
-- La primera consulta debe dar todo en 0; la segunda, cero filas.
-- ─────────────────────────────────────────────────────────────────────────────

-- ¿Alguien de fuera del grupo depende de estas tablas?
-- Ojo: esta consulta fue la que reveló las 7 satélites que no estaban en el plan
-- original de 9 tablas. Sin ella, el DROP habría fallado a mitad de camino.
--
-- WITH objetivo(t) AS (VALUES ('nodes'),('program_activities'), ... )
-- SELECT con.conname, origen.relname AS tabla_que_depende, destino.relname AS tabla_a_borrar
-- FROM pg_constraint con
-- JOIN pg_class origen  ON origen.oid  = con.conrelid
-- JOIN pg_class destino ON destino.oid = con.confrelid
-- WHERE con.contype='f'
--   AND destino.relname IN (SELECT t FROM objetivo)
--   AND origen.relname NOT IN (SELECT t FROM objetivo);

-- ─────────────────────────────────────────────────────────────────────────────
-- El borrado aplicado. Sin CASCADE a propósito: si algo dependiera, falla en vez
-- de arrastrarlo. El orden respeta las llaves foráneas internas del grupo.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS constraint_history;
DROP TABLE IF EXISTS deliverable_versions;
DROP TABLE IF EXISTS tidp_constraints;
DROP TABLE IF EXISTS deliverables;
DROP TABLE IF EXISTS tidp_notification_settings;
DROP TABLE IF EXISTS tidps;
DROP TABLE IF EXISTS task_teams;
DROP TABLE IF EXISTS activity_bim_links;
DROP TABLE IF EXISTS activity_requirements;
DROP TABLE IF EXISTS program_activities;
DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS sot_mappings;
DROP TABLE IF EXISTS custom_views;
DROP TABLE IF EXISTS nodes;
DROP TABLE IF EXISTS model_elements;
DROP TABLE IF EXISTS model_data_versions;
DROP TABLE IF EXISTS project_invitations;
DROP TABLE IF EXISTS cwp_master;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS milestones;
