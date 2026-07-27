/**
 * Inspecciona uno o varios Excel/CSV: hojas, encabezados reales y muestra de filas.
 * Sirve para reconocer archivos de un cliente antes de mapearlos al data pack.
 *
 * Uso: node scripts/inspeccionar-excel.mjs <archivo1> [archivo2...] [--filas=3] [--hoja=NOMBRE]
 *
 * Detecta el encabezado aunque el archivo traiga títulos o filas en blanco arriba
 * (los exports de Navisworks/Assemble y las planillas de obra casi siempre los traen).
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const N_FILAS = Number((args.find(a => a.startsWith('--filas=')) ?? '--filas=3').split('=')[1]);
const SOLO_HOJA = (args.find(a => a.startsWith('--hoja=')) ?? '').split('=')[1] || null;
const archivos = args.filter(a => !a.startsWith('--'));
if (!archivos.length) { console.error('Uso: inspeccionar-excel.mjs <archivo.xlsx> [...] [--filas=N] [--hoja=NOMBRE]'); process.exit(1); }

/** La primera fila con al menos 3 celdas con texto es, casi siempre, el encabezado real. */
function ubicarEncabezado(filas) {
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const llenas = filas[i].filter(c => String(c ?? '').trim()).length;
    if (llenas >= 3) return i;
  }
  return 0;
}

for (const archivo of archivos) {
  if (!fs.existsSync(archivo)) { console.log(`\n!! No existe: ${archivo}`); continue; }
  console.log(`\n${'='.repeat(90)}\n${path.basename(archivo)}   (${(fs.statSync(archivo).size / 1024).toFixed(0)} KB)\n${'='.repeat(90)}`);
  let wb;
  try { wb = XLSX.read(fs.readFileSync(archivo), { type: 'buffer', cellDates: false }); }
  catch (e) { console.log(`   ERROR al leer: ${e.message}`); continue; }

  for (const nombre of wb.SheetNames) {
    if (SOLO_HOJA && nombre !== SOLO_HOJA) continue;
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: '', raw: false });
    const conDatos = filas.filter(f => f.some(c => String(c ?? '').trim()));
    if (!conDatos.length) { console.log(`\n  [${nombre}]  (vacía)`); continue; }

    const iHdr = ubicarEncabezado(filas);
    const hdr = (filas[iHdr] ?? []).map(c => String(c ?? '').trim());
    const datos = filas.slice(iHdr + 1).filter(f => f.some(c => String(c ?? '').trim()));
    console.log(`\n  [${nombre}]  ${datos.length} filas de datos  (encabezado en fila ${iHdr + 1})`);
    console.log(`    cols (${hdr.filter(Boolean).length}): ${hdr.filter(Boolean).join(' | ')}`);
    for (const f of datos.slice(0, N_FILAS)) {
      const par = hdr.map((h, i) => h && String(f[i] ?? '').trim() ? `${h}=${String(f[i]).slice(0, 34)}` : null).filter(Boolean);
      console.log(`      · ${par.join('  ').slice(0, 300)}`);
    }
  }
}
