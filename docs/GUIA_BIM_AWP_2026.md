# Guía BIM–AWP 2026 (Anexo 7) → Hilo Digital: mapa de conformidad

**Documento fuente:** «Guía consulta práctica REQUERIMIENTOS BIM AWP para proyectos de montaje
industrial y de infraestructura minera», V01 · primera edición julio 2026.
Codelco Vicepresidencia de Proyectos + Hoja de Ruta BIM (CChC / CDT). 54 páginas.

**Qué es:** el consenso de la Mesa Minera 2025 sobre el Anexo 7 BIM AWP de Codelco, construido en
un kick off y tres talleres con mineras, ingenierías, constructoras y proveedores. No es norma ni
obligación contractual —lo dice su propia exención de responsabilidad— pero **es el lenguaje con el
que se van a escribir y evaluar las bases técnicas de licitación** del rubro. Andrés Tapia aparece
en la lista de participantes (p.53).

**Por qué importa para el producto:** cada brecha entre la guía y la plataforma es, a la vez, una
funcionalidad pendiente y un argumento de venta. Hilo es fuerte donde la guía es breve
(construcción, WFP, IWP) y es débil donde la guía es exhaustiva (etapas de ingeniería FEL2/FEL3,
atributos por disciplina, rutas de planificación, puesta en marcha).

---

## 1. Lo que la guía valida de lo que ya existe

No hay nada que cambiar acá. Sirve para defender decisiones ya tomadas:

| Definición de la guía | Dónde vive en Hilo |
|---|---|
| «El IWP es una unidad de trabajo ejecutable, segura y controlable, cuyo alcance puede completarse normalmente por **una cuadrilla dentro de un período acotado**» (p.14) | `src/lib/iwp-apertura.ts` — el objetivo sale de `n_personas × horas_día × días_trabajo × factor`, con el turno como dato |
| «Los IWP nacen de la división de los CWP y **deben completar el alcance total** del paquete» (glosario 19) | El corte parejo `ceil(total/objetivo)`: no deja colas |
| «…contiene todo lo necesario para ejecutar una tarea específica de forma segura, eficiente y **libre de restricciones**» | `puedeTransicionar` en `mining-iwp` — gate duro en `LIBERADO` |
| «Los CWA pueden contener uno o varios CWP de la misma disciplina; la necesidad de quiebre se define en función de la estrategia constructiva» (glosario 11) | Modelo CWA → CV → CWP, con quiebre por frente físico (`item` + `partida_bmp`) |
| «El SWP puede integrar alcances provenientes de **distintos CWP e IWP**, porque responde a la lógica operativa y no a la división disciplinar» (p.14) | `mining_swp_subsistemas` con `cwp_id`: la matriz ya está modelada |
| «Los roles BIM y AWP **no deben concentrarse en una misma persona**» (p.21) | Todavía no: ver §4 |

---

## 2. Lo que se implementó (2026-08-06)

### 2.1 Catálogo de atributos — `src/lib/atributos-bim.ts`

Los ~90 atributos del capítulo 5.6, agrupados como en la guía (General · Adquisiciones · AWP ·
Civil · Equipos mecánicos · Equipos eléctricos · Cañerías y válvulas · Instrumentación · Soportes ·
Hormigones · Estructuras · Minería · Puesta en marcha · As built), cada uno con su tipo, las etapas
en que se exige y —lo que la guía no puede traer— **la columna de `mining_elementos` que lo guarda
hoy**. Incluye además los seis NDI (cap. 5.7) y los once hitos de avance del modelo con su
ponderación (cap. 5.8).

Mismo patrón que `src/lib/constraints.ts`: catálogo cerrado, con significado, en un solo archivo.

> **Letra chica de la extracción.** La tabla original marca las etapas con una `x` por columna. Al
> extraer el texto del PDF se pierde la alineación: las filas con cuatro y con dos `x` son
> inequívocas, las de tres se interpretaron por criterio de madurez de ingeniería y están marcadas
> con `nota` en el catálogo. Si el PDF original se revisa a mano, corregir ahí.

### 2.2 Pantalla de conformidad — `mineria/atributos`

Entra desde el explorador CWP y desde el editor de elementos, botón **Anexo 7**. Mide el modelo
cargado contra el catálogo, para la etapa que se elija, con filtro por disciplina.

Separa deliberadamente dos cifras que se confunden todo el tiempo:

- **Cobertura del catálogo** — qué proporción de los atributos exigidos la plataforma siquiera
  puede contestar. La mejora la plataforma.
