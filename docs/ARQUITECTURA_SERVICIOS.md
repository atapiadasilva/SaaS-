# Arquitectura de Servicios — Hilo Digital

> **Estado:** diseño aprobado, implementación por etapas.
> **Audiencia:** el equipo de desarrollo que industrializará la plataforma, y quien alimente
> los servicios mientras tanto.
> **Regla de oro:** un dato tiene un solo dueño. Todos los demás lo leen por contrato.

> 🔧 **Puesta en marcha — un solo paso manual, una sola vez.** En Supabase:
> *Settings → API → Exposed schemas* → agregar **`pub`**. Sin eso el contrato existe en la base
> pero PostgREST no lo sirve, y `/api/servicios/*` responde 503 con este mismo remedio.
> Los schemas `svc_*` **nunca** se agregan ahí.

---

## 1. El problema que resuelve

Hoy la información de un proyecto llega de departamentos distintos —planificación, terreno,
calidad, RRHH, abastecimiento, control documental— y cada uno trabaja a su ritmo, con su
propia noción de "el dato bueno". Dos fallas nacen de ahí:

- **Silos.** Un departamento tiene la información y el resto no la ve. La dotación de una
  cuadrilla existe, pero el Estado de Pago no puede usarla.
- **Contaminación.** Sin límites, cualquier módulo escribe sobre cualquier tabla y nadie sabe
  quién dejó el dato como está.

La solución no es centralizar todo en una base común donde todos meten mano. Es lo contrario:
**dar a cada departamento propiedad exclusiva de sus datos, y obligarlo a publicar un
contrato** que los demás consumen.

---

## 2. Los cinco principios

1. **Propiedad exclusiva.** Cada servicio es el único que escribe en sus tablas. Nadie más,
   nunca, ni "por esta vez".
2. **Versionado propio.** Cada servicio versiona a su ritmo. Puede tener borradores internos
   sin que nadie se entere.
3. **Publicación explícita.** Compartir es un acto deliberado: *"esta es la v7 oficial de
   dotación"*. Lo que no se publica, no existe para el resto.
4. **Consumo por contrato.** Los demás leen la vista publicada, jamás la tabla interna ajena.
   Por defecto ven el último dato publicado; pueden pedir una versión histórica.
5. **Todo publicado lleva la llave.** El **CWP** es el pegamento del proyecto entero. Un
   servicio que publica sin CWP (ni forma de mapearlo) sigue siendo un silo, solo que con API.

---

## 3. Monolito modular, no microservicios

La separación que se busca es de **propiedad del dato y de contrato**, no de proceso. Por eso
todo vive en el mismo Next.js + Supabase, con los límites impuestos por el motor de base de
datos (schemas + grants), no por convención.

**Por qué no microservicios reales hoy:** doce procesos, doce despliegues, doce bases y
consistencia eventual es una carga de operación que no se justifica en esta etapa y que no
compra nada que el schema no dé.

**Por qué esto no es un callejón sin salida:** el contrato publicado ya está definido y es
estable. El día que un departamento necesite su propio servicio —porque escala distinto, porque
lo opera otra empresa, porque tiene su propio sistema— se corta por el contrato y **ningún
consumidor se entera**. Eso es exactamente lo que compra este diseño.

---

## 4. Catálogo de servicios

