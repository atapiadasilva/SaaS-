-- 08 · Atributos y entregables del Anexo 7 (Guía de consulta práctica BIM AWP)
--
-- APLICADO el 2026-08-08 (migración `anexo7_atributos`, durante la auditoría de la cuarta
-- limpieza). Los atributos `propuesta` de `src/lib/atributos-bim.ts` pasaron a `columna` ese día.
--
-- FUENTE: «Guía consulta práctica REQUERIMIENTOS BIM AWP para proyectos de montaje industrial y de
-- infraestructura minera», V01 · julio 2026 — Codelco VP + Hoja de Ruta BIM CChC. Capítulos 5.6
-- (atributos), 5.7 (NDI) y 5.9 (entregables AWP y contenido mínimo).
--
-- POR QUÉ: la pantalla `mineria/atributos` mide el modelo contra la tabla de atributos del Anexo 7.
-- Hoy la mitad de esa tabla no se puede ni medir, porque el dato no tiene dónde vivir. Este script
-- abre esas columnas. Son todas `text`/`date` y nullable a propósito: el Anexo 7 exige el atributo
-- por etapa, no su completitud inmediata, y un NOT NULL rompería los cargadores existentes.
--
-- QUÉ NO ESTÁ ACÁ Y ES DELIBERADO: los atributos por disciplina profunda (túneles, hormigones,
-- soportes, instrumentación) y los de puesta en marcha. La guía dice explícitamente que los
-- atributos se acuerdan en el PEB de cada proyecto y que no se copian completos; abrir cuarenta
-- columnas que nadie va a poblar sólo ensucia `mining_elementos`. Cuando un contrato los exija,
-- se agregan en su propio script.
--
-- MANTENER EN SYNC con `src/lib/atributos-bim.ts`: el campo `propuesta` de cada atributo nombra
-- exactamente la columna que se crea acá. Si divergen, la pantalla ofrece una columna que no existe.

-- ── mining_elementos · atributos del modelo ───────────────────────────────────

-- General: estado de la información del propio elemento.
alter table mining_elementos add column if not exists estado_avance_bim   text;  -- E1..E4 (cap. 5.8)
alter table mining_elementos add column if not exists estado_aprobacion   text;  -- E1/E2/E3 del PEB
alter table mining_elementos add column if not exists condicion_equipo    text;  -- Nuevo / Reubicado / Repotenciado
alter table mining_elementos add column if not exists ndi                 text;  -- NDI-1..NDI-6 (cap. 5.7)
alter table mining_elementos add column if not exists memoria_calculo     text;
alter table mining_elementos add column if not exists requisicion         text;
alter table mining_elementos add column if not exists hoja_datos          text;
alter table mining_elementos add column if not exists equipo_vendor       text;  -- Diseño / Certificada / N/A

-- `aporte_suministro` no es un campo más: define de quién es la restricción de material. Si el
-- suministro lo aporta el mandante, el dueño del despeje no es el contratista, y hoy
-- `src/lib/constraints.ts` manda todo MATERIAL al departamento de Suministros sin distinguir.
alter table mining_elementos add column if not exists aporte_suministro   text;  -- CONTRATISTA / MANDANTE

-- Adquisiciones (cap. 5.6, grupo ADQUISICIONES).
alter table mining_elementos add column if not exists numero_den          text;
alter table mining_elementos add column if not exists orden_compra        text;
alter table mining_elementos add column if not exists eta                 date;
alter table mining_elementos add column if not exists vendor              text;

-- AWP. `mwp_id` cierra la familia de paquetes: CWA/CWP/EWP/PWP/SWP ya están en la tabla, faltaba
-- el de modularización o prefabricación. En piping la materia prima ya está cargada (`spool`,
-- `isometrico`): un MWP es el paquete de prearmado que agrupa esos spools.
alter table mining_elementos add column if not exists mwp_id                text;
alter table mining_elementos add column if not exists contrato_construccion text;
alter table mining_elementos add column if not exists ras                   date;  -- Required At Site

-- OJO CON `actividad_id`. El Anexo 7 lo exige desde FEL 3, pero NO se puede deducir de la tabla de
-- datos 4D de SmartPlant: dentro de un mismo CWP todos los elementos comparten exactamente el mismo
-- conjunto de actividades, así que el 4D es el vínculo CWP→actividad disfrazado (se probó y se
-- descartó el mismo día — ver `scripts/sql/04-elemento-actividad.sql`). Esta columna sólo se puebla
-- con dato declarado por el modelador. Si algún día se llena por script desde el 4D, va a mentir.
alter table mining_elementos add column if not exists actividad_id text;

