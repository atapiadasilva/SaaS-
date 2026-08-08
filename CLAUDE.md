# CLAUDE.md — Hilo Digital

Contexto para trabajar en este repo. Léelo completo antes de tocar código.

## Qué es
**Hilo Digital** es una plataforma web de gestión de proyectos de construcción industrial bajo la metodología **Advanced Work Packaging (AWP)** + **CDE ISO 19650** + IA. Integra en una sola fuente de verdad: modelo BIM, programa (Primavera P6), matriz de cobro (ECO-2/itemizado), documentación (Aconex) y planificación de terreno. Es un **SaaS multi-empresa / multi-proyecto** (cobro por proyecto). Postulación CORFO en curso; el dueño (Andrés Tapia) cubre BIM/AWP/ISO, un equipo del CENIA hará IA/optimización/PWA.

**Principio maestro del dato:** todo se conecta por el **CWP** (Construction Work Package). Formato de código: `CV.DisciplinaSeq` → `312101.C001` (CV 6 díg + `.` + letra disciplina + secuencia).

## Stack
- **Frontend:** Next.js 16 + React 19 + TypeScript (App Router). UI blanco/rojo (`#FF0000`), estilos inline + Tailwind.
- **Backend/CDE:** Supabase (PostgreSQL) — **project ref `lsoesbsrlfingfckozsq`**. ~75 tablas, prefijo `mining_*`. RLS multi-tenant.
- **BIM viewer:** Autodesk Forge/APS. **Docs:** Aconex (local + futura API).
- **Repo:** github.com/atapiadasilva/SaaS- (rama `master`).

## Comandos
- `npm run dev` → localhost:3000 (limpia `.next/dev/types` antes, evita EBUSY en Windows).
- `npm run typecheck` → `tsc --noEmit` (mantener SIEMPRE en 0 antes de commitear).
- `npm run smoke` → smoke test de rutas (server corriendo).
- El dev server suele lanzarse detached con el `.bat` del Escritorio "HILO Digital - Servidor".

## Variables de entorno (`.env.local`, NO está en git)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTODESK_CLIENT_ID/SECRET/CALLBACK_URL`, `ACONEX_DOCS_DIR` (rutas locales de PDFs, separadas por `;`). Ver `.env.example`. Pedir valores reales al dueño.

## Multi-tenant: organizaciones y proyectos
Jerarquía: **organización (empresa/cliente) → proyecto (unidad de cobro y de datos) → miembros**. RLS: todas las `mining_*` usan la política *"Users can access mining data in their orgs"* (acceso vía `organization_members`).

Organización activa: **EIMISA** (slug `eimisa`, id `96aa5951-6849-45f4-8d86-2aeb853ef47b`).

Proyectos (project_id):
| Proyecto | project_id | Estado |
|---|---|---|
| EIMI00417 Puerto Collahuasi | `b2ad07a9-1dec-4e5a-9a46-7b6a41a73001` | REAL, poblado (el principal) |
| Puerto Collahuasi 2 | `21db8086-2d48-486e-a26a-e303d9edda12` | limpio (onboarding) |
| EIMI00418 BHP Spence (SCPY) | `d9e5f943-9ff8-42d2-a9f7-2eee11c9941a` | poblado desde data pack |
| Ingeniería FEED EPV1 | `643871dc-3654-471c-a2ec-8e34bedf4d61` | vacío |
| EIMI00413 Andina | `3a32fa60-2f23-441b-be0b-9b3aef900b58` | creado, onboarding en curso |

## Módulos (fuente única: `src/lib/modules.ts`)
`projects.active_modules` (jsonb array de claves) define qué módulos ve cada proyecto. El layout `[org_slug]/projects/[project_id]/layout.tsx` los lee con `resolverModulos()`. Categorías: **núcleo** (panel, setup — siempre), **AWP** (mineria, **apertura**, planificacion, trisemanal, recursos, conciliacion, estado-pago), **departamentos** (calidad, medio-ambiente, sso, equipos, rrhh). La nav está en `components/layout/ProjectNavBar.tsx`.

