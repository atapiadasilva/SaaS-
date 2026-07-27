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
