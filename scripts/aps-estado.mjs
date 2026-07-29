/**
 * Consulta el estado de traducción de un modelo en APS.
 * Uso: node --env-file=.env.local scripts/aps-estado.mjs [urn]
 * Sin urn usa el último subido (graphify-out/ultimo-urn.txt).
 */
import fs from 'node:fs';

const URN = process.argv[2] || (fs.existsSync('graphify-out/ultimo-urn.txt')
  ? fs.readFileSync('graphify-out/ultimo-urn.txt', 'utf8').trim() : null);
if (!URN) { console.error('Falta el URN'); process.exit(1); }

const r = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials',
    client_id: process.env.AUTODESK_CLIENT_ID, client_secret: process.env.AUTODESK_CLIENT_SECRET,
    scope: 'data:read viewables:read' }),
});
const tok = (await r.json()).access_token;

const m = await fetch(`https://developer.api.autodesk.com/modelderivative/v2/designdata/${URN}/manifest`,
  { headers: { Authorization: `Bearer ${tok}` } });
const man = await m.json();

console.log(`Estado    : ${man.status}`);
console.log(`Progreso  : ${man.progress}`);
if (man.derivatives) {
  for (const d of man.derivatives) {
    console.log(`  ${d.outputType.padEnd(6)} ${d.status.padEnd(10)} ${d.progress ?? ''}`);
    for (const msg of d.messages ?? []) {
      if (msg.type === 'error') console.log(`     ERROR: ${JSON.stringify(msg.message).slice(0, 200)}`);
      if (msg.type === 'warning') console.log(`     aviso: ${JSON.stringify(msg.message).slice(0, 160)}`);
    }
  }
}
if (man.status === 'success') console.log(`\nListo. Extraer propiedades:\n  node --env-file=.env.local scripts/aps-propiedades.mjs`);