`apertura` cuelga de `mineria` (`path: 'mineria/apertura'`). Por eso la nav marca el activo con **el href más largo que calce**, no con `startsWith` a secas: si no, Minería y Apertura se encienden juntas.

## Onboarding (productizado — clave del negocio)
El "cargo de implementación" = cargar los datos del cliente. Flujo:
1. Crear proyecto (`projects/new/CreateProjectForm.tsx`) → elige etapa y módulos del catálogo → va a Setup.
2. **Setup** (`.../setup/page.tsx`): toggles de módulos + checklist de datos cargados (`/api/project-setup`).
3. **Onboarding** (`.../onboarding/page.tsx`): sube archivos (Excel/CSV/`.xer`), auto-mapea columnas (CWP obligatorio), previsualiza y carga vía `/api/project-ingest`. Parser XER en `src/lib/xer.ts`.
4. Para packs completos: `node --env-file=.env.local scripts/load-datapack.mjs <xlsx> <project_id>` — **loader parametrizado** que carga CWP/programa/itemizado/ponderaciones/personal/suministros/docs desde el Excel de "data pack" (hojas P1–P10). Usa la columna **`CWP_hilo`** como clave.

El formato de data pack que un cliente/IA debe entregar está en `Downloads/Brief_Datos_para_Cowork.md` e `Instruccion_Andina_para_Cowork.md`.

## Modelo de datos y llaves de conexión
Tablas centrales (todas con `project_id`): `mining_cwa`, `mining_cv`, `mining_cwp`, `mining_programa` (P6/P333), `mining_itemizado` (ECO-2), `mining_ponderaciones` (Bases de M&P), `mining_elementos` (BIM), `mining_planos`, `mining_doc_aconex`, `mining_iwp` (+ `_actividad`/`_partida`/`_constraint`/`_progreso`), `mining_3wla` (+ `_restriccion`), `mining_personal`, `mining_suministro`, `mining_turno` + `mining_cuadrilla` (WFP).

### Regla de oro del cobro: todo ítem del itemizado necesita forma de pago
**Cada ítem del itemizado tiene que tener su forma de pago definida en las Bases de Medición y Pago** (`mining_itemizado.partida_mp` → `mining_ponderaciones.item_code`/`subitem_code`). Un ítem sin esa partida se ejecuta igual en terreno, pero **no se puede medir ni facturar**: es trabajo que se regala. Por eso el aviso de Estado de Pago es rojo y no amarillo — no es calidad de dato, es plata que se pierde.

Medido en el Puerto: **69 de 919 ítems sin forma de pago** (Desinstalación de Equipos, Equipos mecánicos, Montaje de equipos eléctricos y soportes secundarios). Se asignan en Conciliación → *Itemizado → forma de pago*.

**Vocabulario: se dice «itemizado», no «ECO-2».** El nombre del documento cambia entre contratos y clientes; lo que no cambia es que es el itemizado de cobro y que se paga según las Bases de Medición y Pago. Toda la interfaz dice «itemizado» y «forma de pago». Las claves internas de la API (`eco2_cwp`, `eco2_hh`) conservan el nombre viejo a propósito: son contrato entre API y front, y renombrarlas no le cambia nada al usuario.

**Llaves que conectan todo:**
- `CWP` (cwp_id) → conecta programa ↔ itemizado ↔ elementos ↔ planos ↔ trisemanal.
- `mining_programa.cod_actividad` = `mining_itemizado.partida_bmp` → conecta itemizado ↔ programa (el código P333 en Collahuasi, código P6 tipo `A1250` en Spence).
- `mining_itemizado.partida_mp` = `mining_ponderaciones.item_code`/`subitem_code` → avance físico (Estado de Pago).
- `mining_itemizado.commodity` → mapea a partida M&P.

