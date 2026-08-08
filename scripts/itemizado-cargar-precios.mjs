/**
 * Carga los precios unitarios del ECO-2 sobre un itemizado ya cargado.
 *
 * POR QUÉ EXISTE: en el Puerto las 919 líneas del itemizado tienen cantidades pero ningún
 * precio (`pu_clp` y `p_total_clp` en NULL), así que el Panel no puede mostrar Valor
 * Contrato, Monto Ganado ni Avance financiero, y el Estado de Pago queda en cero. Los datos
 * de obra están completos: lo único que falta es la columna de plata.
 *
 * LA LLAVE ES EL ITEM, y eso es deliberado. Una misma línea de alcance aparece varias veces
 * —una por frente físico (Anillo A / B / C)— con la misma descripción y distinta cantidad.
 * El precio unitario es del item, no del frente: se aplica a todas sus filas y el total de
 * cada fila se recalcula como cantidad × PU. Ver CLAUDE.md, "la línea de alcance de un CWP
 * es item + partida_bmp".
 *
 * NO INVENTA NADA: los items del Excel que no existen en la base se reportan y se saltan;
 * los items de la base que el Excel no trae quedan como estaban. Al final imprime ambas
 * listas para que se pueda revisar antes de aplicar.
 *
 * Uso:
 *   node --env-file=.env.local scripts/itemizado-cargar-precios.mjs <archivo.xlsx|csv> <project_id> [--hoja=NOMBRE] [--aplicar]
 *
 * Sin `--aplicar` simula y no escribe nada. Siempre correr primero sin la bandera.
 */
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const opt = (n, d = '') => (args.find(a => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=') || d;
const [archivo, projectId] = args.filter(a => !a.startsWith('--'));

if (!archivo || !projectId) {
  console.error('Uso: node --env-file=.env.local scripts/itemizado-cargar-precios.mjs <archivo> <project_id> [--hoja=NOMBRE] [--aplicar]');
  process.exit(1);
}
if (!fs.existsSync(archivo)) {
  console.error(`No existe el archivo: ${archivo}`);
  process.exit(1);
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Lectura del Excel ────────────────────────────────────────────────────────
const libro = XLSX.readFile(archivo, { cellDates: true });
const hoja = opt('hoja') || libro.SheetNames[0];
if (!libro.Sheets[hoja]) {
  console.error(`La hoja «${hoja}» no existe. Hojas disponibles: ${libro.SheetNames.join(', ')}`);
  process.exit(1);
}
const filas = XLSX.utils.sheet_to_json(libro.Sheets[hoja], { defval: null });
if (!filas.length) {
  console.error(`La hoja «${hoja}» está vacía.`);
  process.exit(1);
}

// Los encabezados del ECO-2 varían entre revisiones ("Item", "ITEM", "N° Item"; "PU", "P.U.",
// "Precio Unitario"). Se detectan por contenido en vez de exigir un nombre exacto.
const columnas = Object.keys(filas[0]);
const buscarCol = (...patrones) =>
  columnas.find(c => patrones.some(p => new RegExp(p, 'i').test(String(c).trim())));

const colItem = opt('col-item') || buscarCol('^item$', '^n.?\\s*item', '^c[oó]digo$');
const colPu   = opt('col-pu')   || buscarCol('^p\\.?\\s*u\\.?$', 'precio\\s*unit', '^pu[_ ]?clp$', 'unitario');
const colTot  = opt('col-total') || buscarCol('^p\\.?\\s*total', 'total.*clp', '^monto');

if (!colItem || !colPu) {
  console.error('No se pudo identificar las columnas necesarias.');
  console.error(`  Columnas del archivo: ${columnas.join(' | ')}`);
  console.error(`  Item detectado: ${colItem ?? '(ninguno)'} · Precio unitario detectado: ${colPu ?? '(ninguno)'}`);
  console.error('  Puedes forzarlas con --col-item=NOMBRE --col-pu=NOMBRE');
  process.exit(1);
}
console.log(`Hoja «${hoja}» · item="${colItem}" · precio unitario="${colPu}"${colTot ? ` · total="${colTot}"` : ''}`);

/** "1.234.567,89" y 1234567.89 llegan igual desde Excel según cómo se guardó la celda. */
const numero = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : null;
};

const precioPorItem = new Map();
for (const f of filas) {
  const item = String(f[colItem] ?? '').trim();
  const pu = numero(f[colPu]);
  if (!item || pu == null || pu <= 0) continue;
  precioPorItem.set(item, pu);
}
console.log(`Precios leídos del archivo: ${precioPorItem.size} items\n`);

// ── Estado actual en la base ─────────────────────────────────────────────────
const { data: actuales, error } = await sb
  .from('mining_itemizado')
  .select('id, item, cantidad, pu_clp')
  .eq('project_id', projectId)
  .order('item');
if (error) { console.error('Error leyendo mining_itemizado:', error.message); process.exit(1); }

const itemsBase = new Set(actuales.map(r => r.item));
const sinPrecio = [...itemsBase].filter(i => !precioPorItem.has(i));
const sobrantes = [...precioPorItem.keys()].filter(i => !itemsBase.has(i));

const cambios = actuales
  .filter(r => precioPorItem.has(r.item))
  .map(r => {
    const pu = precioPorItem.get(r.item);
    const cantidad = Number(r.cantidad) || 0;
    return { id: r.id, item: r.item, pu_clp: pu, p_total_clp: Math.round(cantidad * pu) };
  });

const totalContrato = cambios.reduce((s, c) => s + c.p_total_clp, 0);

console.log(`Filas del itemizado en la base : ${actuales.length}`);
console.log(`Filas que reciben precio       : ${cambios.length}`);
console.log(`Items de la base sin precio    : ${sinPrecio.length}${sinPrecio.length ? ` → ${sinPrecio.slice(0, 10).join(', ')}${sinPrecio.length > 10 ? '…' : ''}` : ''}`);
console.log(`Items del archivo que no existen en la base: ${sobrantes.length}${sobrantes.length ? ` → ${sobrantes.slice(0, 10).join(', ')}${sobrantes.length > 10 ? '…' : ''}` : ''}`);
console.log(`\nValor de contrato que resultaría: $${totalContrato.toLocaleString('es-CL')}\n`);

if (!APLICAR) {
  console.log('SIMULACIÓN — no se escribió nada. Revisa los números y repite con --aplicar.');
  process.exit(0);
}

// ── Escritura por lotes ──────────────────────────────────────────────────────
let hechas = 0;
const LOTE = 200;
for (let i = 0; i < cambios.length; i += LOTE) {
  const lote = cambios.slice(i, i + LOTE);
  // Un update por fila: son ~900 y el precio depende de la cantidad de cada una.
  await Promise.all(lote.map(c =>
    sb.from('mining_itemizado').update({ pu_clp: c.pu_clp, p_total_clp: c.p_total_clp }).eq('id', c.id),
  ));
  hechas += lote.length;
  process.stdout.write(`\r  actualizadas ${hechas}/${cambios.length}`);
}
console.log(`\n\nListo. ${hechas} filas con precio. Valor de contrato: $${totalContrato.toLocaleString('es-CL')}`);
console.log('Revisa el Panel y Estado de Pago para confirmar.');
