-- 04 · WorkFace Planning: vocabulario de estado, integridad del CWP y gobierno de las
--      restricciones.  Aplicado el 2026-08-02.
--
-- Contexto (ver docs/PROPUESTA_AWP_2026.md): el proyecto tenía 98 CWP aperturables y ninguno
-- aperturado. Tres de las causas eran de base de datos:
--
--   1. `mining_iwp.status` no tenía CHECK y convivían tres grafías del mismo estado
--      ('Planificado', 'PLANIFICADO', 'LISTO_PARA_TRABAJO'). Los mapas de color de la UI
--      comparan por string exacto, así que un IWP creado por el asistente no pintaba en
--      Skyline, Gantt ni Planificación.
--   2. El `cwp_id` era texto libre sin FK en itemizado, programa y planos: estaban limpios
--      por disciplina del loader, no porque la base lo exigiera.
--   3. Las restricciones no tenían dueño, así que ningún departamento tenía motivo para
--      entrar a la plataforma.
--
-- Este archivo deja constancia de lo aplicado. Ya está en la base: no hace falta correrlo.

-- ─── 1 · Vocabulario de estado del IWP ───────────────────────────────────────
--
-- La máquina separa dos cosas que el estándar COAA/CII trata distinto:
--   LISTO_PARA_TRABAJO  sin restricciones pendientes  → lo calcula el sistema
--   LIBERADO            entregado a terreno           → lo decide el superintendente

update mining_iwp set status = upper(btrim(status)) where status is distinct from upper(btrim(status));
update mining_iwp set status = 'HOLD'        where status in ('EN_ESPERA', 'ESPERA');
update mining_iwp set status = 'PLANIFICADO' where status not in
  ('PLANIFICADO','LISTO_PARA_TRABAJO','LIBERADO','EN_EJECUCION','COMPLETADO','CERRADO','HOLD');

alter table mining_iwp drop constraint if exists mining_iwp_status_check;
alter table mining_iwp add constraint mining_iwp_status_check
  check (status in ('PLANIFICADO','LISTO_PARA_TRABAJO','LIBERADO','EN_EJECUCION','COMPLETADO','CERRADO','HOLD'));
alter table mining_iwp alter column status set default 'PLANIFICADO';

update mining_iwp set origen_apertura = 'manual'
 where origen_apertura is null or origen_apertura not in ('manual','asistente');
alter table mining_iwp drop constraint if exists mining_iwp_origen_apertura_check;
alter table mining_iwp add constraint mining_iwp_origen_apertura_check
  check (origen_apertura in ('manual','asistente'));

-- ─── 2 · Integridad referencial del CWP ──────────────────────────────────────
--
-- Sólo donde el dato ya estaba sano (0 huérfanos verificados). `mining_elementos` queda
-- fuera a propósito: tiene 33.733 filas apuntando a CWP que no existen en su proyecto, y esa
-- limpieza es trabajo de datos, no de esquema.

update mining_itemizado set cwp_id = null where btrim(coalesce(cwp_id,'')) = '';
update mining_planos     set cwp_id = null where btrim(coalesce(cwp_id,'')) = '';
update mining_programa   set cwp_id = null where btrim(coalesce(cwp_id,'')) = '';

alter table mining_itemizado add constraint mining_itemizado_cwp_fk
  foreign key (project_id, cwp_id) references mining_cwp (project_id, cwp_id)
  on update cascade on delete restrict;
alter table mining_planos add constraint mining_planos_cwp_fk
  foreign key (project_id, cwp_id) references mining_cwp (project_id, cwp_id)
  on update cascade on delete restrict;
alter table mining_programa add constraint mining_programa_cwp_fk
  foreign key (project_id, cwp_id) references mining_cwp (project_id, cwp_id)
  on update cascade on delete restrict;
alter table mining_iwp_elemento add constraint mining_iwp_elemento_iwp_fk
  foreign key (project_id, iwp_id) references mining_iwp (project_id, iwp_id)
  on update cascade on delete cascade;

create index if not exists idx_itemizado_cwp    on mining_itemizado    (project_id, cwp_id);
create index if not exists idx_planos_cwp       on mining_planos       (project_id, cwp_id);
create index if not exists idx_programa_cwp     on mining_programa     (project_id, cwp_id);
create index if not exists idx_iwp_elemento_iwp on mining_iwp_elemento (project_id, iwp_id);
create index if not exists idx_elementos_cwp    on mining_elementos    (project_id, cwp_id);

-- ─── 3 · Gobierno de las restricciones (catálogo COAA) ───────────────────────
--
-- Críticas del estándar: documentos, materiales y andamios. Secundarias: equipos, control de
-- proyecto, seguridad, calidad y personal. MEDIO_AMBIENTE se agrega porque en la minería
-- chilena es un departamento con permisos propios. El catálogo vive en src/lib/constraints.ts.

alter table mining_iwp_constraint add column if not exists depto       text;
alter table mining_iwp_constraint add column if not exists responsable text;
alter table mining_iwp_constraint add column if not exists severidad   text not null default 'media';

