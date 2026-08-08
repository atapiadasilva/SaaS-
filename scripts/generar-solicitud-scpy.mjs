/**
 * Genera el Excel de solicitud de datos para SCPY: una hoja por dato faltante, con los códigos
 * reales ya precargados para que quien lo complete solo rellene la columna que falta.
 *
 * No es una plantilla en blanco a propósito. Pedir "mándame el mapeo BMP" obliga al experto a
 * ir a buscar cuáles son los 74 códigos; traerlos ya escritos convierte el pedido en rellenar
 * una columna.
 *
 * Uso: node --env-file=.env.local scripts/generar-solicitud-scpy.mjs <salida.xlsx> [project_id]
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [, , SALIDA, PROJECT_ID = 'd9e5f943-9ff8-42d2-a9f7-2eee11c9941a'] = process.argv;
if (!SALIDA) { console.error('Uso: generar-solicitud-scpy.mjs <salida.xlsx> [project_id]'); process.exit(1); }
const DIR_PACK = 'C:\\Users\\atapiad\\AppData\\Local\\Temp\\claude\\C--Users-atapiad--antigravity-SaaS---Data\\1ae42fe7-d63a-4a30-8a3e-745ee095d23c\\scratchpad\\basedatos\\json\\';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const hoy = new Date().toISOString().slice(0, 10);

// ── Datos reales para precargar ─────────────────────────────────────────────
const fp = JSON.parse(fs.readFileSync(DIR_PACK + 'fact_partida.json', 'utf8'));
const porBmp = new Map();
for (const r of fp) {
  const b = String(r.bmp ?? '').trim(); if (!b) continue;
  const e = porBmp.get(b) ?? { n: 0, hh: 0, clp: 0, ej: '', disc: new Set() };
  e.n++; e.hh += Number(r.hh_total) || 0; e.clp += Number(r.total_clp) || 0;
  if (!e.ej) e.ej = String(r.descripcion ?? '').slice(0, 70);
  if (r.disciplina_nombre) e.disc.add(r.disciplina_nombre);
  porBmp.set(b, e);
}

const { data: pond } = await sb.from('mining_ponderaciones').select('item_code, item_nombre, commodity, hito, peso, orden').eq('project_id', PROJECT_ID).order('item_code');
const partidasMp = [...new Map((pond ?? []).map(p => [p.item_code, p])).values()];

const { data: cwps } = await sb.from('mining_cwp')
  .select('cwp_id, cwp_nombre, cwa_id, cv_id, disciplina, disciplina_cod, status_cwp, hh_planner')
  .eq('project_id', PROJECT_ID).order('cwp_id');
const vigentes = (cwps ?? []).filter(c => c.status_cwp !== 'no_vigente');

const { data: sums } = await sb.from('mining_suministro')
  .select('numero_po, descripcion_material, proveedor, fecha_entrega_plan, observacion').eq('project_id', PROJECT_ID).order('numero_po');

const { data: turnos } = await sb.from('mining_turno').select('codigo, nombre, dias_trabajo, dias_descanso, horas_dia').eq('project_id', PROJECT_ID).order('codigo');

// ── Hojas ───────────────────────────────────────────────────────────────────
const LEEME = [
  ['SOLICITUD DE DATOS · EIMI00418 BHP SPENCE (SCPY)'],
  [`Generado el ${hoy} desde la plataforma Hilo Digital`],
  [],
  ['CÓMO USAR ESTE ARCHIVO'],
  ['Cada hoja R1..R7 es un dato que falta. Las columnas en gris ya vienen llenas con lo que'],
  ['hay en el sistema; solo hay que completar las columnas marcadas >>> COMPLETAR <<<.'],
  ['No hace falta llenarlas todas: cada hoja sirve por separado.'],
  [],
  ['PRIORIDAD'],
  ['   R1 y R2 son los que desbloquean la operación. Sin R1 no se puede medir avance;'],
  ['   sin R2 no se puede dimensionar ningún paquete de trabajo (IWP).'],
  ['   R3 a R7 van cerrando cobertura y control.'],
  [],
  ['REGLAS DE FORMATO'],
  ['   Fechas   : YYYY-MM-DD  (ej. 2026-10-01). No usar formato de EE.UU.'],
  ['   Números  : sin separador de miles.'],
  ['   CWP      : usar exactamente los códigos de la hoja "REF CWP vigentes" (ej. 0048100.P001).'],
  ['   No renumerar ni reordenar las filas precargadas: se cruzan por su código.'],
  [],
  ['HOJAS'],
  ['   R1  Mapeo BMP → Bases de M&P        74 filas, falta 1 columna'],
  ['   R1b Bases de M&P completas          por si el catálogo de 19 partidas está incompleto'],
  ['   R2  Cuadrillas de construcción      en blanco'],
  ['   R3  Restricciones por CWP           en blanco'],
  ['   R4  Sector de la Pila 0044          una decisión, dos opciones'],
  ['   R5  CWP del área 0075               en blanco'],
  ['   R6  Suministros por CWP             46 filas, falta 1 columna'],
  ['   R7  Hitos contractuales             en blanco'],
  [],
  ['   REF CWP vigentes      46 paquetes válidos'],
  ['   REF Partidas M&P      las 19 partidas que hoy conoce el sistema'],
  ['   REF Turnos            los 5 turnos ya cargados'],
  ['   REF Estado actual     qué tiene y qué le falta hoy a cada dato'],
  [],
  ['DUDAS: devolver el archivo con comentarios en la columna Observaciones de cada hoja.'],
];

const R1 = [
  ['Código BMP', 'N° partidas E-1', 'HH', 'Monto CLP', 'Disciplina', 'Ejemplo de partida', '>>> COMPLETAR: Partida M&P <<<', 'Observaciones'],
  ...[...porBmp].sort().map(([b, e]) => [b, e.n, Math.round(e.hh), Math.round(e.clp), [...e.disc].join(' / '), e.ej, '', '']),
];

const R1b = [
  ['Partida M&P', 'Nombre de la partida', 'Commodity / grupo', 'Hito de pago', 'Peso %', 'Orden', 'Observaciones'],
  ...((pond ?? []).map(p => [p.item_code, p.item_nombre, p.commodity, p.hito, p.peso, p.orden, ''])),
  [], ['>>> Si faltan partidas, agregarlas abajo con el mismo formato. La suma de pesos por partida debe dar 100. <<<'],
];

const R2 = [
  ['>>> COMPLETAR: Código cuadrilla <<<', 'Disciplina', 'Turno', 'N° personas', 'Composición (rol x cantidad)', 'Factor productividad', 'Disponible desde', 'CWA o sector donde opera', 'Observaciones'],
  ['CUAD-P-01', 'Piping', '14X14', 12, '1 capataz, 4 soldadores, 5 maestros, 2 ayudantes', 0.85, '2026-10-01', '0048', 'FILA DE EJEMPLO — borrar'],
  ...vigentes.filter((c, i, a) => a.findIndex(x => x.disciplina_cod === c.disciplina_cod) === i)
    .map(c => ['', c.disciplina, '', '', '', '', '', '', `hay ${vigentes.filter(v => v.disciplina_cod === c.disciplina_cod).length} CWP de esta disciplina`]),
];

const R3 = [
  ['CWP', 'Tipo de restricción', 'Descripción', 'Responsable', 'Departamento', 'Fecha compromiso', 'Estado', 'Crítica (SI/NO)', 'Observaciones'],
  ['0048100.P001', 'Suministro', 'Falta llegada de cañería HDPE', 'J. Pérez', 'Adquisiciones', '2027-01-15', 'Abierta', 'SI', 'FILA DE EJEMPLO — borrar'],
  [], ['>>> Tipos válidos: Ingeniería · Suministro · Permisos · Terreno/Acceso · Equipos · Mano de obra · Seguridad · Calidad · Interferencias · Cliente <<<'],
  ['>>> Si usan otros nombres, escribirlos igual y agregar la equivalencia en Observaciones. <<<'],
];

const R4 = [
  ['SECTOR DE LA PILA DE LIXIVIACIÓN (CWA 0044)'],
  [],
  ['Hay 2.596 componentes del modelo 3D en el área 0044 sin saber a qué sector pertenecen.'],
  ['El catálogo tiene tres: 0044-100 Este, 0044-200 Centro, 0044-300 Oeste.'],
  ['Ya se descartó deducirlo por coordenadas del modelo y por la numeración de canalizaciones.'],
  [],
  ['OPCIÓN A — la definitiva'],
  ['Que el modelador llene la propiedad CWA en SmartPlant 3D con 0044-100 / 0044-200 / 0044-300'],
  ['y republique el modelo. Queda resuelto para siempre y no hay que repetirlo en cada revisión.'],
  [],
  ['OPCIÓN B — la rápida: el límite geográfico'],
  ['Completar abajo, o adjuntar el plano de sectorización de la pila.'],
  [],
  ['Sector', 'Coordenada Este desde', 'Coordenada Este hasta', 'Referencia / hito físico', 'Observaciones'],
  ['0044-100 Este', '', '', '', ''],
  ['0044-200 Centro', '', '', '', ''],
  ['0044-300 Oeste', '', '', '', ''],
];

const R5 = [
  ['CWP DEL ÁREA 0075 — MANEJO DE AGUAS'],
  [],
  ['El modelo trae 790 componentes del área 0075 y hay documentos suyos en Aconex,'],
  ['pero no existe ningún CWP de esa área en el catálogo del contrato.'],
  [],
  ['PRIMERO RESPONDER: ¿el manejo de aguas es alcance de este contrato?   SI / NO:', ''],
  [],
  ['Si la respuesta es SI, completar los paquetes:'],
  [],
  ['CWP (formato 0075-100-PP)', 'Nombre', 'Sector', 'Disciplina', 'HH estimadas', 'Observaciones'],
  ['', '', '', '', '', ''],
];

const R6 = [
  ['Código / PEP', 'Descripción', 'Proveedor', 'Fecha comprometida', 'Criticidad', '>>> COMPLETAR: CWP que bloquea <<<', '>>> COMPLETAR: Fecha requerida en obra <<<', 'Observaciones'],
  ...((sums ?? []).map(s => [s.numero_po, s.descripcion_material, s.proveedor, s.fecha_entrega_plan, s.observacion, '', '', ''])),
  [], ['>>> Si un suministro bloquea VARIOS CWP, duplicar la fila una vez por cada CWP. <<<'],
];

const R7 = [
  ['Hito', 'Descripción', 'CWP o CWA asociado', 'Fecha contractual', 'Tiene multa (SI/NO)', 'Monto o % de multa', 'Observaciones'],
  ['H1060', 'Área 0050 SX: Término de Tren D', '0050400.P001', '2027-06-30', 'SI', '0,5% por semana', 'FILA DE EJEMPLO — borrar'],
];

const REF_CWP = [
  ['CWP', 'Nombre', 'CWA', 'CV', 'Disciplina', 'HH del programa'],
  ...vigentes.map(c => [c.cwp_id, c.cwp_nombre, c.cwa_id, c.cv_id, c.disciplina, c.hh_planner]),
];
const REF_MP = [['Partida M&P', 'Nombre', 'Commodity / grupo'], ...partidasMp.map(p => [p.item_code, p.item_nombre, p.commodity])];
const REF_TURNOS = [['Código', 'Nombre', 'Días trabajo', 'Días descanso', 'Horas/día'], ...((turnos ?? []).map(t => [t.codigo, t.nombre, t.dias_trabajo, t.dias_descanso, t.horas_dia]))];

const REF_ESTADO = [
  ['Dato', 'Qué hay hoy', 'Qué falta', 'Hoja'],
  ['Itemizado', '1.199 partidas · 207.713 HH · $10.407 millones', 'la partida de M&P de cada una (0 de 1.199)', 'R1'],
  ['Bases de M&P', '19 partidas con 88 hitos y pesos', 'confirmar si el catálogo está completo', 'R1b'],
  ['Cuadrillas', '7 plantillas idénticas de 10 personas, factor 1,0', 'la dotación real por disciplina y turno', 'R2'],
  ['Personal', '11 personas, todas indirectas', 'la dotación directa de construcción', 'R2'],
  ['Restricciones', 'ninguna', 'el registro completo por paquete', 'R3'],
  ['Modelo 3D', '11.443 componentes · 5.860 con CWP', 'el sector de 2.596 componentes de la Pila', 'R4'],
  ['Área 0075', '790 componentes y documentos en Aconex', 'si es alcance, y sus CWP', 'R5'],
  ['Suministros', '46 cargados', 'a qué CWP bloquea cada uno (0 de 46)', 'R6'],
  ['Hitos contractuales', 'ninguno', 'los que tienen multa o retención', 'R7'],
  [],
  ['Programa', '421 actividades Rev.0 · 823 relaciones · CWP nativo', 'nada, está al día', '—'],
  ['Documentos', '228 de Aconex con revisión y estado', 'ninguno está IFC: no es dato faltante, es el estado real', '—'],
];

// ── Escritura ───────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();
const agregar = (nombre, aoa, anchos) => {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = (anchos ?? (aoa[0] ?? []).map(() => 22)).map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
};
agregar('00 Léeme', LEEME, [95]);
agregar('R1 Mapeo BMP a MyP', R1, [14, 15, 10, 16, 26, 60, 32, 30]);
agregar('R1b Bases MyP completas', R1b, [14, 40, 26, 42, 9, 8, 30]);
agregar('R2 Cuadrillas', R2, [30, 26, 10, 12, 46, 20, 18, 22, 40]);
agregar('R3 Restricciones', R3, [16, 20, 50, 18, 18, 18, 12, 14, 30]);
agregar('R4 Sector Pila 0044', R4, [95, 22, 22, 30, 30]);
agregar('R5 CWP area 0075', R5, [95, 20, 14, 14, 14, 30]);
agregar('R6 Suministros por CWP', R6, [14, 52, 14, 20, 24, 32, 34, 30]);
agregar('R7 Hitos contractuales', R7, [12, 44, 22, 18, 18, 22, 30]);
agregar('REF CWP vigentes', REF_CWP, [16, 52, 8, 10, 34, 16]);
agregar('REF Partidas MyP', REF_MP, [14, 44, 28]);
agregar('REF Turnos', REF_TURNOS, [10, 26, 14, 14, 12]);
agregar('REF Estado actual', REF_ESTADO, [22, 52, 52, 8]);

XLSX.writeFile(wb, SALIDA);
console.log(`Generado: ${SALIDA}`);
console.log(`  R1  mapeo BMP        : ${porBmp.size} códigos precargados`);
console.log(`  R1b bases M&P        : ${(pond ?? []).length} filas`);
console.log(`  R6  suministros      : ${(sums ?? []).length} precargados`);
console.log(`  REF CWP vigentes     : ${vigentes.length}`);
