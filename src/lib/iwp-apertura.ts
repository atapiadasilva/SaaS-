// Motor de apertura de CWP en IWP — la rutina de Pull Planning del Workface Planning.
//
// La teoría (O3, "El WorkFace Planning: Rutinas de Gestión") pide diez pasos para quebrar
// un CWP. Los pasos 2, 3, 4 y 7 son aritmética y viven acá:
//
//   2. Levantar cantidades y rendimientos  →  el banco de cantidades del CWP
//   3. Definir las quiebras preliminares   →  `proponerIwps`
//   4. Estrategia y secuencia de ejecución →  `Estrategia` + la cascada de fechas
//   7. Evaluación del ritmo (TAKT)         →  `duracionDias` / `taktPromedio`
//
// El resto (refinar límites de batería, la evaluación gráfica, las restricciones) es
// juicio humano: el asistente los presenta, no los decide.
//
// La regla que gobierna todo: **un IWP lo cierra una sola cuadrilla dentro de un ciclo de
// turno**. Por eso el tamaño objetivo no es una constante de 1.000 HH — sale de multiplicar
// la cuadrilla por su turno. Un 14×14 a 11 h con 8 personas da 1.232 HH; un 7×7 a 12 h con
// 12 personas da 1.008. El rango de 800–1.200 HH emerge solo, no se impone.
//
// Este módulo es puro y sin dependencias: el cliente lo usa para el preview en vivo del
// asistente y el servidor lo vuelve a correr antes de escribir, para no confiar en el body.

// ─── Entradas ────────────────────────────────────────────────────────────────

/**
 * Una línea del CWP con lo que ya se llevaron los IWP abiertos. Es lo que se descuenta.
 *
 * No es "un item": es un item en una partida del programa, que en el itemizado equivale a
 * un frente físico concreto ("Hormigón — Fundación Anillo B"). Por eso la identidad es
 * `clave` y no `item`: el mismo item vive en varios frentes del mismo CWP.
 */
export interface PartidaBanco {
  /** `item|partida_bmp`. Identidad de la línea y llave del descuento. */
  clave: string;
  item: string;
  partida_bmp: string | null;
  descripcion: string | null;
  unidad: string | null;
  /** Familia de la partida (commodity de la base de M&P). Agrupa en la estrategia homónima. */
  commodity?: string | null;
  cantidad_total: number;
  cantidad_asignada: number;
  cantidad_saldo: number;
  /** Rendimiento HH por unidad. Sin él la partida no puede planificarse por HH. */
  hh_unidad: number | null;
  hh_total: number;
  hh_asignadas: number;
  hh_saldo: number;
  origen: 'itemizado';
}

export interface Turno {
  id: string;
  codigo: string;
  nombre?: string | null;
  dias_trabajo: number;
  dias_descanso: number;
  horas_dia: number;
}

export interface Cuadrilla {
  id: string;
  codigo: string;
  nombre?: string | null;
  disciplina_cod?: string | null;
  n_personas: number;
  factor_productividad: number;
  turno_id?: string | null;
}

/** Una zona física del CWP (nivel, sector, sistema) con su peso relativo en el alcance. */
export interface Zona {
  clave: string;
  nombre: string;
  /** Peso relativo — toneladas, cantidad de elementos, lo que el modelo pueda ofrecer. */
  peso: number;
}

export type Estrategia = 'hh' | 'commodity' | 'zona';

export interface OpcionesApertura {
  estrategia: Estrategia;
  /** HH que debe tener cada IWP. Por defecto, la capacidad de la cuadrilla en un ciclo. */
  hhObjetivo: number;
  /** Cuánto puede desviarse un IWP del objetivo antes de forzar el corte. 0.2 = ±20%. */
  tolerancia?: number;
  /**
   * Fracción mínima de una partida que vale la pena dejar en un IWP aparte. Si al cortar
   * queda menos que esto, la cola se arrastra al paquete actual en vez de generar una miga
   * que en terreno nadie va a ir a ejecutar.
   */
  migaMinima?: number;
  /** Solo para la estrategia 'zona'. Cada zona se vuelve al menos un IWP. */
  zonas?: Zona[];
  /**
   * Frentes que entran a esta apertura. Es opt-in a propósito: una sesión de Pull Planning
   * abre una tajada del CWP, no su alcance completo. Vacío significa que no se eligió nada.
   */
  clavesIncluidas?: string[];
}