## Convenciones y gotchas (IMPORTANTE)
- **Paginar PostgREST SIN `.order()` devuelve filas repetidas y se salta otras.** Sin ORDER BY el motor no garantiza el orden entre páginas, así que `.range(0,999)` y `.range(1000,1999)` pueden traer la misma fila dos veces. Medido en el Puerto: `mining_elementos` daba 15.000 "duplicados" y 41.000 elementos "faltantes" que no existían. **Todo `.range()` va con `.order()`** por una columna estable (`sp3d_moniker`, `cod_actividad`…). Ojo: el síntoma es un diagnóstico plausible pero falso, no un error.
- **`mining_programa` se filtra SIEMPRE por `.eq('fuente','P333')`** en las queries — al cargar un proyecto nuevo, poner `fuente='P333'` o no se ve nada. Conviven **dos programas**: `P333` es el contractual del mandante (`P333-1A-0322-41-0233`) y es el único que lee la aplicación; `MC` es el programa de construcción propio (`312-CONS-1130`), 206 actividades en el Puerto, que es al que apunta el 4D del modelo. Nada de la app lee `MC` todavía.
- **`mining_elementos` y `mining_cwp` NO tienen columna `id`** — para contar usar `select('*', {count:'exact', head:true})`, no `select('id')`.
- **Las disciplinas (chips/filtro del explorador CWP) se derivan de los propios CWP** en `/api/mining-data`, NO de `mining_disciplinas` (esa tabla puede estar vacía en proyectos onboardeados).
- **La disciplina de un elemento no siempre vive en `mining_elementos.disciplina`.** En el Puerto la lista real (Estructura 24.590, Piping 22.574, Hormigón 3.785…) sale de **`disciplina_modelo`**; `disciplina` viene vacía. Quien arme un selector con `mining_elementos_filtros()` y después filtre por `disciplina` a secas obtiene **cero filas sin ningún error**: la lista se ve bien y el conteo da 0. Resolver primero cuál columna trae valores (`disciplina` → `disciplina_modelo` → `especialidad_cod`) y usar esa misma para filtrar.
- **`mining_itemizado.partida_bmp` guarda el código de programa** (link al CWP), NO el de Bases de M&P. El de M&P va en **`partida_mp`** (columna aparte). No confundir ni sobreescribir.
- **NUNCA sumar `mining_mc.hh_item` ni `cantidad_item` por CWP.** La MC repite el total del item en cada actividad que lo toca: el CWP `312101.S001` tiene el item 113 en cinco filas (1ª a 5ª etapa) con las mismas 778 un y 42.430 HH cada una, y sumarlas da 225.666 HH contra 55.606 del planner. Para cantidades por CWP la fuente es **`mining_itemizado` filtrado por `cwp_id`** (queda dentro del 1–3% del `hh_planner`); de los 159 CWP cargados ninguno depende sólo de la MC. Ver `src/lib/cwp-banco.ts`.
- **La línea de alcance de un CWP es `item` + `partida_bmp`, no `item`.** Un mismo item aparece una vez por frente físico (Anillo A / B / C), cada uno con su cantidad. Agregarlo por item borra los frentes.
- RLS: para inserts masivos que el MCP no aguanta, usar el service role (scripts con `--env-file=.env.local`) o Edge Function temporal.
- Índice único `idx_itemizado_project_item_partida` (project_id, item, partida_bmp) — no es constraint, no sirve `ON CONFLICT`.
- El export de Excel a veces trae filas vacías (ojo con conteos "fantasma").
- **Las fechas de las planillas de P6 vienen en formato de EE.UU. (M/D/YYYY).** Leídas como texto con `fecha()` de `numeros.mjs`, el 10 de octubre se convierte en el mes 14 y Postgres rechaza el insert (o peor, pasa). Leer la hoja con `XLSX.read(..., {cellDates:true})` + `sheet_to_json(..., {raw:true})` y aceptar el `Date`. Ver `fechaCelda()` en `scripts/programa-cons-cargar.mjs`.

## La tabla de datos 4D de SmartPlant 3D (qué sirve y qué no)
`14.BIM\4D_Ultra_SP3dMoniker_ES (Tabla de datos).xlsx` — también es la hoja `SP3dMoniker` del `Programa Construcción PRC25031`. 84.994 filas, 16.043 elementos, llave `SP3d_Moniker` (`@a=0028!!240024##…`, el mismo que guarda `mining_elementos.sp3d_moniker` en el Puerto).