| Servicio | Dueño funcional | Datos que gobierna | Publica (contrato) | Consume de |
|---|---|---|---|---|
| `awp` | Control de Proyecto | `mining_cwa`, `mining_cv`, `mining_cwp`, `mining_programa`, `mining_itemizado`, `mining_ponderaciones` | catálogo CWP, programa vigente, itemizado, ponderaciones | — (es la raíz) |
| `bim` | Coordinación BIM | `mining_elementos`, `mining_sistemas`, `mining_colores` | elementos por CWP, sistemas, cobertura del modelo | `awp` |
| `documental` | Control Documental | `mining_planos`, `mining_doc_aconex` | planos y documentos vigentes por CWP y disciplina | `awp` |
| `ejecucion` | Terreno / Construcción | `mining_iwp`, `mining_3wla`, `mining_avance_pasos` | IWP abiertos, avance registrado, restricciones | `awp`, `bim`, `recursos` |
| `recursos` ✅ | RRHH / Adm. de Obra | `svc_recursos.reporte_diario`, `.personal`, `.actividad_mapa` | reporte diario, actividades, HH reales por CWP, horas de equipo, nómina, cuadrillas | `awp` |
| `equipos` | Equipos y Maquinaria | `mining_equipos` | disponibilidad y acreditación | `awp` |
| `suministros` | Abastecimiento | `mining_suministro` | estado de suministro por CWP | `awp` |
| `calidad` | Calidad | `mining_consideraciones`, protocolos | ITP, no conformidades, liberaciones por CWP | `awp`, `documental` |
| `sso` | Prevención de Riesgos | permisos, procedimientos | restricciones SSO por CWP | `awp`, `documental` |
| `medioambiente` | Medio Ambiente | consideraciones ambientales | restricciones ambientales por CWP | `awp`, `documental` |
| `comercial` | Comercial / EP | estados de pago emitidos | EP emitidos y su trazabilidad | `awp`, `ejecucion`, `recursos` |

✅ = ya migrado a su schema privado, versionado y publicando. El resto sigue en
`public.mining_*` con su contrato declarado pero no construido; el campo `migrado` de
`servicios.ts` dice la verdad y la API responde 501 si se le pide uno de ellos.

`comercial` es casi puro consumidor: es el caso que mejor muestra por qué la trazabilidad de
versiones (§8) no es opcional.

El registro canónico en código está en [`src/lib/servicios.ts`](../src/lib/servicios.ts), que se
apoya en el catálogo de fuentes ya existente en `src/lib/fuentes-datos.ts`.

---

## 5. Separación física: schemas y permisos

```sql
-- Un schema privado por servicio. Solo su dueño escribe aquí.
create schema if not exists svc_awp;
create schema if not exists svc_bim;
create schema if not exists svc_recursos;
-- … uno por servicio del catálogo

-- Un único schema público: la superficie compartida.
create schema if not exists pub;
```

### Cómo se hace cumplir el límite

Todas las vistas —tanto las de `pub` como las de compatibilidad— se declaran con
**`security_invoker = true`**: los permisos y la RLS de la tabla base se evalúan con el usuario
que llama. La política multi-tenant (*"Users can access mining data in their orgs"*) sigue
vigente a través de cada vista, y es **imposible que una vista nueva se convierta en un agujero
por olvidar el filtro de organización**.

Eso tiene una consecuencia que conviene decir en voz alta: con `security_invoker`, el rol que
consulta necesita permisos sobre las tablas base, así que **los `grant` no encapsulan**. La
separación entre servicios se sostiene sobre tres cosas, en este orden:

1. **PostgREST solo sirve `public` y `pub`.** Los schemas `svc_*` no se exponen nunca en la
   API, así que ningún cliente puede leerlos por HTTP. Este es el límite duro real.
2. **La capa API solo consulta `pub`** (`/api/servicios/*`). Un `.schema('svc_…')` en el código
   es un error de revisión de código.
3. **La escritura sí está protegida por la base:** un trigger impide modificar filas de una
   versión publicada, en cualquier ruta y para cualquier rol que no sea el service role.

La alternativa —vistas `security definer` con el filtro de organización escrito a mano— daría
encapsulación real de permisos a cambio de que un olvido en una vista futura exponga datos de
otra empresa. No vale la pena el cambio.

```sql
grant usage on schema pub to authenticated;
alter default privileges in schema pub grant select on tables to authenticated;
```

> ⚠️ **Paso manual obligatorio en Supabase.** Para que PostgREST sirva el contrato hay que
> agregar `pub` en *Dashboard → Settings → API → Exposed schemas*. Mientras no esté,
> `/api/servicios/*` responde **503** con el remedio exacto en el cuerpo. Los `svc_*` **nunca**
> se agregan ahí.

