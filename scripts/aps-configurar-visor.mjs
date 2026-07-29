/**
 * Deja el modelo traducido conectado al proyecto: escribe projects.module_config.bim,
 * que es de donde el explorador CWP toma el URN para levantar el visor.
 *
 * Uso: node --env-file=.env.local scripts/aps-configurar-visor.mjs <project_id> <urn> ["Nombre del modelo"]
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [, , PROJECT_ID, URN_ARG, NOMBRE] = process.argv;
const URN = URN_ARG || (fs.existsSync('graphify-out/ultimo-urn.txt') ? fs.readFileSync('graphify-out/ultimo-urn.txt', 'utf8').trim() : null);
if (!PROJECT_ID || !URN) { console.error('Uso: aps-configurar-visor.mjs <project_id> [urn] ["nombre"]'); process.exit(1); }

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: proj } = await sb.from('projects').select('module_config').eq('id', PROJECT_ID).single();

const bim = {
  urn: URN,
  modelName: NOMBRE || 'Modelo del proyecto',
  configuredAt: new Date().toISOString(),
  // El CWP viene como propiedad del objeto. Se deja sin categoría a propósito: en este
  // modelo el mismo dato aparece bajo AutoCad, Personalizar y Custom según el archivo de
  // origen de cada parte, así que conviene buscar por nombre de propiedad en todas.
  cwpPropName: 'CWP',
  itemPropName: 'TAG',
};

const config = { ...(proj?.module_config ?? {}), bim };
const { error } = await sb.from('projects').update({ module_config: config }).eq('id', PROJECT_ID);
if (error) { console.error('Error:', error.message); process.exit(1); }
console.log('Visor conectado al proyecto.');
console.log(`  modelo   : ${bim.modelName}`);
console.log(`  propiedad: ${bim.cwpPropName} (CWP) · ${bim.itemPropName} (tag)`);
console.log(`  urn      : ${URN.slice(0, 50)}…`);