**Sirve** para el **CWP declarado por elemento**: es la asignación del planificador, y le gana al CWP deducido del árbol del modelo. Al cruzarla, 12.607 coincidían, 1.918 elementos sin CWP lo ganaron y 1.518 estaban en el paquete equivocado — los 403 de `312101.S001 → 312101.P001` son `Flange` y `Pipe` de la línea `8"-312-CT-17135` que el árbol había metido en estructuras. Cargar con `scripts/sp3d-4d-vincular.mjs`.

**NO sirve** para el vínculo elemento → actividad, aunque lo aparente con sus 5 actividades por elemento: **dentro de cada CWP los elementos comparten exactamente el mismo conjunto de actividades** (19 CWP → 19 conjuntos; ni la clase constructiva los separa). Es el vínculo CWP → actividad disfrazado, y ya vive en `mining_programa.cwp_id`. Se creó `mining_elemento_actividad` y se descartó el mismo día: ver `scripts/sql/04-elemento-actividad.sql`.

**NUNCA sumar `HH_Proporcional`** — es el total del grupo (CWP, clase, actividad) repetido en cada fila. Sumarlo por CWP da 1.178.499.168 HH para `312101.M001`, que tiene 56.119 de presupuesto. Misma trampa que `mining_mc.hh_item`.

Cuando el 4D contradice al CWP que una actividad ya tenía, **manda el que estaba**: el 4D deriva el CWP del paquete de los elementos que mueve, y eso mandaba nueve actividades de cajones y estanques (`312101.MB001`, calderería) al CWP de equipos mecánicos.

## WorkFace Planning: apertura de CWP en IWP
El corazón del módulo. Sigue la rutina de Pull Planning de O3 (Programa → Pull Planning → Look Ahead 3MLA/6WLA → Obeya → POD; ver `Presentaciones O3`, lámina 40).

Regla que gobierna el dimensionamiento: **un IWP lo cierra una sola cuadrilla dentro de un ciclo de turno**. El tamaño objetivo no es una constante — sale de `n_personas × horas_dia × dias_trabajo × factor_productividad`. Los turnos son dato (`mining_turno`: 7×7, 14×14, 6×1…), no constante, porque cambian por contrato.

- `src/lib/cwp-banco.ts` — el banco de cantidades del CWP con su saldo (lo que se descuenta).
- `src/lib/iwp-apertura.ts` — motor puro del quiebre. Corta en paquetes **parejos** (`ceil(total/objetivo)` partes iguales), no de a objetivo hasta agotar: así el TAKT es constante y no quedan colas. Se usa igual en el preview del cliente y en la validación del servidor.
- `src/lib/iwp-estado.ts` — **la máquina de estados y su vocabulario. Fuente única.** Nadie escribe un `status` a mano.
- `src/lib/constraints.ts` — **catálogo COAA de restricciones** con departamento dueño y cuáles son críticas.
- `.../mineria/apertura/page.tsx` — **la Sala de Apertura**: ranking de CWP por urgencia, semáforo de aperturabilidad y los KPI de WFP. Es la entrada; cada fila lleva a la Mesa.
- `.../mineria/apertura/[cwp_id]/page.tsx` + `src/components/awp/mesa/` — **la Mesa de Trabajo**. Reemplazó al asistente modal de 4 pasos, que iba en una sola dirección: una sesión de Pull Planning prueba una estrategia, la descarta, fusiona, divide, corre fechas y vuelve atrás. Layout: banco fijo a la izquierda, planilla + Gantt sobre el **mismo orden** (`construirLista` es compartida — si cada uno ordenara por su cuenta mostrarían cosas distintas), inspector a la derecha, parámetros en un ribbon permanente.
- APIs: `mining-apertura` (ranking + resumen WFP), `mining-apertura-mesa` (GET estado de la mesa — incluye banco, zonas del 3D y catálogos; POST con `accion`: generar/parametros/editar/lote/dividir/fusionar/eliminar/restaurar/publicar/descartar), `mining-iwp-apertura` (GET restricciones sugeridas por departamento), `mining-cuadrilla` (CRUD de turnos y cuadrillas). El endpoint aparte `mining-cwp-banco` era del wizard anterior y se eliminó en la cuarta limpieza.
- Catálogo de cuadrillas: `recursos/cuadrillas`.
- Vistas SQL `v_cwp_banco` y `v_cwp_cobertura` (ambas con `security_invoker = on`, si no se saltan el RLS). Usan la **misma llave `item + partida_bmp`** que `cwp-banco.ts`: si divergen, el ranking y la Mesa muestran saldos distintos.

