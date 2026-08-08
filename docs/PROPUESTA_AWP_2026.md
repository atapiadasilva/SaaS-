# Propuesta Hilo Digital — de plataforma de datos a máquina de apertura CWP→IWP

**Fecha:** 2 de agosto de 2026
**Alcance:** análisis completo de la plataforma (código + base de datos real), benchmark contra
referentes internacionales (O3 Solutions, WorkPacks, COAA/CII), y plan de mejora.

---

## 0. El resumen en un párrafo

El motor de apertura de CWP en IWP está construido, está bien argumentado y **no se usa**.
Hay **159 CWP cargados**, de los cuales **98 tienen banco de cantidades completo** (itemizado con
rendimiento HH/unidad) y son aperturables hoy mismo. En toda la plataforma existen **4 IWP**,
los cuatro creados a mano, **cero** filas en `mining_iwp_partida`, **cero** en `mining_iwp_progreso`,
**cero** en `mining_iwp_elemento` y **cero cuadrillas** en los cinco proyectos. La apertura del
proyecto es 0%.

No es un problema de motor. Es un problema de **embudo**: la acción que da sentido a todo el
producto está cuatro clics adentro, bloqueada por un prerrequisito invisible, sin lista de qué
aperturar, y sin ciclo de retorno que premie a quien la ejecuta. Esta propuesta corrige eso.

---

## 1. Diagnóstico

### 1.1 Lo que está bien (y hay que decirlo)

| Pieza | Estado |
|---|---|
| `src/lib/iwp-apertura.ts` | Motor puro, determinista, corre igual en cliente y servidor. Corta en paquetes **parejos** (`ceil(total/objetivo)`) en vez de trocear hasta agotar: no deja colas y el TAKT queda constante. Es mejor que el default de la industria. |
| `src/lib/cwp-banco.ts` | El banco sale del itemizado y no de la MC, con el razonamiento documentado. **Validado con datos**: en Collahuasi el itemizado suma 487.783 HH contra 486.978 del planner — 0,2% de diferencia. |
| Dimensionamiento | El tamaño objetivo del IWP sale de `n_personas × horas_día × días_trabajo × factor`, no de una constante. Es la única forma correcta en Chile, donde el turno es 7×7 o 14×14 y no 5×2. |
| `AperturaWizard.tsx` | Cuatro pasos, preview en vivo con el mismo motor que escribe el servidor, alertas con severidad. |
| POST `mining-iwp-apertura` | Revalida el saldo contra la base antes de escribir y revierte el lote completo si falla la segunda inserción. Correcto para una sesión de Pull Planning con varias personas. |
| `IwpSkyline.tsx` | El Skyline existe y está bien resuelto. Es el estándar visual de la industria. |
| Conciliación | Las 4 relaciones (ECO-2→CWP, ECO-2→BMP, Programa→CWP, Aconex→CWP) están medidas con paginado real. |
| Ponderaciones | 312 pasos físicos sobre 61 partidas en Collahuasi: son **Rules of Credit** ya cargadas. |

### 1.2 Salud real de las relaciones (Collahuasi, proyecto principal)

Medido directo contra la base:

| Relación | Resultado |
|---|---|
| Itemizado → CWP | **919 / 919 (100%)**, cero huérfanos |
| Itemizado → `partida_bmp` | 100% poblado |
| Planos → CWP | **512 / 512 (100%)** |
| HH itemizado vs HH planner | 487.783 vs 486.978 → **0,2%** |
| Programa P333 sin `cwp_id` | 26 actividades |
| Programa P333 sin match en itemizado | 123 actividades |
| Itemizado sin `partida_mp` | 69 items → sin reglas de crédito |
| Ponderaciones huérfanas | **190** de 563 no calzan con ningún `partida_mp` |
| Elementos BIM sin CWP | 93 |
| **CWP sin una sola línea de itemizado** | **31 de 74** |
| CWP sin elementos en el modelo | 27 |
| CWP sin programa | 7 |