update mining_iwp_constraint set tipo = upper(btrim(tipo));
update mining_iwp_constraint set tipo = 'INGENIERIA' where tipo in ('IFC','DOCUMENTO','DOCUMENTOS','PLANO');
update mining_iwp_constraint set tipo = 'MATERIAL'   where tipo in ('MATERIALES','SUMINISTRO');
update mining_iwp_constraint set tipo = 'PERMISO'    where tipo in ('PERMISOS','SSO','SEGURIDAD');
update mining_iwp_constraint set tipo = 'OTRO'       where tipo not in
  ('INGENIERIA','MATERIAL','ANDAMIO','EQUIPO','PERMISO','PREDECESORA','CALIDAD','PERSONAL','MEDIO_AMBIENTE','OTRO');

alter table mining_iwp_constraint add constraint mining_iwp_constraint_tipo_check
  check (tipo in ('INGENIERIA','MATERIAL','ANDAMIO','EQUIPO','PERMISO','PREDECESORA','CALIDAD','PERSONAL','MEDIO_AMBIENTE','OTRO'));
alter table mining_iwp_constraint add constraint mining_iwp_constraint_severidad_check
  check (severidad in ('alta','media','baja'));

create index if not exists idx_constraint_abiertas on mining_iwp_constraint (project_id, cleared, fecha_necesaria);
create index if not exists idx_constraint_depto    on mining_iwp_constraint (project_id, depto, cleared);

-- ─── 4 · Vistas de apertura ──────────────────────────────────────────────────
--
-- La Sala de Apertura calculaba el saldo trayéndose el itemizado, las asignaciones, los
-- planos y los 57.519 elementos del proyecto a punta de páginas de mil filas. La agregación
-- baja a la base. `security_invoker = on` es obligatorio: sin eso la vista corre con los
-- permisos del dueño y se salta el RLS multi-tenant.
--
-- La llave de las líneas es la misma que usa src/lib/cwp-banco.ts (item + partida_bmp). Si
-- divergieran, el ranking mostraría un saldo distinto al del asistente.

create or replace view v_cwp_banco with (security_invoker = on) as
with banco as (
  select project_id, cwp_id, item, coalesce(partida_bmp, '') as pb,
         sum(cantidad) as cantidad,
         sum(coalesce(hh_item, cantidad * hh_unidad)) as hh,
         max(hh_unidad) as hh_unidad
    from mining_itemizado where cwp_id is not null
   group by 1, 2, 3, 4
),
asignado as (
  select p.project_id, w.cwp_id, p.item, coalesce(p.partida_bmp, '') as pb,
         sum(p.cantidad_asignada) as cantidad
    from mining_iwp_partida p
    join mining_iwp w on w.project_id = p.project_id and w.iwp_id = p.iwp_id
   group by 1, 2, 3, 4
),
lineas as (
  select b.project_id, b.cwp_id, b.hh, b.cantidad, b.hh_unidad,
         greatest(0, b.cantidad - coalesce(a.cantidad, 0)) as saldo_cant
    from banco b
    left join asignado a on a.project_id = b.project_id and a.cwp_id = b.cwp_id
                        and a.item = b.item and a.pb = b.pb
)
select project_id, cwp_id,
       count(*)::int as n_partidas,
       round(coalesce(sum(hh), 0))::numeric as hh_banco,
       round(coalesce(sum(case when cantidad > 0 then hh * saldo_cant / cantidad else 0 end), 0))::numeric as hh_saldo,
       count(*) filter (where saldo_cant > 0 and coalesce(hh_unidad, 0) <= 0 and coalesce(hh, 0) <= 0)::int as n_sin_rendimiento
  from lineas group by 1, 2;

create or replace view v_cwp_cobertura with (security_invoker = on) as
select c.project_id, c.cwp_id,
       coalesce(p.n, 0)::int as n_planos,
       coalesce(e.n, 0)::int as n_elementos
  from mining_cwp c
  left join (select project_id, cwp_id, count(*) n from mining_planos    where cwp_id is not null group by 1, 2) p
    on p.project_id = c.project_id and p.cwp_id = c.cwp_id
  left join (select project_id, cwp_id, count(*) n from mining_elementos where cwp_id is not null group by 1, 2) e
    on e.project_id = c.project_id and e.cwp_id = c.cwp_id;

-- ─── 5 · Siembra de cuadrillas ───────────────────────────────────────────────
--
-- `mining_cuadrilla` estaba vacía en los cinco proyectos, y sin cuadrilla no hay capacidad de
-- ciclo con la cual dimensionar un IWP: era el bloqueo duro del asistente. Se siembra una
-- plantilla por disciplina con CWP, sobre el turno por defecto del proyecto. Las dotaciones
-- son un punto de partida — se ajustan en Recursos → Cuadrillas.

insert into mining_cuadrilla (project_id, codigo, nombre, disciplina_cod, n_personas, turno_id, factor_productividad, activa, observacion)
select d.project_id, 'CUAD-' || d.disciplina_cod,
       coalesce(d.disciplina, 'Disciplina ' || d.disciplina_cod), d.disciplina_cod,
       10, t.id, 1.0, true,
       'Plantilla inicial: 10 personas en el turno por defecto. Ajustar dotación y factor de productividad reales en Recursos → Cuadrillas.'
from (
  select project_id, disciplina_cod, max(disciplina) as disciplina
    from mining_cwp
   where es_oficial and disciplina_cod is not null and btrim(disciplina_cod) <> ''
   group by project_id, disciplina_cod
) d
join lateral (
  select id from mining_turno where project_id = d.project_id and activo
   order by es_default desc, created_at limit 1
) t on true
where not exists (
  select 1 from mining_cuadrilla c
   where c.project_id = d.project_id and c.disciplina_cod = d.disciplina_cod
);
