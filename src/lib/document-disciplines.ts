// Disciplina derivada del 4to segmento del código de documento Aconex:
// {proyecto}-{contrato}-{area}-{disciplina}-{tipo}-{secuencia}, ej. 333-PRC23084-312-42-DW-8001 → '42'.
// mining_planos no tiene columna de disciplina propia — esta es la única fuente confiable,
// incluso para los documentos generales/sin CWP que no tienen fila en mining_cwp.
export const DOC_DISCIPLINE_RE = /^\d+-[A-Z0-9]+-\d{3}-(\d{2})-[A-Z]+-\d+/;

export const DISCIPLINE_NAMES: Record<string, string> = {
  '10': 'Medio Ambiente',
  '41': 'Movimiento de Tierra',
  '42': 'Civil / Hormigón',
  '43': 'Estructura',
  '44': 'Arquitectura',
  '45': 'Mecánica',
  '46': 'Cañerías (Piping)',
  '47': 'Electricidad',
  '48': 'Instrumentación & Control',
  '49': 'Metalurgia & Proceso',
};

export const DISCIPLINE_COLOR: Record<string, string> = {
  '10': '#16a34a', '41': '#92400e', '42': '#64748b', '43': '#2563eb',
  '44': '#a855f7', '45': '#ea580c', '46': '#0891b2', '47': '#eab308',
  '48': '#dc2626', '49': '#7c3aed',
};

export function disciplineFromDocNum(codigoDocumento: string | null | undefined): { code: string; name: string; color: string } {
  const m = codigoDocumento?.match(DOC_DISCIPLINE_RE);
  const code = m ? m[1] : '--';
  return {
    code,
    name: DISCIPLINE_NAMES[code] || 'Sin clasificar',
    color: DISCIPLINE_COLOR[code] || '#6b7280',
  };
}
