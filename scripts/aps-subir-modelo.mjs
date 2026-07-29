/**
 * Sube un modelo a Autodesk Platform Services y lanza su traducción.
 * Con el URN resultante se obtienen las dos cosas: el visor 3D y las propiedades.
 *
 * Uso: node --env-file=.env.local scripts/aps-subir-modelo.mjs <archivo> [nombre-objeto]
 *
 * Usa el flujo de subida firmada por S3. El PUT directo a /objects/{key} que aparece en
 * ejemplos antiguos (y en src/lib/aps-oss.ts) está deprecado por Autodesk y responde 400.
 */
import fs from 'node:fs';
import path from 'node:path';

const ARCHIVO = process.argv[2];
if (!ARCHIVO || !fs.existsSync(ARCHIVO)) { console.error('Uso: aps-subir-modelo.mjs <archivo.nwd>'); process.exit(1); }
const NOMBRE = (process.argv[3] || path.basename(ARCHIVO)).replace(/[^A-Za-z0-9._-]/g, '_');

const ID = process.env.AUTODESK_CLIENT_ID, SECRET = process.env.AUTODESK_CLIENT_SECRET;
const BUCKET = (process.env.APS_BUCKET_KEY || `hilo-${ID}`.toLowerCase()).slice(0, 128).replace(/[^a-z0-9-_.]/g, '');

async function token() {
  const r = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: ID, client_secret: SECRET,
      scope: 'data:read data:write data:create bucket:create bucket:read' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Auth falló: ' + JSON.stringify(j));
  return j.access_token;
}

const tok = await token();
console.log(`Bucket: ${BUCKET}`);

// ── 1. Bucket (409 = ya existe, es lo esperado a partir de la segunda vez) ──
const bRes = await fetch('https://developer.api.autodesk.com/oss/v2/buckets', {
  method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ bucketKey: BUCKET, policyKey: 'persistent' }),
});
console.log(`  ${bRes.status === 409 ? 'ya existía' : bRes.ok ? 'creado' : 'ERROR ' + await bRes.text()}`);

// ── 2. URLs firmadas: una parte por cada 100 MB ─────────────────────────────
const datos = fs.readFileSync(ARCHIVO);
const TAM_PARTE = 100 * 1024 * 1024;
const partes = Math.max(1, Math.ceil(datos.length / TAM_PARTE));
console.log(`\nArchivo: ${NOMBRE}  (${(datos.length / 1024 / 1024).toFixed(1)} MB, ${partes} parte/s)`);

const urlBase = `https://developer.api.autodesk.com/oss/v2/buckets/${BUCKET}/objects/${encodeURIComponent(NOMBRE)}/signeds3upload`;
const firmaRes = await fetch(`${urlBase}?parts=${partes}`, { headers: { Authorization: `Bearer ${tok}` } });
const firma = await firmaRes.json();
if (!firma.urls) throw new Error('No se obtuvieron URLs firmadas: ' + JSON.stringify(firma));

// ── 3. Subida de cada parte ─────────────────────────────────────────────────
for (let i = 0; i < firma.urls.length; i++) {
  const trozo = datos.subarray(i * TAM_PARTE, Math.min((i + 1) * TAM_PARTE, datos.length));
  process.stdout.write(`  subiendo parte ${i + 1}/${firma.urls.length} (${(trozo.length / 1024 / 1024).toFixed(1)} MB)… `);
  const up = await fetch(firma.urls[i], { method: 'PUT', body: trozo });
  if (!up.ok) throw new Error(`fallo parte ${i + 1}: ${up.status} ${await up.text()}`);
  console.log('ok');
}

// ── 4. Confirmar la subida ──────────────────────────────────────────────────
const finRes = await fetch(urlBase, {
  method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ uploadKey: firma.uploadKey }),
});
const fin = await finRes.json();
if (!fin.objectId) throw new Error('No se completó la subida: ' + JSON.stringify(fin));

const urn = Buffer.from(fin.objectId).toString('base64').replace(/=/g, '');
console.log(`\nSubido. objectId: ${fin.objectId}`);
console.log(`URN: ${urn}`);

// ── 5. Traducción ───────────────────────────────────────────────────────────
// SVF2 es el formato que necesita la Model Properties API y el visor moderno.
const jobRes = await fetch('https://developer.api.autodesk.com/modelderivative/v2/designdata/job', {
  method: 'POST',
  headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'x-ads-force': 'true' },
  body: JSON.stringify({
    input: { urn },
    output: { formats: [{ type: 'svf2', views: ['3d', '2d'] }] },
  }),
});
const job = await jobRes.json();
console.log(`\nTraducción: ${job.result ?? JSON.stringify(job)}`);
console.log(`\nSeguimiento:  node --env-file=.env.local scripts/aps-estado.mjs ${urn}`);
fs.writeFileSync('graphify-out/ultimo-urn.txt', urn);
