// Legacy static list — kept only as seed data reference for /api/projects/seed.
// At runtime, project names/codes come from projects.external_code in the DB.
// To add a new project: create it via the Projects UI and set external_code in the project settings.
export const OFFICIAL_PROJECTS_SEED = [
  { name: "Andina", external_code: "EIMI00413" },
  { name: "Codelco RT", external_code: "EIMI00403" },
  { name: "COLECCIÓN POLVOS CUAJONE", external_code: "MIPE00103" },
  { name: "Collahuasi PG3A", external_code: "EIMI00400" },
  { name: "CONCENTRADORA CUAJONE", external_code: "MIPE00102" },
  { name: "EPC Muelle Centinela", external_code: "EIMI00387" },
  { name: "ERA Planta de Azufre", external_code: "EIMI00389" },
  { name: "GPRO2024", external_code: "EIMI00405" },
  { name: "Hidrometalurgia", external_code: "EIMI00408" },
  { name: "La Junta Teniente", external_code: "EIMI00393" },
  { name: "Lodos Electromecanico", external_code: "EIMI00412" },
  { name: "MGA3", external_code: "EIMI00414" },
  { name: "Montemina", external_code: "EIMI00415" },
  { name: "PROYECTO CONDENSADORES SI...", external_code: "EIMI00397" },
  { name: "Teniente Matadero", external_code: "EIMI00406" },
];

// Use these only when you have a project row and need to display its external code.
// Prefer reading projects.external_code directly from the DB query result.
export function getProjectCodeByName(name: string): string | undefined {
  const p = OFFICIAL_PROJECTS_SEED.find(
    p => p.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.name.toLowerCase())
  );
  return p?.external_code;
}

export function getProjectNameByCode(code: string): string | undefined {
  return OFFICIAL_PROJECTS_SEED.find(p => p.external_code === code)?.name;
}