---

## 6. Versionado

### Modelo elegido: versión por publicación

Un departamento carga, revisa, corrige —todo en borrador— y cuando está conforme, **publica**.
Esto calza con cómo llegan realmente los datos (planilla semanal de dotación, `.xer` del
programa, Excel del itemizado) y evita el costo de un esquema bitemporal fila a fila.

```sql
create table servicio_version (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  servicio      text not null,
  n_version     int  not null,
  estado        text not null default 'draft'
                check (estado in ('draft','publicada','retirada')),
  titulo        text,
  nota          text,                       -- qué cambió y por qué
  creada_por    uuid references auth.users(id),
  creada_at     timestamptz not null default now(),
  publicada_por uuid references auth.users(id),
  publicada_at  timestamptz,
  unique (project_id, servicio, n_version)
);

create index on servicio_version (project_id, servicio, estado, n_version desc);
```

Estados:

- **`draft`** — trabajo interno del departamento. Invisible para el resto.
- **`publicada`** — parte del contrato. **Inmutable**: no se edita, se publica una nueva.
- **`retirada`** — publicada por error y anulada. Deja de ser vigente pero no se borra.

**La vigente** es la `publicada` de mayor `n_version`. Las anteriores siguen publicadas y
consultables — así se reproduce el pasado.

```sql
create or replace function pub.version_vigente(p_project uuid, p_servicio text)
returns uuid language sql stable as $$
  select id from servicio_version
   where project_id = p_project and servicio = p_servicio and estado = 'publicada'
   order by n_version desc limit 1
$$;
```

### Cada fila de datos pertenece a una versión

```sql
alter table svc_recursos.reporte_diario
  add column version_id uuid not null references public.servicio_version(id);
create index on svc_recursos.reporte_diario (version_id);
```

**Nada se borra ni se sobreescribe.** Corregir un dato es cargar una versión nueva. El
histórico es el activo, no un residuo.

---

## 7. El contrato publicado

Es una vista en `pub` que resuelve sola cuál es el último dato. Quien la consume no sabe que
existen versiones:

```sql
create or replace view pub.recursos_reporte_diario
with (security_invoker = true) as
select d.project_id, d.fecha, d.n_cmdic,
       d.mod_hd, d.mod_hh_dia, d.moi_hd, d.moi_hh_dia,
       (coalesce(d.mod_hd,0) + coalesce(d.moi_hd,0)) as dotacion_total,
       v.n_version                                    -- se expone para trazabilidad
  from svc_recursos.reporte_diario d
  join public.servicio_version v on v.id = d.version_id
 where v.id = pub.version_vigente(d.project_id, 'recursos');
```

El patrón se repite idéntico en todos los contratos: `join servicio_version` + `where v.id =
pub.version_vigente(...)`. Para reproducir el pasado se cambia esa única línea por
`v.n_version = <n> and v.estado = 'publicada'`.

**El contrato es lo que se promete mantener.** Agregar una columna es compatible; quitar o
renombrar una es un cambio que rompe consumidores y exige aviso. Vale la pena tratarlo con esa
seriedad desde el principio.

---

## 8. Trazabilidad de los cálculos derivados

Esto es lo que convierte el versionado en algo que vale plata. Cuando el Estado de Pago se
calcula, se guarda **con qué versiones** se calculó:

```sql
create table calculo_lineage (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  calculo      text not null,       -- 'estado-pago', 'kpi-panel', 'conciliacion'
  referencia   text not null,       -- '2026-07', el período o identificador
  insumos      jsonb not null,      -- [{"servicio":"recursos","n_version":7}, …]
  resultado    jsonb,               -- las cifras finales, congeladas
  generado_por uuid references auth.users(id),
  generado_at  timestamptz not null default now()
);
```