// ─── Salidas ─────────────────────────────────────────────────────────────────

export interface PartidaAsignada {
  clave: string;
  item: string;
  partida_bmp: string | null;
  descripcion: string | null;
  unidad: string | null;
  cantidad: number;
  hh_unidad: number | null;
  hh: number;
  origen: 'itemizado';
}

export interface IwpPropuesto {
  secuencia: number;
  nombre: string;
  /** De dónde salió el corte: la zona, la familia de partidas o el troceo por HH. */
  grupo: string | null;
  partidas: PartidaAsignada[];
  hh: number;
  dias: number;
  /** Hasta dónde llega este paquete. Editable en el paso 5 del asistente. */
  limites_bateria: string;
}

export type SeveridadAlerta = 'info' | 'aviso' | 'bloqueo';

export interface Alerta {
  severidad: SeveridadAlerta;
  mensaje: string;
}

export interface Propuesta {
  iwps: IwpPropuesto[];
  alertas: Alerta[];
  hh_total: number;
  /** HH del saldo que quedaron fuera (partidas sin rendimiento o excluidas). */
  hh_sin_aperturar: number;
}

// ─── Capacidad: de HH a días y personas ──────────────────────────────────────

const round = (v: number, dec = 2) => {
  const f = 10 ** dec;
  return Math.round(v * f) / f;
};

/** HH que una persona entrega en un ciclo completo de turno. */
export function hhCicloPersona(turno: Turno): number {
  return turno.dias_trabajo * turno.horas_dia;
}

/**
 * HH que la cuadrilla cierra en un ciclo de turno. Este número ES el tamaño objetivo del
 * IWP: lo que la cuadrilla alcanza a terminar antes de bajar del turno.
 */
export function capacidadCiclo(cuadrilla: Cuadrilla, turno: Turno): number {
  return Math.round(
    cuadrilla.n_personas * hhCicloPersona(turno) * cuadrilla.factor_productividad,
  );
}

/** Días de turno que la cuadrilla necesita para las HH dadas. */
export function duracionDias(hh: number, cuadrilla: Cuadrilla, turno: Turno): number {
  const hhDia = cuadrilla.n_personas * turno.horas_dia * cuadrilla.factor_productividad;
  if (hhDia <= 0) return 0;
  return Math.max(1, Math.ceil(hh / hhDia));
}

/** El frente que más pesa en el paquete: es el que le da nombre. */
function nombreBase(partidas: PartidaAsignada[]): string {
  const principal = partidas.reduce((a, b) => (b.hh > a.hh ? b : a), partidas[0]);
  const desc = principal?.descripcion?.trim();
  if (desc) return partidas.length > 1 ? `${desc} y otros ${partidas.length - 1}` : desc;
  return principal?.item ?? 'Paquete sin descripción';
}

/**
 * Los límites de batería del paso 5: qué entra en este paquete y cuánto. Se escribe con
 * cantidades porque es lo que terreno mide para decir que lo cerró.
 */
function describirAlcance(partidas: PartidaAsignada[]): string {
  const linea = (p: PartidaAsignada) =>
    `${p.descripcion?.trim() || p.item}: ${round(p.cantidad, 1).toLocaleString('es-CL')} ${p.unidad ?? ''}`.trim();
  const visibles = partidas.slice(0, 3).map(linea);
  const resto = partidas.length - visibles.length;
  return visibles.join(' · ') + (resto > 0 ? ` · y ${resto} frente(s) más` : '');
}

/** El ritmo: días de turno por IWP. Es el TAKT del paso 7. */
export function taktPromedio(iwps: IwpPropuesto[]): number {
  if (!iwps.length) return 0;
  return round(iwps.reduce((s, i) => s + i.dias, 0) / iwps.length, 1);
}

