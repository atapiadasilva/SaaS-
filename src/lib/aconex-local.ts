import fs from 'fs';
import path from 'path';

// Lee la carpeta local de exportaciones de Aconex (ACONEX_DOCS_DIR) — usada por
// /api/mining-planos/file (servir el PDF) y /api/mining-data (saber qué códigos tienen PDF
// disponible, para no mostrar un link roto en el "Planos" tab). Nunca sale de esta máquina.
const DOC_NUM_RE = /^([0-9]+-[A-Z0-9]+-[0-9]+-[0-9]+-[A-Z]+-[0-9]+)/;

function walkPdfs(baseDir: string): { full: string; name: string }[] {
  const out: { full: string; name: string }[] = [];
  const stack = [baseDir];
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

export function findLocalPdfByDocNum(docNum: string): string | null {
  const baseDir = process.env.ACONEX_DOCS_DIR;
  if (!baseDir) return null;
  for (const f of walkPdfs(baseDir)) {
    const m = f.name.match(DOC_NUM_RE);
    if (m && m[1] === docNum) return f.full;
  }
  return null;
}

// Set de TODOS los códigos de documento con PDF disponible localmente — una sola pasada por el
// disco en vez de un walk por cada plano listado.
export function listLocalDocNums(): Set<string> {
  const baseDir = process.env.ACONEX_DOCS_DIR;
  if (!baseDir) return new Set();
  const set = new Set<string>();
  for (const f of walkPdfs(baseDir)) {
    const m = f.name.match(DOC_NUM_RE);
    if (m) set.add(m[1]);
  }
  return set;
}
