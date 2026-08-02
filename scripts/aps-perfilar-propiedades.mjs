/**
 * Perfila el volcado de propiedades que deja aps-procesar-modelo.mjs y responde una sola
 * pregunta: ¿con qué propiedad se puede vincular cada elemento a su CWP?
 *
 * En Hilo un CWP se identifica por CV (área+sector) + disciplina. Así que el perfil busca,
 * en TODAS las propiedades, dos señales: códigos de área (0044/0045/0048/0050) y códigos de
 * disciplina (CL/EL/IC/ME/PP/ST). Una propiedad que traiga las dos resuelve el match sola.
 *
 * Uso: node scripts/aps-perfilar-propiedades.mjs <props-*.json> [--prop=NOMBRE] [--top=N]
 *      --prop=NOMBRE   muestra la distribución completa de valores de esa propiedad
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d = '') => (args.find(a => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=') || d;
const ARCHIVO = args.find(a => !a.startsWith('--'));
const TOP = Number(opt('top', 25));
const DETALLE = opt('prop', null);
if (!ARCHIVO || !fs.existsSync(ARCHIVO)) { console.error('Uso: aps-perfilar-propiedades.mjs <props-*.json>'); process.exit(1); }

const filas = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
console.log(`${filas.length.toLocaleString('es-CL')} objetos\n`);

// ── Distribución de una sola propiedad, si se pidió ─────────────────────────
if (DETALLE) {
  const v = new Map();
  for (const f of filas) { const x = String(f[DETALLE] ?? '(vacío)'); v.set(x, (v.get(x) ?? 0) + 1); }
  console.log(`Valores de "${DETALLE}"  (${v.size} distintos)`);
  for (const [k, n] of [...v].sort((a, b) => b[1] - a[1]).slice(0, 200)) {
    console.log(`  ${String(n).padStart(7)}  ${k.slice(0, 110)}`);
  }
  process.exit(0);
}

// ── Inventario general ──────────────────────────────────────────────────────
const conteo = new Map(), ejemplos = new Map(), distintos = new Map();
for (const f of filas) {
  for (const [k, val] of Object.entries(f)) {
    if (val === null || val === '') continue;
    conteo.set(k, (conteo.get(k) ?? 0) + 1);
    if (!ejemplos.has(k)) ejemplos.set(k, val);
    let s = distintos.get(k); if (!s) distintos.set(k, s = new Set());
    if (s.size < 5000) s.add(String(val));
  }
}
console.log(`${conteo.size} propiedades distintas en el modelo\n`);

// ── Señal de CWP: área y disciplina ─────────────────────────────────────────
const AREAS = /\b(0044|0045|0048|0050)\b/;
const DISC = /\b(CL|EL|IC|ME|PP|ST)\b/;
const señal = [];
for (const [k, n] of conteo) {
  const muestra = [...(distintos.get(k) ?? [])].slice(0, 3000);
  const conArea = muestra.filter(v => AREAS.test(v)).length / (muestra.length || 1);
  const conDisc = muestra.filter(v => DISC.test(v)).length / (muestra.length || 1);
  if (conArea > 0.02 || conDisc > 0.02) señal.push({ k, n, conArea, conDisc, d: distintos.get(k).size });
}
señal.sort((a, b) => (b.conArea + b.conDisc) - (a.conArea + a.conDisc));

console.log(`PROPIEDADES QUE CONTIENEN CÓDIGOS DE ÁREA O DISCIPLINA\n${'─'.repeat(100)}`);
console.log(`${'cobertura'.padStart(9)} ${'%área'.padStart(6)} ${'%disc'.padStart(6)} ${'distintos'.padStart(9)}  propiedad / ejemplo`);
for (const s of señal.slice(0, TOP)) {
  console.log(`${String(s.n).padStart(9)} ${(s.conArea * 100).toFixed(0).padStart(5)}% ${(s.conDisc * 100).toFixed(0).padStart(5)}% ${String(s.d).padStart(9)}  ${s.k}`);
  console.log(`${' '.repeat(34)}ej: ${String(ejemplos.get(s.k)).slice(0, 80)}`);
}
if (!señal.length) console.log('  ninguna — el match tendrá que salir de geometría o de un cruce externo');

// ── El resto de las propiedades con buena cobertura ─────────────────────────
console.log(`\n\nOTRAS PROPIEDADES CON COBERTURA ALTA (candidatas a tag/sistema/tipo)\n${'─'.repeat(100)}`);
const yaVistas = new Set(señal.map(s => s.k));
const otras = [...conteo].filter(([k, n]) => !yaVistas.has(k) && n / filas.length > 0.3)
  .sort((a, b) => b[1] - a[1]).slice(0, TOP);
for (const [k, n] of otras) {
  console.log(`${String(n).padStart(9)} (${((n / filas.length) * 100).toFixed(0).padStart(3)}%) ${String(distintos.get(k).size).padStart(7)} distintos  ${k.padEnd(40)} ej: ${String(ejemplos.get(k)).slice(0, 40)}`);
}