// ─── Cascada de fechas ───────────────────────────────────────────────────────

/**
 * Fechas de cada IWP encadenadas a partir del inicio, saltando los días de descanso del
 * turno. Si `solapamiento` es 0 los paquetes van uno detrás de otro; con 1 cuadrilla eso es
 * lo correcto. Con más cuadrillas en paralelo el asistente sube el solapamiento.
 */
export function encadenarFechas(
  iwps: IwpPropuesto[],
  fechaInicio: string,
  turno: Turno,
  cuadrillasParalelo = 1,
): { fecha_inicio_plan: string; fecha_fin_plan: string }[] {
  const base = new Date(fechaInicio + 'T00:00:00');
  const salida: { fecha_inicio_plan: string; fecha_fin_plan: string }[] = [];
  // Cada cuadrilla en paralelo lleva su propio reloj; el IWP i lo toma la cuadrilla i % n.
  const relojes = Array.from({ length: Math.max(1, cuadrillasParalelo) }, () => new Date(base));

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const avanzar = (d: Date, diasTurno: number) => {
    // El descanso del ciclo se intercala: tras `dias_trabajo` días vienen `dias_descanso`.
    const ciclos = turno.dias_trabajo > 0 ? Math.floor((diasTurno - 1) / turno.dias_trabajo) : 0;
    const calendario = diasTurno + ciclos * turno.dias_descanso;
    const fin = new Date(d);
    fin.setDate(fin.getDate() + calendario - 1);
    return fin;
  };

  iwps.forEach((iwp, i) => {
    const r = i % relojes.length;
    const ini = new Date(relojes[r]);
    const fin = avanzar(ini, iwp.dias);
    salida.push({ fecha_inicio_plan: iso(ini), fecha_fin_plan: iso(fin) });
    const siguiente = new Date(fin);
    siguiente.setDate(siguiente.getDate() + 1);
    relojes[r] = siguiente;
  });

  return salida;
}

// ─── El quiebre ──────────────────────────────────────────────────────────────

interface Resto {
  p: PartidaBanco;
  cantidad: number; // saldo pendiente de repartir
  hh: number;
}

const EPS = 1e-6;

/**
 * Corta una lista de partidas en paquetes ejecutables.
 *
 * No trocea de a `objetivo` hasta que se acabe el saldo, porque eso deja siempre una cola:
 * 6.862 HH con objetivo 1.232 daría cinco paquetes llenos y uno de 702. En vez de eso
 * calcula cuántos paquetes hacen falta —`ceil(total / objetivo)`— y reparte el total en
 * partes iguales. Salen seis paquetes de 1.144 HH: mismo alcance, sin colas, y con un TAKT
 * constante, que es de lo que se trata el paso 7 de la rutina.
 *
 * `techo` es lo máximo que un paquete puede pesar cuando una partida entra entera para no
 * fragmentarla en un sobrante ridículo. Va acotado por la capacidad del ciclo: prefiero un
 * corte más feo antes que un IWP que la cuadrilla no alcanza a cerrar antes de bajar del turno.
 */
