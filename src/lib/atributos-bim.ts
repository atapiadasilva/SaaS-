// Catálogo de atributos del modelo BIM según la Guía de consulta práctica BIM–AWP (Anexo 7).
//
// Fuente: «Guía consulta práctica REQUERIMIENTOS BIM AWP para proyectos de montaje industrial y de
// infraestructura minera», V01 · julio 2026 — Codelco VP + Hoja de Ruta BIM CChC, cap. 5.6.
// Es el consenso de la Mesa Minera 2025 y es contra esta tabla que un mandante evalúa el modelo.
//
// POR QUÉ VIVE ACÁ Y NO EN UN EXCEL: la guía dice *qué* atributo se exige y *en qué etapa*, pero no
// dice dónde lo guarda cada plataforma. Ese mapeo —atributo del Anexo 7 → columna de
// `mining_elementos`— es lo que permite contestar «¿cumple mi modelo?» con los datos que ya están
// cargados, en vez de con una planilla que alguien llena a mano. Mismo patrón que `constraints.ts`:
// catálogo cerrado, con dueño y con significado, en un solo archivo.
//
// LETRA CHICA DE LA LECTURA DEL PDF: la tabla del capítulo 5.6 marca las etapas con una `x` por
// columna (FEL2 · FEL3 · Ingeniería de detalle · Construcción). Al extraer el texto se pierde la
// alineación de las columnas, así que las filas con cuatro `x` y las de dos `x` son inequívocas,
// pero las de tres se interpretaron por criterio de madurez de ingeniería (un atributo que depende
// de información vendor o de compra no puede exigirse en FEL2). Están marcadas con `nota`.

export const ETAPAS = ['FEL2', 'FEL3', 'DETALLE', 'CONSTRUCCION'] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_META: Record<Etapa, { label: string; corto: string; descripcion: string }> = {
  FEL2: {
    label: 'FEL 2 · Ingeniería conceptual', corto: 'FEL 2',
    descripcion: 'Se comparan alternativas conceptuales. Clase 4 de estimación (−20%/+40%).',
  },
  FEL3: {
    label: 'FEL 3 · Ingeniería básica', corto: 'FEL 3',
    descripcion: 'Se consolida la definición del proyecto para la decisión de inversión. Clase 2 (−10%/+10%).',
  },
  DETALLE: {
    label: 'Ingeniería de detalle', corto: 'Detalle',
    descripcion: 'El modelo habilita fabricación, compras y la paquetización completa CWA/CWP/EWP/PWP/SWP.',
  },
  CONSTRUCCION: {
    label: 'Construcción', corto: 'Construcción',
    descripcion: 'El modelo sostiene la ejecución por IWP, el control de obra y la entrega a puesta en marcha.',
  },
};

export type TipoDato = 'Código' | 'Texto' | 'Número' | 'Fecha' | 'Link';

export interface AtributoAnexo7 {
  /** Nombre del atributo tal como lo escribe el Anexo 7. Es la llave que usa el mandante. */
  clave: string;
  descripcion: string;
  tipo: TipoDato;
  /** Etapas en que la guía lo exige. */
  etapas: Etapa[];
  /** Columna de `mining_elementos` que ya lo guarda hoy. Sin esto, el atributo no es medible. */
  columna?: string;
  /**
   * Los códigos `SIN-CWA`, `SIN-CWP.POR_ASIGNAR`, `{padre}.SIN-CV` son placeholders de la UI para
   * "por asignar", no dato. Contarlos como atributo presente inflaría la cobertura justo donde más
   * duele: `mining_elementos` tiene decenas de miles de filas apuntando a CWP que no existen.
   */
  excluirSin?: boolean;
  /** Columna que crea `scripts/sql/08-anexo7-atributos.sql`. Sin esto: no se captura y no se propone. */
  propuesta?: string;
  /** Letra chica del mapeo o de la lectura de la tabla original. */
  nota?: string;
}