create index if not exists mining_elementos_aporte_suministro_idx
  on mining_elementos (project_id, aporte_suministro);
create index if not exists mining_elementos_estado_avance_bim_idx
  on mining_elementos (project_id, estado_avance_bim);
create index if not exists mining_elementos_mwp_idx
  on mining_elementos (project_id, mwp_id);

-- ── mining_cwp · contenido mínimo del Plan de Paquetización (cap. 5.9 C) ──────
--
-- La guía fija qué debe declarar cada CWP: «código, descripción y responsable · alcance y límites
-- de batería · especialidades involucradas · cubicaciones principales · suministros relevantes ·
-- restricciones e interfaces · relación con contratos, programa, costos, modelo BIM y puesta en
-- marcha». Hilo ya calcula las cubicaciones (banco), los suministros, las restricciones y todas las
-- relaciones. Lo que faltaba era lo que nadie puede calcular: quién responde por el paquete, dónde
-- termina y con qué se topa.
alter table mining_cwp add column if not exists responsable      text;
alter table mining_cwp add column if not exists limites_bateria  text;
alter table mining_cwp add column if not exists interfaces       text;

-- El código del mandante convive con el de Hilo en vez de reemplazarlo. Codelco escribe
-- `CWP-C-08-3120-H-002-H-AEO-Y` y BHP `CWP-0044-200-PP-114`, mientras la plataforma usa
-- `312101.C001`. Hoy esa traducción vive dentro de `scripts/sp3d-cwp-declarado.mjs` y se pierde
-- después de correrlo; acá queda guardada, que es lo que permite emitir un informe con el código
-- que el mandante reconoce.
alter table mining_cwp add column if not exists codigo_mandante text;
alter table mining_cwa add column if not exists codigo_mandante text;
alter table mining_cwa add column if not exists limites_bateria text;

create index if not exists mining_cwp_codigo_mandante_idx
  on mining_cwp (project_id, codigo_mandante);