function trocearPorHH(
  restos: Resto[],
  objetivo: number,
  techo: number,
  migaMinima: number,
): PartidaAsignada[][] {
  const total = restos.reduce((s, r) => s + r.hh, 0);
  if (total <= EPS) return [];

  const nPaquetes = Math.max(1, Math.ceil(total / objetivo - EPS));
  const meta = total / nPaquetes;

  const paquetes: PartidaAsignada[][] = [];
  let actual: PartidaAsignada[] = [];
  let hhActual = 0;

  const cerrar = () => {
    if (actual.length) paquetes.push(actual);
    actual = [];
    hhActual = 0;
  };
  const agregar = (r: Resto, cantidad: number, hh: number) => {
    actual.push({
      clave: r.p.clave, item: r.p.item, partida_bmp: r.p.partida_bmp,
      descripcion: r.p.descripcion, unidad: r.p.unidad,
      cantidad: round(cantidad, 3), hh_unidad: r.p.hh_unidad,
      hh: Math.round(hh), origen: r.p.origen,
    });
    hhActual += hh;
  };

  for (const r of restos) {
    while (r.hh > EPS) {
      const cupo = meta - hhActual;
      if (cupo <= EPS) { cerrar(); continue; }

      // Cabe entera en lo que falta del paquete.
      if (r.hh <= cupo + EPS) {
        agregar(r, r.cantidad, r.hh);
        r.hh = 0; r.cantidad = 0;
        continue;
      }

      // Partirla dejaría un sobrante insignificante: entra entera, siempre que no rompa el techo.
      if (r.hh - cupo < r.hh * migaMinima && hhActual + r.hh <= techo + EPS) {
        agregar(r, r.cantidad, r.hh);
        r.hh = 0; r.cantidad = 0;
        cerrar();
        continue;
      }

      // Se reparte por cantidad, que es lo que terreno mide.
      const cant = r.cantidad * (cupo / r.hh);
      agregar(r, cant, cupo);
      r.cantidad -= cant;
      r.hh -= cupo;
      cerrar();
    }
    if (hhActual >= meta - EPS) cerrar();
  }

  cerrar();
  return paquetes;
}

/**
 * Propone el quiebre de un CWP en IWPs.
 *
 * Trabaja siempre sobre el **saldo**, nunca sobre el total: si el CWP ya tiene IWPs abiertos,
 * la apertura siguiente sólo puede repartir lo que queda. Ese es el descuento.
 */