export interface GrupoAnexo7 {
  clave: string;
  label: string;
  /**
   * Los grupos por disciplina sólo aplican al subconjunto de elementos de esa especialidad: medir
   * "% de elementos con Diámetro Nominal" sobre las 57.519 filas del modelo completo no significa
   * nada. La pantalla los mide sobre la disciplina filtrada y lo dice.
   */
  disciplinar: boolean;
  atributos: AtributoAnexo7[];
}

const TODAS: Etapa[] = ['FEL2', 'FEL3', 'DETALLE', 'CONSTRUCCION'];
const DESDE_FEL3: Etapa[] = ['FEL3', 'DETALLE', 'CONSTRUCCION'];
const DESDE_DETALLE: Etapa[] = ['DETALLE', 'CONSTRUCCION'];
const SOLO_CONSTRUCCION: Etapa[] = ['CONSTRUCCION'];

export const GRUPOS_ANEXO7: GrupoAnexo7[] = [
  {
    clave: 'general', label: 'General', disciplinar: false,
    atributos: [
      { clave: 'TAG', descripcion: 'Identificador único del elemento, equipo o línea según estructura preestablecida.', tipo: 'Código', etapas: TODAS, columna: 'tag_equipo' },
      { clave: 'GUID', descripcion: 'Identificador global único del objeto o elemento.', tipo: 'Código', etapas: TODAS, columna: 'guid_modelo' },
      { clave: 'WBS', descripcion: 'Código de la Estructura de Quiebre de Trabajo (Facility).', tipo: 'Código', etapas: TODAS, columna: 'wbs' },
      { clave: 'Descripcion_General', descripcion: 'Descripción general del elemento.', tipo: 'Texto', etapas: TODAS, columna: 'descripcion' },
      { clave: 'Descripcion_Complementaria', descripcion: 'Descripción complementaria o especial del elemento.', tipo: 'Texto', etapas: TODAS, nota: 'Sin columna propia: hoy se mezcla con la descripción general.' },
      { clave: 'Commodity_Capitalizacion', descripcion: 'Estructura que da cuenta de los componentes o unidad de obra a ejecutar.', tipo: 'Texto', etapas: TODAS, nota: 'Existe en `mining_itemizado.commodity`, a nivel de partida y no de elemento.' },
      { clave: 'Material', descripcion: 'Descripción del material.', tipo: 'Texto', etapas: TODAS, columna: 'material' },
      { clave: 'Peso', descripcion: 'Peso del elemento.', tipo: 'Número', etapas: TODAS, columna: 'peso_kg' },
      { clave: 'Estado_Avance', descripcion: 'Estado de avance de la modelación según el hito alcanzado (E1 a E4).', tipo: 'Texto', etapas: TODAS, columna: 'estado_avance_bim' },
      { clave: 'Estado_Aprobacion', descripcion: 'Estado de aprobación del elemento según las etapas del PEB (E1, E2, E3).', tipo: 'Código', etapas: TODAS, columna: 'estado_aprobacion' },
      { clave: 'Condicion_Equipo', descripcion: 'Nuevo (proyectado), Reubicado (existente que cambia de ubicación) o Repotenciado.', tipo: 'Texto', etapas: TODAS, columna: 'condicion_equipo' },
      { clave: 'Especificacion_Tecnica', descripcion: 'Número de documento de la Especificación Técnica.', tipo: 'Código', etapas: TODAS, columna: 'especificacion' },
      { clave: 'Memoria_Calculo', descripcion: 'Número de documento de la memoria de cálculo.', tipo: 'Número', etapas: DESDE_FEL3, columna: 'memoria_calculo', nota: 'Tres etapas en el original; se leyó desde FEL 3 porque depende del desarrollo de ingeniería.' },
      { clave: 'Requisicion', descripcion: 'Código del documento de requisición de compra o cotización.', tipo: 'Código', etapas: DESDE_FEL3, columna: 'requisicion', nota: 'Tres etapas en el original; se leyó desde FEL 3 porque nace del proceso de compra.' },
      { clave: 'P&ID', descripcion: 'Código del P&ID; en estudios previos, del diagrama de flujo.', tipo: 'Código', etapas: TODAS, columna: 'pid' },
      { clave: 'Aporte_Suministro', descripcion: 'Si el elemento lo aporta el contratista o el mandante, coherente con el PEP.', tipo: 'Texto', etapas: TODAS, columna: 'aporte_suministro', nota: 'Define de quién es la restricción de material: si el suministro es del mandante, el dueño del despeje no es el contratista.' },
      { clave: 'BMP', descripcion: 'Código asociado a las Bases de Medición y Pago, desde el anexo de las Bases Técnicas.', tipo: 'Código', etapas: DESDE_DETALLE, columna: 'codigo_bmp' },
      { clave: 'Equipo_Vendor', descripcion: 'Estatus de la información vendor certificada (Diseño / Certificada / N/A).', tipo: 'Texto', etapas: DESDE_DETALLE, columna: 'equipo_vendor' },
      { clave: 'Sitio', descripcion: 'Condición especial del sitio: sector protegido, avalancha, rodados u otro.', tipo: 'Texto', etapas: TODAS, columna: 'sitio' },
    ],
  },
  {
    clave: 'adquisiciones', label: 'Adquisiciones', disciplinar: false,
    atributos: [
      { clave: 'Numero_DEN', descripcion: 'Código del proceso de compra del Plan de Adquisiciones, cuando el suministro es del mandante.', tipo: 'Código', etapas: DESDE_DETALLE, columna: 'numero_den' },
      { clave: 'Orden_compra', descripcion: 'Código de la orden de compra del proceso.', tipo: 'Código', etapas: DESDE_DETALLE, columna: 'orden_compra' },
      { clave: 'ETA', descripcion: 'Fecha estimada de llegada del suministro según el proceso de compra.', tipo: 'Fecha', etapas: DESDE_DETALLE, columna: 'eta' },
      { clave: 'Vendor', descripcion: 'Nombre del proveedor adjudicado.', tipo: 'Texto', etapas: DESDE_DETALLE, columna: 'vendor' },
    ],
  },
  {
    clave: 'awp', label: 'AWP', disciplinar: false,
    atributos: [
      { clave: 'CWA', descripcion: 'Área de construcción a la que pertenece el elemento.', tipo: 'Código', etapas: TODAS, columna: 'cwa_id', excluirSin: true },
      { clave: 'CWP', descripcion: 'Paquete de trabajo de construcción al que pertenece.', tipo: 'Código', etapas: TODAS, columna: 'cwp_id', excluirSin: true },
      { clave: 'EWP', descripcion: 'Paquete de trabajo de ingeniería al que pertenece el elemento.', tipo: 'Código', etapas: DESDE_FEL3, columna: 'ewp_id', excluirSin: true },
      { clave: 'PWP', descripcion: 'Paquete de compras del elemento.', tipo: 'Código', etapas: DESDE_FEL3, columna: 'pwp_elemento', excluirSin: true },
      { clave: 'SWP', descripcion: 'Paquete de puesta en marcha (quiebre por sistema operable).', tipo: 'Código', etapas: TODAS, columna: 'swp_id', excluirSin: true },
      { clave: 'MWP', descripcion: 'Paquete de modularización: partes de un módulo por disciplina (spools prearmados, prefabricados de hormigón).', tipo: 'Código', etapas: DESDE_FEL3, columna: 'mwp_id', nota: 'Hilo ya guarda `spool` e `isometrico` en piping: es la materia prima del MWP, falta el paquete.' },
      { clave: 'Contrato_Construccion', descripcion: 'Contrato que ejecutará las obras a las que pertenece el elemento.', tipo: 'Código', etapas: TODAS, columna: 'contrato_construccion' },
      { clave: 'Actividad', descripcion: 'Código ID de la actividad vinculada desde el programa de construcción.', tipo: 'Código', etapas: DESDE_FEL3, columna: 'actividad_id', nota: 'No se puede deducir del 4D de SP3D: dentro de un CWP todos los elementos comparten el mismo conjunto de actividades (ver scripts/sql/04-elemento-actividad.sql). Tiene que venir declarado por el modelador.' },
      { clave: 'RAS', descripcion: 'Fecha requerida en sitio del suministro, desde el programa de montaje y con sus holguras.', tipo: 'Fecha', etapas: DESDE_FEL3, columna: 'ras' },
      { clave: 'Sector_obra', descripcion: 'Sector o área de trabajo.', tipo: 'Código', etapas: DESDE_FEL3, columna: 'sector' },
    ],
  },
  {
    clave: 'civil', label: 'Civil', disciplinar: true,
    atributos: [
      { clave: 'Volumen_Corte', descripcion: 'Volumen de material removido (m³).', tipo: 'Número', etapas: TODAS },
      { clave: 'Volumen_Relleno', descripcion: 'Volumen de material rellenado (m³).', tipo: 'Número', etapas: TODAS },
      { clave: 'Material', descripcion: 'Tipo de material del corte, relleno o recubrimiento (común, roca, rippable, mampostería).', tipo: 'Texto', etapas: TODAS, columna: 'material' },
    ],
  },
  {
    clave: 'mecanicos', label: 'Equipos mecánicos', disciplinar: true,
    atributos: [
      { clave: 'Dimensiones', descripcion: 'Dimensiones generales alto × ancho × largo (mm).', tipo: 'Número', etapas: TODAS, nota: 'Hilo guarda `longitud_m`, no la terna completa.' },
      { clave: 'Peso', descripcion: 'Peso total del elemento.', tipo: 'Número', etapas: TODAS, columna: 'peso_kg' },
      { clave: 'Material_Commodity_Code', descripcion: 'Código del catálogo de materiales.', tipo: 'Código', etapas: TODAS },
      { clave: 'Potencia', descripcion: 'Potencia del equipo (HP).', tipo: 'Número', etapas: TODAS },
      { clave: 'Hoja_Datos', descripcion: 'Código de la hoja de datos.', tipo: 'Código', etapas: DESDE_FEL3, columna: 'hoja_datos' },
      { clave: 'Capacidad_diseno', descripcion: 'Capacidad principal del equipo (por ejemplo, caudal en bombas).', tipo: 'Número', etapas: DESDE_FEL3 },
    ],
  },
  {
    clave: 'electricos', label: 'Equipos eléctricos', disciplinar: true,
    atributos: [
      { clave: 'Hoja_Datos', descripcion: 'Código de la hoja de datos.', tipo: 'Código', etapas: DESDE_FEL3, columna: 'hoja_datos' },
      { clave: 'Diagrama', descripcion: 'Diagrama unilineal o de conexiones eléctricas.', tipo: 'Código', etapas: TODAS },
      { clave: 'Voltaje', descripcion: 'Voltaje expresado en volts.', tipo: 'Número', etapas: DESDE_FEL3 },
      { clave: 'Listado_Circuito', descripcion: 'Listado de circuito eléctrico, parte de un sistema, asociado al elemento.', tipo: 'Código', etapas: TODAS },
    ],
  },
  {
    clave: 'canerias', label: 'Cañerías y válvulas', disciplinar: true,
    atributos: [
      { clave: 'Dimensiones', descripcion: 'Dimensiones generales o diámetro nominal en cañerías (pulg).', tipo: 'Número', etapas: TODAS, columna: 'diametro_in' },
      { clave: 'Servicio', descripcion: 'Descripción del tipo de servicio.', tipo: 'Texto', etapas: TODAS, columna: 'sistema_servicio' },
      { clave: 'Aislacion', descripcion: 'Descripción del tipo de aislación.', tipo: 'Texto', etapas: DESDE_FEL3 },
      { clave: 'Presion_Nominal', descripcion: 'Presión nominal (PN) de la cañería.', tipo: 'Número', etapas: DESDE_FEL3 },
      { clave: 'Diametro_Nominal', descripcion: 'Diámetro nominal (DN) de la cañería.', tipo: 'Número', etapas: DESDE_FEL3, columna: 'diametro_in' },
    ],
  },
  {
    clave: 'instrumentacion', label: 'Instrumentación', disciplinar: true,
    atributos: [
      { clave: 'Dimensiones', descripcion: 'Dimensiones generales alto × ancho × largo (mm).', tipo: 'Número', etapas: TODAS },
      { clave: 'Tipo_senal', descripcion: 'Análoga o digital.', tipo: 'Texto', etapas: DESDE_DETALLE },
      { clave: 'Tipo', descripcion: 'Definición del tipo de elemento.', tipo: 'Texto', etapas: DESDE_FEL3, columna: 'tipo_elemento' },
    ],
  },
  {
    clave: 'soportes', label: 'Soportes', disciplinar: true,
    atributos: [
      { clave: 'Grado', descripcion: 'Grado del material utilizado.', tipo: 'Código', etapas: DESDE_FEL3 },
      { clave: 'Estandar', descripcion: 'Código del plano estándar usado para diseño o fabricación.', tipo: 'Código', etapas: DESDE_FEL3 },
      { clave: 'Codigo', descripcion: 'Descripción del tipo de soporte, según estándar.', tipo: 'Texto', etapas: DESDE_FEL3 },
    ],
  },
  {
    clave: 'hormigones', label: 'Hormigones', disciplinar: true,
    atributos: [
      { clave: 'Enfierradura_Peso', descripcion: 'Peso de fierros de construcción (kg).', tipo: 'Número', etapas: DESDE_FEL3 },
      { clave: 'Calidad_hormigon', descripcion: 'Calidad del hormigón (GXX).', tipo: 'Código', etapas: TODAS },
      { clave: 'Superficie', descripcion: 'Superficie expresada en m².', tipo: 'Número', etapas: DESDE_FEL3 },
      { clave: 'Volumen', descripcion: 'Volumen del elemento expresado en m³.', tipo: 'Número', etapas: TODAS, columna: 'volumen_m3' },
      { clave: 'Excavacion_estructural', descripcion: 'Volumen estimado de excavación (m³) cuando no está modelado.', tipo: 'Número', etapas: DESDE_DETALLE },
      { clave: 'Relleno_estructural', descripcion: 'Volumen estimado de relleno (m³) cuando no está modelado.', tipo: 'Número', etapas: DESDE_DETALLE },
    ],
  },
  {
    clave: 'estructuras', label: 'Estructuras', disciplinar: true,
    atributos: [
      { clave: 'Seccion', descripcion: 'Sección del perfil de estructura.', tipo: 'Texto', etapas: TODAS },
      { clave: 'Grado', descripcion: 'Grado del material utilizado.', tipo: 'Código', etapas: DESDE_FEL3 },
      { clave: 'Longitud', descripcion: 'Largo del perfil.', tipo: 'Número', etapas: DESDE_FEL3, columna: 'longitud_m' },
      { clave: 'Categoria', descripcion: 'Liviana, mediana, pesada o extra pesada.', tipo: 'Texto', etapas: TODAS, columna: 'categoria_constructiva', nota: 'La columna de Hilo guarda categoría constructiva, no el peso de la estructura: el mapeo es aproximado.' },
      { clave: 'Tipo_estructura', descripcion: 'Tipo de estructura: soporte, parrón, escalera, plataforma, etc.', tipo: 'Texto', etapas: TODAS, columna: 'tipo_elemento' },
    ],
  },
  {
    clave: 'mineria', label: 'Minería (obras subterráneas)', disciplinar: true,
    atributos: [
      { clave: 'Seccion_tunel_diseno', descripcion: 'Dimensión teórica de la sección alto × ancho excavada.', tipo: 'Número', etapas: TODAS },
      { clave: 'Seccion_tunel_libre', descripcion: 'Dimensión teórica de la sección alto × ancho libre con fortificación.', tipo: 'Texto', etapas: DESDE_FEL3 },
      { clave: 'Funcionalidad', descripcion: 'Manejo de materiales, ventilación, acopios, etc.', tipo: 'Texto', etapas: DESDE_FEL3 },
      { clave: 'Tipo_roca', descripcion: 'Tipo de roca según categoría (I, II, III, IV).', tipo: 'Texto', etapas: TODAS },
      { clave: 'Fortificacion', descripcion: 'Tipo de fortificación (PM / PMS / marcos / otras).', tipo: 'Texto', etapas: TODAS },
      { clave: 'Tipo_malla', descripcion: 'Descripción de la malla.', tipo: 'Texto', etapas: DESDE_FEL3 },
      { clave: 'Perno', descripcion: 'Tipo y dimensión del perno.', tipo: 'Texto', etapas: DESDE_FEL3 },
      { clave: 'Fijacion', descripcion: 'Tipo de fijación.', tipo: 'Texto', etapas: DESDE_FEL3 },
      { clave: 'Espesor_Shotcrete', descripcion: 'Espesor del hormigón proyectado.', tipo: 'Número', etapas: DESDE_FEL3 },
    ],
  },
  {
    clave: 'pem', label: 'Puesta en marcha', disciplinar: false,
    atributos: [
      { clave: 'Plan_PEM', descripcion: 'Código del entregable de estrategia de puesta en marcha.', tipo: 'Código', etapas: TODAS },
      { clave: 'Termino_constructivo', descripcion: 'Fecha de término de los protocolos de pruebas constructivas.', tipo: 'Fecha', etapas: SOLO_CONSTRUCCION },
      { clave: 'Certificado_termino_constructivo', descripcion: 'Certificado por sistema o subsistema.', tipo: 'Código', etapas: SOLO_CONSTRUCCION },
      { clave: 'Certificado_termino_mecanico', descripcion: 'Por sistema o subsistema, incluye validación vendor.', tipo: 'Código', etapas: SOLO_CONSTRUCCION },
      { clave: 'Pruebas_FAT', descripcion: 'Si aplica y en qué documento están consideradas (PIE, requisición, matriz de pruebas).', tipo: 'Código', etapas: DESDE_DETALLE },
      { clave: 'Pruebas_IFAT', descripcion: 'Si aplica y en qué documento están consideradas.', tipo: 'Código', etapas: DESDE_DETALLE },
      { clave: 'Pruebas_SAT', descripcion: 'Estatus y aplicación (aplica / no aplica).', tipo: 'Texto', etapas: SOLO_CONSTRUCCION },
      { clave: 'Pruebas_CAT', descripcion: 'Estatus y aplicación.', tipo: 'Texto', etapas: SOLO_CONSTRUCCION },
      { clave: 'Punch_list', descripcion: 'Listado de punch list vigente.', tipo: 'Link', etapas: SOLO_CONSTRUCCION },
      { clave: 'TOP', descripcion: 'Paquete de entrega de puesta en marcha.', tipo: 'Link', etapas: SOLO_CONSTRUCCION },
      { clave: 'PEC', descripcion: 'Paquete de entrega de construcción a nivel de SWP.', tipo: 'Link', etapas: SOLO_CONSTRUCCION },
      { clave: 'Acta_transferencia', descripcion: 'Certificado CCC (Control, Cuidado y Custodia) de construcción a PEM.', tipo: 'Link', etapas: SOLO_CONSTRUCCION },
      { clave: 'Matriz_de_prueba_precom', descripcion: 'Por sistema, subsistema o equipo (SWP).', tipo: 'Texto', etapas: DESDE_FEL3 },
      { clave: 'Matriz_de_prueba_comisionamiento', descripcion: 'Por sistema, subsistema o equipo (SWP).', tipo: 'Texto', etapas: DESDE_FEL3 },
      { clave: 'Certificado_CRE', descripcion: 'Certificado de Criterios de Recepción y Entrega.', tipo: 'Código', etapas: DESDE_FEL3 },
      { clave: 'Tipo_partida', descripcion: 'Requerimiento de partida (VDF / No aplica).', tipo: 'Texto', etapas: DESDE_FEL3 },
      { clave: 'Tipo_carga_electrica', descripcion: 'Crítica, no crítica, desconectada o N/A.', tipo: 'Texto', etapas: DESDE_FEL3 },
      { clave: 'Tipo_operacion', descripcion: 'Esporádica, stand by, punta o N/A.', tipo: 'Texto', etapas: DESDE_FEL3 },
    ],
  },
  {
    clave: 'asbuilt', label: 'Condición as built', disciplinar: false,
    atributos: [
      { clave: 'Condicion_AB', descripcion: 'Sí o No según el estatus as built del elemento.', tipo: 'Texto', etapas: SOLO_CONSTRUCCION },
      { clave: 'Plano_RL', descripcion: 'Numeración del plano Red Line del constructor y la revisión que genera la actualización.', tipo: 'Texto', etapas: SOLO_CONSTRUCCION },
    ],
  },
];