### La sesión de apertura (borrador compartido)
`mining_apertura_sesion` (una **abierta** por CWP, garantizado por índice parcial) + `mining_iwp_borrador` (paquete propuesto, con sus `partidas` en jsonb). El borrador vive en la base para que sobreviva al reload y para que dos personas en la misma sesión de Pull Planning vean lo mismo. Al publicar, la sesión pasa a `PUBLICADA` y los borradores se convierten en `mining_iwp` + `mining_iwp_partida`.

- **`editado` es lo que hace usable la mesa**: al regenerar con otros parámetros, los paquetes que una persona tocó se conservan y su alcance se descuenta del saldo antes de repartir el resto. Sin eso, mover el objetivo de HH borraría media hora de refinamiento.
- **Los inserts por lote en PostgREST usan la unión de las claves de todas las filas.** Una fila a la que le falte `editado` o `hh` viaja con `NULL` explícito y revienta el `NOT NULL` en vez de tomar el `DEFAULT`. Todas las filas de un lote van con el mismo juego de claves.

### La máquina de estados del IWP (regla dura)
`PLANIFICADO → LISTO_PARA_TRABAJO → LIBERADO → EN_EJECUCION → COMPLETADO → CERRADO` (+ `HOLD`).
Hay `CHECK` en la base: cualquier otro valor revienta el insert.

- **`LISTO_PARA_TRABAJO` lo calcula el servidor**, nunca una persona: `mining-iwp-constraint` recalcula el semáforo cada vez que una restricción cambia y sube el paquete cuando las pendientes llegan a cero. Declararlo a mano sería mentirle al backlog.
- **`LIBERADO` exige cero restricciones abiertas.** Es la regla del estándar COAA, y se valida en el `PATCH` de `mining-iwp` (`puedeTransicionar`), no en el cliente. El botón de la UI sólo se anticipa para no ofrecer algo que va a fallar.
- Un IWP aperturado sin restricciones **nace `LISTO_PARA_TRABAJO`**.

### Gotchas propios del WFP
- **La semana de `semana_ejecucion` es ISO (`2026-W31`)** — usar `semanaIso()` de `lib/iwp-estado`. El POST manual antes guardaba la semana *del mes* (1–5) y los paquetes caían en columnas distintas del Skyline.
- Los tipos de restricción son un **catálogo cerrado con `CHECK`**. Al sembrar desde `mining_consideraciones` (texto libre de los departamentos) hay que pasar por `normalizarTipo()` o el insert falla.
- `mining_elementos` **no tiene FK al CWP** a propósito: tiene 33.733 filas apuntando a CWP inexistentes. Itemizado, planos y programa sí la tienen (`ON DELETE RESTRICT`), así que **borrar un CWP con datos colgando ahora falla** — es lo que se quiere.

## Conformidad BIM: la guía del Anexo 7
La **Guía de consulta práctica BIM AWP** (Codelco VP + Hoja de Ruta BIM CChC, V01 julio 2026) es el consenso de la Mesa Minera sobre el Anexo 7 BIM AWP de Codelco. No es norma, pero es el lenguaje con que se escriben y evalúan las bases técnicas del rubro. Mapa completo de brechas y pendientes en **`docs/GUIA_BIM_AWP_2026.md`**.

