/**
 * Ejecuta el import de Montemina directamente via Supabase REST API.
 * Lee los records del JSON generado y los inserta en batches.
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lsoesbsrlfingfckozsq.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const tmpDir = process.env.TEMP || process.env.TMP || '/tmp';
const records = JSON.parse(readFileSync(`${tmpDir}/montemina_data.json`, 'utf8'));

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

const BATCH_SIZE = 100;
let inserted = 0;
let errors = 0;

console.log(`Insertando ${records.length} actividades en batches de ${BATCH_SIZE}...`);

for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);
  const { error } = await supabase.from('program_activities').insert(batch);

  if (error) {
    console.error(`Batch ${Math.floor(i/BATCH_SIZE)} ERROR:`, error.message);
    errors++;
  } else {
    inserted += batch.length;
    process.stdout.write(`\r  Insertados: ${inserted}/${records.length}`);
  }
}

console.log(`\n\nResultado: ${inserted} OK | ${errors} errores`);

// Verificación
const { count } = await supabase
  .from('program_activities')
  .select('*', { count: 'exact', head: true })
  .eq('project_id', '39ce1776-17e2-4b27-8a52-8066b31ffae6');

console.log(`Verificación Supabase: ${count} filas en DB`);
