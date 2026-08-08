-- 06 · Estado del ciclo de vida del documento
--
-- Aplicado en Supabase el 2026-08-04 (migración `doc_estado_ciclo_vida`).
--
-- POR QUÉ: el gate de liberación del IWP exige ingeniería emitida para construcción (IFC). El dato
-- existe en Aconex —viene en el export de metadatos como "Estado del ciclo de vida"— pero no había
-- dónde guardarlo, así que el gate no podía consultarlo. Medido en SCPY al 2026-08-04: de 228
-- documentos, 219 están "Issued for Review / Issued for Information", 9 "Issued for Internal
-- Review" y CERO en IFC. O sea que hoy ningún paquete del proyecto es liberable contra ingeniería.
--
-- OJO: no se crea índice único sobre (project_id, n_cmdic) porque Collahuasi tiene 38 documentos
-- repetidos que habría que depurar antes. El cargador hace upsert leyendo primero, acotado al
-- proyecto que se está cargando.

alter table mining_doc_aconex add column if not exists estado_ciclo_vida text;
alter table mining_doc_aconex add column if not exists tipo_entregable  text;
alter table mining_doc_aconex add column if not exists fecha_recepcion  date;
alter table mining_doc_aconex add column if not exists fecha_entrega    date;

-- mining_planos es el vínculo documento → CWP. El estado y la revisión se desnormalizan acá para
-- que la Sala de Apertura pueda responder "cuántos planos IFC tiene este CWP" sin un join extra
-- por cada paquete del ranking.
alter table mining_planos add column if not exists estado_ciclo_vida text;
alter table mining_planos add column if not exists rev               text;

create index if not exists mining_planos_estado_idx
  on mining_planos (project_id, estado_ciclo_vida);
create index if not exists mining_doc_aconex_estado_idx
  on mining_doc_aconex (project_id, estado_ciclo_vida);

-- Estado de la ingeniería agregado por CWP. Mismo patrón que v_cwp_banco y v_cwp_cobertura: la
-- Sala de Apertura no puede traer cientos de vínculos crudos sin topar el límite de filas de
-- PostgREST. `security_invoker = on` es obligatorio — sin eso la vista se salta el RLS y un
-- proyecto vería los documentos de otro.
create or replace view v_cwp_ingenieria
with (security_invoker = on) as
select
  project_id,
  cwp_id,
  count(*)::int                                                                    as n_docs,
  count(*) filter (where estado_ciclo_vida ilike '%for construction%')::int        as n_ifc,
  count(*) filter (where estado_ciclo_vida ilike '%for review%'
                      or estado_ciclo_vida ilike '%for information%')::int         as n_revision,
  count(*) filter (where estado_ciclo_vida ilike '%internal%')::int                as n_interna,
  count(*) filter (where estado_ciclo_vida is null)::int                           as n_sin_estado
from mining_planos
where cwp_id is not null
group by project_id, cwp_id;
