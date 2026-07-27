/**
 * Convierte el grafo de graphify en decisiones de arquitectura.
 *
 * El grafo por sí solo es un dibujo bonito. Lo que sirve son tres preguntas:
 *   1. ¿Qué código nadie usa?     -> nodos sin aristas entrantes (candidatos a borrar)
 *   2. ¿Qué no puedo tocar?       -> nodos con muchos dependientes (romperlos rompe todo)
 *   3. ¿Dónde está la complejidad? -> archivos que dependen de demasiadas cosas
 *
 * Uso: node scripts/analizar-grafo.mjs [ruta/graph.json]
 *
 * OJO con el límite de la herramienta: esto mapea el CÓDIGO, no los datos en ejecución.
 * Dos archivos que se comunican por la base de datos aparecen como desconectados, porque
 * su relación no está escrita en ningún import.
 */
import fs from 'node:fs';

const RUTA = process.argv[2] ?? 'graphify-out/graph.json';
if (!fs.existsSync(RUTA)) {
  console.error(`No existe ${RUTA}. Genera el grafo primero con:  graphify update .`);
  process.exit(1);
}
const g = JSON.parse(fs.readFileSync(RUTA, 'utf8'));
const nodos = g.nodes ?? [];
const aristas = g.edges ?? g.links ?? [];

const porId = new Map(nodos.map(n => [n.id, n]));
const entrantes = new Map(), salientes = new Map();
for (const e of aristas) {
  const o = e.source ?? e.from, d = e.target ?? e.to;
  salientes.set(o, (salientes.get(o) ?? 0) + 1);
  entrantes.set(d, (entrantes.get(d) ?? 0) + 1);
}

const etiqueta = (n) => n.label ?? n.name ?? n.id;
const archivo = (n) => n.file ?? n.source_file ?? n.path ?? '';
/** Solo nos interesan archivos propios del proyecto, no símbolos internos ni librerías. */
const esArchivoPropio = (n) => /\.(tsx?|mjs|jsx?)$/.test(etiqueta(n)) && /^(src|scripts)[\\/]/.test(archivo(n));

console.log(`Grafo: ${nodos.length} nodos · ${aristas.length} aristas\n`);

// ── 1. Huérfanos ────────────────────────────────────────────────────────────
const huerfanos = nodos
  .filter(n => esArchivoPropio(n) && !(entrantes.get(n.id) > 0) && (salientes.get(n.id) ?? 0) > 0)
  .map(n => ({ n, peso: salientes.get(n.id) ?? 0 }))
  .sort((a, b) => b.peso - a.peso);

// "Nadie lo importa" NO significa "no sirve". Hay tres puertas de entrada que un grafo de
// imports no ve, y confundirlas lleva a borrar código vivo:
//   - rutas de Next: las invoca el framework por la convención de carpetas
//   - scripts CLI: se ejecutan con `node scripts/x.mjs`, nadie los importa jamás
//   - comunicación por base de datos: dos módulos que se hablan por Supabase no comparten import
const clasificar = (ruta) =>
  /[\\/](page|layout|route|loading|not-found|error)\.tsx?$/.test(ruta) ? 'ruta Next — la llama el framework'
  : /^scripts[\\/]/.test(ruta) ? 'script CLI — se ejecuta a mano'
  : null;

console.log(`1) CÓDIGO QUE NADIE IMPORTA  (${huerfanos.length} archivos)`);
console.log(`   Sin aristas entrantes. Pero ojo: hay entradas que el grafo no ve.\n`);
for (const { n, peso } of huerfanos.slice(0, 22)) {
  const ruta = archivo(n);
  const motivo = clasificar(ruta);
  console.log(`   ${String(peso).padStart(3)} deps  ${etiqueta(n).padEnd(28)} ${motivo ? `(${motivo})` : '<-- REVISAR: sin uso aparente'}`);
}

// ── 2. Nodos críticos ───────────────────────────────────────────────────────
const criticos = nodos
  .map(n => ({ n, dep: entrantes.get(n.id) ?? 0 }))
  .filter(x => x.dep > 0)
  .sort((a, b) => b.dep - a.dep);

console.log(`\n2) LO QUE NO PUEDES ROMPER  (más dependientes)`);
console.log(`   Cambiar su firma obliga a tocar todo lo que cuelga de ellos.\n`);
for (const { n, dep } of criticos.slice(0, 12)) {
  console.log(`   ${String(dep).padStart(3)} usos   ${etiqueta(n).padEnd(28)} ${archivo(n)}`);
}

// ── 3. Complejidad concentrada ──────────────────────────────────────────────
const complejos = nodos
  .filter(esArchivoPropio)
  .map(n => ({ n, sal: salientes.get(n.id) ?? 0 }))
  .sort((a, b) => b.sal - a.sal);

console.log(`\n3) ARCHIVOS QUE DEPENDEN DE MÁS COSAS  (candidatos a dividir)`);
console.log(`   Mucha dependencia saliente = el archivo hace demasiado y es difícil de probar.\n`);
for (const { n, sal } of complejos.slice(0, 12)) {
  console.log(`   ${String(sal).padStart(3)} deps  ${etiqueta(n).padEnd(28)} ${archivo(n)}`);
}

const realmenteSinUso = huerfanos.filter(({ n }) => !clasificar(archivo(n)));
console.log(`\nRESUMEN: ${realmenteSinUso.length} archivos sin uso aparente, descontadas rutas de Next y scripts CLI:`);
for (const { n } of realmenteSinUso.slice(0, 25)) console.log(`   ${archivo(n)}`);
console.log(`\nVerifica SIEMPRE antes de borrar:  grep -rn "NombreDelArchivo" src/`);