Un mes después, cuando el mandante discute una cifra, la respuesta deja de ser "así salió el
sistema" y pasa a ser **"este EP se calculó con itemizado v3, dotación v7 y avance v12, y aquí
está cada uno"**. Reproducible, auditable, defendible.

Sin esto, versionar sirve de poco.

---

## 9. Aviso de publicación (eventos)

Cuando un servicio publica, los módulos derivados deben saber que su cálculo quedó viejo.

```sql
create table servicio_evento (
  id          bigserial primary key,
  project_id  uuid not null references projects(id) on delete cascade,
  servicio    text not null,
  tipo        text not null,       -- 'version_publicada' | 'version_retirada'
  version_id  uuid references servicio_version(id),
  payload     jsonb,
  ocurrido_at timestamptz not null default now(),
  procesado_at timestamptz
);
```

Empieza como una bandera que el panel lee para mostrar *"la conciliación usa datos de hace 2
versiones"*. No necesita cola de mensajes hoy; el día que la necesite, la tabla ya es un
*outbox* estándar y se conecta a Supabase Realtime o a un worker sin rediseñar nada.

---

## 10. La API de servicios

Una sola forma para todos. Reemplaza el patrón actual de ~50 endpoints que cada uno arma su
propia consulta.

```
GET  /api/servicios/{servicio}/{recurso}?project_id=…&cwp=…&desde=…&hasta=…&limit=…
GET  /api/servicios/{servicio}/versiones?project_id=…
POST /api/servicios/{servicio}/versiones   { project_id, accion:'publicar', nota }
POST /api/servicios/{servicio}/versiones   { project_id, accion:'retirar', n_version, motivo }
```

Implementado en [`src/app/api/servicios/`](../src/app/api/servicios). El catálogo de
`src/lib/servicios.ts` es el que valida: pedir un recurso que el servicio no declara publicar
devuelve 404 con la lista de lo que sí publica.

Reglas de la capa API:

- **Lectura** siempre contra `pub`. Nunca contra `svc_*` de otro servicio.
- **Escritura** solo la acepta el endpoint del servicio dueño, y solo sobre versiones `draft`.
- Toda respuesta incluye `n_version`: **quien guarde el resultado debe guardar ese número**
  en `calculo_lineage`.
- No hay endpoint para "crear borrador": el borrador se abre solo al cargar el primer dato.
  Crear un contenedor vacío a mano es una ceremonia sin valor.

---

## 11. Reglas de convivencia (lo prohibido)

Estas son las que el equipo de desarrollo debe hacer cumplir en revisión de código:

1. Ningún servicio hace `SELECT` sobre el schema `svc_*` de otro servicio. Solo `pub`.
2. Ningún servicio escribe fuera de su propio schema.
3. Ningún `JOIN` entre datos de dos servicios ocurre fuera de `pub`.
4. Toda vista de `pub` lleva `cwp_id` o una columna que mapee a CWP.
5. Una versión `publicada` no se edita jamás. Se publica una nueva.
6. Nada se borra. Se retira.
7. Todo cálculo derivado escribe su `calculo_lineage`.

---

## 12. Plan de implementación por etapas

**Etapa 1 — Declarar (sin mover datos).**
Registro de servicios en código (`src/lib/servicios.ts`), tablas `servicio_version`,
`servicio_evento` y `calculo_lineage`. Nada se rompe; queda el vocabulario instalado.

**Etapa 2 — Piloto con `recursos`. ✅ Hecho.** Ver §13: es la implementación de referencia.

**Etapa 3 — Migrar `awp` y `bim`.**
Son los de mayor volumen y los que más consumidores tienen. Al migrar, crear una versión `v1`
`publicada` por proyecto y hacer *backfill* del `version_id` sobre las filas existentes.

**Etapa 4 — El resto de los departamentos y el corte de la API antigua.**
Los endpoints `mining-*` actuales quedan como fachada sobre `/api/servicios/*` durante la
transición, y luego se retiran.

---

## 13. `recursos`: la implementación de referencia

Es el único servicio migrado. Sirve de molde para los demás.

