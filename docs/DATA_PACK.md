# Data Pack de Hilo Digital — formato de entrega de datos de un proyecto

Este es el **contrato** para incorporar un proyecto nuevo a la plataforma. Un solo archivo
Excel con las hojas `P1` a `P10`. Quien prepara los datos (el cliente, un analista o una IA
de apoyo) solo necesita este documento.

> Ejemplo real de referencia: `EIMI00418_SCPY_Paquetes_HiloDigital.xlsx` (Spence).

---

## 1. La regla que hace que todo funcione: `CWP_hilo`

El **CWP es la llave del proyecto entero**, no un dato del módulo AWP. Es lo que permite
preguntar "¿qué pasa con este paquete?" y que respondan a la vez el programa, el itemizado,
los planos, el modelo 3D, los suministros y los documentos.

Por eso **cada fila de cada hoja que describa trabajo debe traer la columna `CWP_hilo`**, y
el valor debe ser **exactamente el mismo string** entre hojas.

### Formato del código

```
{CV}.{DISCIPLINA}{SECUENCIA}        ej.  312101.C001   ·   0044100.MB002
```

| Parte | Qué es | Regla |
|---|---|---|
| `CV` | Construction Vertical (subárea) | Solo dígitos. **Largo variable**: Collahuasi usa 6, Spence 7. Se acepta de 4 a 8 |
| `DISCIPLINA` | Letra(s) de disciplina | `C`, `D`, `S`, `M`, `MB`, `EW`, `FF`… |
| `SECUENCIA` | Correlativo dentro del CV y disciplina | Normalmente 3 dígitos |

El **CWA se deriva solo**: son los primeros 4 caracteres del CV (`312101` → `3121`). No hace
falta que lo calcules, pero si lo mandas se respeta.

Fuente de verdad en código: [`src/lib/awp-codigo.ts`](../src/lib/awp-codigo.ts).

---

## 2. Hojas

Solo **P1 es obligatoria**. Lo demás es opcional: cada hoja que agregues desbloquea módulos.

| Hoja | Contenido | Destino en la base | Habilita |
|---|---|---|---|
| **P1** | Catálogo CWP | `mining_cwp` + `mining_cwa` + `mining_cv` | La llave. Sin esto no hay proyecto |
| **P2** | Programa P6 | `mining_programa` | Planificación, Recursos |
| **P3** | Itemizado ECO-2 | `mining_itemizado` | Conciliación, Estado de Pago |
| **P4** | Bases de Medición y Pago | `mining_ponderaciones` | Avance físico y financiero |
| **P4b** | Mapeo Commodity → Partida | *(regla de derivación)* | Rellena `Partida_MyP` faltante |
| **P5** | Elementos BIM | `mining_elementos` | Visor 3D por paquete |
| **P6** | Documentos | `mining_doc_aconex` | Calidad, SSO, M. Ambiente |
| **P6b** | Vínculo Documento ↔ CWP | `mining_planos` | Planos dentro de la ficha del CWP |
| **P7** | Trisemanal (3WLA) | `mining_3wla` + `mining_3wla_restriccion` | Trisemanal y restricciones |
| **P8** | Personal clave | `mining_personal` | RRHH |
| **P9** | Suministros | `mining_suministro` | Seguimiento de materiales |
| **P10** | Ruta a ejecución | *(enriquece `mining_cwp`)* | Fecha IFC, suministro, ventana de obra |

### Columnas por hoja

**P1 — Catálogo CWP**
`CWP_hilo` · `Nombre` · `Disciplina` (letra) · `Disciplina_nombre` · `CWA` · `CV` · `CV_legible` · `EWP` · `Alcance` · `Costo_oferta_CLP` · `HH_planner` · `Fecha_ini` · `Fecha_fin`

**P2 — Programa P6**
`Cod_actividad` *(único)* · `Nombre_actividad` · `HH` · `Fecha_inicio` · `Fecha_fin` · `CWP_hilo` · `Cantidad` · `Unidad` · `WBS` · `CWA` · `Tipo_actividad`