- `src/lib/atributos-bim.ts` — los ~90 atributos del cap. 5.6 agrupados como en la guía, con tipo, etapas en que se exige (FEL2/FEL3/detalle/construcción) y **la columna de `mining_elementos` que lo guarda**. Incluye los seis NDI (5.7) y los once hitos de avance del modelo E1–E4 con su ponderación (5.8). Mismo patrón que `constraints.ts`.
- `.../mineria/atributos` + `/api/mining-atributos-bim` — la pantalla de conformidad. **Separa dos cifras que se confunden**: *cobertura del catálogo* (cuántos atributos la plataforma siquiera puede contestar — la mejora la plataforma) y *llenado del modelo* (de esos, cuántos elementos traen el dato — la mejora el modelador). Un informe que sólo mide lo que ya guarda siempre da 100%.
- Medido en el Puerto al 2026-08-06, etapa Construcción: **97 atributos exigidos, 26 los guarda Hilo (26,8%), llenado 45,3%**. El CWP da 24.712/57.519 = 43,0%, que calza exacto con la carga del 4D — buena señal de que el descuento de placeholders funciona.
- **Los códigos `SIN-*` no cuentan como atributo presente** en las columnas de paquetización (`cwa_id`, `cwp_id`, `ewp_id`, `pwp_elemento`, `swp_id`): son placeholders de UI para "por asignar". Sin descontarlos el informe diría 100% de cobertura de CWP con 33.733 filas apuntando a paquetes inexistentes.
- **La agregación va en la base.** `scripts/sql/08-anexo7-atributos.sql` (aplicado el 2026-08-08) abrió las columnas faltantes y creó `mining_atributos_cobertura()`, que resuelve las ~20 cuentas en un solo recorrido; la API la usa con fallback columna-por-columna por si un proyecto no la tuviera. Lanzar los counts de a lotes es peor (18,6 s vs 7 s), porque el pooler los serializa igual.
- **El atributo `Actividad` (ID del programa por elemento) no se puede deducir del 4D** — ver `scripts/sql/04-elemento-actividad.sql`. La guía lo exige desde FEL 3, pero tiene que venir declarado por el modelador. Es el típico requisito que se da por cumplido y no lo está.

## Rutas principales (App Router)
`src/app/[org_slug]/projects/[project_id]/`:
- `panel` (KPIs + fila WorkFace Planning), `mineria` (explorador CWP + visor 3D + fichas + IWP; el más grande), `planificacion`, `trisemanal` (3WLA), `recursos` (dotación por disciplina), `conciliacion` (salud de cruces), `estado-pago`, `calidad`/`medio-ambiente`/`sso`/`equipos`/`rrhh` (dashboards por depto vía `DeptoDashboard`), `setup`, `onboarding`.
- Sub-rutas de mineria: **`apertura` (Sala de Apertura)**, `elementos` (editor BIM), `atributos` (Conformidad BIM / Anexo 7), `sistemas` (SWP), `documentos`, `cwp-ficha/[cwp_id]` (editor de ficha PDF) + `/print`.
- `mineria` acepta `?cwp=<id>` para abrir directo en un paquete (lo usa la Sala de Apertura).

APIs en `src/app/api/mining-*` y `project-*`. Scripts de datos en `scripts/` (parsers Python + loaders Node, todos parametrizables por project_id).

### Scripts del modelo BIM
Todos simulan por defecto y escriben sólo con `--aplicar`.
- `aps-vincular-sp3d.mjs` — carga elementos desde un volcado de propiedades de APS **deduciendo** el CWP del árbol del modelo. Es la primera pasada de un proyecto nuevo.
- `sp3d-4d-vincular.mjs` — corrige ese CWP deducido con el **declarado** en la tabla de datos 4D, y rellena isométrico/spool/línea/P&ID/especificación/peso/largo sólo donde están vacíos.
- `sp3d-cwp-declarado.mjs` — lo mismo para los modelos cargados con llave `externalId` (BHP): usa el volcado de propiedades como puente `SP3d Moniker → externalId` y traduce el código del mandante (`CWP-0044-200-PP-114`) al de Hilo (`0044200.P001`).
- `programa-cons-cargar.mjs` — carga el programa de construcción (`###-CONS-####`) desde la hoja `P6` del PRC25031 a `mining_programa` con `fuente='MC'`.

