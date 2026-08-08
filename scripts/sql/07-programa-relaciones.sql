-- 07 · Relaciones lógicas del cronograma
--
-- Aplicado en Supabase el 2026-08-06 (migración `programa_relaciones`).
--
-- POR QUÉ: hasta ahora la ruta crítica era una bandera declarada en `mining_cwp.ruta_critica`, no
-- algo calculable. Sin las relaciones no se puede saber qué arrastra a qué ni cuánta holgura real
-- tiene un paquete, que es justo lo que hay que mirar antes de decidir qué CWP aperturar primero.
-- El .xer las trae en TASKPRED: el Rev.0 de SCPY tiene 823 (el Rev.B tenía 597).
--
-- `fuente` sigue la misma convención que mining_programa: la aplicación solo lee 'P333'.

create table if not exists mining_programa_relacion (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  fuente       text not null default 'P333',
  pred_codigo  text not null,
  suc_codigo   text not null,
  tipo         text,            -- PR_FS, PR_SS, PR_FF, PR_SF
  lag_dias     numeric,
  unique (project_id, fuente, pred_codigo, suc_codigo, tipo)
);

create index if not exists mining_programa_relacion_proj_idx on mining_programa_relacion (project_id, fuente);
create index if not exists mining_programa_relacion_pred_idx on mining_programa_relacion (project_id, pred_codigo);
create index if not exists mining_programa_relacion_suc_idx  on mining_programa_relacion (project_id, suc_codigo);

alter table mining_programa_relacion enable row level security;

drop policy if exists "Users can access mining data in their orgs" on mining_programa_relacion;
create policy "Users can access mining data in their orgs" on mining_programa_relacion
  for all using (
    exists (
      select 1 from projects p
      join organization_members om on om.organization_id = p.organization_id
      where p.id = mining_programa_relacion.project_id and om.user_id = auth.uid()
    )
  );
