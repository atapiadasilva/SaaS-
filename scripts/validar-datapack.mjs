/**
 * Validador del data pack de Hilo Digital. NO toca la base de datos: solo lee el Excel
 * y responde si está en condiciones de cargarse.
 *
 * Uso:  node scripts/validar-datapack.mjs <archivo.xlsx>
 *
 * Existe porque el modo de fallo más caro de esta plataforma es silencioso: un pack que
 * carga "bien" pero con la llave CWP inconsistente entre hojas deja un proyecto lleno de
 * datos que no cruzan con nada. Eso no se ve hasta que alguien abre un módulo y está vacío.
 */
import * as XLSX from 'xlsx';
import fs from 'node:fs';

// Formatos de CWP aceptados. Espejo de src/lib/awp-codigo.ts, que es la fuente de verdad:
//   canónico   {CV}.{DISC}{SEQ}                    312101.C001 · 0044100.MB002
//   prefijado  CWP-{AREA}-{SECTOR}-{DISC}-{SEQ}    CWP-3351-10-BA-010  (Andina)
const RE_CWP_CANONICO = /^(\d{4,8})\.([A-Za-z]+)(\d+)$/;
const RE_CWP_PREFIJADO = /^CWP-(\d{4})-(\d{2})-([A-Za-z]{2,3})-(\d{2,4})$/i;
const RE_CWP = { test: (s) => RE_CWP_CANONICO.test(s) || RE_CWP_PREFIJADO.test(s) };
const RE_FECHA = /^\d{4}-\d{2}-\d{2}/;

