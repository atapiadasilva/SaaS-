# Registro de limpieza de código

Bitácora de las eliminaciones de código muerto: qué se borró, con qué evidencia y cómo
recuperarlo. Todo lo listado aquí sigue en el historial de git.

---

## 2026-07-26 · Primera limpieza — 30 archivos, 11.250 líneas

**Resultado:** 187 → 157 archivos · 44.047 → 32.797 líneas (**−26%**).
`typecheck` 0 · `build` limpio · `smoke` 11/11.

### Cómo se detectó

Dos métodos independientes que dieron el mismo resultado:

1. **Grafo de conocimiento** ([graphify](https://graphify.net), `graphify update .`): 1.572 nodos,
   2.376 aristas. Reveló que las comunidades estructurales más grandes del repo eran
   componentes que nadie importaba — `PlanComparator` (60 nodos) e `IntegrityAnalyzer` (43).
2. **[scripts/huerfanos.mjs](../scripts/huerfanos.mjs)** — cierre transitivo sobre los imports
   reales del código. Es el que manda: cuenta sentencias `import`, no menciones en comentarios.

### Por qué hizo falta el cierre transitivo

Una sola pasada encontraba 20 archivos. Al borrarlos, otros 6 quedaban muertos; al borrar
esos, otros 4. **30 en total.** Un barrido simple deja siempre residuo, porque el código
muerto viene en racimos: alguien borró la página, quedó el componente, y con él su hook,
su tipo y su helper.

| Ronda | Archivos | Ejemplo |
|---|---|---|
| 1 — nadie los importa | 20 | `PlanComparator.tsx`, `SortableSequenceList.tsx` (1.475 líneas) |
| 2 — mueren al borrar la ronda 1 | 6 | `BimDataLinker.tsx`, `CreateOrgModal.tsx` |
| 3 — mueren al borrar la ronda 2 | 4 | `cwp-utils.ts`, `detectTables.ts`, `projectConfig.ts` |

### Cuatro falsos positivos que NO se borraron

Un grafo de imports no ve todas las puertas de entrada. Verificar antes de borrar no es
opcional:

| Archivo | Parecía muerto | Está vivo porque |
|---|---|---|
| `src/proxy.ts` | sin imports entrantes | **es el middleware de autenticación**; lo llama Next por convención |
| `mineria/page.tsx` y demás rutas | sin imports entrantes | Next las sirve por la convención de carpetas |
| `scripts/load-datapack.mjs` | sin imports entrantes | se ejecuta desde la terminal |
| `ModelTree.tsx` vs `ModelTreePanel` | nombre parecido | `ModelTreePanel` es una función local de `elementos/page.tsx`, no el componente |

Borrar `proxy.ts` habría dejado la plataforma sin control de sesión.

### Lo que se perdió (a conciencia)

- **`CreateOrgModal.tsx`** era la única interfaz para crear organizaciones, y solo la usaba
  `OrgsGrid` (muerto). Esa función ya era inaccesible antes de esta limpieza. Si se necesita,
  se recupera del historial.
- **`projectConfig.ts`** (`setModuleConfigKey`, `setBimLinkerKey`) solo lo usaban los dos
  linkers BIM muertos. Documenta dos RPC de Supabase (`merge_module_config`,
  `set_bim_linker_key`) que **siguen existiendo en la base**; si se vuelven a necesitar, el
  SQL está en el historial de ese archivo.
- **`detectTables.ts`** — detección automática de tablas en Excel. Capacidad interesante que
  hoy nadie invoca; el onboarding usa mapeo manual de columnas.

### Cómo revertir

```bash
git revert <hash-del-commit-de-limpieza>          # deshacer todo
git checkout <hash>^ -- src/components/awp/X.tsx  # recuperar un archivo suelto
```

### Cómo repetir el análisis

```bash
node scripts/huerfanos.mjs        # código muerto por cierre transitivo
graphify update .                 # regenerar el grafo (local, sin coste)
node scripts/analizar-grafo.mjs   # huérfanos + nodos críticos + complejidad
```

### Pendiente para una segunda fase

Rutas fuera del catálogo de módulos (`src/lib/modules.ts`): no aparecen en la navegación
pero siguen accesibles por URL y se compilan en cada build.

| Ruta | Líneas | Nota |
|---|---|---|
| `[project_id]/awp/` | 1.778 | generación anterior del explorador |
| `[project_id]/lps/` | 558 | Last Planner System |
| `[project_id]/4d/` | — | simulación 4D; arrastra `Bim4DPlayer` y `FourDGanttPanel` |
| `[project_id]/vistas/` | — | solo un redirect |

Borrarlas liberaría otras ~3.000 líneas, pero **cambia URLs** y puede que alguna se use como
prototipo. Requiere decisión explícita del dueño.

---

## 2026-07-26 · Segunda limpieza — rutas legacy, scripts y dependencias

**Resultado acumulado:** 187 → 152 archivos en `src` · el repo versionado baja de 24 MB a ~13 MB.
`typecheck` 0 · `build` limpio (100 rutas) · `smoke` 11/11.

**Respaldo previo:** tag `respaldo-antes-limpieza-profunda` y rama `respaldo/pre-limpieza-profunda`.

```bash
git checkout respaldo-antes-limpieza-profunda   # ver el estado anterior completo
```

### Rutas fuera del catálogo de módulos (4)

No aparecían en la navegación ni las enlazaba nadie: solo eran alcanzables escribiendo la
URL a mano. Se compilaban en cada build.

| Ruta | Líneas | Qué era |
|---|---|---|
| `[project_id]/awp/` | 1.778 | explorador AWP de la generación anterior, reemplazado por `mineria/` |
| `[project_id]/lps/` | 558 | Last Planner System |
| `[project_id]/4d/` | 148 | simulación 4D |
| `[project_id]/vistas/` | 5 | solo un `redirect` a `mineria` |

En cascada murieron `FourDGanttPanel.tsx` (854) y `Bim4DPlayer.tsx` (593).

### Scripts (27 archivos)

- **19 exploraciones puntuales** — `check-fields.ts` … `check-fields5.ts`, `check-rpc` …
  `check-rpc3.ts`, `read-excel-headers.ts`. Volcados de depuración de sesiones pasadas;
  típicamente cinco filas por consola. `scripts/inspeccionar-excel.mjs` cubre ese uso.
- **4 de Montemina** — importadores de un proyecto que no existe en la base.
- **4 parches ya aplicados** — `fix_hormigones_shift.js`, `fix-cwp-costs.ts`,
  `update-prices.ts`, `update-elements-cwa-cv.ts`. Corrigieron datos una vez; volver a
  ejecutarlos hoy sería peligroso, no útil.

### Otros

- **`scripts/xer_sql/`** — 49 volcados SQL (9,2 MB) del proyecto EIMI00357, inexistente en la base.
- **3 insumos de datos en la raíz** — `Programa Rev.1 Excel - Andina v2.xlsx`,
  `Programa_Andina_WBS.xlsx`, `_programa_andina.json`. Son entradas de trabajo, no código.
- **5 dependencias** sin un solo uso tras la limpieza: `@dnd-kit/core`, `@dnd-kit/sortable`,
  `@dnd-kit/utilities`, `@tanstack/react-table`, `reactflow`.

**Se mantienen** los `supabase_*.sql` de la raíz: documentan el esquema de la base.

### Hallazgo pendiente: 16 APIs sin consumidor

No se borraron. Una ruta de API puede llamarse desde fuera del front (integración, Postman,
un script) y el grep no lo ve. Requieren confirmación antes de tocarlas:

```
4d-schedule · activity-tags · catalog/activate · ingest · mining-iwp-elemento
mining-iwp-ficha · mining-reporte/html · model-data · model-versions/[id] · parse-mpp
program · program-links · program/versions · project-column-mapping · project-health
project-members
```

Verificado que ninguna la llamaba el front actual ni las rutas recién borradas — `awp/page.tsx`
no usaba `fetch`, hablaba directo con el cliente de Supabase. `project-health` aparece en el
smoke test, así que borrarla obliga a editar `scripts/smoke-api.mjs`.

---

## 2026-08-02 · Tercera limpieza — el sistema pre-`mining_*`, código y base de datos

**Resultado:** 18 archivos y 3.778 líneas menos en `src` · 20 tablas eliminadas de la base ·
la dependencia `cfb` fuera. `typecheck` 0.

Cierra el "hallazgo pendiente" de la segunda limpieza: 10 de aquellas 16 APIs sin consumidor
resultaron ser la capa entera anterior al modelo minero, y ahora hay evidencia dura de que
estaban muertas.

### Cómo se confirmó: cruzar el código con los datos, no solo con los imports

El método anterior (cierre transitivo de imports) no alcanza para las rutas de API: Next las
sirve por convención de carpetas, así que ninguna tiene imports entrantes y todas parecen
huérfanas. La prueba que sí decide es **contra qué tabla hablan y qué hay en esa tabla**:

1. Extraer todas las llamadas `fetch('/api/...')` del front → qué rutas se usan de verdad.
2. Extraer todos los `.from('tabla')` de cada ruta → qué toca cada una.
3. Contar filas de esas tablas en Supabase.

Una ruta que nadie llama y cuya tabla tiene 0 filas está muerta sin ambigüedad. Dos de ellas
—`activity-tags` y `program-links`— apuntaban a tablas que **ya no existían en la base**:
habrían devuelto error 500 el día que alguien las invocara.

### Código eliminado (3.778 líneas)

| Qué | Evidencia |
|---|---|
| `api/ingest` + `lib/ingestion-utils.ts` | tabla `nodes`, 0 filas |
| `api/activity-tags`, `api/program-links` | sus tablas ya no existían |
| `api/program` + `api/program/versions` | `program_activities`, 0 filas |
| `api/model-data` + `api/model-versions/[id]` | `model_elements`, 0 filas |
| `api/catalog/activate` | `tidps`/`deliverables`/`task_teams`, 0 filas |
| `api/parse-mpp` (467) | parser binario .MPP; el onboarding usa XER/Excel |
| `GanttChart.tsx` (1.082) + `PlanCharts.tsx` (412) | **se importaban solo entre ellos** |
| `api/invite` ×3 + `/invite/[token]` + `api/project-members` | flujo de tokens sin origen |

El par `GanttChart` ↔ `PlanCharts` es el caso que el cierre transitivo no detecta solo: dos
archivos que se importan mutuamente forman un ciclo con aristas entrantes, así que ninguno
aparece como huérfano aunque el ciclo completo esté desconectado del resto.

Las invitaciones se borraron porque `/api/org-members` ya usa
`supabase.auth.admin.inviteUserByEmail` — el mecanismo nativo de Supabase, con email real.
El flujo de tokens propios era una reimplementación que nadie disparaba: `project_invitations`
tenía 0 filas.

### Base de datos: 20 tablas (`scripts/sql/01-limpieza-tablas-legado.sql`)

El plan eran 9. La consulta de llaves foráneas entrantes reveló **7 satélites** más
(`edges`, `sot_mappings`, `custom_views`, `deliverable_versions`, `constraint_history`,
`activity_bim_links`, `activity_requirements`) y una revisión del esquema, 4 tablas vacías
sin código (`cwp_master`, `departments`, `milestones`, `tidp_notification_settings`).

**Verificar dependencias antes de borrar no es opcional.** Sin esa consulta el `DROP` habría
fallado a mitad de transacción; con `CASCADE` habría arrastrado tablas sin mirar cuáles.

`nodes` y `edges` eran el grafo ReactFlow de la primera generación. La dependencia `reactflow`
ya se había desinstalado en la segunda limpieza: el esquema llevaba semanas sin su motor.

La base queda con 50 tablas `mining_*` + 4 de plataforma + `bot_tools_dinamicas`.

### Lo que NO se tocó

- **`bot_tools_dinamicas`** (6 filas), **`mining_bot_*`** — hay un bot en alguna parte; sin
  entender qué lo consume, no se toca.
- **Las 6 APIs restantes del hallazgo anterior** — `4d-schedule`, `project-column-mapping`,
  `project-health`, `mining-reporte/html`, `mining-iwp-ficha`, `mining-iwp-elemento`.
  Funcionan y hablan con tablas vivas; parecen features a medio conectar, no basura.
- **`admin-sync`** — página oculta que siembra proyectos hardcodeados desde
  `project-constants.ts`. Contradice el multi-tenant, pero es decisión del dueño.

### Pendientes detectados de paso

- **`mining_cambios_log`: 178.469 filas**, casi el doble que `mining_elementos` (94.657).
  Log de auditoría inflado por las cargas masivas por script. Se puede purgar por fecha.
- **`projects/[project_id]/page.tsx` redirige siempre a `/mineria`**, aunque un proyecto en
  etapa licitación arranca sin ese módulo activo (`modulosPorDefecto`). Debería ir a `/panel`.
- **`src/lib/supabase/types.ts`** no lo importa nadie. Es el tipado generado; sirve de
  referencia, pero conviene saber que está desconectado.
- **~16 tablas `mining_*` sin `.from()` en el código** (`mining_epr` con 836 filas,
  `mining_pwp`, `mining_swp`, `mining_obras_crosswalk`…). A diferencia del caso de arriba,
  **varias tienen datos reales**: pueden ser cargas esperando su interfaz, no basura.
  Requieren revisión caso a caso.

---

## 2026-08-08 · Cuarta limpieza — auditoría completa código ↔ base

**Resultado:** 10 rutas de API + `admin-sync` + `lib/aps-oss` + 6 scripts + 7 dumps SQL de la
raíz fuera del repo · la base pasa de 69 a **47 tablas** en `public` (13 archivadas, 3 borradas)
· 5 enums y 3 funciones `SECURITY DEFINER` expuestas por REST eliminadas · el log de cambios
baja de 178.469 filas a 63 (las cargas masivas quedaron archivadas) · **se aplicó por fin
`08-anexo7-atributos.sql`** (la pantalla de Atributos deja de tardar ~7 s).
`typecheck` 0 antes y después. Migraciones: `limpieza_auditoria_2026_08_08` y `anexo7_atributos`;
SQL en [scripts/sql/09-limpieza-auditoria.sql](../scripts/sql/09-limpieza-auditoria.sql).

### Método

El de la tercera limpieza, completo y en ambas direcciones: (1) `fetch('/api/…')` y `/api/…` en
hrefs del front → APIs vivas; (2) `.from('tabla')` y `.rpc('fn')` en `src` y `scripts` → objetos
de base vivos; (3) conteo real de filas y última actividad; (4) FKs entrantes antes de cualquier
DROP; (5) definición de vistas/funciones antes de sentenciar sus tablas — `mining_swp_resumen`
devuelve `pids[]` y parecía leer `mining_awp_pid`, pero su definición mostró que los arma desde
`mining_awp_linea.pid_codigo`: la tabla estaba de verdad muerta.

### Rutas de API eliminadas (10) — sin un solo consumidor

| Ruta | Evidencia extra |
|---|---|
| `project-health` | además **rota**: llamaba al RPC `project_data_health`, que no existe → 500 siempre. Salió del smoke y entró `mining-apertura` |
| `4d-schedule` | config 4D que nadie escribe ni lee |
| `mining-cwp-banco` | era del wizard viejo; la Mesa importa `cargarBanco` directo |
| `mining-iwp-ficha`, `mining-iwp-elemento` | era la ficha IWP del wizard; `mining_iwp_elemento` tenía 0 filas |
| `mining-reporte/html` | reemplazado por `cwp-ficha/[cwp_id]/print` |
| `project-column-mapping` | el onboarding usa `project-ingest` |
| `mining-elementos/vincular-al-cwp`, `/agregar-sin-moniker`, `/tags` | del editor BIM anterior a `mineria/elementos`; el log confirma que sus orígenes (`vincular_4d_*`, `alta_sin_moniker_*`) no se escriben desde el refactor |
| `autodesk/oss/models` (+`/status`) y `lib/aps-oss.ts` | usaban el signed-upload **deprecado por Autodesk (responde 400)** — lo documenta `scripts/aps-subir-modelo.mjs`, que es el camino vivo |

También: `admin-sync/` + `lib/project-constants.ts` (siembra hardcodeada que contradice el
multi-tenant y apuntaba a `/api/projects/seed`, borrada hace dos limpiezas), `public/costanera/`
(JSON de un demo sin una sola referencia), `docs/ReactFlow_Migration.md` (reactflow salió en la
segunda limpieza).

### Scripts eliminados (6)

`bulk-import-xer.mjs` (escribía en `program_activities`, borrada en la tercera limpieza — roto),
`import-epv1.ts` y `exportProjectData.ts` (migradores del sistema pre-`mining_*`),
`import-planos-aconex.mjs` (reemplazado por `aconex-cargar-metadatos.mjs`), `analyze-xer.ts`
(exploración puntual), `grafo-datos.mjs` (visualización one-off con conteos hardcodeados de julio).
Y los 7 dumps `*.sql` de la raíz: documentaban el esquema de hace tres generaciones, con tablas
TIDP que ya no existen; el registro real son las migraciones de `scripts/sql/`.

### Base de datos

**Nada con datos se borró.** Se creó el esquema `archivo` (PostgREST no lo expone; se revierte
con `ALTER TABLE archivo.x SET SCHEMA public`) y allá se movieron:

- Los 4 respaldos `_respaldo_*` de agosto.
- 9 tablas con datos y cero código: `mining_awp_pid`, `mining_bmp_partidas`, `mining_condiciones`,
  `mining_doc_referencia`, `mining_epr` (836 filas), `mining_mapeo_area_cwa`,
  `mining_obras_crosswalk`, `mining_partidas` (477), `mining_pwp`.
- El bot completo (`bot_tools_dinamicas`, `mining_bot_*`): sin código en el repo y último
  mensaje el 2026-06-26.
- `mining_cambios_log` < 2026-08-01 → `archivo.mining_cambios_log_carga_junjul` (178.469 filas
  de pintado masivo y scripts de jun–jul; el log vivo queda con la actividad real de usuarios).

Se **borraron** (vacías y sin código): `mining_awp_linea_equipo`, `mining_awp_piping_elemento`,
`mining_iwp_elemento`. Y los objetos muertos: vista `v_mining_brechas`, funciones
`set_bim_linker_key`, `extract_cwp_combinations`, `create_organization`,
`mining_bot_schema_map` (las tres primeras eran `SECURITY DEFINER` invocables por cualquier
usuario autenticado vía REST — warning del linter de Supabase que esto cierra), y 5 de los 6
enums ISO sin columna (`cde_status`, `constraint_status`, `constraint_type`, `deliverable_type`,
`tidp_status`). `tidp_discipline` se conserva: es el plan para `project_members.departamento`.

**Siguen vivas aunque no lo parezcan:** `mining_dotacion` y `mining_personal` son **vistas**
(el `.from('mining_dotacion')` de `mining-kpi` que parecía un bug, no lo es);
`mining_awp_linea`/`mining_awp_equipo` las lee `mining-sistemas/detalle` y `mining_swp_resumen`;
`mining_avance_pasos`, `mining_ewp_ifc`, `mining_cwp_ficha` e `mining_iwp_*` están vacías pero
son el flujo WFP/Estado de Pago esperando datos; todo el juego `servicio_*`/esquema `pub` es la
arquitectura de servicios por departamento (decisión estratégica, se queda).

### Bugs corregidos de paso

- `projects/[project_id]/page.tsx` redirigía siempre a `mineria`, módulo que un proyecto en
  licitación no tiene activo → ahora a `panel` (siempre activo).
- Aplicado `08-anexo7-atributos.sql` y pasados los 17 atributos de `propuesta` a `columna` en
  `src/lib/atributos-bim.ts`.

### Segunda ronda (mismo día, autorizada por el dueño)

- **`/proyectos` se fusionó con `/dashboard`**: mostraban la misma grilla en dos URLs.
  `CarteraMadurez` vive ahora en el dashboard, `/proyectos` quedó como redirect y la barra
  lateral perdió el ítem duplicado.
- **Borrados los 4 IWP de prueba del Puerto** (`312101.D001-IWP-001/002/03`,
  `312101.S001-IWP-001`) con sus 5 actividades y 7 restricciones: ensuciaban Skyline y KPI
  mientras la apertura oficial va en 0%. `mining_iwp` queda en cero, listo para la primera
  apertura real.
- **`projects.role_permissions` eliminada** (migración `drop_role_permissions`): hablaba de
  módulos que no existen en `ModuleKey` y nadie la leía; el refactor ya había sacado la única
  escritura. La autorización efectiva es la RLS por organización.
- **El login no aparece más**: `HILO_ACCESO_DIRECTO_EMAIL` activa en `.env.local` hace que el
  proxy abra la sesión solo (`/auth/acceso-directo`). La página `/auth/login` se conserva como
  respaldo de emergencia (si falla la llave de servicio) y para cuando entren más usuarios.
- Protección de contraseñas filtradas (HaveIBeenPwned): **el dueño decidió no activarla** por
  ahora.

### Tercera ronda — revisión visual módulo por módulo

Recorrido con pantallazos de las 18 pantallas (vía Claude in Chrome). Tres incongruencias
de fondo que solo se ven mirando la aplicación funcionando:

1. **El RLS se evaluaba por fila.** `user_organizations()`, `user_has_project_access()` y
   `user_is_project_admin()` — las tres funciones que sostienen las políticas de las ~50
   tablas `mining_*` — eran `VOLATILE` (el default de Postgres). Dentro de una política, una
   función volátil no se puede cachear ni inline-ar: el planner la reevalúa **una vez por
   fila**. La Ficha del CWP lanza ocho consultas en paralelo sobre 902 documentos y 2.524
   líneas de itemizado, y todas morían con `canceling statement due to statement timeout`
   — el usuario veía ese texto crudo de Postgres en pantalla. Marcadas `STABLE` (migración
   `rls_helpers_stable`), la ficha carga completa. **No relaja la seguridad**: el filtro es
   idéntico, solo se evalúa una vez por consulta. Es el arreglo de rendimiento más grande de
   toda la auditoría y afecta a cada pantalla de la plataforma.
2. **El feed diario se contaba dos y tres veces.** `mining_consideraciones` acumula una fila
   por carga del reporte: 71 filas para 36 hechos reales. El Panel deduplicaba por su cuenta
   en el cliente y los dashboards de departamento no deduplicaban nada, así que Calidad
   mostraba tres veces el mismo ITP rechazado y el Panel una. La regla vive ahora en
   `src/lib/consideraciones.ts` y la usan las dos APIs: Calidad pasa de 19 a 6 consideraciones
   y los bloqueantes del Panel de 5 a 2.
3. **Los cajones "por asignar" se contaban como paquetes.** El explorador decía 74 CWP contra
   69 de la Sala de Apertura y de Conciliación, sobre el mismo proyecto: la diferencia eran
   los cinco `SIN-CWP` placeholder. `esCwpPlaceholder()` en `src/lib/awp-codigo.ts`, junto al
   resto de la codificación de paquetes. Ojo con el nombre del campo: `/api/mining-data`
   devuelve `cwp`, no `cwp_id` — filtrar por la clave equivocada no da error, simplemente no
   filtra nada.

**Identidad visual.** Documentos, Sistemas, el Editor de Elementos y el modal de configuración
BIM arrastraban los headers azul marino de la generación anterior (`#08203F`, `#0C1E4F`,
`#1565C0`) sobre fondo gris `#EEF2F7`: pasan a blanco con acento rojo, como el resto. Las
paletas de disciplina (los chips de colores del explorador y de Recursos) **se conservan**:
ahí el color es dato, no decoración.

### Cuarta ronda — un solo vocabulario

Con las pantallas ya coherentes en color, quedaba lo que se contradecía en **palabras y
cifras**:

| Dónde | Decía | Dice |
|---|---|---|
| Explorador de Minería | "suministros" (eran ítems del ECO-2; `mining_suministro` es otra tabla) | "ítems ECO-2" |
| Explorador y tarjeta de CWP | "HH planner" sobre las HH del programa P333 — y el planner es otra cifra (486.978 vs 530.652) que la propia ficha muestra al lado | "HH programa" |
| Explorador | "MM CLP" (suma de `costo_oferta_clp`) junto a un Panel que llama "Valor Contrato" a otra cifra | "MM CLP oferta" |
| Conciliación | `CONCILIACION` sin tilde, con la pestaña diciendo `CONCILIACIÓN` | con tilde |

**El banco divergía entre la Sala y la Mesa**: 77.536 HH contra 77.539 sobre el mismo CWP.
`cwp-banco.ts` redondeaba **cada una** de las 89 líneas y sumaba los redondeos; la vista
`v_cwp_banco` suma y redondea una vez (`round(sum(hh))`). Los totales se acumulan ahora sin
redondear y se redondean al final, como la vista — las líneas se siguen mostrando redondeadas.
Es exactamente la divergencia que este mismo repo advertía en `CLAUDE.md`.

**La máquina de estados del IWP estaba copiada en tres lugares más** (`planificacion`,
`CwpGantt`, `ficha/types`) y a las tres copias les faltaban `LIBERADO` y `CERRADO`. El efecto:
un paquete entregado a terreno se pintaba **gris como "Planificado"** en el Gantt —
justo lo que el Gantt existe para distinguir— y se imprimía como el código crudo `LIBERADO`
en la ficha que se le entrega al mandante. `CwpGantt` además pintaba de rojo el "Listo"
cuando el rojo es el "Liberado" en el resto de la plataforma. Las tres leen ahora
`lib/iwp-estado`, que ya era la fuente única declarada: **la regla estaba escrita, pero no
cableada.**

### Quinta ronda — las constantes que cada pantalla reimplementaba

Mismo patrón que la ronda anterior, ahora en color y formato. Dos módulos nuevos:
`src/lib/disciplinas.ts` y `src/lib/formato.ts`.

**Una disciplina, un color.** Había cuatro sistemas conviviendo: Estructura salía **roja** en
el explorador de Minería y **morada** en Recursos; Obras Civiles, azul en una y verde en la
otra. La causa de fondo es peor que la inconsistencia: el explorador y `/api/mining-data`
repartían la paleta **por orden alfabético de aparición**, así que la misma disciplina cambiaba
de color entre proyectos con distinto set, y agregar una disciplina nueva recoloreaba todas
las anteriores. Ahora el color cuelga del **código** de disciplina (la letra del CWP), que es
estable y compartido. La Sala de Apertura pintaba además todas las letras de un gris azulado
fijo y Trisemanal todas de rojo — con lo que el color no distinguía nada.

Planificación es el caso especial: el WBS de P6 sólo trae el texto (`"OBRAS CIVILES"`), no el
código, así que `codigoDesdeNombre()` lo traduce antes de pintar.

**Una fecha, un formato.** La misma fecha se escribía de cinco maneras:

| Pantalla | Escribía |
|---|---|
| Planificación, Minería | `18-Ene-27` |
| Trisemanal, IWP | `18-01` |
| Dashboards de departamento | `18-01-27` |
| Ficha del CWP (la que se entrega al mandante) | `2027-01-18` |

El canónico es `18-Ene-27` y **el mes va en letras a propósito**: este repo ya se quemó con
fechas ambiguas —las planillas de P6 vienen en formato de EE.UU. y el 10 de octubre entraba
como mes 14, ver `fechaCelda()` en `scripts/programa-cons-cargar.mjs`—. Un `05-03-27` no dice
si es marzo o mayo.

`lib/formato` fija de paso **qué se muestra cuando no hay dato**: había veinte copias del mismo
`toLocaleString('es-CL')`, unas devolviendo `—` y otras dejando la celda vacía para el mismo
caso, así que "sin dato" se veía distinto en cada tabla.