Consolidado de los tres proyectos poblados:

| Proyecto | CWP | Con itemizado | Con rendimiento completo | HH itemizado |
|---|---|---|---|---|
| Collahuasi | 74 | 43 | 39 | 487.783 |
| Spence (SCPY) | 58 | 37 | **37 (100%)** | 207.714 |
| Andina | 27 | 26 | 22 | 65.624 |
| **Total** | **159** | **106** | **98** | **761.121** |

**98 CWP aperturables. 0 aperturados.**

### 1.3 Los cinco problemas de fondo

**Problema 1 — La acción principal está escondida.**
Ruta actual para aperturar un CWP: `AWP Minería` → buscar el CWP en una lista de 74 → pestaña
`IWP` → botón `Aperturar CWP`. Cuatro niveles. No hay ninguna llamada a la acción en el Panel,
ni en la home del proyecto, ni en la barra de navegación. El Panel KPI (305 líneas, excelente
para el contrato) no tiene **una sola métrica de WorkFace Planning**.

**Problema 2 — Un prerrequisito invisible bloquea todo.**
`mining_cuadrilla` tiene **0 filas en los 5 proyectos**. Sin cuadrilla no hay capacidad de ciclo,
sin capacidad no hay `hhObjetivo`, sin objetivo no hay propuesta. El wizard tiene un rescate
(`CuadrillaRapida`) pero aparece recién en el paso 2, después de que el usuario ya invirtió tiempo.
El catálogo vive en `recursos/cuadrillas` y nadie lo llenó porque nada obliga a llenarlo.

**Problema 3 — El ciclo del IWP no cierra.**
Después de crear los IWP no pasa nada más:

- **No existe la transición de estado.** Ninguna pantalla mueve un IWP a `LISTO_PARA_TRABAJO`,
  `EN_EJECUCION` o `COMPLETADO`. La única escritura de `status` fuera de la creación está en
  `api/mining-iwp-constraint/route.ts:45,86` y **sólo lo devuelve a `PLANIFICADO`**. El semáforo
  del Skyline nunca se puede encender.
- **El vocabulario está roto.** En la tabla conviven hoy `'Planificado'`, `'PLANIFICADO'` y
  `'LISTO_PARA_TRABAJO'`. Tres grafías, sin `CHECK`. Los mapas de color de `IwpManager`,
  `IwpSkyline`, `CwpGantt` y `planificacion` comparan por string exacto: **un IWP creado por el
  asistente (`'Planificado'`) no pinta en ninguna de las cuatro vistas.**
- **El avance no llega a la plata.** `mining_iwp_partida.cantidad_ejecutada` existe y siempre vale 0.
  `mining_iwp_progreso` tiene 0 filas. El Estado de Pago no ve nada de lo que pasa en los IWP.
- **No hay parte de terreno.** No hay ruta pensada para un teléfono ni rol de capataz.

Si el ciclo no cierra, la primera apertura no produce ningún beneficio visible. Y entonces nadie
la repite. **Ese es el verdadero motivo del 0%.**

**Problema 4 — El modelo relacional aguanta por disciplina, no por diseño.**

- Las llaves que conectan todo son **texto libre sin FK**: `mining_itemizado.cwp_id`,
  `mining_programa.cwp_id`, `mining_planos.cwp_id`, `mining_doc_aconex.cwp_id_exacto`,
  `mining_elementos.cwp_id`, `mining_3wla.cwp_id`. Hoy están limpias porque el loader las limpia,
  no porque la base las obligue. Un import malo las rompe en silencio.
