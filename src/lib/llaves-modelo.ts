// Llaves de identificación de elementos del modelo BIM.
//
// No existe UNA propiedad universal que identifique un elemento: depende de la herramienta
// que lo originó. SmartPlant 3D publica SP3D_MONIKER, Tekla la posición de ensamblaje,
// Revit el nombre/ID del elemento, y un modelo federado en Navisworks mezcla todo eso según
// de qué archivo venga cada parte.
//
// Por eso la llave es una LISTA ORDENADA de candidatas, configurable por proyecto: de cada
// elemento se toma la primera propiedad que traiga valor. Al final siempre está el GUID
// nativo del modelo (externalId), que existe siempre y es estable entre traducciones — a
// diferencia del objectid, que cambia en cada una y rompería el vínculo.

export interface OrigenModelo {
  key: string;
  label: string;
  /** Propiedades candidatas, en orden de preferencia. */
  llaves: string[];
  descripcion: string;
}

export const ORIGENES_MODELO: OrigenModelo[] = [
  {
    key: 'smartplant', label: 'SmartPlant 3D',
    llaves: ['SP3D_MONIKER', 'DATA_EIMISA/SP3D_MONIKER', 'SP3d Moniker'],
    descripcion: 'Plantas de proceso. El moniker es la llave que devuelve el export a SmartPlant.',
  },
  {
    key: 'tekla', label: 'Tekla Structures',
    llaves: ['ASSEMBLY_POS', 'AISC_EM11_Pset_PieceIdentification/ASSEMBLY_POS', 'PieceMark', 'AssemblyPos', 'Tekla Assembly'],
    descripcion: 'Estructura metálica. La posición de ensamblaje identifica la pieza montable.',
  },
  {
    key: 'revit', label: 'Revit',
    llaves: ['ElementId', 'Element ID/Value', 'Element Name', 'Mark', 'Type Mark'],
    descripcion: 'Arquitectura y especialidades. El ElementId es único dentro del modelo.',
  },
  {
    key: 'autocad', label: 'AutoCAD Plant / P&ID',
    llaves: ['TAG', 'AutoCad/TAG', 'Personalizar/TAG', 'Custom/TAG', 'PnPGuid'],
    descripcion: 'Cañerías e instrumentación. El TAG del equipo o línea.',
  },
  {
    key: 'guid', label: 'GUID del modelo',
    llaves: [],
    descripcion: 'Sin propiedad propia: se usa el externalId nativo. Funciona siempre, pero el identificador no significa nada fuera del modelo.',
  },
];

/** Llaves por defecto cuando el proyecto no declara ninguna: cubre los orígenes habituales. */
export const LLAVES_POR_DEFECTO = [
  'SP3D_MONIKER',
  'ASSEMBLY_POS',
  'TAG',
  'ElementId',
  'Mark',
];

/**
 * Lista de llaves a probar, en orden, para un proyecto.
 * `itemPropName` admite varias separadas por coma: "SP3D_MONIKER,ASSEMBLY_POS,TAG".
 */
export function llavesDelProyecto(config?: { itemPropName?: string; itemCategory?: string } | null): string[] {
  const crudo = (config?.itemPropName ?? '').trim();
  if (!crudo) return LLAVES_POR_DEFECTO;

  const llaves = crudo.split(',').map(s => s.trim()).filter(Boolean);
  // Una categoría suelta se antepone a la primera llave (formato "Categoría/Propiedad" del visor).
  if (config?.itemCategory && llaves.length === 1 && !llaves[0].includes('/')) {
    return [`${config.itemCategory}/${llaves[0]}`, llaves[0]];
  }
  return llaves;
}

/** Primer valor no vacío entre las llaves candidatas. null si el elemento no publica ninguna. */
export function valorDeLlave(props: Record<string, string>, llaves: string[]): string | null {
  for (const ll of llaves) {
    const v = props[ll];
    if (v != null && String(v).trim() && !['-', 'N/A', 'NA'].includes(String(v).trim())) return String(v).trim();
    // El visor devuelve unas veces "Categoría/Propiedad" y otras solo "Propiedad".
    const corto = ll.includes('/') ? ll.split('/').pop()! : null;
    if (corto) {
      const v2 = props[corto];
      if (v2 != null && String(v2).trim() && !['-', 'N/A', 'NA'].includes(String(v2).trim())) return String(v2).trim();
    }
  }
  return null;
}
