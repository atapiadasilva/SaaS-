/**
 * Vincula a su CWP los elementos de un modelo SmartPlant 3D traducido por APS.
 *
 * A diferencia de Andina, donde el CWP venía escrito en cada objeto, en los modelos SP3D de
 * BHP el paquete no existe como propiedad: hay que deducirlo. Un CWP de Hilo se identifica
 * por CV (área + sector) y disciplina, y el modelo trae las dos cosas repartidas:
 *
 *   SmartPlant 3D::System Path   SCPY_DET\0040\0044\PIPING\UNDERGROUND SYSTEM\0044-10156-SR\…
 *                                            └área┘ └disciplina┘
 *   SmartPlant 3D::CWA           "0044-200"   → el sector, cuando el modelador lo llenó
 *   …\TREN-B\…                                → el sector en las áreas partidas por trenes
 *
 * El sector se busca en ese orden y, si aún falta, se hereda de los hermanos del mismo nodo
 * de sistema cuando TODOS coinciden. Lo que no se resuelve se carga igual, con cwp_id nulo y
 * el motivo escrito: un elemento en el paquete equivocado es peor que uno sin asignar, y
 * dejarlo fuera de la base lo haría invisible en vez de pendiente.
 *
 * LLAVE: se guarda el `Item::GUID` del objeto, no el externalId de APS. El externalId es una
 * ruta de índices ("1/4/0/0/…"): al republicar el modelo con un elemento menos, los índices de
 * todo lo que viene después se corren y cada fila queda apuntando a otra pieza. El GUID viene
 * del objeto de origen y sobrevive a la republicación, que es lo que permite que la
 * clasificación hecha a mano en el editor no se pierda con cada versión del modelo. El visor
 * lo resuelve con su índice de la propiedad GUID (module_config.bim.itemPropName = 'GUID').
 *
 * Uso:
 *   node --env-file=.env.local scripts/aps-vincular-sp3d.mjs <props-*.json> <project_id> [--aplicar]
 *
 *   Sin --aplicar solo simula e imprime el resultado; no escribe nada.
 *   --urn=…            además conecta el visor del proyecto a ese modelo
 *   --nombre="…"       nombre del modelo en el visor
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const opt = (n, d = '') => (args.find(a => a.startsWith(`--${n}=`)) ?? '').split('=').slice(1).join('=') || d;
const APLICAR = args.includes('--aplicar');
const [PROPS, PROJECT_ID] = args.filter(a => !a.startsWith('--'));
if (!PROPS || !PROJECT_ID) {
  console.error('Uso: aps-vincular-sp3d.mjs <props-*.json> <project_id> [--aplicar] [--urn=…] [--nombre="…"]');
  process.exit(1);
}
const URN = opt('urn', null), NOMBRE_MODELO = opt('nombre', 'Modelo del proyecto');

/** Carpeta de disciplina del System Path → código de disciplina de Hilo. */
const DISCIPLINA = {
  PIPING: 'P', ELECTRICAL: 'E', STEEL: 'S', CONCRETE: 'C',
  CSYS: 'J',      // Control System: instrumentos, paneles IO y sus soportes
  LAYOUT: 'M',    // disposición de equipos
};
const TREN_A_SECTOR = { A: '100', B: '200', C: '300', D: '400' };

/**
 * Planta existente y referencias dibujadas dentro de las áreas nuevas. No son alcance de
 * construcción y no pueden colgar de un CWP: se cargan marcadas para que se vean en el visor
 * como contexto. Ojo con "SP-PIPING NUEVO…", que pese al parecido SÍ es obra nueva.
 */
const ES_EXISTENTE = /(EXISTENTE|EXISTING|\bREF_|DEMOL)/i;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── Catálogo del proyecto ───────────────────────────────────────────────────
const { data: cwps, error: eCwp } = await sb.from('mining_cwp')
  .select('cwp_id, cwa_id, cv_id, disciplina_cod, disciplina').eq('project_id', PROJECT_ID);
