# MASTER de entrega — EIMI00413 Andina

Todo lo que necesito de ti para cargar Andina completo, de dónde sale en los archivos que ya
tienes, y qué decisiones solo puedes tomar tú.

- **Proyecto ya creado:** `EIMI00413 - Andina` · `project_id` `3a32fa60-2f23-441b-be0b-9b3aef900b58`
- **Plantilla lista para llenar:** `Downloads/EIMI00413_Andina_DataPack_PLANTILLA.xlsx`
- **Formato de referencia:** [DATA_PACK.md](DATA_PACK.md)

---

## 0. Lo primero: Andina todavía no tiene código CWP

Revisé tus archivos. El programa y el modelo están, pero **la llave no existe aún**:

| Archivo | Qué trae | Qué le falta |
|---|---|---|
| `Programa Rev.1 Excel - Andina (Unificado).xlsx` | 265 tareas con `WBS`, `Especialidad`, `Trabajo (HH)`, fechas | **Ninguna columna CWP** |
| `ANDINA - POR CWP - *.xlsx` | Export de Assemble/Navisworks: WBS de texto (`1.01 Construcción Banco de ductos`), `TAG`, `Quantity`, `Unit`, `VOLUMEN_M3`, `HHs` | El "CWP" del título es un WBS, no un código `CV.DiscSeq` |
| `BD ESTRUCTURA ANDINA.xlsx` | 4.472 elementos con `GUID`, `MARCA`, `ETAPA`, `Kg unit`, `Total` | Sin CWP |
| `propiedades-VCAD ANDINA 11-02.nwd.csv` | 105.069 elementos: `dbId`, `externalId`, `name` | Sin CWP |
| `model-ids-VCAD ANDINA 11-02.nwd.csv` | 108.980 pares `externalId` ↔ `dbId` | — |

**Por eso el primer entregable es P1: el diccionario CWP de Andina.** Sin esa hoja, el resto
de los datos entra suelto y ningún módulo cruza nada. Es la decisión que no puedo tomar por ti.

### Lo que necesito que definas (solo esto)

1. **Los CWA/CV de Andina** — las áreas y subáreas físicas, con su código numérico.
   En Collahuasi el CV es de 6 dígitos (`312101`), en Spence de 7 (`0044100`). Ambos sirven:
   los primeros 4 son el CWA.
2. **Las disciplinas que aplican**, con su letra: C civil · D hormigón · S estructura ·
   M mecánica · P piping · E eléctrica · J instrumentación · MB calderería · EW cableado.
3. **La regla para mapear el WBS de Assemble a esos CWP.** Ej.: si
   `1.01 Construcción Banco de ductos` pertenece al CV `2201` y es civil, sería `2201xx.C001`.

Con esas tres cosas yo genero el catálogo P1 completo y propago la llave al resto de las
hojas automáticamente. **No necesitas llenar el Excel a mano.**

---

## 1. Lo mínimo para que Andina funcione

Con esto ya tienes explorador CWP, planificación y conciliación:

| Hoja | Qué es | De dónde lo saco en tus archivos |
|---|---|---|
| **P1** | Catálogo CWP | Lo construimos desde el WBS de `ANDINA - POR CWP` + tus reglas de codificación |
| **P2** | Programa | `Programa Rev.1 Excel - Andina (Unificado)` → mapeo `Id`→`Cod_actividad`, `Nombre de tarea`, `Trabajo (HH)`→`HH`, `Comienzo`/`Fin Actual`→fechas. **Falta asignarle el CWP a cada tarea** |
| **P3** | Itemizado | *No lo encontré.* Necesito el ECO-2 / matriz de cobro de Andina |

## 2. Lo que suma módulos

| Hoja | Habilita | De dónde sale |
|---|---|---|
| **P4** Bases M&P | Estado de Pago y avance físico | Bases de Medición y Pago del contrato. No lo tengo |
| **P4b** Mapeo commodity | Rellena partidas M&P faltantes | Se deriva de P3 + P4 |
| **P5** Elementos BIM | Visor 3D por paquete | `propiedades-VCAD ANDINA` + `model-ids-VCAD` (105 mil elementos) y/o `BD ESTRUCTURA ANDINA` (4.472 con GUID) |
| **P6/P6b** Documentos | Calidad, SSO, M. Ambiente, planos en la ficha | Export de Aconex de Andina. No lo tengo |
| **P7** Trisemanal | Trisemanal **y registro de restricciones** | Tu 3WLA de Andina, si existe |
| **P8** Personal | RRHH | Nómina / personal clave |
| **P9** Suministros | Seguimiento de materiales | `SCING-CAP25010-...-MASTER PACKING LIST.xlsx` podría servir |
| **P10** Ruta a ejecución | Fecha IFC, suministro, ventana de obra por CWP | Fechas de ingeniería y suministro por paquete |

---

## 3. Cómo me lo entregas (elige una)

**Opción A — me das las reglas y yo armo el pack.** Respondes las 3 preguntas del punto 0 y
yo construyo P1, P2 y P5 desde tus archivos actuales. Es la más rápida y la que recomiendo.

**Opción B — llenas la plantilla.** Abres `EIMI00413_Andina_DataPack_PLANTILLA.xlsx`, la
rellenas (o se la pasas a Cowork con [DATA_PACK.md](DATA_PACK.md)) y me dices el nombre del
archivo.

**Opción C — me pasas archivos sueltos.** Me dices qué archivo corresponde a qué hoja y yo
hago la conversión. Más lento, pero sirve si los datos están dispersos.

En los tres casos, antes de escribir nada en la base corro:

```bash
node scripts/validar-datapack.mjs "<archivo.xlsx>"
```

y después la carga en seco, para mostrarte qué entraría y qué se perdería:

```bash
node --env-file=.env.local scripts/load-datapack.mjs "<archivo.xlsx>" 3a32fa60-2f23-441b-be0b-9b3aef900b58 --dry-run
```

---

## 4. Checklist de entrega

- [ ] **Códigos CWA/CV de Andina** (o autorización para derivarlos del WBS de Assemble)
- [ ] **Letras de disciplina** que aplican al proyecto
- [ ] **Regla WBS → CWP**
- [ ] Itemizado / ECO-2 de Andina *(sin esto no hay estado de pago)*
- [ ] Bases de Medición y Pago *(sin esto no hay avance físico)*
- [ ] Export de documentos Aconex *(sin esto los módulos de departamento quedan vacíos)*
- [ ] Confirmar qué archivo del modelo uso para P5: `propiedades-VCAD` (105 mil elementos,
      todo el modelo) o `BD ESTRUCTURA ANDINA` (4.472, solo estructura)

Lo marcado como *sin esto...* no bloquea la carga: el proyecto entra igual y esos módulos
quedan en gris hasta que llegue el dato. La matriz de madurez en `/eimisa/proyectos` te va a
mostrar exactamente qué falta.