- `mining_iwp_elemento` sólo tiene FK a `projects`: **no** a `mining_iwp` ni a `mining_elementos`.
- Hay FKs compuestas generadas mal (`mining_elemento_codigo.project_id → mining_elementos.sp3d_moniker`).
- **Tablas muertas o sin producto:** `mining_mc` (997 filas, ya declarada no-fuente en CLAUDE.md
  pero todavía referenciada en `IwpManager` como `fuente: 'mc' | 'itemizado'`), `mining_partidas`
  (477), `mining_epr` (836), `mining_pwp` (51), `mining_swp` (32), `mining_bmp_partidas` (74),
  `mining_obras_crosswalk` (76), `mining_estudio_aconex` (101), `mining_awp_linea_equipo` (0),
  `mining_awp_piping_elemento` (0), `mining_bot_*`, `bot_tools_dinamicas`. De ~60 tablas, el
  producto usa ~25. Cada tabla muerta es una decisión que un desarrollador futuro va a tomar mal.
- Los tipos de restricción son **6 strings libres en un `<select>`** (`IwpDetail.tsx:298`), sin
  catálogo, sin departamento dueño, sin responsable.

**Problema 5 — La navegación es un menú de tablas, no un flujo de trabajo.**
13 módulos planos, todos con el mismo peso visual. Un gerente y un jefe de terreno ven exactamente
lo mismo. Los 5 dashboards de departamento son el mismo componente (`DeptoDashboard`) con distinto
filtro: son **destinos de lectura**, no bandejas de trabajo, así que nadie entra dos veces.
`mineria/page.tsx` son 1.094 líneas con tres paneles colapsables, cinco pestañas y un visor 3D:
es la joya de la plataforma y también donde se pierde el usuario nuevo. Trisemanal sigue en la
navegación de los cuatro proyectos aunque está pausado.

---

## 2. Los referentes internacionales

### 2.1 Qué hacen O3 y WorkPacks