if (eCwp) { console.error(eCwp.message); process.exit(1); }
if (!cwps?.length) { console.error('El proyecto no tiene CWP cargados.'); process.exit(1); }

const porCv = new Map();                       // cv_id → Set(disciplina_cod)
const nombreDisc = new Map();                  // disciplina_cod → nombre largo
const catalogo = new Map();                    // "cv.disc" → cwp
for (const c of cwps) {
  if (!porCv.has(c.cv_id)) porCv.set(c.cv_id, new Set());
  porCv.get(c.cv_id).add(c.disciplina_cod);
  nombreDisc.set(c.disciplina_cod, c.disciplina);
  catalogo.set(`${c.cv_id}.${c.disciplina_cod}`, c);
}
/** Sectores reales de un área, sin el CV "000" que es el de cierre. */
const sectoresDe = (area) => [...porCv.keys()].filter(cv => cv.startsWith(area) && !cv.endsWith('000')).map(cv => cv.slice(4));
console.log(`Catálogo: ${cwps.length} CWP en ${porCv.size} CV`);

// ── Objetos del modelo ──────────────────────────────────────────────────────
const filas = JSON.parse(fs.readFileSync(PROPS, 'utf8'));
const comps = filas.filter(f => f['Item::Icon'] === 'Composite Object' && f['SmartPlant 3D::System Path']);
console.log(`Modelo: ${filas.length.toLocaleString('es-CL')} objetos, ${comps.length.toLocaleString('es-CL')} componentes SP3D\n`);

const path = (f) => String(f['SmartPlant 3D::System Path']).split('\\');
const areaDe = (f) => { const a = path(f)[2] ?? ''; return /^\d{4}$/.test(a) ? a : null; };
const discDe = (f) => DISCIPLINA[path(f)[3] ?? ''] ?? null;
/** Nodo de sistema = el path sin la hoja. Los hermanos de un mismo nodo son el mismo sistema físico. */
const nodoDe = (f) => { const p = path(f); return p.length > 4 ? p.slice(0, -1).join('\\') : null; };

function sectorDeclarado(f) {
  const area = areaDe(f);
  const m = String(f['SmartPlant 3D::CWA'] ?? '').match(/(\d{4})-?0?(\d00)\b/);
  if (m && m[1] === area) return { sector: m[2], via: 'CWA del modelo' };
  const t = String(f['SmartPlant 3D::System Path']).match(/\\TREN[- ]?([A-D])\\/i);
  if (t) return { sector: TREN_A_SECTOR[t[1].toUpperCase()], via: 'tren del path' };
  return null;
}

// Herencia entre hermanos: solo si TODOS los hermanos con sector declarado coinciden.
const porNodo = new Map();
for (const f of comps) {
  if (ES_EXISTENTE.test(String(f['SmartPlant 3D::System Path']))) continue;
  const n = nodoDe(f), d = sectorDeclarado(f);
  if (!n || !d) continue;
  if (!porNodo.has(n)) porNodo.set(n, new Set());
  porNodo.get(n).add(d.sector);
}
const sectorDelNodo = new Map([...porNodo].filter(([, s]) => s.size === 1).map(([n, s]) => [n, [...s][0]]));

/** "E 2951 ft  2 in   S 17247 ft  2 in   EL+ 5548 ft  6 in" → milímetros */
function coordenadas(s) {
  if (!s) return {};
  const pie = (letra) => {
    const m = String(s).match(new RegExp(`(?:^|\\s)${letra}\\+?\\s*(-?\\d+)\\s*ft\\s*(-?\\d+)?`, 'i'));
    return m ? Math.round((Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0)) * 304.8) : null;
  };
  return { este: pie('E'), norte: pie('S'), elevacion: pie('EL') };
}

/** GUID del objeto si lo trae; si no, el externalId posicional como último recurso. */
function llaveDe(f) {
  const guid = String(f['Item::GUID'] ?? f['SmartPlant 3D::GUID'] ?? '').trim();
  if (guid) return { id: guid, tipo: 'guid' };
  const ext = String(f.externalId ?? '').trim();
  return ext ? { id: ext, tipo: 'externalId' } : null;
}

