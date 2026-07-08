/**
 * Importa a mining_planos los documentos de la paquetización Aconex→CWP
 * (salida docs_cwp.json del análisis Paquetizacion_Documentos_por_CWP_Puerto).
 * Dedupe por (cwp_id, codigo_documento). Convenciones: ewp_id = cwp_id + 'E',
 * tipo DW→Plano / PR→Procedimiento / resto→Documento.
 *
 * Uso: node --env-file=.env.local scripts/import-planos-aconex.mjs <ruta docs_cwp.json> [project_id]
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const [, , jsonPath, projectIdArg] = process.argv;
if (!jsonPath) {
  console.error('Uso: node --env-file=.env.local scripts/import-planos-aconex.mjs <docs_cwp.json> [project_id]');
  process.exit(1);
}

const PROJECT_ID = projectIdArg ?? 'b2ad07a9-1dec-4e5a-9a46-7b6a41a73001';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (corre con --env-file=.env.local)'); process.exit(1); }

const sb = createClient(url, key);
const TIPO = { DW: 'Plano', PR: 'Procedimiento' };

const docs = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
console.log(`Docs en paquetización: ${docs.length}`);

const { data: existing, error: exErr } = await sb.from('mining_planos')
  .select('cwp_id, codigo_documento').eq('project_id', PROJECT_ID);
if (exErr) { console.error('Error leyendo mining_planos:', exErr.message); process.exit(1); }
const have = new Set(existing.map(r => `${r.cwp_id}|${r.codigo_documento}`));
console.log(`Ya en mining_planos: ${existing.length} filas`);

const nuevos = [];
for (const d of docs) {
  const cwp = d.CWP_ID?.trim();
  const code = d.Doc_Code?.trim();
  if (!cwp || !code || have.has(`${cwp}|${code}`)) continue;
  have.add(`${cwp}|${code}`);
  const desc = [d['Área_Nombre'], d.Disciplina, d.Tags_encontrados].filter(Boolean).join(' · ');
  nuevos.push({
    project_id: PROJECT_ID,
    cwp_id: cwp,
    ewp_id: `${cwp}E`,
    codigo_documento: code,
    descripcion: desc || null,
    tipo: TIPO[d.Tipo_Doc] ?? 'Documento',
    confianza: d.Tags_encontrados ? 'tag' : 'area-disciplina',
  });
}

console.log(`Nuevos a insertar: ${nuevos.length}`);
if (nuevos.length === 0) { console.log('Nada que hacer.'); process.exit(0); }

for (let i = 0; i < nuevos.length; i += 200) {
  const chunk = nuevos.slice(i, i + 200);
  const { error } = await sb.from('mining_planos').insert(chunk);
  if (error) { console.error(`Error insertando (lote ${i / 200 + 1}):`, error.message); process.exit(1); }
  console.log(`Lote ${i / 200 + 1}: ${chunk.length} insertados`);
}

const { count } = await sb.from('mining_planos')
  .select('id', { count: 'exact', head: true }).eq('project_id', PROJECT_ID);
console.log(`✓ Total mining_planos ahora: ${count}`);
