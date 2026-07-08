import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const projectId = '643871dc-3654-471c-a2ec-8e34bedf4d61';
  console.log('Fetching CWPs...');
  const { data: cwps, error: cwpErr } = await supabase.from('mining_cwp').select('cwp_id, cwa_id, cv_id').eq('project_id', projectId);
  if (cwpErr) throw cwpErr;
  
  const cwpMap = new Map();
  for (const cwp of cwps) {
    cwpMap.set(cwp.cwp_id, { cwa_id: cwp.cwa_id, cv_id: cwp.cv_id });
  }

  // Unfortunately Supabase REST API doesn't support bulk UPDATE with different values easily.
  // We can just query elements, map them, and upsert them, OR do updates per CWP.
  // Updating per CWP is very fast because there are only 39 CWPs!
  console.log(`Found ${cwps.length} CWPs. Updating elements by CWP...`);
  
  for (const cwp of cwps) {
    console.log(`Updating CWP: ${cwp.cwp_id} with CWA: ${cwp.cwa_id}, CV: ${cwp.cv_id}`);
    const { data, error, count } = await supabase.from('mining_elementos')
      .update({ cwa_id: cwp.cwa_id, cv_id: cwp.cv_id })
      .eq('project_id', projectId)
      .eq('cwp_id', cwp.cwp_id)
      .select('sp3d_moniker');
    
    if (error) {
      console.error(`Error on ${cwp.cwp_id}:`, error);
    } else {
      console.log(`  -> Updated ${data.length} elements.`);
    }
  }
  
  console.log('Done!');
}

main().catch(console.error);