// ── Resolución ──────────────────────────────────────────────────────────────
const elementos = [], motivos = new Map(), vias = new Map(), porCwp = new Map();
const vistos = new Set();
let repetidos = 0, porGuid = 0, porExternalId = 0;

for (const f of comps) {
  const llave = llaveDe(f);
  if (!llave) continue;
  const id = llave.id;
  if (vistos.has(id)) { repetidos++; continue; }
  vistos.add(id);
  if (llave.tipo === 'guid') porGuid++; else porExternalId++;

  const p = path(f);
  const area = areaDe(f), disc = discDe(f), nodo = nodoDe(f);
  let sector = null, via = null, cwp = null, motivo = null, categoria = 'SECTOR_PENDIENTE';

  if (ES_EXISTENTE.test(p.join('\\'))) { motivo = 'planta existente o referencia, no es alcance de construcción'; categoria = 'EXISTENTE'; }
  else if (!area) motivo = `área ilegible en el path: "${p[2] ?? ''}"`;
  else if (!disc) motivo = `disciplina no mapeada: ${area} ${p[3] ?? '(vacía)'}`;
  else {
    const d = sectorDeclarado(f);
    if (d) ({ sector, via } = d);
    else if (sectoresDe(area).length === 1) { sector = sectoresDe(area)[0]; via = 'único sector del área'; }
    else if (nodo && sectorDelNodo.has(nodo)) { sector = sectorDelNodo.get(nodo); via = 'heredado del nodo de sistema'; }

    if (!sector) motivo = `sector sin determinar — el área ${area} tiene ${sectoresDe(area).length} sectores`;
    else {
      const hit = catalogo.get(`${area + sector}.${disc}`);
      if (hit) cwp = hit;
      else { motivo = `${area + sector}.${disc} no existe en el catálogo de CWP`; categoria = 'FUERA_CATALOGO'; }
    }
  }

  if (cwp) { vias.set(via, (vias.get(via) ?? 0) + 1); porCwp.set(cwp.cwp_id, (porCwp.get(cwp.cwp_id) ?? 0) + 1); }
  else motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);

  const c = coordenadas(f['SmartPlant 3D::Location'] ?? f['SmartPlant 3D::Support Location']);
  elementos.push({
    project_id: PROJECT_ID,
    sp3d_moniker: id,                    // GUID del objeto (ver nota de LLAVE arriba)
    guid_modelo: f['Item::GUID'] ?? f['SmartPlant 3D::GUID'] ?? null,
    name: f['SmartPlant 3D::Name'] ?? f.name ?? null,
    descripcion: f['SmartPlant 3D::Description'] ?? null,
    tipo_elemento: f['Item::Type'] ?? null,
    material: f['SmartPlant 3D::Material'] ?? f['Item::Material'] ?? null,
    tag_equipo: f['SmartPlant 3D::Equipment Name'] ?? f['PDS Component Data::Tag no'] ?? null,
    pipeline_linea: f['SmartPlant 3D::Pipeline'] ?? f['SmartPlant 3D::RunName'] ?? null,
    spool: f['SmartPlant 3D::PipeRun'] ?? null,
    pid: f['SmartPlant 3D::PID'] ?? null,
    especificacion: f['SmartPlant 3D::Especificacion Técnica'] ?? null,
    sistema_servicio: p.slice(4, 6).join(' / ') || null,
    area_unidad: area,
    sector: sector ? `${area}-${sector}` : null,
    wbs: f['SmartPlant 3D::WBS'] ?? null,
    obra_raw: f['Item::Source File'] ?? null,
    disciplina_modelo: p[3] ?? null,
    disciplina: disc ? nombreDisc.get(disc) ?? null : null,
    especialidad_cod: disc,
    cwp_id: cwp?.cwp_id ?? null,
    cwa_id: cwp?.cwa_id ?? area,
    cv_id: cwp?.cv_id ?? (sector ? area + sector : null),
    cwp_fuente: cwp ? `modelo SP3D (${via})` : null,
    categoria_enlace: cwp ? 'VINCULADO' : categoria,
    validado: cwp ? 'SI' : 'NO',
    motivo_no_valido: motivo,
    ...c,
  });
}