export function proponerIwps(
  banco: PartidaBanco[],
  cuadrilla: Cuadrilla,
  turno: Turno,
  opts: OpcionesApertura,
): Propuesta {
  const tolerancia = opts.tolerancia ?? 0.2;
  const migaMinima = opts.migaMinima ?? 0.1;
  const incluidos = new Set(opts.clavesIncluidas ?? []);
  const alertas: Alerta[] = [];

  const hhObjetivo = opts.hhObjetivo > 0 ? opts.hhObjetivo : capacidadCiclo(cuadrilla, turno);
  if (hhObjetivo <= 0) {
    return {
      iwps: [], hh_total: 0, hh_sin_aperturar: 0,
      alertas: [{ severidad: 'bloqueo', mensaje: 'La cuadrilla y el turno dan capacidad cero: revisa personas, horas y días del ciclo.' }],
    };
  }

  const capacidad = capacidadCiclo(cuadrilla, turno);

  // El margen para no fragmentar una partida nunca puede empujar el paquete más allá de lo
  // que la cuadrilla cierra en su ciclo — esa es la regla, no una preferencia estética.
  const techo = Math.max(hhObjetivo, Math.min(hhObjetivo * (1 + tolerancia), capacidad || Infinity));

  if (hhObjetivo > capacidad * 1.05) {
    alertas.push({
      severidad: 'aviso',
      mensaje: `El objetivo de ${Math.round(hhObjetivo)} HH excede lo que ${cuadrilla.codigo} cierra en un ciclo ${turno.codigo} (${capacidad} HH). Los IWP no alcanzarán a cerrarse dentro del turno.`,
    });
  }

  // Partidas planificables: con saldo y con rendimiento. Sin rendimiento no hay HH que repartir.
  if (!incluidos.size) {
    return {
      iwps: [], hh_total: 0, hh_sin_aperturar: 0,
      alertas: [{ severidad: 'bloqueo', mensaje: 'No hay frentes elegidos. Marca en el banco los que entran a esta sesión de apertura.' }],
    };
  }

  const disponibles = banco.filter(p => incluidos.has(p.clave) && p.cantidad_saldo > 0);
  const sinRendimiento = disponibles.filter(p => !p.hh_unidad || p.hh_saldo <= 0);
  const planificables = disponibles.filter(p => p.hh_unidad && p.hh_saldo > 0);

  if (sinRendimiento.length) {
    alertas.push({
      severidad: 'aviso',
      mensaje: `${sinRendimiento.length} partida(s) con saldo pero sin rendimiento HH/unidad quedan fuera del quiebre automático. Cárgales el rendimiento o asígnalas a mano.`,
    });
  }
  if (!planificables.length) {
    alertas.push({ severidad: 'bloqueo', mensaje: 'No hay saldo planificable en este CWP: o ya está todo abierto en IWPs, o falta cargar cantidades y rendimientos.' });
    return { iwps: [], alertas, hh_total: 0, hh_sin_aperturar: sinRendimiento.reduce((s, p) => s + p.hh_saldo, 0) };
  }

  // ── Agrupación según la estrategia ──
  type Grupo = { nombre: string | null; restos: Resto[] };
  let grupos: Grupo[];

  if (opts.estrategia === 'commodity') {
    const porFamilia = new Map<string, Resto[]>();
    for (const p of planificables) {
      const k = p.commodity?.trim() || 'Sin familia';
      const arr = porFamilia.get(k) ?? [];
      arr.push({ p, cantidad: p.cantidad_saldo, hh: p.hh_saldo });
      porFamilia.set(k, arr);
    }
    grupos = [...porFamilia.entries()].map(([nombre, restos]) => ({ nombre, restos }));
  } else if (opts.estrategia === 'zona') {
    const zonas = (opts.zonas ?? []).filter(z => z.peso > 0);
    if (!zonas.length) {
      alertas.push({ severidad: 'bloqueo', mensaje: 'La estrategia por zona necesita zonas con peso. El modelo 3D de este CWP no entregó sectores ni niveles utilizables.' });
      return { iwps: [], alertas, hh_total: 0, hh_sin_aperturar: 0 };
    }
    const pesoTotal = zonas.reduce((s, z) => s + z.peso, 0);
    // Cada partida se reparte entre las zonas en proporción a su peso físico —
    // es el caso de la lámina 25 de O3: 35 t de estructura repartidas por nivel.
    grupos = zonas.map(z => ({
      nombre: z.nombre,
      restos: planificables.map(p => ({
        p,
        cantidad: (p.cantidad_saldo * z.peso) / pesoTotal,
        hh: (p.hh_saldo * z.peso) / pesoTotal,
      })).filter(r => r.hh > 0.0001),
    }));
  } else {
    grupos = [{ nombre: null, restos: planificables.map(p => ({ p, cantidad: p.cantidad_saldo, hh: p.hh_saldo })) }];
  }

  // ── Troceo por HH dentro de cada grupo ──
  const crudos: { grupo: string | null; partidas: PartidaAsignada[]; hh: number }[] = [];
  for (const g of grupos) {
    for (const partidas of trocearPorHH(g.restos, hhObjetivo, techo, migaMinima)) {
      const hh = partidas.reduce((s, p) => s + p.hh, 0);
      if (hh > 0) crudos.push({ grupo: g.nombre, partidas, hh });
    }
  }

  // El nombre sale del frente que más pesa dentro del paquete, no del grupo: "Enfierradura
  // Fundación Anillo C" le dice algo a un capataz; "Armaduras (7/22)" no le dice nada.
  const vecesPorNombre = new Map<string, number>();
  for (const c of crudos) {
    const base = nombreBase(c.partidas);
    vecesPorNombre.set(base, (vecesPorNombre.get(base) ?? 0) + 1);
  }
  const vistos = new Map<string, number>();

  const iwps: IwpPropuesto[] = crudos.map((c, i) => {
    const base = nombreBase(c.partidas);
    const total = vecesPorNombre.get(base) ?? 1;
    const idx = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, idx);
    return {
      secuencia: i + 1,
      nombre: total > 1 ? `${base} — tramo ${idx} de ${total}` : base,
      grupo: c.grupo,
      partidas: c.partidas,
      hh: c.hh,
      dias: duracionDias(c.hh, cuadrilla, turno),
      limites_bateria: describirAlcance(c.partidas),
    };
  });

  const hhTotal = iwps.reduce((s, i) => s + i.hh, 0);

  // ── Chequeos de sensatez sobre la propuesta ──
  const fueraDeTurno = iwps.filter(i => i.dias > turno.dias_trabajo);
  if (fueraDeTurno.length) {
    alertas.push({
      severidad: 'aviso',
      mensaje: `${fueraDeTurno.length} de ${iwps.length} IWP no cierran dentro del ciclo ${turno.codigo} (${turno.dias_trabajo} días). Baja el objetivo de HH o agranda la cuadrilla.`,
    });
  }
  const flacos = iwps.filter(i => i.hh < hhObjetivo * (1 - tolerancia));
  if (flacos.length) {
    alertas.push({
      severidad: 'info',
      mensaje: `${flacos.length} IWP quedan bajo el objetivo (colas de partidas). Son válidos, pero revisa si conviene fusionarlos con el anterior.`,
    });
  }
  if (iwps.length > 40) {
    alertas.push({ severidad: 'aviso', mensaje: `${iwps.length} IWP es mucho para una sola sesión de Pull Planning. Considera aperturar el CWP por etapas.` });
  }

  return {
    iwps,
    alertas,
    hh_total: Math.round(hhTotal),
    hh_sin_aperturar: Math.round(sinRendimiento.reduce((s, p) => s + p.hh_saldo, 0)),
  };
}