- **Llenado del modelo** — de los que sí guardamos, cuántos elementos traen el dato. La mejora el
  modelador.

Un informe que sólo mide lo que ya guarda siempre da 100% y no sirve para nada.

**Dos decisiones de cálculo que importan:**

1. Los códigos `SIN-CWA`, `SIN-CWP.POR_ASIGNAR` y `{padre}.SIN-CV` **no cuentan como atributo
   presente**. Son placeholders de UI para "por asignar". Sin descontarlos el informe diría que el
   100% de los elementos tiene CWP, cuando hay 33.733 filas apuntando a paquetes que no existen.
2. Se cuenta con `count(*) exact, head: true` por columna deduplicada, no trayendo filas. Son
   57.519 elementos en el Puerto: contar en el cliente es el error que ya costó caro en la Sala de
   Apertura.

Los grupos por disciplina se marcan como tales: medir «% de elementos con Diámetro Nominal» sobre
el modelo completo no dice nada del cumplimiento de piping.

### 2.3 Columnas faltantes — `scripts/sql/08-anexo7-atributos.sql`

**No aplicado.** Abre en `mining_elementos` los atributos AWP y de adquisiciones que hoy no tienen
dónde vivir (`aporte_suministro`, `mwp_id`, `ras`, `contrato_construccion`, `eta`, `numero_den`,
`orden_compra`, `vendor`, `requisicion`, `hoja_datos`, `memoria_calculo`, `equipo_vendor`,
`estado_avance_bim`, `estado_aprobacion`, `ndi`, `actividad_id`), y en `mining_cwp`/`mining_cwa` los
campos del contenido mínimo del Plan de Paquetización (`responsable`, `limites_bateria`,
`interfaces`, `codigo_mandante`).

Quedan **fuera a propósito** los atributos de disciplina profunda (túneles, hormigones, soportes,
instrumentación) y los de puesta en marcha: la guía dice que los atributos se acuerdan en el PEB de
cada proyecto y no se copian completos. Cuarenta columnas que nadie va a poblar sólo ensucian la
tabla.

**`aporte_suministro` no es una columna más.** Define de quién es la restricción de material: si el
suministro lo aporta el mandante, el dueño del despeje no es el contratista. Hoy
`src/lib/constraints.ts` manda todo `MATERIAL` al departamento de Suministros sin distinguir.

---

## 3. La tensión real: el atributo `Actividad`

La guía exige, desde FEL 3, el atributo **`Actividad` — «Código ID de actividad vinculada desde el
programa de construcción»** a nivel de elemento (p.29).

Ese dato **no se puede deducir de la tabla de datos 4D de SmartPlant**, aunque lo aparente con sus
cinco actividades por elemento: dentro de cada CWP todos los elementos comparten exactamente el
mismo conjunto de actividades (19 CWP → 19 conjuntos; ni la clase constructiva los separa). Es el
vínculo CWP→actividad disfrazado, y ya vive en `mining_programa.cwp_id`. Se probó y se descartó el
mismo día: `scripts/sql/04-elemento-actividad.sql`.

La guía no se equivoca: el atributo tiene que **venir declarado por el modelador**. Lo que hay que
evitar es darlo por cumplido porque el 4D "lo trae". Conviene dejarlo escrito así en el PEB de cada
proyecto — es exactamente el tipo de exigencia que un mandante marca como cumplida y no lo está.

---

## 4. Lo que queda pendiente, en orden

### 4.1 Informe de CWP según Plan de Lanzamiento (p.45) — *el más barato*

La guía define su contenido mínimo: confirmar alcance, límites y responsables · identificar las
actividades de los tres meses siguientes · registrar y gestionar restricciones · verificar la
disponibilidad de ingeniería, suministros, permisos, recursos y condiciones de terreno · incorporar
la validación de ingeniería, construcción, planificación y control, adquisiciones, contratos,
calidad, seguridad, sustentabilidad y puesta en marcha.

Campo por campo, es lo que la Sala de Apertura ya calcula. Falta emitirlo como PDF desde
`cwp-ficha/[cwp_id]/print`, con los cuatro campos nuevos del script 08 y un pie de validación por
área. Convierte una pantalla interna en el entregable contractual que el mandante pide.

### 4.2 Estados de avance del modelo E1–E4 (cap. 5.8) — *producto nuevo, encaja solo*

