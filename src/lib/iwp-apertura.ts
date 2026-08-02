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

/** Una partida del CWP con lo que ya se llevaron los IWP abiertos. Es lo que se descuenta. */
export interface PartidaBanco {
  item: string;
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
  origen: 'mc' | 'itemizado';
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
  /** Partidas excluidas de la apertura (se dejan en el saldo del CWP a propósito). */
  itemsExcluidos?: string[];
}

// ─── Salidas ─────────────────────────────────────────────────────────────────

export interface PartidaAsignada {
  item: string;
  descripcion: string | null;
  unidad: string | null;
  cantidad: number;
  hh_unidad: number | null;
  hh: number;
  origen: 'mc' | 'itemizado';
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

/** Corta una lista de partidas en paquetes de ~hhObjetivo, sin dejar migas. */
function trocearPorHH(
  restos: Resto[],
  hhObjetivo: number,
  tolerancia: number,
  migaMinima: number,
): PartidaAsignada[][] {
  const paquetes: PartidaAsignada[][] = [];
  let actual: PartidaAsignada[] = [];
  let hhActual = 0;
  const techo = hhObjetivo * (1 + tolerancia);

  const cerrar = () => {
    if (actual.length) paquetes.push(actual);
    actual = [];
    hhActual = 0;
  };

  for (const r of restos) {
    while (r.hh > 0.0001) {
      const espacio = hhObjetivo - hhActual;

      // El paquete ya está lleno: cerrarlo antes de tocar esta partida.
      if (espacio <= 0) { cerrar(); continue; }

      if (r.hh <= techo - hhActual) {
        // Cabe entera (aunque se pase un poco del objetivo, dentro de la tolerancia).
        actual.push({
          item: r.p.item, descripcion: r.p.descripcion, unidad: r.p.unidad,
          cantidad: round(r.cantidad, 3), hh_unidad: r.p.hh_unidad,
          hh: Math.round(r.hh), origen: r.p.origen,
        });
        hhActual += r.hh;
        r.hh = 0; r.cantidad = 0;
        if (hhActual >= hhObjetivo) cerrar();
        continue;
      }

      // Hay que partirla. Se reparte por cantidad, que es lo que se mide en terreno.
      const fraccion = espacio / r.hh;
      const colaFraccion = 1 - fraccion;

      // Si la cola que quedaría es una miga, no vale la pena: entra entera y nos pasamos.
      if (colaFraccion < migaMinima) {
        actual.push({
          item: r.p.item, descripcion: r.p.descripcion, unidad: r.p.unidad,
          cantidad: round(r.cantidad, 3), hh_unidad: r.p.hh_unidad,
          hh: Math.round(r.hh), origen: r.p.origen,
        });
        r.hh = 0; r.cantidad = 0;
        cerrar();
        continue;
      }

      // Si lo que cabe es una miga, mejor abrir paquete nuevo y meterla completa allá.
      if (fraccion < migaMinima) { cerrar(); continue; }

      const cant = r.cantidad * fraccion;
      actual.push({
        item: r.p.item, descripcion: r.p.descripcion, unidad: r.p.unidad,
        cantidad: round(cant, 3), hh_unidad: r.p.hh_unidad,
        hh: Math.round(espacio), origen: r.p.origen,
      });
      r.cantidad -= cant;
      r.hh -= espacio;
      cerrar();
    }
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
  const excluidos = new Set(opts.itemsExcluidos ?? []);
  const alertas: Alerta[] = [];

  const hhObjetivo = opts.hhObjetivo > 0 ? opts.hhObjetivo : capacidadCiclo(cuadrilla, turno);
  if (hhObjetivo <= 0) {
    return {
      iwps: [], hh_total: 0, hh_sin_aperturar: 0,
      alertas: [{ severidad: 'bloqueo', mensaje: 'La cuadrilla y el turno dan capacidad cero: revisa personas, horas y días del ciclo.' }],
    };
  }

  const capacidad = capacidadCiclo(cuadrilla, turno);
  if (hhObjetivo > capacidad * 1.05) {
    alertas.push({
      severidad: 'aviso',
      mensaje: `El objetivo de ${Math.round(hhObjetivo)} HH excede lo que ${cuadrilla.codigo} cierra en un ciclo ${turno.codigo} (${capacidad} HH). Los IWP no alcanzarán a cerrarse dentro del turno.`,
    });
  }

  // Partidas planificables: con saldo y con rendimiento. Sin rendimiento no hay HH que repartir.
  const disponibles = banco.filter(p => !excluidos.has(p.item) && p.cantidad_saldo > 0);
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
  const iwps: IwpPropuesto[] = [];
  let seq = 0;
  for (const g of grupos) {
    const paquetes = trocearPorHH(g.restos, hhObjetivo, tolerancia, migaMinima);
    paquetes.forEach((partidas, i) => {
      const hh = partidas.reduce((s, p) => s + p.hh, 0);
      if (hh <= 0) return;
      seq += 1;
      const sufijo = paquetes.length > 1 ? ` (${i + 1}/${paquetes.length})` : '';
      const nombre = g.nombre ? `${g.nombre}${sufijo}` : `Paquete ${seq}`;
      const principal = [...partidas].sort((a, b) => b.hh - a.hh)[0];
      iwps.push({
        secuencia: seq,
        nombre,
        grupo: g.nombre,
        partidas,
        hh,
        dias: duracionDias(hh, cuadrilla, turno),
        limites_bateria: g.nombre
          ? `Alcance limitado a ${g.nombre}.`
          : `Desde ${principal?.descripcion ?? principal?.item ?? 'inicio del alcance'} — ${round(principal?.cantidad ?? 0, 1)} ${principal?.unidad ?? ''}`.trim(),
      });
    });
  }

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