-- ── Cobertura de atributos en una sola pasada ────────────────────────────────
--
-- POR QUÉ: la pantalla de conformidad necesita, para cada columna del catálogo, cuántos elementos
-- traen el dato. Hecho desde la aplicación son ~20 `count(*) exact` en paralelo sobre 57.519 filas:
-- medido en el Puerto, 7 segundos para una sola carga y 48 cuando coinciden dos pestañas. Es la
-- misma lección de `v_cwp_banco` y `v_cwp_cobertura` — la agregación va en la base, que resuelve
-- todo en un solo recorrido de la tabla.
--
-- Devuelve jsonb y no una tabla para que agregar un atributo al catálogo sea agregar una línea acá
-- y otra en `src/lib/atributos-bim.ts`, sin cambiar la firma ni los tipos generados.
--
-- SECURITY INVOKER (el default de Postgres, explícito para que no se pierda en un `create or
-- replace` futuro): sin eso la función se saltaría el RLS y un proyecto contaría los elementos de
-- otro.
--
-- Los placeholders `SIN-CWA` / `SIN-CWP.POR_ASIGNAR` / `{padre}.SIN-CV` NO cuentan como dato en las
-- columnas de paquetización: son códigos de UI para "por asignar". Sin descontarlos el informe diría
-- que el 100% de los elementos tiene CWP, cuando 33.733 filas apuntan a paquetes inexistentes.
create or replace function mining_atributos_cobertura(
  p_project_id        uuid,
  p_columna_disciplina text default null,
  p_disciplina        text default null
)
returns jsonb
language sql
stable
security invoker
as $$
  select jsonb_build_object(
    'universo',              count(*),
    -- General
    'tag_equipo',            count(*) filter (where nullif(btrim(tag_equipo), '') is not null),
    'guid_modelo',           count(*) filter (where nullif(btrim(guid_modelo), '') is not null),
    'wbs',                   count(*) filter (where nullif(btrim(wbs), '') is not null),
    'descripcion',           count(*) filter (where nullif(btrim(descripcion), '') is not null),
    'material',              count(*) filter (where nullif(btrim(material), '') is not null),
    'peso_kg',               count(*) filter (where peso_kg is not null),
    'especificacion',        count(*) filter (where nullif(btrim(especificacion), '') is not null),
    'pid',                   count(*) filter (where nullif(btrim(pid), '') is not null),
    'codigo_bmp',            count(*) filter (where nullif(btrim(codigo_bmp), '') is not null),
    'sitio',                 count(*) filter (where nullif(btrim(sitio), '') is not null),
    -- AWP: con los placeholders descontados
    'cwa_id',                count(*) filter (where nullif(btrim(cwa_id), '') is not null and cwa_id not ilike '%SIN-%'),
    'cwp_id',                count(*) filter (where nullif(btrim(cwp_id), '') is not null and cwp_id not ilike '%SIN-%'),
    'ewp_id',                count(*) filter (where nullif(btrim(ewp_id), '') is not null and ewp_id not ilike '%SIN-%'),
    'pwp_elemento',          count(*) filter (where nullif(btrim(pwp_elemento), '') is not null and pwp_elemento not ilike '%SIN-%'),
    'swp_id',                count(*) filter (where nullif(btrim(swp_id), '') is not null and swp_id not ilike '%SIN-%'),
    'sector',                count(*) filter (where nullif(btrim(sector), '') is not null),
    -- Por disciplina
    'diametro_in',           count(*) filter (where diametro_in is not null),
    'longitud_m',            count(*) filter (where longitud_m is not null),
    'volumen_m3',            count(*) filter (where volumen_m3 is not null),
    'sistema_servicio',      count(*) filter (where nullif(btrim(sistema_servicio), '') is not null),
    'tipo_elemento',         count(*) filter (where nullif(btrim(tipo_elemento), '') is not null),
    'categoria_constructiva', count(*) filter (where nullif(btrim(categoria_constructiva), '') is not null),
    -- Columnas que abre este mismo script. Están acá desde ya para que, al pasarlas de `propuesta`
    -- a `columna` en `src/lib/atributos-bim.ts`, la pantalla las mida sin tocar la función.
    'estado_avance_bim',     count(*) filter (where nullif(btrim(estado_avance_bim), '') is not null),
    'estado_aprobacion',     count(*) filter (where nullif(btrim(estado_aprobacion), '') is not null),
    'condicion_equipo',      count(*) filter (where nullif(btrim(condicion_equipo), '') is not null),
    'ndi',                   count(*) filter (where nullif(btrim(ndi), '') is not null),
    'memoria_calculo',       count(*) filter (where nullif(btrim(memoria_calculo), '') is not null),
    'requisicion',           count(*) filter (where nullif(btrim(requisicion), '') is not null),
    'hoja_datos',            count(*) filter (where nullif(btrim(hoja_datos), '') is not null),
    'equipo_vendor',         count(*) filter (where nullif(btrim(equipo_vendor), '') is not null),
    'aporte_suministro',     count(*) filter (where nullif(btrim(aporte_suministro), '') is not null),
    'numero_den',            count(*) filter (where nullif(btrim(numero_den), '') is not null),
    'orden_compra',          count(*) filter (where nullif(btrim(orden_compra), '') is not null),
    'eta',                   count(*) filter (where eta is not null),
    'vendor',                count(*) filter (where nullif(btrim(vendor), '') is not null),
    'mwp_id',                count(*) filter (where nullif(btrim(mwp_id), '') is not null),
    'contrato_construccion', count(*) filter (where nullif(btrim(contrato_construccion), '') is not null),
    'ras',                   count(*) filter (where ras is not null),
    'actividad_id',          count(*) filter (where nullif(btrim(actividad_id), '') is not null)
  )
  from mining_elementos
  where project_id = p_project_id
    and (
      p_disciplina is null
      or (p_columna_disciplina = 'disciplina'        and disciplina        = p_disciplina)
      or (p_columna_disciplina = 'disciplina_modelo' and disciplina_modelo = p_disciplina)
      or (p_columna_disciplina = 'especialidad_cod'  and especialidad_cod  = p_disciplina)
    );
$$;

-- ── Nota sobre la etapa del proyecto ─────────────────────────────────────────
--
-- La etapa del Anexo 7 (FEL2 / FEL3 / Ingeniería de detalle / Construcción) es un eje distinto del
-- `projects.stage` actual, que es contractual (licitación / operación / cierre). Por ahora la
-- pantalla de conformidad la elige el usuario y la recuerda el navegador, que alcanza para leer.
-- Cuando haya que emitirla en un entregable firmado, deja de ser preferencia y pasa a ser dato:
--
--   alter table projects add column if not exists etapa_anexo7 text;
--   alter table projects add constraint projects_etapa_anexo7_check
--     check (etapa_anexo7 is null or etapa_anexo7 in ('FEL2','FEL3','DETALLE','CONSTRUCCION'));
