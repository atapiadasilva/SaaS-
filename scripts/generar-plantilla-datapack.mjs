/**
 * Genera el Excel plantilla del data pack de Hilo Digital, con las hojas P1–P10, sus
 * encabezados exactos y una hoja de instrucciones. Quien prepara los datos solo rellena.
 *
 * Uso: node scripts/generar-plantilla-datapack.mjs <salida.xlsx> ["Nombre del proyecto"]
 *
 * Los encabezados de aquí son los que leen scripts/load-datapack.mjs y validar-datapack.mjs:
 * si cambian allí, cambian aquí.
 */
import * as XLSX from 'xlsx';

const [, , SALIDA, PROYECTO = 'Proyecto'] = process.argv;
if (!SALIDA) { console.error('Uso: generar-plantilla-datapack.mjs <salida.xlsx> ["Nombre proyecto"]'); process.exit(1); }

const HOJAS = [
  ['P1 Catálogo CWP', ['CWP_hilo','Nombre','Disciplina','Disciplina_nombre','CWA','CWA_legible','CV','CV_legible','EWP','Alcance','Costo_oferta_CLP','HH_planner','Fecha_ini','Fecha_fin']],
  ['P2 Programa P6', ['Cod_actividad','Nombre_actividad','HH','Fecha_inicio','Fecha_fin','CWP_hilo','Cantidad','Unidad','WBS','CWA','Tipo_actividad']],
  ['P3 Itemizado ECO-2', ['Item','Descripcion','Unidad','Cantidad','HH','CWP_hilo','Cod_programa','Commodity','Partida_MyP','Area','WBS','Rendimiento_HH_unidad','Precio_unitario_CLP','Total_CLP']],
  ['P4 Bases M&P', ['Partida','Nombre_partida','Commodity','Tipo','Paso_o_hito','Peso','Orden']],
  ['P4b Mapeo Commodity', ['Commodity_itemizado','Partida','Nombre_partida','Commodity_grupo']],
  ['P5 Elementos BIM', ['SP3D_MONIKER','Nombre','Disciplina','CWA','CV','CWP_hilo','GUID','Tipo_elemento','Descripcion','Material','WBS','Cantidad','Unidad']],
  ['P6 Documentos', ['N_documento','Titulo','Tipo','Revision','CWP','Estado_Aconex','Es_IFC','Codigo_interno','CWA','Disciplina_aconex','Empresa','Fecha_Aconex','Ruta_archivo']],
  ['P6b Documento-CWP', ['N_documento','CWP_hilo','Origen_del_vinculo']],
  ['P7 Trisemanal', ['ID_P6','Actividad','HH','Fecha_inicio','Fecha_fin','Especialidad','Commodity','CWP_hilo','Restriccion_ingenieria_RFI','Restriccion_seguridad','Restriccion_suministro','Restriccion_maquinaria','Responsable','Fecha_compromiso','Estado','Fecha_control']],
  ['P8 Personal clave', ['N','Nombre','Cargo','Directo_Indirecto','Cuadrilla','Fecha_compromiso','Estado_acreditacion']],
  ['P9 Suministros', ['PEP_id','Descripcion','Responsable','Criticidad','Fecha_comprometida','CWA','CWP_hilo']],
  ['P10 Ruta a ejecución', ['CWP_hilo','Fecha_recepcion_ingenieria','Fecha_IFC','Estado_suministro','Inicio_construccion','Termino_construccion','HH']],
];

const LEEME = [
  [`DATA PACK HILO DIGITAL — ${PROYECTO}`],
  [],
  ['REGLA ÚNICA IMPORTANTE'],
  ['El CWP es la llave de todo el proyecto. La columna CWP_hilo debe traer el MISMO texto'],
  ['en todas las hojas donde aparece. Si una fila no trae CWP_hilo, ese dato entra a la'],
  ['plataforma pero no se conecta con nada.'],
  [],
  ['FORMATO DEL CÓDIGO CWP:  {CV}.{DISCIPLINA}{SECUENCIA}    ejemplo:  312101.C001'],
  ['   CV          = código de subárea, solo dígitos (4 a 8). El CWA son sus primeros 4.'],
  ['   DISCIPLINA  = letra(s): C civil, D hormigón, S estructura, M mecánica, P piping,'],
  ['                 E eléctrica, J instrumentación, MB calderería, EW cableado...'],
  ['   SECUENCIA   = correlativo de 3 dígitos dentro de ese CV y disciplina.'],
  [],
  ['ORDEN DE LLENADO'],
  ['   1. P1 primero: es el catálogo de paquetes. Todo lo demás apunta acá.'],
  ['   2. P2 programa y P3 itemizado: cada fila con su CWP_hilo.'],
  ['   3. El resto en cualquier orden.'],
  [],
  ['CRUCES OBLIGATORIOS'],
  ['   P3.Cod_programa  debe existir como P2.Cod_actividad'],
  ['   P3.Partida_MyP   debe existir como P4.Partida'],
  ['   P6b.N_documento  debe existir como P6.N_documento'],
  [],
  ['FECHAS: siempre en formato YYYY-MM-DD (ej. 2026-07-31).'],
  ['NÚMEROS: sin separador de miles. Decimal con punto o coma, ambos se aceptan.'],
  [],
  ['MÍNIMO PARA CARGAR: solo P1. Cada hoja adicional habilita más módulos.'],
  [],
  ['ANTES DE ENTREGAR, valida el archivo con:'],
  ['   node scripts/validar-datapack.mjs "este_archivo.xlsx"'],
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(LEEME), '00 Léeme');
for (const [nombre, cols] of HOJAS) {
  const ws = XLSX.utils.aoa_to_sheet([cols]);
  ws['!cols'] = cols.map(c => ({ wch: Math.max(12, Math.min(28, c.length + 4)) }));
  XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
}
XLSX.writeFile(wb, SALIDA);
console.log(`Plantilla generada: ${SALIDA}`);
console.log(`Hojas: ${['00 Léeme', ...HOJAS.map(h => h[0])].join(' · ')}`);
