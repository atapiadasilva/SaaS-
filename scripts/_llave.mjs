import fs from 'node:fs';
const filas = JSON.parse(fs.readFileSync('graphify-out/props-SCPY-0000-PP-RPT-51034_LIMPIO3.nwd.json', 'utf8'));
const comps = filas.filter(f => f['Item::Icon'] === 'Composite Object' && f['SmartPlant 3D::System Path']);
console.log(`${comps.length} componentes SP3D\n`);

// Toda propiedad presente en los componentes, con cuántos valores distintos
const cobertura = new Map(), distintos = new Map(), ejemplo = new Map();
for (const f of comps) {
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === '') continue;
    cobertura.set(k, (cobertura.get(k) ?? 0) + 1);
    let s = distintos.get(k); if (!s) distintos.set(k, s = new Set());
    if (s.size < 20000) s.add(String(v));
    if (!ejemplo.has(k)) ejemplo.set(k, String(v));
  }
}

console.log('=== Candidatas a LLAVE DE IDA Y VUELTA (presentes en >90% y casi únicas) ===');
const cand = [...cobertura].filter(([k, n]) => n / comps.length > 0.9)
  .map(([k, n]) => ({ k, n, d: distintos.get(k).size }))
  .sort((a, b) => b.d - a.d);
for (const c of cand) {
  const unicidad = (c.d / c.n * 100).toFixed(1);
  console.log(`  ${String(c.n).padStart(6)} (${((c.n / comps.length) * 100).toFixed(0)}%)  ${String(c.d).padStart(6)} distintos = ${unicidad.padStart(5)}% único   ${c.k}`);
  console.log(`${' '.repeat(38)}ej: ${String(ejemplo.get(c.k)).slice(0, 70)}`);
}

console.log('\n=== ¿Hay algo con pinta de moniker/OID de SmartPlant? ===');
const pat = /moniker|oid|objectid|\bid\b|handle|uid|siteid/i;
const sospechosas = [...cobertura].filter(([k]) => pat.test(k));
if (!sospechosas.length) console.log('  ninguna propiedad con ese nombre');
for (const [k, n] of sospechosas) console.log(`  ${String(n).padStart(6)}  ${k}   ej: ${String(ejemplo.get(k)).slice(0, 60)}`);

// ¿Algún valor con la forma del moniker de SP3D (@a=...!!...##...)?
let conForma = 0, ejForma = '';
for (const f of comps) for (const v of Object.values(f)) {
  if (typeof v === 'string' && /^@[a-z]=\d+!!/i.test(v)) { conForma++; if (!ejForma) ejForma = v; break; }
}
console.log(`\nValores con la forma "@a=0028!!240024##…" (moniker SP3D real): ${conForma}${ejForma ? ' · ej ' + ejForma : ''}`);

console.log('\n=== Todas las propiedades de SmartPlant 3D disponibles ===');
for (const [k, n] of [...cobertura].filter(([k]) => k.startsWith('SmartPlant')).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(6)} (${((n / comps.length) * 100).toFixed(0).padStart(3)}%)  ${k.replace('SmartPlant 3D::', '')}   ej: ${String(ejemplo.get(k)).slice(0, 44)}`);
}