**Actualizar `mining_elementos` fila por fila vía PostgREST da 46 filas/minuto.** Para lotes se usa la tabla puente `_stage_elementos_4d` (NULL = "no tocar esa columna") y la función `aplicar_parches_4d(project_id)`, que resuelve todo en un `UPDATE ... FROM`.

### Documentos de Aconex
`aconex-cargar-metadatos.mjs <carpeta-del-respaldo> <project_id>` lee las dos planillas que trae el respaldo y las fusiona: **ExportDocs** (fecha, nombre de archivo, transmittal) y **PlantillaDeMetadatos** (CWP, EWP, TAG). Al ExportDocs hay que buscarle el encabezado — trae seis a diez filas de portada y el número varía entre exports.

El **`Estatus` de Aconex es el estado del ciclo de vida** que gobierna el gate de liberación del IWP ("Emitido para construcción" = IFC).

El vínculo documento → CWP se resuelve por prioridad y **la inferencia por código es el último recurso**: primero el CWP escrito en Aconex, luego el que el título nombra (`Procedimiento CWP 312101.F001 Malla a Tierra`), luego **el vínculo que ya existía**, y sólo al final área+disciplina del código. El orden importa: los vínculos previos tienen criterio que el código no alcanza — los planos de cajones (disciplina 45, Mecánica) están en `312101.MB001` (calderería) y los de disciplina 47 repartidos entre `E001`, `EW001` y `T001` según sean equipos, cableado o canalizaciones.

Los CWP de relleno (`SIN-CWP.POR_ASIGNAR`, `*.SIN-CV.SIN-CWP`) **no cuentan como vínculo**: un documento que sólo cuelga de uno de esos se vuelve a resolver.

Los PDF se sirven desde `ACONEX_DOCS_DIR` (ver `src/lib/aconex-local.ts`): se recorre recursivamente y se busca el código del documento dentro del nombre del archivo. **Sólo `.pdf`** — en el Puerto hay 108 planos que en Aconex existen únicamente como DWG, 36 de ellos emitidos para construcción, y desde la plataforma no se pueden abrir.

## Producto y modelo: los dos documentos de referencia
`docs/HISTORIAS_USUARIO.md` (las 16 personas, sus historias con criterios de aceptación y la matriz historia ↔ entidad ↔ dueño) y `docs/MODELO_DATOS.md` (las tres capas, las llaves de cruce, los vocabularios y las trampas de agregación). **Se leen juntos**: una historia sin entidad detrás es una brecha del modelo; una entidad sin historia es dato muerto.

Las cuatro brechas de escalabilidad que ese cruce destapó, en orden de desbloqueo/costo: (1) el **departamento de una persona no existe** — 11 departamentos dueños de restricciones contra 3 roles técnicos, se resuelve con `project_members.departamento` reusando el enum `tidp_discipline` que ya está en la base; (2) **el dato no sabe quién lo dejó** — de 56 tablas `mining_*`, 56 tienen `project_id` pero sólo 2 `updated_by` y ninguna `created_by`; (3) **el mandante/ITO no cabe en el multi-tenant** — `projects` cuelga de una sola `organization_id`, hace falta `project_acceso_externo`; (4) **el versionado está al 9%** — 1 servicio migrado de 11 y `calculo_lineage` en cero.

El **vocabulario duplicado** se limpió en la cuarta limpieza (2026-08-08): de los seis enums ISO 19650 que ninguna columna usaba se borraron cinco; queda sólo `tidp_discipline`, reservado para `project_members.departamento` (brecha nº1). El catálogo vivo de restricciones sigue siendo el `CHECK` en español + `src/lib/constraints.ts`. Ojo todavía con `projects.role_permissions`, que habla de módulos (`4d/awp/bim/cwp/team/roles/documents`) que no existen en `ModuleKey` — y que además **nadie lee**: se escribe una vez en `CreateProjectForm.tsx` y ahí muere, así que la autorización efectiva es sólo la RLS por organización.

