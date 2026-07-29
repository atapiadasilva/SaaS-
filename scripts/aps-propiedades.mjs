/**
 * Extrae las propiedades de todos los objetos de un modelo traducido en APS.
 *
 * Uso: node --env-file=.env.local scripts/aps-propiedades.mjs [urn] [--salida=archivo.json]
 *
 * Primero muestra QUÉ propiedades trae el modelo y cuántos objetos tienen cada una: sin ese
 * inventario no se puede decidir con qué campo vincular los elementos a su CWP. Recién
 * después conviene programar el match.
 *
 * El identificador que se conserva es `externalId`, no `objectid`: el segundo cambia cada
 * vez que se retraduce el modelo, así que un vínculo hecho sobre él se rompe en la próxima
 * versión.
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const salida = (args.find(a => a.startsWith('--salida=')) ?? '').split('=')[1] || 'graphify-out/propiedades-modelo.json';
const URN = args.find(a => !a.startsWith('--')) || (fs.existsSync('graphify-out/ultimo-urn.txt')
  ? fs.readFileSync('graphify-out/ultimo-urn.txt', 'utf8').trim() : null);
if (!URN) { console.error('Falta el URN'); process.exit(1); }

const API = 'https://developer.api.autodesk.com/modelderivative/v2/designdata';

async function token() {
  const r = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials',
      client_id: process.env.AUTODESK_CLIENT_ID, client_secret: process.env.AUTODESK_CLIENT_SECRET,
      scope: 'data:read viewables:read' }),
  });
  return (await r.json()).access_token;
}

const tok = await token();
const cab = { Authorization: `Bearer ${tok}` };

// ── Vistas del modelo ───────────────────────────────────────────────────────
const metaRes = await fetch(`${API}/${URN}/metadata`, { headers: cab });
const meta = await metaRes.json();
const vistas = meta?.data?.metadata ?? [];
if (!vistas.length) { console.error('Sin vistas. ¿Terminó la traducción?', JSON.stringify(meta).slice(0, 300)); process.exit(1); }

console.log(`Vistas del modelo (${vistas.length}):`);
for (const v of vistas) console.log(`   ${v.role.padEnd(3)} ${v.name}   guid=${v.guid}`);

// La vista 3D es la que trae la jerarquía completa de objetos.
const vista = vistas.find(v => v.role === '3d') ?? vistas[0];
console.log(`\nUsando: ${vista.name}\n`);

// ── Propiedades (202 = el servicio las está preparando) ─────────────────────
let props = null;
for (let intento = 1; intento <= 30; intento++) {
  const r = await fetch(`${API}/${URN}/metadata/${vista.guid}/properties?forceget=true`, { headers: cab });
  if (r.status === 202) {
    process.stdout.write(`\r  preparando propiedades… intento ${intento}`);
    await new Promise(s => setTimeout(s, 10000));
    continue;
  }
  if (!r.ok) { console.error(`\nError ${r.status}: ${(await r.text()).slice(0, 300)}`); process.exit(1); }
  props = await r.json();
  break;
}
if (!props) { console.error('\nEl servicio no entregó las propiedades tras varios intentos.'); process.exit(1); }

const objetos = props?.data?.collection ?? [];
console.log(`\rObjetos con propiedades: ${objetos.length.toLocaleString('es-CL')}          \n`);

// ── Inventario: qué propiedades existen y en cuántos objetos ────────────────
const conteo = new Map();      // "Categoría :: Propiedad" -> nº de objetos
const ejemplos = new Map();
for (const o of objetos) {
  for (const [grupo, campos] of Object.entries(o.properties ?? {})) {
    if (typeof campos !== 'object') continue;
    for (const [campo, valor] of Object.entries(campos)) {
      if (valor === null || valor === '' || valor === undefined) continue;
      const k = `${grupo} :: ${campo}`;
      conteo.set(k, (conteo.get(k) ?? 0) + 1);
      if (!ejemplos.has(k)) ejemplos.set(k, String(valor).slice(0, 40));
    }
  }
}

console.log(`PROPIEDADES DISPONIBLES (${conteo.size})`);
console.log(`${'-'.repeat(96)}`);
for (const [k, v] of [...conteo].sort((a, b) => b[1] - a[1]).slice(0, 60)) {
  const pct = ((v / objetos.length) * 100).toFixed(0);
  console.log(`  ${String(v).padStart(7)} (${pct.padStart(3)}%)  ${k.padEnd(56)} ej: ${ejemplos.get(k)}`);
}

// ── Salida: un registro plano por objeto ────────────────────────────────────
const filas = objetos.map(o => {
  const plano = { externalId: o.externalId ?? null, objectid: o.objectid, name: o.name ?? null };
  for (const [grupo, campos] of Object.entries(o.properties ?? {})) {
    if (typeof campos !== 'object') continue;
    for (const [campo, valor] of Object.entries(campos)) {
      if (valor === null || valor === '') continue;
      plano[`${grupo}::${campo}`] = valor;
    }
  }
  return plano;
});
fs.mkdirSync('graphify-out', { recursive: true });
fs.writeFileSync(salida, JSON.stringify(filas));
console.log(`\nGuardado: ${salida}  (${(fs.statSync(salida).size / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Con externalId: ${filas.filter(f => f.externalId).length.toLocaleString('es-CL')} de ${filas.length.toLocaleString('es-CL')}`);