### Lo que se encontró al abrir la caja

`mining_dotacion` **no era** "dotación por disciplina". Es el **Reporte Diario de obra**: MOD/MOI,
HH del día, actividades ejecutadas y horas de equipo. Dato real de terreno.

Y el módulo Recursos —`/api/mining-recursos`— **nunca leyó esa tabla**: calcula dotación
*estimada* dividiendo las HH del programa por 11 h × 6 días. Es decir, convivían dos dotaciones
que no se hablaban: la **planificada**, derivada del programa (dueño: `awp`), y la **real**, del
Reporte Diario (dueño: `recursos`). Ese es exactamente el silo que la arquitectura elimina, y
apareció recién al preguntar quién era dueño de qué.

Por eso la tabla se renombró a lo que es. Un nombre que miente es la primera forma de silo.

### Estructura

| Objeto | Qué es |
|---|---|
| `svc_recursos.reporte_diario` | El RD. Antes `public.mining_dotacion`. |
| `svc_recursos.personal` | La nómina. Antes `public.mining_personal`. |
| `svc_recursos.actividad_mapa` | El puente `cod_rd → cwp_id`. |
| `public.mining_dotacion` / `mining_personal` | **Vistas de compatibilidad**, temporales. |

Contrato publicado: `pub.recursos_reporte_diario`, `_actividades`, `_hh_por_cwp`,
`_equipos_horas`, `_personal`, `_cuadrillas`, `_cobertura_llave`.

### Dos decisiones que se repetirán en los demás servicios

**Quien emite el reporte es su dueño.** El RD trae `equipos` (horas de máquina) dentro de un
jsonb. Esa data no se le entrega al servicio `equipos` para que la gobierne: `recursos` la
publica en `pub.recursos_equipos_horas` y `equipos` la **consume** para contrastarla con su
propio registro. El RD es el formulario de captura, no el dueño de todo lo que captura.

**Las filas nuevas caen solas en el borrador abierto.** Un trigger asigna `version_id` en cada
insert, creando el borrador si no existe. Así todo el código de carga que ya existe
—`load-datapack.mjs`, el onboarding, los endpoints— siguió funcionando sin tocar una línea, y
lo cargado no se ve hasta que alguien publica. Publicar es el único acto deliberado.

### Lo que quedó bloqueado: la llave

El RD identifica sus actividades con códigos propios (`MOV-1010`, `MOV-1550`, …) que **no
existen en `mining_programa`** —ahí los códigos son `P333-…` y `312-CONS-…`. Es un tercer
código, de la planilla de movilización. Sin puente, las **1.100 HH reales de Collahuasi cruzan
con 0 paquetes**.

`svc_recursos.actividad_mapa` quedó sembrada con los **9 códigos distintos** que aparecen, sin
mapear. A qué CWP corresponde cada uno es una decisión de obra: nadie puede adivinarla. En
cuanto se llenen, `pub.recursos_hh_por_cwp` se enciende sola y `pub.recursos_cobertura_llave`
sube de 0 %.

```sql
update svc_recursos.actividad_mapa
   set cwp_id = '312101.C001', cod_actividad = 'P333-2A-0720-47-0320', mapeado_at = now()
 where project_id = 'b2ad07a9-1dec-4e5a-9a46-7b6a41a73001' and cod_rd = 'MOV-1550';
```

---

## 14. Nota para el equipo que industrialice esto

Lo que está aquí definido —propiedad del dato, contrato publicado, versión inmutable,
trazabilidad de insumos— es la parte que **no debe cambiar** aunque cambie todo lo demás. La
implementación concreta (schemas de Postgres, vistas, endpoints de Next.js) es negociable y
seguramente mejorable.

Si se decide extraer servicios a procesos independientes, el criterio ya está: el corte va por
el contrato de `pub`, y el consumidor no debería notar la diferencia. Si un cambio propuesto
obliga a que un consumidor sepa cómo el otro servicio guarda sus datos por dentro, ese cambio
está rompiendo el diseño.
