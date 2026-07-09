/**
 * Cruza los documentos registrados en la BD (mining_doc_aconex + mining_planos)
 * contra los PDFs disponibles en las carpetas locales de Aconex (ACONEX_DOCS_DIR),
 * lista los faltantes y detecta comprimidos (.zip/.rar/.7z) sin extraer.
 *
 * Uso: node --env-file=.env.local scripts/check-docs-faltantes.mjs [salida.csv]
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ID = 'b2ad07a9-1dec-4e5a-9a46-7b6a41a73001';
const OUT = process.argv[2] ?? path.join(process.env.USERPROFILE ?? '.', 'Downloads', 'faltantes_documentos.csv');
const RE = /[0-9]+-[A-Z0-9]+-[0-9]+-[0-9]+-[A-Z]+-[0-9]+/g;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ── 1. Escanear disco: PDFs y comprimidos ──────────────────────────────────
const roots = (process.env.ACONEX_DOCS_DIR ?? '').split(';').map(s => s.trim()).filter(Boolean);
const localCodes = new Set();
const comprimidos = [];
let totalPdfs = 0;

for (const root of roots) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      const low = e.name.toLowerCase();
      if (low.endsWith('.pdf')) {
        totalPdfs++;
        (e.name.match(RE) ?? []).forEach(c => localCodes.add(c));
      } else if (/\.(zip|rar|7z)$/.test(low)) {
        const st = fs.statSync(full);
        comprimidos.push({ full, mb: Math.round(st.size / 1048576), fecha: st.mtime.toISOString().slice(0, 10) });
      }
    }
  }
}

console.log(`PDFs locales: ${totalPdfs} · códigos únicos detectados: ${localCodes.size}`);

// ── 2. Documentos en BD ─────────────────────────────────────────────────────
const { data: aconex, error: e1 } = await sb.from('mining_doc_aconex')
  .select('n_cmdic, titulo, funcion, tipo_doc, estado_aconex, rev, ext')
  .eq('project_id', PROJECT_ID);
if (e1) { console.error(e1.message); process.exit(1); }

const { data: planos, error: e2 } = await sb.from('mining_planos')
  .select('codigo_documento, cwp_id, descripcion, tipo')
  .eq('project_id', PROJECT_ID);
if (e2) { console.error(e2.message); process.exit(1); }

// ── 3. Cruce ────────────────────────────────────────────────────────────────
const faltAconex = aconex.filter(d => d.n_cmdic && !localCodes.has(d.n_cmdic));
const planosUnicos = [...new Map(planos.map(p => [p.codigo_documento, p])).values()];
const faltPlanos = planosUnicos.filter(p => !localCodes.has(p.codigo_documento));

// Nota: los "ext" no-PDF (dwg, xlsx…) nunca van a resolver como PDF — separarlos
const faltAconexPdf = faltAconex.filter(d => !d.ext || /pdf/i.test(d.ext));
const faltAconexOtros = faltAconex.filter(d => d.ext && !/pdf/i.test(d.ext));

console.log(`\nmining_doc_aconex: ${aconex.length} docs → ${faltAconex.length} sin archivo local (${faltAconexPdf.length} PDF esperado, ${faltAconexOtros.length} son ${[...new Set(faltAconexOtros.map(d => d.ext))].join('/') || '—'})`);
console.log(`mining_planos: ${planosUnicos.length} códigos únicos → ${faltPlanos.length} sin archivo local`);

// Por contrato / disciplina
const grupo = c => (c.match(/^\d+-([A-Z0-9]+)-\d+-(\d+)/) ?? []).slice(1, 3).join(' · disc ');
const cnt = {};
for (const d of faltAconex) cnt[grupo(d.n_cmdic)] = (cnt[grupo(d.n_cmdic)] ?? 0) + 1;
for (const p of faltPlanos) cnt[grupo(p.codigo_documento)] = (cnt[grupo(p.codigo_documento)] ?? 0) + 1;
console.log('\nFaltantes por contrato · disciplina:');
Object.entries(cnt).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

// ── 4. Comprimidos ──────────────────────────────────────────────────────────
console.log(`\nComprimidos sin extraer en las carpetas Aconex: ${comprimidos.length}`);
comprimidos.sort((a, b) => b.mb - a.mb).slice(0, 15).forEach(z => console.log(`  [${z.mb} MB · ${z.fecha}] ${z.full}`));

// ── 5. CSV ──────────────────────────────────────────────────────────────────
const esc = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
const rows = [
  'origen,codigo,titulo_o_descripcion,tipo,estado_o_cwp,ext',
  ...faltAconex.map(d => ['doc_aconex', d.n_cmdic, d.titulo, d.tipo_doc, d.estado_aconex, d.ext].map(esc).join(',')),
  ...faltPlanos.map(p => ['plano_cwp', p.codigo_documento, p.descripcion, p.tipo, p.cwp_id, 'pdf'].map(esc).join(',')),
];
fs.writeFileSync(OUT, '﻿' + rows.join('\r\n'), 'utf-8');
console.log(`\n✓ Detalle completo en: ${OUT} (${faltAconex.length + faltPlanos.length} filas)`);
