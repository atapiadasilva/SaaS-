import * as XLSX from 'xlsx';

export interface ColumnPreview {
  name: string;
  type: 'text' | 'number' | 'date' | 'boolean';
  sampleValue: any;
}

export const parseExcel = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet);
};

export const excelDateToJSDate = (serial: number): string => {
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  
  const seconds = total_seconds % 60;
  total_seconds -= seconds;
  
  const hours = Math.floor(total_seconds / (60 * 60));
  const minutes = Math.floor(total_seconds / 60) % 60;
  
  const finalDate = new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
  return finalDate.toISOString().split('T')[0];
};

export const getColumnPreviews = (rows: any[]): ColumnPreview[] => {
  if (rows.length === 0) return [];
  const firstRow = rows[0];
  return Object.keys(firstRow).map((key) => {
    const value = firstRow[key];
    let type: 'text' | 'number' | 'date' | 'boolean' = 'text';
    const lowerKey = key.toLowerCase();
    
    // Forzar EDT/WBS a texto siempre para evitar truncamientos numéricos (1.9.1 -> 1.9)
    if (lowerKey === 'edt' || lowerKey === 'wbs') {
      type = 'text';
    } else if (typeof value === 'number') {
      type = 'number';
    } else if (typeof value === 'boolean') {
      type = 'boolean';
    } else if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)))) {
      type = 'date';
    }
    
    return {
      name: key,
      type,
      sampleValue: value,
    };
  });
};

export const processETL = (
  rows: any[],
  pkColumns: string[],
  cleaningRules: { trim: boolean; uppercase: boolean } = { trim: true, uppercase: false },
  columnTypes: Record<string, 'text' | 'number' | 'date' | 'boolean'> = {}
) => {
  // Heurística de negocio: Programa de Obra (EDT, Nombre del recurso/tarea, CWP)
  const hasEDTColumn = rows.length > 0 && 'EDT' in rows[0];
  const hasNombreRecurso = rows.length > 0 && ('Nombre del recurso' in rows[0] || 'Nombre de tarea' in rows[0]);
  const hasCWPColumn = rows.length > 0 && Object.keys(rows[0]).some(k => k.toLowerCase() === 'cwp');
  
  let currentDiscipline = '';
  let currentCWP = '';
  let workingRows = [...rows];

  if (hasEDTColumn && hasNombreRecurso) {
    const validRows = [];
    for (const row of rows) {
      // Normalizar nombre de columna CWP si existe pero está en otro case
      const cwpKey = Object.keys(row).find(k => k.toLowerCase() === 'cwp');

      const titleKey = 'Nombre del recurso' in row ? 'Nombre del recurso' : 'Nombre de tarea';

      // Las filas sin EDT son agrupadores/sumatorias
      if ((!row['EDT'] || String(row['EDT']).trim() === '') && row[titleKey]) {
         currentDiscipline = String(row[titleKey]).replace(/[^\w\s]/gi, '').trim(); 
         
         // Si el agrupador tiene un CWP asignado en esa fila, lo guardamos
         if (cwpKey && row[cwpKey]) {
            currentCWP = String(row[cwpKey]).trim();
         }
         continue; 
      }

      // Hijos heredan la disciplina y el CWP del agrupador superior
      if (currentDiscipline && row['EDT']) {
         row['Disciplina'] = currentDiscipline;
      }
      if (currentCWP && row['EDT']) {
         const targetKey = cwpKey || 'CWP';
         if (!row[targetKey]) row[targetKey] = currentCWP;
      }

      validRows.push(row);
    }
    workingRows = validRows;
  }

  return workingRows.map((row) => {
    const processedRow = { ...row };
    
    // Apply type conversions and cleaning
    Object.keys(processedRow).forEach((key) => {
      const targetType = columnTypes[key];
      let value = processedRow[key];

      // Excel Date Conversion
      if (targetType === 'date' && typeof value === 'number') {
        value = excelDateToJSDate(value);
      }

      // Robust Number parsing (e.g., "23.646,46 h" -> 23646.46)
      // Excluir EDT/WBS de la conversión numérica incluso si el usuario lo marcó mal
      const isHierarchyCol = key.toLowerCase() === 'edt' || key.toLowerCase() === 'wbs';
      if (!isHierarchyCol && (targetType === 'number' || key === 'Trabajo') && typeof value === 'string') {
        let cleanStr = value.replace(/[a-zA-Z]/g, '').trim(); // Remove letters like 'h'
        // If it looks like European/South American format with dots as thousands and comma as decimal
        if (cleanStr.includes(',') && (!cleanStr.includes('.') || cleanStr.indexOf(',') > cleanStr.indexOf('.'))) {
             cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
        } else if (cleanStr.includes(',') && cleanStr.includes('.')) {
          // Mixed format, try to be smart
        }
        const numVal = parseFloat(cleanStr);
        if (!isNaN(numVal)) {
          value = numVal;
        }
      }

      if (typeof value === 'string') {
        if (cleaningRules.trim) value = value.trim();
        if (cleaningRules.uppercase) value = value.toUpperCase();
      }

      processedRow[key] = value;
    });

    // Generate PK if it's a composite or needs a specific name
    if (pkColumns.length > 0) {
      const pkValue = pkColumns.map(col => String(processedRow[col] || '')).join('_');
      processedRow['__pk'] = pkValue;
    }

    return processedRow;
  });
};