// ─── Refinar a mano: dividir y fusionar ──────────────────────────────────────
//
// El motor propone; el planificador dispone. Estas dos son las operaciones que más se usan
// al revisar el quiebre paquete por paquete, y por eso viven acá: repartir cantidades sin
// perder ni inventar es aritmética delicada y hay que poder probarla.

/** Un paquete al que se le pueden repartir las cantidades. */
export interface PaqueteEditable {
  nombre: string;
  grupo: string | null;
  partidas: PartidaAsignada[];
  limites_bateria?: string;
}

/**
 * Divide un paquete en `partes` iguales por carga de trabajo.
 *
 * Cada partida se reparte proporcionalmente, así que las `partes` quedan con el mismo mix
 * de frentes. Es lo correcto cuando lo que sobra es tamaño, no alcance: dividir "3.000 kg
 * de enfierradura" en dos da dos veces 1.500 kg del mismo frente.
 */
export function dividirPaquete(paquete: PaqueteEditable, partes: number): PaqueteEditable[] {
  const n = Math.max(2, Math.floor(partes));
  const salida: PaqueteEditable[] = [];

  for (let i = 0; i < n; i++) {
    const partidas = paquete.partidas.map(p => {
      // La última parte se lleva el remanente exacto: así la suma cuadra al milímetro
      // aunque la división no sea entera.
      const cantidad = i === n - 1
        ? round(p.cantidad - round(p.cantidad / n, 3) * (n - 1), 3)
        : round(p.cantidad / n, 3);
      const hh = i === n - 1
        ? p.hh - Math.round(p.hh / n) * (n - 1)
        : Math.round(p.hh / n);
      return { ...p, cantidad, hh };
    }).filter(p => p.cantidad > 0 || p.hh > 0);

    salida.push({
      nombre: `${paquete.nombre} · parte ${i + 1} de ${n}`,
      grupo: paquete.grupo,
      partidas,
      limites_bateria: describirAlcance(partidas),
    });
  }

  return salida;
}

/**
 * Fusiona varios paquetes en uno. Las líneas que comparten `clave` se suman, porque son el
 * mismo frente partido por el troceo: dejarlas separadas mostraría el mismo item dos veces
 * en la ficha que se lleva el capataz.
 */
export function fusionarPaquetes(paquetes: PaqueteEditable[]): PaqueteEditable {
  const porClave = new Map<string, PartidaAsignada>();
  for (const p of paquetes) {
    for (const partida of p.partidas) {
      const cur = porClave.get(partida.clave);
      if (cur) {
        cur.cantidad = round(cur.cantidad + partida.cantidad, 3);
        cur.hh += partida.hh;
      } else {
        porClave.set(partida.clave, { ...partida });
      }
    }
  }
  const partidas = [...porClave.values()].sort((a, b) => b.hh - a.hh);
  const grupos = [...new Set(paquetes.map(p => p.grupo).filter(Boolean))];

  return {
    nombre: nombreBase(partidas),
    grupo: grupos.length === 1 ? grupos[0] : null,
    partidas,
    limites_bateria: describirAlcance(partidas),
  };
}
