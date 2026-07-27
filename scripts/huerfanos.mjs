/**
 * Detecta código muerto por cierre transitivo, leyendo los imports reales del código.
 *
 * Por qué no basta una pasada: si A importa a B y nadie importa a A, al borrar A el
 * archivo B queda muerto también. Hay que repetir el análisis hasta que no aparezcan
 * huérfanos nuevos. Un solo barrido deja siempre residuo.
 *
 * A diferencia del grafo de graphify, aquí solo se cuentan sentencias `import` reales:
 * las menciones en comentarios ("mismo patrón que en SortableSequenceList") no cuentan.
 *
 * Uso: node scripts/huerfanos.mjs
 *
 * Puntos de entrada que NUNCA son huérfanos aunque nadie los importe:
 *   - page/layout/route/loading/error de Next (los llama el framework)
 *   - proxy.ts / middleware.ts (idem)
 *   - todo lo de scripts/ (se ejecuta desde la terminal)
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = 'src';
const archivos = [];
(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) archivos.push(p.replace(/\\/g, '/'));
  }
})(RAIZ);

const esEntrada = (f) =>
  /\/(page|layout|route|loading|error|not-found|template|default)\.(tsx?|jsx?)$/.test(f) ||
  /^src\/(proxy|middleware|instrumentation)\.ts$/.test(f);

/** Nombre sin extensión, para casar con lo que aparece tras el último "/" en un import. */
const base = (f) => path.basename(f).replace(/\.(tsx?|jsx?)$/, '');

// Mapa archivo -> quiénes lo importan
const importadoPor = new Map(archivos.map(f => [f, new Set()]));
const RE_IMPORT = /^\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/gm;

for (const f of archivos) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(RE_IMPORT)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec || (!spec.startsWith('.') && !spec.startsWith('@/'))) continue;  // paquete externo
    const nombre = spec.split('/').pop();
    // Un import "@/components/awp/ModelTree" apunta al archivo cuyo basename es ModelTree.
    for (const cand of archivos) {
      if (cand === f) continue;
      if (base(cand) !== nombre) continue;
      // Desambiguar por ruta cuando hay varios con el mismo nombre.
      const rutaSpec = spec.replace(/^@\//, 'src/').replace(/^\.\//, '');
      if (spec.startsWith('@/') && !cand.startsWith(rutaSpec.split('/').slice(0, -1).join('/'))) continue;
      importadoPor.get(cand).add(f);
    }
  }
}

// Cierre transitivo: quitar huérfanos e ir recalculando.
const vivos = new Set(archivos);
const muertos = [];
let ronda = 0;
for (;;) {
  ronda++;
  const nuevos = [...vivos].filter(f =>
    !esEntrada(f) && [...importadoPor.get(f)].every(imp => !vivos.has(imp))
  );
  if (!nuevos.length) break;
  for (const f of nuevos) { vivos.delete(f); muertos.push({ archivo: f, ronda }); }
}

const lineas = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').length : 0;
const total = muertos.reduce((s, m) => s + lineas(m.archivo), 0);

console.log(`Archivos analizados: ${archivos.length}`);
console.log(`Código muerto: ${muertos.length} archivos · ${total.toLocaleString('es-CL')} líneas\n`);

const porRonda = new Map();
for (const m of muertos) { (porRonda.get(m.ronda) ?? porRonda.set(m.ronda, []).get(m.ronda)).push(m.archivo); }
for (const [r, fs_] of [...porRonda].sort((a, b) => a[0] - b[0])) {
  console.log(r === 1
    ? `RONDA 1 — nadie los importa (${fs_.length}):`
    : `RONDA ${r} — quedan muertos al borrar la ronda anterior (${fs_.length}):`);
  for (const f of fs_.sort()) console.log(`   ${String(lineas(f)).padStart(5)} líneas  ${f}`);
  console.log();
}
console.log('Para borrarlos:  node scripts/huerfanos.mjs --lista | xargs rm');
if (process.argv.includes('--lista')) {
  fs.writeFileSync('graphify-out/huerfanos.txt', muertos.map(m => m.archivo).join('\n'));
  console.log('Lista escrita en graphify-out/huerfanos.txt');
}