// ── Niveles de Información (cap. 5.7) ──────────────────────────────────────────
//
// La guía insiste en algo que se malinterpreta seguido: **el NDI es de la entidad, no del modelo**.
// Un modelo alberga entidades con NDI distintos; no se declara "modelo NDI-4". Es el LOIN de la
// ISO 19650 dicho en castellano.

export interface NivelInformacion {
  nivel: string;
  nombre: string;
  resumen: string;
  fase: string;
}

export const NIVELES_INFORMACION: NivelInformacion[] = [
  { nivel: 'NDI-1', nombre: 'Información inicial general', resumen: 'Representativo', fase: 'Perfil · Prefactibilidad' },
  { nivel: 'NDI-2', nombre: 'Información básica aproximada', resumen: 'Aproximado', fase: 'Prefactibilidad' },
  { nivel: 'NDI-3', nombre: 'Información detallada', resumen: 'Simplificado', fase: 'Factibilidad' },
  { nivel: 'NDI-4', nombre: 'Información detallada y coordinada', resumen: 'Detallada', fase: 'Factibilidad · Detalles' },
  { nivel: 'NDI-5', nombre: 'Información detallada de fabricación y montaje', resumen: 'Certificado', fase: 'Detalles' },
  { nivel: 'NDI-6', nombre: 'Información de lo construido y su puesta en marcha', resumen: 'As Built', fase: 'Construcción' },
];

