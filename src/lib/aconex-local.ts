import fs from 'fs';
import path from 'path';

// Lee las carpetas locales de exportaciones de Aconex (ACONEX_DOCS_DIR, una o varias rutas
// separadas por ";") — usada por /api/mining-planos/file (servir el PDF) y /api/mining-data
// (saber qué códigos tienen PDF disponible, para no mostrar un link roto en el "Planos" tab).
// Nunca sale de esta máquina.
// El código de documento puede venir en cualquier parte del nombre: los export antiguos son
// "333-PRC23084-...-8001 <cliente>.pdf" y los nuevos "<cliente> 333-PRC23084-...-8041_Rev0.pdf".
const DOC_NUM_RE = /[0-9]+-[A-Z0-9]+-[0-9]+-[0-9]+-[A-Z]+-[0-9]+/g;

function baseDirs(): string[] {
  return (process.env.ACONEX_DOCS_DIR ?? '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

function walkPdfs(dirs: string[]): { full: string; name: string }[] {
  const out: { full: string; name: string }[] = [];
  const stack = [...dirs];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(full); continue; }
      if (entry.name.toLowerCase().endsWith('.pdf')) out.push({ full, name: entry.name });
    }
  }
  return out;
}

function docNumsIn(name: string): string[] {
  return name.match(DOC_NUM_RE) ?? [];
}

export function findLocalPdfByDocNum(docNum: string): string | null {
  for (const f of walkPdfs(baseDirs())) {
    if (docNumsIn(f.name).includes(docNum)) return f.full;
  }
  return null;
}

// Set de TODOS los códigos de documento con PDF disponible localmente — una sola pasada por el
// disco en vez de un walk por cada plano listado.
export function listLocalDocNums(): Set<string> {
  const set = new Set<string>();
  for (const f of walkPdfs(baseDirs())) {
    for (const num of docNumsIn(f.name)) set.add(num);
  }
  return set;
}