export function validarDataPack(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: false });
  const hoja = (pref) => {
    const name = wb.SheetNames.find(n => n.startsWith(pref));
    return name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false }) : null;
  };
  const CWP = r => String(r.CWP_hilo || r.CWP || '').trim();

  const errores = [];   // bloquean la carga
  const avisos = [];    // se carga igual, pero conviene saberlo
  const err = (hoja, msg, ejemplos = []) => errores.push({ hoja, msg, ejemplos: ejemplos.slice(0, 3) });
  const avi = (hoja, msg, ejemplos = []) => avisos.push({ hoja, msg, ejemplos: ejemplos.slice(0, 3) });

  const P1 = hoja('P1'), P2 = hoja('P2'), P3 = hoja('P3'), P4 = hoja('P4');
  const P4b = hoja('P4b'), P5 = hoja('P5'), P6 = hoja('P6'), P6b = hoja('P6b'), P7 = hoja('P7'), P10 = hoja('P10');

  // ── P1: el catálogo CWP es la columna vertebral; sin él no hay llave que repartir.
  if (!P1 || !P1.length) {
    err('P1', P1
      ? 'La hoja P1 (Catálogo CWP) está vacía. Es la hoja obligatoria: define la llave del proyecto.'
      : 'Falta la hoja P1 (Catálogo CWP). Es obligatoria: define la llave del proyecto.');
    return { errores, avisos, resumen: { hojas: wb.SheetNames.join(', ') } };
  }
  const cwpsP1 = new Set();
  const malFormados = [], duplicados = [];
  for (const r of P1) {
    const c = CWP(r);
    if (!c) { malFormados.push('(fila sin CWP_hilo)'); continue; }
    if (!RE_CWP.test(c)) malFormados.push(c);
    if (cwpsP1.has(c)) duplicados.push(c);
    cwpsP1.add(c);
  }
  if (malFormados.length) err('P1', `${malFormados.length} CWP no siguen el formato CV.DisciplinaSeq (ej. 312101.C001)`, malFormados);
  if (duplicados.length) err('P1', `${duplicados.length} CWP duplicados en el catálogo`, duplicados);

  // Formatos mezclados en un mismo proyecto: no es error, pero suele indicar dos criterios
  // de codificación conviviendo (y eso termina en CWP que no cruzan).
  const formatos = new Set([...cwpsP1].map(c => RE_CWP_PREFIJADO.test(c) ? 'prefijado' : `canónico/CV-${c.split('.')[0].length}`));
  if (formatos.size > 1) avi('P1', `Conviven distintos formatos de CWP en el mismo proyecto (${[...formatos].join(', ')}). Se cargan igual, pero revisa que sea intencional.`);

  // ── Verifica que la llave de una hoja exista en el catálogo P1.
  //
  // Criterio: falta de llave es un AVISO (el dato está incompleto — típico de un proyecto
  // en plena paquetización, y la matriz de madurez ya lo hace visible). Una llave que
  // apunta a un CWP inexistente es un ERROR: ese dato está mal y ensucia los cruces.
  const chequearLlave = (rows, nombre) => {
    if (!rows) return;
    const sinLlave = [], huerfanos = [];
    for (const r of rows) {
      const c = CWP(r);
      if (!c) { sinLlave.push(JSON.stringify(r).slice(0, 60)); continue; }
      if (!cwpsP1.has(c)) huerfanos.push(c);
    }
    if (sinLlave.length) {
      const pct = Math.round((sinLlave.length / rows.length) * 100);
      avi(nombre, `${sinLlave.length} de ${rows.length} filas (${pct}%) sin CWP_hilo — entran, pero no cruzan con el resto del proyecto`, sinLlave);
    }
    if (huerfanos.length) err(nombre, `${huerfanos.length} filas con un CWP que no existe en P1`, [...new Set(huerfanos)]);
  };

  for (const [rows, nombre] of [[P2,'P2'], [P3,'P3'], [P6b,'P6b'], [P5,'P5'], [P7,'P7'], [P10,'P10']]) {
    chequearLlave(rows, nombre);
  }

  // ── P2: el código de actividad es la llave que usa el itemizado para engancharse.
  const codsP2 = new Set();
  if (P2) {
    const vacios = [], dups = [], fechasMalas = [];
    for (const r of P2) {
      const cod = String(r.Cod_actividad || '').trim();
      if (!cod) { vacios.push('(fila sin Cod_actividad)'); continue; }
      if (codsP2.has(cod)) dups.push(cod);
      codsP2.add(cod);
      for (const f of ['Fecha_inicio', 'Fecha_fin']) {
        const v = String(r[f] || '').trim();
        if (v && !RE_FECHA.test(v)) fechasMalas.push(`${cod}: ${f}="${v}"`);
      }
    }
    if (vacios.length) err('P2', `${vacios.length} actividades sin Cod_actividad`, vacios);
    if (dups.length) avi('P2', `${dups.length} códigos de actividad repetidos`, [...new Set(dups)]);
    if (fechasMalas.length) err('P2', `${fechasMalas.length} fechas fuera del formato YYYY-MM-DD`, fechasMalas);
  } else avi('P2', 'Sin hoja P2 (Programa): el proyecto quedará sin planificación.');

  // ── P4: las partidas de Bases M&P habilitan el avance físico y el estado de pago.
  const partidasP4 = new Set();
  if (P4) {
    const tiposMalos = [], pesosMalos = [];
    for (const r of P4) {
      const p = String(r.Partida || '').trim();
      if (p) partidasP4.add(p);
      const tipo = String(r.Tipo || '').trim().toLowerCase();
      if (tipo && !['fisico', 'físico', 'financiero'].includes(tipo)) tiposMalos.push(`${p}: "${r.Tipo}"`);
      if (r.Peso !== '' && isNaN(Number(String(r.Peso).replace(',', '.')))) pesosMalos.push(`${p}: "${r.Peso}"`);
    }
    if (tiposMalos.length) err('P4', `${tiposMalos.length} filas con Tipo distinto de "fisico"/"financiero"`, tiposMalos);
    if (pesosMalos.length) err('P4', `${pesosMalos.length} pesos no numéricos`, pesosMalos);
  } else avi('P4', 'Sin hoja P4 (Bases M&P): no se podrá reportar avance físico ni estado de pago.');

  // ── P3: cruces del itemizado hacia programa (Cod_programa) y hacia M&P (Partida_MyP).
  if (P3) {
    const sinItem = [], progHuerfano = [], mypHuerfano = [], sinMyp = [];
    for (const r of P3) {
      if (!String(r.Item || '').trim()) sinItem.push(JSON.stringify(r).slice(0, 60));
      const cod = String(r.Cod_programa || '').trim();
      if (cod && codsP2.size && !codsP2.has(cod)) progHuerfano.push(cod);
      const myp = String(r.Partida_MyP || '').trim();
      if (!myp) sinMyp.push(String(r.Item || ''));
      else if (partidasP4.size && !partidasP4.has(myp)) mypHuerfano.push(myp);
    }
    if (sinItem.length) err('P3', `${sinItem.length} filas sin Item`, sinItem);
    if (progHuerfano.length) err('P3', `${progHuerfano.length} valores de Cod_programa que no existen en P2`, [...new Set(progHuerfano)]);
    if (mypHuerfano.length) err('P3', `${mypHuerfano.length} valores de Partida_MyP que no existen en P4`, [...new Set(mypHuerfano)]);
    if (sinMyp.length) avi('P3', `${sinMyp.length} ítems sin Partida_MyP: no podrán reportar avance físico`, sinMyp);
  } else avi('P3', 'Sin hoja P3 (Itemizado): el proyecto no será cobrable.');

  // ── P6b: los vínculos documento↔CWP necesitan que el documento exista en P6.
  if (P6b) {
    const docsP6 = new Set((P6 ?? []).map(d => String(d.N_documento || '').trim()));
    const huerfanos = [];
    for (const r of P6b) {
      const d = String(r.N_documento || '').trim();
      if (docsP6.size && d && !docsP6.has(d)) huerfanos.push(d);
    }
    if (huerfanos.length) avi('P6b', `${huerfanos.length} documentos vinculados que no están en P6`, [...new Set(huerfanos)]);
  }

  // ── P5: el moniker es la llave del elemento en el modelo.
  if (P5) {
    const sinMoniker = P5.filter(r => !String(r.SP3D_MONIKER || '').trim()).length;
    if (sinMoniker) avi('P5', `${sinMoniker} elementos sin SP3D_MONIKER`);
  }

  // ── Filas que el loader descartaría por no traer su campo obligatorio. Sin este aviso
  // la pérdida es invisible: el pack dice 26 personas y en la plataforma aparecen 11.
  for (const [rows, nombre, campo, etiqueta] of [
    [hoja('P8'), 'P8', 'Nombre', 'personas'],
    [hoja('P9'), 'P9', 'Descripcion', 'suministros'],
  ]) {
    if (!rows?.length) continue;
    const descartadas = rows.filter(r => !String(r[campo] || '').trim()).length;
    if (descartadas) avi(nombre, `${descartadas} de ${rows.length} ${etiqueta} no se cargarán: les falta "${campo}"`);
  }

  const cuenta = (h) => h ? h.length : 0;
  return {
    errores, avisos,
    resumen: {
      P1_cwp: cuenta(P1), P2_programa: cuenta(P2), P3_itemizado: cuenta(P3), P4_basesMyP: cuenta(P4),
      P4b_commodity: cuenta(P4b), P5_elementos: cuenta(P5), P6_docs: cuenta(P6), P6b_vinculos: cuenta(P6b),
      P7_trisemanal: cuenta(P7), P8_personal: cuenta(hoja('P8')), P9_suministros: cuenta(hoja('P9')), P10_ruta: cuenta(P10),
      hojas: wb.SheetNames.join(', '),
    },
  };
}

