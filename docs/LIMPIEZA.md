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
