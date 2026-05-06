export const OFFICIAL_PROJECTS = [
  { name: "Andina", code: "EIMI00413" },
  { name: "Codelco RT", code: "EIMI00403" },
  { name: "COLECCIÓN POLVOS CUAJONE", code: "MIPE00103" },
  { name: "Collahuasi PG3A", code: "EIMI00400" },
  { name: "CONCENTRADORA CUAJONE", code: "MIPE00102" },
  { name: "EPC Muelle Centinela", code: "EIMI00387" },
  { name: "ERA Planta de Azufre", code: "EIMI00389" },
  { name: "GPRO2024", code: "EIMI00405" },
  { name: "Hidrometalurgia", code: "EIMI00408" },
  { name: "La Junta Teniente", code: "EIMI00393" },
  { name: "Lodos Electromecanico", code: "EIMI00412" },
  { name: "MGA3", code: "EIMI00414" },
  { name: "Montemina", code: "EIMI00415" },
  { name: "PROYECTO CONDENSADORES SI...", code: "EIMI00397" },
  { name: "Teniente Matadero", code: "EIMI00406" },
];

export function getProjectCodeByName(name: string): string | undefined {
  const project = OFFICIAL_PROJECTS.find(p => p.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.name.toLowerCase()));
  return project?.code;
}

export function getProjectNameByCode(code: string): string | undefined {
  const project = OFFICIAL_PROJECTS.find(p => p.code === code);
  return project?.name;
}