// ── Informe ─────────────────────────────────────────────────────────────────
const vinculados = elementos.filter(e => e.cwp_id);
const pend = elementos.length - vinculados.length;
console.log(`Componentes            : ${elementos.length.toLocaleString('es-CL')}${repetidos ? `   (${repetidos} llaves repetidas, omitidas)` : ''}`);
console.log(`  llave estable (GUID) : ${porGuid.toLocaleString('es-CL')}${porExternalId ? `   ·   por externalId posicional: ${porExternalId.toLocaleString('es-CL')} (se romperán al republicar)` : ''}`);
console.log(`Vinculados a un CWP    : ${vinculados.length.toLocaleString('es-CL')}  (${((vinculados.length / elementos.length) * 100).toFixed(1)}%)`);
console.log(`Sin CWP                : ${pend.toLocaleString('es-CL')}`);
const porCat = new Map();
for (const e of elementos) if (!e.cwp_id) porCat.set(e.categoria_enlace, (porCat.get(e.categoria_enlace) ?? 0) + 1);
for (const [k, v] of [...porCat].sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(6)}  ${k}`);

console.log(`\nCómo se determinó el sector:`);
for (const [k, v] of [...vias].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);

console.log(`\nPor qué quedan pendientes:`);
for (const [k, v] of [...motivos].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);

console.log(`\nCWP con elementos: ${porCwp.size} de ${cwps.length}`);
for (const [k, v] of [...porCwp].sort()) console.log(`  ${String(v).padStart(6)}  ${k}`);
const sinElementos = cwps.map(c => c.cwp_id).filter(id => !porCwp.has(id)).sort();
console.log(`\nCWP sin ningún elemento (${sinElementos.length}):\n  ${sinElementos.join('  ')}`);

if (!APLICAR) { console.log(`\nSimulación. Repite con --aplicar para escribir en la base.`); process.exit(0); }

// ── Carga ───────────────────────────────────────────────────────────────────
console.log(`\nCargando…`);
const { error: eDel } = await sb.from('mining_elementos').delete().eq('project_id', PROJECT_ID);
if (eDel) { console.error('  error al limpiar:', eDel.message); process.exit(1); }
let n = 0;
for (let i = 0; i < elementos.length; i += 500) {
  const lote = elementos.slice(i, i + 500);
  const { error } = await sb.from('mining_elementos').insert(lote);
  if (error) { console.error(`  error en el lote ${i}:`, error.message); process.exit(1); }
  n += lote.length;
  process.stdout.write(`\r  ${n.toLocaleString('es-CL')} / ${elementos.length.toLocaleString('es-CL')}`);
}
console.log(`\n  ${n.toLocaleString('es-CL')} elementos cargados`);

if (URN) {
  const { data: proj } = await sb.from('projects').select('module_config, name').eq('id', PROJECT_ID).single();
  const { error } = await sb.from('projects').update({
    module_config: {
      ...(proj?.module_config ?? {}),
      // La llave guardada es la propiedad GUID del objeto: el visor arma un índice sobre ella y
      // ubica cada elemento. Lo que se haya cargado con externalId (sin GUID) igual se resuelve,
      // porque resolveMonikers cae a getExternalIdMapping con lo que no encuentra por propiedad.
      bim: { urn: URN, modelName: NOMBRE_MODELO, configuredAt: new Date().toISOString(), itemPropName: 'GUID', cwpPropName: 'CWP' },
    },
  }).eq('id', PROJECT_ID);
  if (error) console.error('  no se pudo conectar el visor:', error.message);
  else console.log(`  visor conectado a ${proj?.name ?? PROJECT_ID}`);
}