## Estado actual / pendientes
- Multi-proyecto robusto (módulos por proyecto, onboarding, loader parametrizado) — hecho.
- **Fase 0 del plan WFP** (ver `docs/PROPUESTA_AWP_2026.md`) — hecho el 2026-08-02: vocabulario de estado con `CHECK`, FKs del CWP, catálogo COAA de restricciones con dueño, gate de liberación constraint-free, Sala de Apertura, fila WFP en el Panel, 40 cuadrillas sembradas.
- **La cifra que importa: el proyecto sigue en 0% de apertura.** 98 CWP tienen banco completo y ninguno está quebrado en IWP. Antes de construir más, aperturar CWP reales — con las dotaciones verdaderas, no las plantillas de 10 personas.
- **Puerto, modelo BIM** (2026-08-03): el CWP declarado del 4D quedó aplicado — 24.712 de 57.519 elementos con CWP real (43,0%, era 39,6%) y 7.329 con isométrico (eran 3.531). Cargado el programa de construcción completo: 206 actividades `MC` (antes 71, sólo del área 312), 146 con CWP. Respaldos en `_respaldo_elementos_puerto_20260803` y `_respaldo_programa_mc_20260803`.
- **Puerto, Aconex** (2026-08-04): cargado el respaldo completo desde `14.BIM\11 ATDS\Respaldo Aconex`. 902 documentos (842 del export + 60 previos), **842 con estado del ciclo de vida donde antes había cero** y 273 emitidos para construcción. 787 vínculos a 61 CWP, sin perder ninguno de los que ya estaban. 842 archivos extraídos a `…\Respaldo Aconex\docs` y `ACONEX_DOCS_DIR` apuntado ahí: 786 de 902 documentos (87%) tienen PDF servible. Respaldos en `_respaldo_doc_aconex_puerto_20260804` y `_respaldo_planos_puerto_20260804`.
- **SCPY sigue bloqueado, y ya se sabe por qué.** El export `SCPY Data NVS.xlsx` trae 28.000 elementos y 8.081 con CWP declarado, pero **el NWD publicado en APS no contiene esos objetos**: de los 11.443 del modelo, 10.812 están en el export y sólo **18** traen CWP. Lo mismo en las tres revisiones publicadas (LIMPIO, LIMPIO2, LIMPIO3), así que no es un problema de versión: el modelo publicado es una tajada de la planta que los modeladores no clasificaron. **Hay que pedir el NWD del mismo alcance del export** — con eso, `sp3d-cwp-declarado.mjs` lo resuelve sin tocar nada más.
- **Conformidad Anexo 7** (2026-08-06): catálogo de atributos, pantalla `mineria/atributos` y mapa de brechas en `docs/GUIA_BIM_AWP_2026.md`. El script `08-anexo7-atributos.sql` quedó aplicado el 2026-08-08: los 17 atributos "propuestos" ya tienen columna, el catálogo los mide y la pantalla usa `mining_atributos_cobertura()` (una pasada en vez de ~7 s).
- **Cuarta limpieza** (2026-08-08, auditoría completa): 10 APIs sin consumidor fuera (incl. `project-health`, que llamaba a un RPC inexistente), `admin-sync`, `lib/aps-oss` (API deprecada de APS), 13 tablas movidas al esquema `archivo`, 3 tablas vacías y 5 enums borrados, log de cambios purgado a la actividad real. Detalle y evidencia en `docs/LIMPIEZA.md`.
- Pendiente inmediato (Fase 2): tablero de restricciones transversal con escalamiento, Release Plan de 6 semanas, parte diario móvil, y `mining_iwp_partida.cantidad_ejecutada` → Estado de Pago.
- Pendiente de fondo: integraciones API vivas (ACC/P6/Aconex), IA de detección de restricciones, PWA de terreno, cargar el modelo BIM al visor por proyecto (hoy `mining_elementos` se puebla por script/CSV).
- Limpieza de UI (botones sin uso) — hacer quirúrgica cuando el dueño señale.
