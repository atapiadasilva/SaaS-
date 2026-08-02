/**
 * Extrae el grafo de DATOS del repo: quién llama a qué API, y qué tabla toca cada API.
 *
 * Complementa a graphify, que mapea imports. Una ruta de API no tiene imports entrantes
 * (Next la sirve por convención de carpetas) y una tabla no es un archivo, así que la
 * cadena real —pantalla → /api/x → mining_y— es invisible en un grafo de imports.
 *
 * Uso: node scripts/grafo-datos.mjs [salida.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = 'src';
const SALIDA = process.argv[2] ?? 'graphify-out/grafo-datos.json';

// Filas por tabla, medidas en Supabase el 2026-08-02. Sirven para pintar el peso real
// del dato: una tabla viva con 90k filas no es lo mismo que uno esperando su interfaz.
const FILAS = {
  mining_cambios_log: 178469, mining_elementos: 94657, mining_elemento_codigo: 30101,
  mining_itemizado: 1578, mining_planos: 1356, mining_doc_aconex: 1223, mining_mc: 997,
  mining_programa: 990, mining_epr: 836, mining_awp_equipo: 630, mining_ponderaciones: 563,
  mining_partidas: 477, mining_cwp: 159, mining_estudio_aconex: 101, mining_awp_linea: 96,
  mining_obras_crosswalk: 76, mining_bmp_partidas: 74, mining_consideraciones: 71,
  mining_doc_referencia: 69, mining_pwp: 51, mining_suministro: 46, mining_colores_codigo: 41,
  mining_bot_mensajes: 38, mining_swp_subsistemas: 36, mining_swp: 32, mining_awp_pid: 31,
  mining_dotacion: 25, mining_cv: 23, mining_3wla: 20, mining_condiciones: 18,
  mining_disciplinas: 17, mining_hitos: 13, mining_cwa: 12, mining_mapeo_area_cwa: 11,
  mining_personal: 11, mining_3wla_restriccion: 7, mining_iwp_constraint: 7,
  mining_iwp_actividad: 5, mining_iwp: 4, mining_bot_invites: 2, mining_equipos: 2,
  mining_bot_usuarios: 1, mining_revision_estado: 1, mining_avance_pasos: 0,
  mining_awp_linea_equipo: 0, mining_awp_piping_elemento: 0, mining_cwp_ficha: 0,
  mining_ewp_ifc: 0, mining_iwp_elemento: 0, mining_iwp_progreso: 0,
  projects: 5, organizations: 4, organization_members: 4, project_members: 3,
  bot_tools_dinamicas: 6,
};

function recorrer(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

// La ruta de API que representa un route.ts, a partir de su ubicación en el árbol.
function rutaApi(archivo) {
  const m = archivo.replace(/\\/g, '/').match(/src\/app\/(api\/.+)\/route\.ts$/);
  return m ? '/' + m[1] : null;
}

// El módulo al que pertenece una pantalla: es la categoría que ve el usuario final.
function moduloDe(rel) {
  const m = rel.match(/projects\/\[project_id\]\/([a-z0-9-]+)/);
  if (m) return m[1];
  if (rel.includes('/api/')) return 'api';
  return 'plataforma';
}

const archivos = recorrer(RAIZ);
const nodos = new Map();
const aristas = [];

const nodo = (id, tipo, extra = {}) => {
  if (!nodos.has(id)) nodos.set(id, { id, tipo, ...extra });
  return nodos.get(id);
};

for (const archivo of archivos) {
  const src = fs.readFileSync(archivo, 'utf8');
  const rel = archivo.replace(/\\/g, '/');
  const api = rutaApi(archivo);

  if (api) {
    nodo(api, 'api', { archivo: rel, lineas: src.split('\n').length });
    // Tablas que toca esta ruta.
    for (const m of src.matchAll(/\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g)) {
      const tabla = m[1];
      nodo(tabla, 'tabla', { filas: FILAS[tabla] ?? null });
      aristas.push({ desde: api, hasta: tabla, tipo: 'lee' });
    }
  } else {
    // Pantallas, componentes y los auxiliares que viven junto a una ruta
    // (RevisionPanel.tsx, elementos-red.ts…): todos pueden consumir APIs.
    const esPagina = /\/page\.tsx$/.test(rel);
    const esComponente = /\/components\//.test(rel);
    const esAuxiliar = /^src\/(app|lib)\//.test(rel) && !esPagina && !esComponente;
    if (!esPagina && !esComponente && !esAuxiliar) continue;

    const llamadas = [...src.matchAll(/['"`](\/api\/[a-z0-9\-/]+)/g)].map(m => m[1]);
    // Consultas directas a Supabase desde el cliente, sin pasar por una API.
    const directas = [...src.matchAll(/\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g)].map(m => m[1]);
    if (!llamadas.length && !directas.length) continue;

    const nombre = esPagina
      ? rel.replace(/^src\/app\//, '').replace(/\/page\.tsx$/, '')
      : path.basename(rel).replace(/\.(tsx|ts)$/, '');

    nodo(nombre, esPagina ? 'pagina' : esComponente ? 'componente' : 'auxiliar', {
      archivo: rel,
      lineas: src.split('\n').length,
      modulo: moduloDe(rel),
    });

    for (const l of new Set(llamadas)) {
      // Normalizar: /api/mining-elementos/route -> /api/mining-elementos
      const limpia = l.replace(/\/route$/, '');
      nodo(limpia, 'api', {});
      aristas.push({ desde: nombre, hasta: limpia, tipo: 'llama' });
    }
    for (const t of new Set(directas)) {
      nodo(t, 'tabla', { filas: FILAS[t] ?? null });
      aristas.push({ desde: nombre, hasta: t, tipo: 'directo' });
    }
  }
}

// Tablas que existen en la base pero que ningún archivo menciona.
for (const [tabla, filas] of Object.entries(FILAS)) {
  if (!nodos.has(tabla)) nodo(tabla, 'tabla', { filas, huerfana: true });
}

// Puertas de entrada que el grep no puede ver. Sin esta lista, el grafo las acusaría
// de muertas: no las llama el front, las llama alguien de fuera.
const ENTRADAS_EXTERNAS = {
  '/api/autodesk/callback': 'Lo invoca Autodesk al terminar el OAuth, no el front.',
};
// Trabajo en curso, todavía sin pantalla que lo consuma. No es código muerto.
const EN_CURSO = ['/api/servicios'];

// Grado entrante: una API sin nadie que la llame es candidata a limpieza.
const entrantes = new Map();
for (const a of aristas) entrantes.set(a.hasta, (entrantes.get(a.hasta) ?? 0) + 1);
for (const n of nodos.values()) {
  n.entrantes = entrantes.get(n.id) ?? 0;
  if (ENTRADAS_EXTERNAS[n.id]) { n.entradaExterna = ENTRADAS_EXTERNAS[n.id]; continue; }
  if (EN_CURSO.some(p => n.id.startsWith(p))) { n.enCurso = true; continue; }
  if (n.tipo === 'api' && n.entrantes === 0) n.sinConsumidor = true;
  if (n.tipo === 'tabla' && n.entrantes === 0) n.huerfana = true;
}

const grafo = { generado: new Date().toISOString(), nodos: [...nodos.values()], aristas };
fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, JSON.stringify(grafo, null, 2));

const por = t => grafo.nodos.filter(n => n.tipo === t).length;
console.log(`${grafo.nodos.length} nodos · ${aristas.length} aristas -> ${SALIDA}`);
console.log(`  paginas ${por('pagina')} · componentes ${por('componente')} · apis ${por('api')} · tablas ${por('tabla')}`);
console.log(`  APIs sin consumidor: ${grafo.nodos.filter(n => n.sinConsumidor).map(n => n.id).join(', ')}`);
console.log(`  Tablas sin lector:   ${grafo.nodos.filter(n => n.tipo === 'tabla' && n.huerfana).map(n => n.id).join(', ')}`);
