/**
 * Smoke test de rutas API críticas.
 * Sin sesión, toda ruta protegida debe responder 401/400 (o 307: el proxy
 * redirige a /auth/login antes de llegar al handler) — nunca 500.
 * Uso: node scripts/smoke-api.mjs [baseUrl]  (default http://localhost:3000)
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';
const PID = '00000000-0000-0000-0000-000000000000';
const PROTECTED = [307, 400, 401];

const CHECKS = [
  { path: '/', ok: [200, 307, 308] },
  { path: '/auth/login', ok: [200] },
  { path: `/api/mining-data?project_id=${PID}`, ok: PROTECTED },
  { path: `/api/mining-kpi?project_id=${PID}`, ok: PROTECTED },
  { path: `/api/mining-iwp?project_id=${PID}`, ok: PROTECTED },
  { path: `/api/mining-iwp-progreso?project_id=${PID}`, ok: PROTECTED },
  { path: `/api/mining-iwp-constraint?project_id=${PID}`, ok: PROTECTED },
  { path: `/api/mining-estado-pago?project_id=${PID}`, ok: PROTECTED },
  { path: `/api/mining-conciliacion?project_id=${PID}`, ok: PROTECTED },
  { path: `/api/mining-elementos?project_id=${PID}`, ok: PROTECTED },
  { path: `/api/mining-apertura?project_id=${PID}`, ok: PROTECTED },
];

let failed = 0;
for (const c of CHECKS) {
  try {
    const res = await fetch(BASE + c.path, { redirect: 'manual' });
    const pass = c.ok.includes(res.status);
    if (!pass) failed++;
    console.log(`${pass ? 'OK  ' : 'FAIL'} ${res.status} ${c.path}${pass ? '' : ` (esperaba ${c.ok.join('/')})`}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ---- ${c.path} (${e.message})`);
  }
}

console.log(failed === 0 ? `\n✓ Smoke OK: ${CHECKS.length} rutas` : `\n✗ ${failed} de ${CHECKS.length} fallaron`);
process.exit(failed === 0 ? 0 : 1);