Once hitos que acumulan 100% **por disciplina**: Setup 5 · Layout 5 · Iniciado 5 · Preliminar 15 ·
Revisión multidisciplinaria 10 · Actualización 15 · Avanzado 10 · Aprobación 5 · Modificaciones 15 ·
Terminado 10 · Final 5. Es un **estado de pago de la ingeniería** con exactamente la misma mecánica
de rules of credit que `mining_ponderaciones` ya usa para el avance físico de construcción.

El catálogo ya está en `atributos-bim.ts` (`HITOS_AVANCE_MODELO`) y la pantalla lo muestra como
referencia. Falta la columna `estado_avance_bim` poblada (script 08) y la vista de avance por
disciplina. Es el producto natural para **Ingeniería FEED EPV1**, que hoy está vacío: Hilo mide
construcción y no mide modelo.

### 4.3 Roles BIM y AWP (cap. 5.4)

Seis roles BIM (Dirección · Gestión · Coordinador · Administrador · Modelador · Revisor) y tres AWP
(Líder o Champion AWP · Especialista de Constructibilidad · Workface Planner), con la regla dura de
que no se concentran en la misma persona. Hoy Hilo tiene RLS por organización y cero roles
funcionales. Es lo que permite después: quién firma la ficha, quién publica una versión, a quién se
le asigna la restricción sin elegirlo a mano. Encaja con la arquitectura de dueño-del-dato con
versiones publicadas que ya existe.

### 4.4 PoC #1–#4 y las rutas PoE / PoP / PoCSU (caps. 5.9–5.10) — *el hueco grande*

Hilo empieza cuando el CWP ya existe. La guía dice que el CWP **sale de una sesión colaborativa
multidisciplinaria** (Path of Construction), que hay cuatro a lo largo del ciclo —PoC #1 define CWA
en prefactibilidad, #2 quiebra en CWP en factibilidad, #3 refina con ingeniería de detalle, #4 se
corre con el contratista adjudicado y es el que habilita el WFP— y que la lógica va al revés:

> El PoCSU define qué sistemas deben habilitarse y en qué secuencia · el PoC establece cómo y cuándo
> construirlos · el PoE cuándo debe estar el diseño · el PoP cuándo deben llegar equipos y materiales.

Lo aprovechable: **la Mesa de Apertura ya es ese patrón un nivel más abajo**
(`mining_apertura_sesion` + `mining_iwp_borrador` + publicar). Una Mesa de PoC que quiebra CWA→CWP
con borrador compartido y publicación reusa la arquitectura completa. Y `mining_swp_subsistemas` ya
tiene `cwp_id`: la «matriz de relación entre CWP, sistemas, subsistemas y SWP» que la guía exige
como anexo (p.44) está a una vista de distancia, con 32 filas ya cargadas.

### 4.5 PEB — Plan de Ejecución BIM (glosario 5)

«Documento dinámico y actualizable que declara los usos BIM, roles, recursos, requisitos por estado
de avance y organización». Es un entregable contractual. Setup ya tiene casi todos los insumos
(módulos activos, etapa, datos cargados); faltaría declarar los **18 usos BIM** del capítulo 5.5 y
emitir el documento. Barato una vez que existan §4.2 y §4.3.

---

## 5. Vocabulario: lo que la guía nombra y Hilo llama distinto

| Guía | Hilo | Nota |
|---|---|---|
| `CWP-C-08-3120-H-002-H-AEO-Y` (Codelco), `CWP-0044-200-PP-114` (BHP) | `312101.C001` | La traducción existe dentro de `sp3d-cwp-declarado.mjs` y se pierde al terminar el script. El campo `codigo_mandante` del script 08 la guarda |
| EAIM — Estado de Avance de Información de Modelos | *(no existe)* | Ver §4.2 |
| NDI — Nivel de Información | *(no existe)* | Catálogo ya en `atributos-bim.ts`, columna en el script 08 |
| MTO — Material Take Off | Banco de cantidades (`cwp-banco.ts`) | La guía pide que el MTO salga del modelo; en Hilo sale del itemizado contractual, que es más cercano a la plata |
| MWP — Module Work Package | *(no existe)* | `spool` e `isometrico` ya cargados son su materia prima |
| Constructibilidad | *(implícito en la Mesa)* | La guía lo trata como rol y como análisis formal |

---

## Fuentes

- Guía de consulta práctica BIM AWP V01, julio 2026 — Codelco VP + Hoja de Ruta BIM (`Downloads/Guia Consulta práctica Requerimientos BIM y AWP.pdf`)
- `docs/PROPUESTA_AWP_2026.md` — el plan WFP contra el que se prioriza esto
- `scripts/sql/04-elemento-actividad.sql` — por qué el vínculo elemento→actividad no sale del 4D