**O3 Solutions — ONBuild** ([o3.solutions](https://o3.solutions/use-cases/workface-planning/)):
scoping **gráfico y no gráfico** de IWP desde el modelo 3D; *constraint management* avanzado con
restricciones auto-creadas, asignadas a un responsable con fecha de cierre; **packaging copilot**
con IA que sugiere el paquete óptimo según estándares de industria y factores del proyecto;
workflows de estado y aprobaciones; roles y permisos **por contrato** para colaborar entre varias
organizaciones en un mismo proyecto; visualización 3D/4D con progreso en tiempo real; EVM y
análisis de varianza de plazo y desempeño.

**WorkPacks** ([workpacks.com](https://workpacks.com/)): planificación del **Path of Construction**
con automatización, desde el marcado del plot plan hasta la generación sistemática de CWP, EWP y
PWP; **auto-generación de EWP/CWP/IWP/PWP**; **IWP Release Plan automatizado**; *constraint
management* y optimización de programa; dashboards con curvas S, **Skyline** y visualización de
estados; WorkPacks Delta como plataforma de integración de datos con sistemas EPC y digital twins.

### 2.2 Qué dice el estándar (COAA / CII), que es lo que más importa

De la práctica recomendada de AWP/WFP ([COAA](https://coaa.ab.ca/), [CII](https://www.construction-institute.org/)):

1. **El IWP es un alcance discreto de aproximadamente una semana**, ejecutable por una cuadrilla.
2. **Un IWP no se libera a terreno si no está libre de restricciones.** Es una regla dura, no una
   recomendación.
3. **Cada Superintendente mantiene un backlog de 4 semanas de IWP libres de restricciones**,
   planificando al mismo ritmo al que se ejecuta, con cuatro semanas de colchón entre que el
   paquete queda constraint-free y que se ejecuta.
4. **Cada semana el Superintendente saca IWP constraint-free del backlog** y los mete al programa
   como actividades de nivel 5 → eso forma el look-ahead de tres semanas. *(El 3WLA no se llena
   con actividades: se llena con IWP ya despejados.)*
5. **Restricciones críticas:** Documentos, Materiales y Andamios. **Secundarias:** Equipos de
   construcción, Control de Proyectos, Seguridad, Calidad y Personal. Cada restricción se **asigna
   a una persona** que la cierra.
6. **Rules of Credit por commodity** (ejemplo de cañería: soportes 20%, montaje 30%, soldadura 30%).
7. **El número de IWP va en el parte diario**, y eso liga el *Earned Value* al *Burned Value* a
   nivel de paquete, que después consolida al CWP.
8. Al final del proyecto el foco gira de áreas a **sistemas (SWP)** para comisionamiento y entrega.

### 2.3 Dónde está Hilo

| Capacidad | O3 / WorkPacks | Hilo hoy |
|---|---|---|
| Path of Construction | Sí, automatizado | No existe |
| Quiebre CWP→IWP dimensionado | Sí (copilot IA) | **Sí — y mejor argumentado** (cuadrilla × turno real, no constante) |
| Scoping gráfico desde el 3D | Sí | Parcial: el puente viewer→IWP existe, `mining_iwp_elemento` está vacío |
| Constraint management | Con dueño, fecha y escalamiento | Básico: tipo libre, fecha, checkbox. Sin responsable, sin departamento, sin escalamiento |
| Regla constraint-free para liberar | Gate duro | **No existe la acción de liberar** |
| Backlog de 4 semanas | KPI de cabecera | No medido |
| IWP Release Plan | Automatizado | No existe |
| Skyline | Sí | **Sí** |
| Rules of Credit | Sí | **Sí** (312 pasos cargados) pero desconectados del Estado de Pago |
| Parte diario / móvil | Sí | No |
| EVM ganado vs quemado | Sí | Campos existen, sin curva ni consolidación |
| SWP / turnover | Sí | Tabla con 32 filas, sin producto |
| Roles por contrato multi-org | Sí | RLS por organización, sin roles funcionales |

### 2.4 Las tres ventajas reales de Hilo (hay que defenderlas)

1. **El IWP se dimensiona con el turno chileno real.** 7×7, 14×14, 6×1 son dato de contrato en
   `mining_turno`, no constante. Ningún competidor lo tiene porque en Norteamérica el turno es 5×2
   y el "1.000 HH" les funciona. Acá no.
2. **El banco de cantidades sale del itemizado contractual (ECO-2), así que el IWP nace conectado
   a la plata.** En O3 el IWP nace conectado al modelo y a las HH; la valorización es otro sistema
   y otro proveedor. Ese puente es el producto.
3. **La ficha del CWP es editable por departamento con versiones publicadas** (`servicio_version`,
   `calculo_lineage`): dato con dueño, contrato inmutable y trazabilidad ISO 19650. Eso es CDE de
   verdad, no un repositorio de PDFs.

---

## 3. La propuesta

### Principio rector

> La plataforma tiene **una sola pregunta**: *«¿qué puede ejecutar terreno la semana que viene, y
> qué falta para que pueda?»*. Todo lo que no contesta eso es soporte, y debe verse como soporte.

### Movimiento 1 — Un embudo, no trece módulos

Reagrupar la navegación por **etapa del ciclo AWP**, no por tabla:

| Etapa | Contiene | Pregunta que responde |
|---|---|---|
| **1 · Planificar** | Diccionario AWP (minería) + Planificación | ¿Qué hay que construir y cuándo? |
| **2 · Aperturar** | **Sala de Apertura** *(nuevo)* | ¿Qué CWP quiebro esta semana? |
| **3 · Despejar** | **Tablero de Restricciones** *(nuevo)* + bandejas por departamento | ¿Qué frena a los paquetes que vienen? |
| **4 · Ejecutar y cobrar** | Terreno *(nuevo)* + Estado de Pago | ¿Qué se hizo y cuánto vale? |
| **Datos** | Setup, Onboarding, Conciliación, Recursos | ¿Está sano lo que cargamos? |

Los cinco dashboards de departamento dejan de ser destinos de lectura y se convierten en **la
bandeja de restricciones de ese departamento**: *«tienes 7 restricciones abiertas que frenan 3 IWP
que parten en 12 días»*. Eso les da un motivo para entrar todos los días, que hoy no tienen.

### Movimiento 2 — La Sala de Apertura (el corazón)

Módulo nuevo de primer nivel. Tres piezas:

1. **Ranking de CWP por aperturar.** Tabla ordenada por urgencia real: fecha de inicio programada,
   ruta crítica, % aperturado, HH de saldo. Botón `Aperturar` en cada fila — un clic desde la
   entrada al proyecto, no cuatro.
2. **Semáforo de aperturabilidad**, con el motivo exacto cuando está en rojo y el enlace para
   arreglarlo: *«31 CWP sin itemizado → ir a Conciliación»*, *«12 partidas sin rendimiento →
   cargar HH/unidad»*, *«sin cuadrilla de disciplina S → crear en Recursos»*.
3. **Una meta visible:** `% de HH del proyecto aperturadas` con objetivo, y `semanas de backlog
   constraint-free` con la meta de 4 del estándar COAA.

Y el **Panel gana una fila de WorkFace Planning** con cuatro números que hoy no existen en ninguna
parte: HH aperturadas / HH totales · semanas de backlog constraint-free · IWP que arrancan en 14
días con restricciones abiertas · PPC de la semana pasada.

### Movimiento 3 — Cerrar el ciclo del IWP

**a) Máquina de estados real, con un solo vocabulario y `CHECK` en la base:**

```
BORRADOR → PLANIFICADO → LISTO → LIBERADO → EN_EJECUCION → COMPLETADO → CERRADO
                                    ↖ EN_ESPERA ↙
```

- `PLANIFICADO → LISTO` es **automática** cuando las restricciones pendientes llegan a cero. La
  mitad negativa del disparador ya existe en `mining-iwp-constraint`; falta la mitad positiva.
- `LISTO → LIBERADO` es **manual y con gate duro**: no se libera con restricciones abiertas. Es la
  regla del estándar y es el momento exacto en que el producto genera valor.
- Migrar los 4 IWP existentes y corregir las tres grafías en el código.

**b) Tablero de Restricciones** (`/restricciones`): todas las restricciones de todos los IWP con
**responsable, departamento, fecha comprometida y escalamiento por vencimiento**. Requiere agregar
`responsable` y `depto` a `mining_iwp_constraint` y convertir los 6 strings del `<select>` en un
**catálogo alineado a COAA**: Documentos/IFC · Materiales · Andamios · Equipos · Permisos ·
Predecesora · Calidad/ITP · Personal. Cada categoría con departamento dueño por defecto → eso hace
posible la asignación automática y las bandejas del Movimiento 1.

**c) Release Plan de 6 semanas** (lo que hace WorkPacks): calendario donde cada semana muestra
cuántos IWP y cuántas HH están en `LISTO`, contra el ritmo que la dotación puede consumir. Es el
KPI de las 4 semanas de backlog convertido en pantalla operable.

**d) Parte diario de terreno.** Una pantalla, tres campos, hecha para un teléfono: IWP → pasos de
Rules of Credit tildados → HH reales → foto. **El 80% ya existe**: `mining_iwp_progreso`, los 312
pasos de `mining_ponderaciones`, y el `manifest.ts` + iconos PWA que ya están en el working tree.
Falta la ruta simple y el rol de capataz.

**e) Cerrar el círculo hacia el dinero.** `mining_iwp_partida.cantidad_ejecutada` (la columna ya
existe) se llena desde el parte diario, consolida por `partida_mp` y alimenta el Estado de Pago.
**Esto es lo que ningún competidor hace, y es el argumento de venta:** el capataz tilda un paso en
el teléfono y el estado de pago se mueve.

> **Nota sobre Trisemanal:** queda fuera de esta propuesta por instrucción. Cuando se retome, la
> corrección de fondo es que el 3WLA **no se llena con actividades del programa, se llena con IWP
> que ya están constraint-free** — es el paso 4 del estándar. Eso convierte a Trisemanal en la
> salida natural del Release Plan y no en un módulo paralelo.

### Movimiento 4 — Sanear el modelo de datos

| Acción | Detalle | Riesgo previo |
|---|---|---|
| **FKs compuestas** `(project_id, cwp_id)` | itemizado, programa, planos, doc_aconex, elementos, 3wla, iwp_elemento → `mining_cwp` | Limpiar huérfanos: 0 en itemizado, 26 en programa, 93 en elementos |
| **FK de `mining_iwp_elemento`** | → `mining_iwp` y → `mining_elementos` | Tabla vacía: costo cero |
| **`CHECK` de vocabulario** | `mining_iwp.status`, `mining_iwp_constraint.tipo`, `mining_cwp.status_cwp`, `origen_apertura` | Migrar las 3 grafías existentes |
| **Catálogo de restricciones** | Tabla `mining_constraint_tipo` con las 8 categorías COAA y su departamento dueño | Nueva |
| **Vistas de consolidación** | `v_cwp_banco` (saldo por CWP) y `v_iwp_estado` (restricciones + avance). Hoy `cargarBanco` hace 3 queries **por CWP** | Ninguno |
| **Archivar tablas muertas** | `mining_mc`, `mining_partidas`, `mining_epr`, `mining_bmp_partidas`, `mining_obras_crosswalk`, `mining_estudio_aconex`, `mining_awp_linea_equipo`, `mining_awp_piping_elemento`, `bot_*` | Inventario de uso primero; quitar el `fuente: 'mc'` de `IwpManager` |
| **`mining_swp` / turnover** | **No borrar.** Es la etapa final del AWP y es lo que el cliente minero pide para entregar sistemas. Producto en Fase 4 | — |

### Movimiento 5 — Que el dato entre solo

- **Checklist de aperturabilidad en Setup**, no de carga: en vez de *«¿cargaste el itemizado?»*,
  *«43 de 74 CWP están listos para aperturar; a los otros 31 les falta esto»*.
- **Biblioteca de rendimientos por organización** (tabla nueva `org_rendimiento`): cuando una
  partida no tiene `hh_unidad` queda fuera del quiebre. Debería heredar el rendimiento de la
  partida M&P equivalente ya usada en otro proyecto de la misma empresa. **Es un activo que crece
  con cada proyecto** — valor compuesto por cliente y una barrera de salida real.
- **La conciliación deja de ser una página aparte**: sus 4 relaciones aparecen como bloqueantes
  dentro de la Sala de Apertura, donde importan.

---

## 4. Roadmap

### ✅ Fase 0 — Desbloquear · aplicado el 2026-08-02

1. ✅ **40 cuadrillas sembradas** en los tres proyectos poblados, una por disciplina con CWP,
   sobre el turno por defecto (`scripts/sql/05-wfp-gate-liberacion.sql`). Son plantillas de 10
   personas: **hay que ajustarlas a la dotación real en Recursos → Cuadrillas** antes de
   aperturar en serio.
2. ✅ **Vocabulario de estado unificado** con `CHECK` en la base y los 4 IWP existentes
   migrados. `src/lib/iwp-estado.ts` es ahora la fuente única; Skyline, Gantt, Planificación y
   el detalle leen de ahí.
3. ✅ **La apertura salió de su escondite**: módulo propio en la barra de navegación
   (`Apertura`), botón de un clic por fila en el ranking, y fila WorkFace Planning en el Panel.
4. ⏸️ **Aperturar 3 CWP reales de Collahuasi** — pendiente a propósito: con dotaciones de
   plantilla el motor propone 118 IWP de 657 HH para un CWP de 77.500 HH. La cifra correcta
   sale sola cuando las cuadrillas tengan su tamaño real. Es una decisión de negocio, no de código.

### ✅ Fase 1 — Sala de Apertura y gate de liberación · aplicado el 2026-08-02

- ✅ **Sala de Apertura** (`.../mineria/apertura`): ranking por urgencia real (fecha de inicio,
  ruta crítica, saldo), semáforo de aperturabilidad con el motivo exacto y el enlace para
  arreglarlo, y el asistente abriéndose desde la propia fila.
- ✅ **Máquina de estados completa** con la frontera del estándar: `LISTO_PARA_TRABAJO` lo
  calcula el servidor cuando cae la última restricción; `LIBERADO` lo decide una persona.
- ✅ **Gate constraint-free** validado en el servidor (`puedeTransicionar`): no se libera un
  paquete a terreno con restricciones abiertas, ni se libera uno sin cantidades asignadas.
- ✅ **Restricciones con dueño**: catálogo COAA de 10 tipos con departamento responsable y
  marca de crítica, más `responsable`, `depto`, `severidad` y semáforo de vencimiento.
- ✅ **Vistas `v_cwp_banco` y `v_cwp_cobertura`**: la agregación bajó a la base. La Sala pasó de
  paginar 57.519 elementos en el cliente a responder de inmediato.
- ⏳ Falta de esta fase: las bandejas por departamento (los dashboards de depto siguen siendo
  destinos de lectura).

### Fase 2 — Despejar y ejecutar · 4–6 semanas
Tablero de Restricciones con responsable y escalamiento, bandejas por departamento, Release Plan de
6 semanas, parte diario móvil.

### Fase 3 — Cerrar el círculo al dinero · 4 semanas
`cantidad_ejecutada` → Estado de Pago, curva de ganado vs quemado por IWP y por CWP, PPC semanal.

### Fase 4 — Diferenciación (con CENIA)
Copiloto de apertura que sugiere estrategia y tamaño según lo que funcionó antes; predicción de
restricciones desde Aconex y suministros; biblioteca de rendimientos; SWP y turnover.

---

## 5. Métricas de éxito

| Indicador | Hoy | Meta 90 días |
|---|---|---|
| % de HH del proyecto aperturadas en IWP | **0%** | 60% |
| Semanas de backlog constraint-free | **0** | 4 (estándar COAA) |
| PPC — IWP completados / IWP comprometidos de la semana | no medido | > 80% |
| % de IWP que cierran dentro del ciclo de turno | no medido | > 85% |
| Días promedio de despeje de restricción, por departamento | no medido | < 10 |
| CWP sin itemizado (Collahuasi) | 31 de 74 | < 5 |

---

## Fuentes

- [AWP Solution for Workface Planners — O3 Solutions](https://o3.solutions/use-cases/workface-planning/)
- [Workface Planning Software for Construction / ONBuild — O3 Solutions](https://o3.solutions/solutions/construction-workface-planning/)
- [Explore WorkPacks: The AWP Software](https://workpacks.com/)
- [Advanced Work Packaging / WorkFace Planning — A Best Practices Guideline (COAA)](https://coaa.ab.ca/wp-content/uploads/2022/09/COP-AWP-PBP-01-2016-v1-Advanced-Work-Packaging-Summary.pdf)
- [WorkFace Planning Templates and Tools Checklist — COAA](https://coaa.ab.ca/document-category/workface-planning-templates-and-tools-checklist/)
- [Making the Case for Advanced Work Packaging as a Standard (Best) Practice — CII RT-319](https://www.construction-institute.org/making-the-case-for-advanced-work-packaging-as-a-standard-best-practice)
- [IWP Development & Release Planning — CII](https://www.construction-institute.org/iwp-development-release-planning)
- [Advanced Work Packaging: Design through Workface Execution v2.1 — CII](https://www.construction-institute.org/advanced-work-packaging-design-through-workface-execution-version-2-1)
- [Workface Planning — Insight-AWP](https://insight-awp.com/workface-planning/)
- [Talking AWP Ep. 3: IWPs and Rules of Credit — Insight-AWP](https://insight-awp.com/advanced-work-packaging-podcast-iwps-and-rules-of-credit/)
- [WorkFace Planning 201: Optimizing IWP Creation and Management — TCON Global](https://tconglobal.com/workface-planning-201-optimizing-installation-work-package-iwp-creation-and-management/)
- [Advanced Work Packaging: A Recommended Practice for Capital Projects — Omega 365](https://blogs.omega365.com/story/advanced-work-packaging-with-omega-365-50287)