// ── Estados de avance del modelo (cap. 5.8) ────────────────────────────────────
//
// Cuatro estados, once hitos, con ponderación que acumula 100% **por disciplina**. Es, en la
// práctica, un estado de pago de la ingeniería: la misma mecánica de rules of credit que Hilo ya
// usa en `mining_ponderaciones` para el avance físico de construcción, aplicada al modelo.

export interface HitoAvanceModelo {
  estado: 'E1' | 'E2' | 'E3' | 'E4';
  estadoLabel: string;
  hito: string;
  descripcion: string;
  pct: number;
  acumulado: number;
}

export const HITOS_AVANCE_MODELO: HitoAvanceModelo[] = [
  { estado: 'E1', estadoLabel: 'Configuración', hito: 'Setup', descripcion: 'Configuración de plataformas y entornos de diseño bajo el estándar del mandante.', pct: 5, acumulado: 5 },
  { estado: 'E1', estadoLabel: 'Configuración', hito: 'Layout', descripcion: 'Disposición general de equipos, sistemas e infraestructura: es el dato de entrada de las demás disciplinas.', pct: 5, acumulado: 10 },
  { estado: 'E1', estadoLabel: 'Configuración', hito: 'Iniciado', descripcion: 'Modelo entregado en los formatos solicitados, con gráfica, data y configuración de reportes.', pct: 5, acumulado: 15 },
  { estado: 'E2', estadoLabel: 'Preliminar', hito: 'Preliminar', descripcion: 'Modelo con información preliminar o de catálogo. Se incorpora el TAG y los espacios reservados.', pct: 15, acumulado: 30 },
  { estado: 'E2', estadoLabel: 'Preliminar', hito: 'Revisión multidisciplinaria', descripcion: 'Ciclo de revisiones entre disciplinas; se inicia el chequeo de interferencias.', pct: 10, acumulado: 40 },
  { estado: 'E3', estadoLabel: 'Avanzado', hito: 'Actualización', descripcion: 'Modelo actualizado con información vendor de la oferta más probable.', pct: 15, acumulado: 55 },
  { estado: 'E3', estadoLabel: 'Avanzado', hito: 'Avanzado', descripcion: 'Consistencia con los P&ID en revisión P; todo lo informado como equipo está modelado y con su NDI.', pct: 10, acumulado: 65 },
  { estado: 'E3', estadoLabel: 'Avanzado', hito: 'Aprobación', descripcion: 'Emisión del modelo para revisión de consistencia y completitud de su data, con reportes de atributos.', pct: 5, acumulado: 70 },
  { estado: 'E4', estadoLabel: 'Final', hito: 'Modificaciones', descripcion: 'Hallazgos y comentarios finales incorporados y validados contra P&ID sin observaciones.', pct: 15, acumulado: 85 },
  { estado: 'E4', estadoLabel: 'Final', hito: 'Terminado', descripcion: 'Declaración firmada de modelo terminado y libre de interferencias, para emisión de entregables.', pct: 10, acumulado: 95 },
  { estado: 'E4', estadoLabel: 'Final', hito: 'Final', descripcion: 'Modelo aprobado para su etapa de ingeniería.', pct: 5, acumulado: 100 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

export function esEtapa(v: unknown): v is Etapa {
  return typeof v === 'string' && (ETAPAS as readonly string[]).includes(v);
}

/** Por defecto se mide contra Construcción: es la etapa de los proyectos poblados de Hilo. */
export function normalizarEtapa(v: unknown): Etapa {
  return esEtapa(v) ? v : 'CONSTRUCCION';
}

export const exigidoEn = (a: AtributoAnexo7, etapa: Etapa) => a.etapas.includes(etapa);

/**
 * Columnas distintas de `mining_elementos` que hay que contar para medir la etapa. Se deduplica
 * porque varios atributos del Anexo 7 caen en la misma columna —`Peso` aparece en General y en
 * Equipos Mecánicos, `Dimensiones` en tres grupos— y contar dos veces lo mismo es una query de más
 * sobre una tabla de decenas de miles de filas.
 */
export function columnasAMedir(etapa: Etapa): { columna: string; excluirSin: boolean }[] {
  const vistas = new Map<string, boolean>();
  for (const g of GRUPOS_ANEXO7) {
    for (const a of g.atributos) {
      if (!a.columna || !exigidoEn(a, etapa)) continue;
      vistas.set(a.columna, (vistas.get(a.columna) ?? false) || !!a.excluirSin);
    }
  }
  return [...vistas].map(([columna, excluirSin]) => ({ columna, excluirSin }));
}

export type EstadoAtributo = 'capturado' | 'propuesto' | 'no_capturado';

/** En qué situación está el atributo respecto de la plataforma, no del modelo. */
export function estadoAtributo(a: AtributoAnexo7): EstadoAtributo {
  if (a.columna) return 'capturado';
  if (a.propuesta) return 'propuesto';
  return 'no_capturado';
}