**P3 — Itemizado ECO-2**
`Item` · `Descripcion` · `Unidad` · `Cantidad` · `HH` · `CWP_hilo` · **`Cod_programa`** *(debe existir como `Cod_actividad` en P2)* · `Commodity` · **`Partida_MyP`** *(debe existir como `Partida` en P4)* · `Area` · `WBS` · `Rendimiento_HH_unidad` · `Precio_unitario_CLP` · `Total_CLP`

**P4 — Bases M&P**
`Partida` · `Nombre_partida` · `Commodity` · `Tipo` (`fisico` \| `financiero`) · `Paso_o_hito` · `Peso` · `Orden`

**P4b — Mapeo Commodity**
`Commodity_itemizado` · `Partida` · `Nombre_partida` · `Commodity_grupo`

**P5 — Elementos BIM**
`SP3D_MONIKER` · `Nombre` · `Disciplina` · `CWA` · `CV` · `CWP_hilo` · `GUID` · `Tipo_elemento` · `Cantidad` · `Unidad`

**P6 — Documentos**
`N_documento` · `Titulo` · `Tipo` · `Revision` · `CWP` · `Estado_Aconex` · `Es_IFC` · `Codigo_interno` · `CWA` · `Disciplina_aconex` · `Empresa` · `Fecha_Aconex` · `Ruta_archivo`

**P6b — Documento ↔ CWP**
`N_documento` *(debe existir en P6)* · `CWP_hilo` · `Origen_del_vinculo`

**P7 — Trisemanal**
`ID_P6` · `Actividad` · `HH` · `Fecha_inicio` · `Fecha_fin` · `Especialidad` · `Commodity` · `CWP_hilo` · `Restriccion_ingenieria_RFI` · `Restriccion_seguridad` · `Restriccion_suministro` · `Restriccion_maquinaria` · `Responsable` · `Fecha_compromiso` · `Estado`
*Cada columna de restricción con texto genera una restricción registrada para ese CWP.*

**P8 — Personal clave**
`N` · **`Nombre`** *(obligatorio: sin él la fila se descarta)* · `Cargo` · `Directo_Indirecto` · `Cuadrilla` · `Fecha_compromiso` · `Estado_acreditacion`

**P9 — Suministros**
`PEP_id` · **`Descripcion`** *(obligatorio)* · `Responsable` · `Criticidad` · `Fecha_comprometida` · `CWA` · `CWP_hilo`

**P10 — Ruta a ejecución**
`CWP_hilo` · `Fecha_recepcion_ingenieria` · `Fecha_IFC` · `Estado_suministro` · `Inicio_construccion` · `Termino_construccion` · `HH`

---

## 3. Los tres cruces que hay que respetar

1. `P3.CWP_hilo` = `P1.CWP_hilo` → el ítem de cobro cuelga de su paquete.
2. `P3.Cod_programa` = `P2.Cod_actividad` → conecta el itemizado con el programa.
3. `P3.Partida_MyP` = `P4.Partida` → habilita el avance físico y el estado de pago.

**Ojo con dos columnas que se confunden:** en la base, `partida_bmp` guarda el **código de
programa** (viene de `Cod_programa`) y `partida_mp` guarda la **partida de Bases de M&P**
(viene de `Partida_MyP`). Son cosas distintas; intercambiarlas deja el avance físico en 0.

**Fechas:** siempre `YYYY-MM-DD`.

---

## 4. Validar antes de cargar

```bash
node scripts/validar-datapack.mjs "ruta/al/pack.xlsx"
```

No toca la base. Distingue **errores** (bloquean: CWP mal formado, duplicados, cruces rotos)
de **avisos** (se carga igual: filas sin llave, ítems sin partida M&P, filas que se
descartarán). El objetivo es que ningún dato se pierda en silencio.

## 5. Cargar

```bash
node --env-file=.env.local scripts/load-datapack.mjs "ruta/al/pack.xlsx" <project_id>
```

- `--dry-run` simula todo y no escribe nada. Úsalo siempre la primera vez.
- `--forzar` carga aunque haya errores. Bajo tu responsabilidad.

La carga **reemplaza** los datos de ese proyecto (borra e inserta), así que es repetible:
corregir el Excel y volver a cargar es el flujo normal.

Después de cargar, revisa `/{org}/proyectos`: la matriz de madurez muestra qué fuentes
quedaron conectadas y cuáles entraron sin llave.
