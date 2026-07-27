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
| EIMI00413 Andina | pendiente | por crear |

## Módulos (fuente única: `src/lib/modules.ts`)
`projects.active_modules` (jsonb array de claves) define qué módulos ve cada proyecto. El layout `[org_slug]/projects/[project_id]/layout.tsx` los lee con `resolverModulos()`. Categorías: **núcleo** (panel, setup — siempre), **AWP** (mineria, planificacion, trisemanal, recursos, conciliacion, estado-pago), **departamentos** (calidad, medio-ambiente, sso, equipos, rrhh). La nav está en `components/layout/ProjectNavBar.tsx`.

## Onboarding (productizado — clave del negocio)
El "cargo de implementación" = cargar los datos del cliente. Flujo:
1. Crear proyecto (`projects/new/CreateProjectForm.tsx`) → elige etapa y módulos del catálogo → va a Setup.
2. **Setup** (`.../setup/page.tsx`): toggles de módulos + checklist de datos cargados (`/api/project-setup`).
3. **Onboarding** (`.../onboarding/page.tsx`): sube archivos (Excel/CSV/`.xer`), auto-mapea columnas (CWP obligatorio), previsualiza y carga vía `/api/project-ingest`. Parser XER en `src/lib/xer.ts`.
4. Para packs completos: `node --env-file=.env.local scripts/load-datapack.mjs <xlsx> <project_id>` — **loader parametrizado** que carga CWP/programa/itemizado/ponderaciones/personal/suministros/docs desde el Excel de "data pack" (hojas P1–P10). Usa la columna **`CWP_hilo`** como clave.

El formato de data pack que un cliente/IA debe entregar está en `Downloads/Brief_Datos_para_Cowork.md` e `Instruccion_Andina_para_Cowork.md`.

## Modelo de datos y llaves de conexión
Tablas centrales (todas con `project_id`): `mining_cwa`, `mining_cv`, `mining_cwp`, `mining_programa` (P6/P333), `mining_itemizado` (ECO-2), `mining_ponderaciones` (Bases de M&P), `mining_elementos` (BIM), `mining_planos`, `mining_doc_aconex`, `mining_iwp` (+ `_actividad`/`_constraint`/`_progreso`), `mining_3wla` (+ `_restriccion`), `mining_personal`, `mining_suministro`.

**Llaves que conectan todo:**
- `CWP` (cwp_id) → conecta programa ↔ itemizado ↔ elementos ↔ planos ↔ trisemanal.
- `mining_programa.cod_actividad` = `mining_itemizado.partida_bmp` → conecta itemizado ↔ programa (el código P333 en Collahuasi, código P6 tipo `A1250` en Spence).
- `mining_itemizado.partida_mp` = `mining_ponderaciones.item_code`/`subitem_code` → avance físico (Estado de Pago).
- `mining_itemizado.commodity` → mapea a partida M&P.

## Convenciones y gotchas (IMPORTANTE)
- **`mining_programa` se filtra SIEMPRE por `.eq('fuente','P333')`** en las queries — al cargar un proyecto nuevo, poner `fuente='P333'` o no se ve nada.
- **`mining_elementos` y `mining_cwp` NO tienen columna `id`** — para contar usar `select('*', {count:'exact', head:true})`, no `select('id')`.
- **Las disciplinas (chips/filtro del explorador CWP) se derivan de los propios CWP** en `/api/mining-data`, NO de `mining_disciplinas` (esa tabla puede estar vacía en proyectos onboardeados).
- **`mining_itemizado.partida_bmp` guarda el código de programa** (link al CWP), NO el de Bases de M&P. El de M&P va en **`partida_mp`** (columna aparte). No confundir ni sobreescribir.
- RLS: para inserts masivos que el MCP no aguanta, usar el service role (scripts con `--env-file=.env.local`) o Edge Function temporal.
- Índice único `idx_itemizado_project_item_partida` (project_id, item, partida_bmp) — no es constraint, no sirve `ON CONFLICT`.
- El export de Excel a veces trae filas vacías (ojo con conteos "fantasma").

## Rutas principales (App Router)
`src/app/[org_slug]/projects/[project_id]/`:
- `panel` (KPIs), `mineria` (explorador CWP + visor 3D + fichas + IWP; el más grande), `planificacion`, `trisemanal` (3WLA), `recursos` (dotación por disciplina), `conciliacion` (salud de cruces), `estado-pago`, `calidad`/`medio-ambiente`/`sso`/`equipos`/`rrhh` (dashboards por depto vía `DeptoDashboard`), `setup`, `onboarding`.
- Sub-rutas de mineria: `elementos` (editor BIM), `sistemas` (SWP), `documentos`, `cwp-ficha/[cwp_id]` (editor de ficha PDF) + `/print`.

APIs en `src/app/api/mining-*` y `project-*`. Scripts de datos en `scripts/` (parsers Python + loaders Node, todos parametrizables por project_id).

## Estado actual / pendientes
- Multi-proyecto robusto (módulos por proyecto, onboarding, loader parametrizado) — hecho.
- Pendiente: integraciones API vivas (ACC/P6/Aconex), IA de detección de restricciones, PWA de terreno, cargar el modelo BIM al visor por proyecto (hoy `mining_elementos` se puebla por script/CSV).
- Limpieza de UI (botones sin uso) — hacer quirúrgica cuando el dueño señale.
