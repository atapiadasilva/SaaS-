import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const projectId = '643871dc-3654-471c-a2ec-8e34bedf4d61'; // Ingeniería FEED - EPV1

async function fixCosts() {
  console.log('Fetching partidas...');
  const { data: partidas } = await supabase.from('mining_partidas').select('pwp_id, total_clp').eq('project_id', projectId);
  
  console.log('Fetching pwps...');
  const { data: pwps } = await supabase.from('mining_pwp').select('pwp_id, cwp_id').eq('project_id', projectId);

  if (!partidas || !pwps) return;

  console.log(`partidas:`, partidas.length);

  const cwpTotals = new Map<string, number>();
  let matched = 0;
  for (const p of partidas) {
    // We know pwp_id was constructed as cwp_id + 'P'
    const cwpId = String(p.pwp_id).replace(/P$/, '').replace(/E$/, '');
    
    if (cwpId) {
      matched++;
      const current = cwpTotals.get(cwpId) || 0;
      cwpTotals.set(cwpId, current + Number(p.total_clp || 0));
    }
  }
  
  console.log(`Matched ${matched} partidas to CWPs.`);
  console.log(`Updating ${cwpTotals.size} CWPs...`);
  
  let updatedCwps = 0;
  for (const [cwpId, total] of cwpTotals.entries()) {
    const { data, error } = await supabase.from('mining_cwp').update({ costo_oferta_clp: total }).eq('cwp_id', cwpId).eq('project_id', projectId).select();
    if (data && data.length > 0) updatedCwps++;
  }
  console.log(`Successfully updated ${updatedCwps} CWPs with their total costs.`);
}

fixCosts().catch(console.error);