export function imprimirInforme({ errores, avisos, resumen }) {
  console.log('\nCONTENIDO DEL PACK');
  for (const [k, v] of Object.entries(resumen)) {
    if (k === 'hojas') continue;
    console.log(`   ${k.padEnd(18)} ${String(v).padStart(7)}`);
  }
  console.log(`   hojas encontradas: ${resumen.hojas}`);

  const bloque = (titulo, items, icono) => {
    if (!items.length) return;
    console.log(`\n${icono} ${titulo} (${items.length})`);
    for (const e of items) {
      console.log(`   [${e.hoja}] ${e.msg}`);
      if (e.ejemplos?.length) console.log(`        ej: ${e.ejemplos.join(' · ')}`);
    }
  };
  bloque('ERRORES — hay que corregirlos antes de cargar', errores, 'X');
  bloque('AVISOS — se puede cargar, pero conviene revisarlos', avisos, '!');

  if (!errores.length && !avisos.length) console.log('\nOK: el pack pasa todas las validaciones.');
  else if (!errores.length) console.log('\nOK: sin errores bloqueantes. Se puede cargar.');
  else console.log('\nNO CARGAR: corrige los errores primero (o usa --forzar bajo tu responsabilidad).');
  return errores.length;
}

// Ejecución directa desde la línea de comandos
if (process.argv[1] && process.argv[1].endsWith('validar-datapack.mjs')) {
  const file = process.argv[2];
  if (!file) { console.error('Uso: node scripts/validar-datapack.mjs <archivo.xlsx>'); process.exit(1); }
  console.log(`Validando: ${file}`);
  const r = validarDataPack(file);
  process.exit(imprimirInforme(r) ? 1 : 0);
}
