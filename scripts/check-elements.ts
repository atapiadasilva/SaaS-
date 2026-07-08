import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const projectId = '643871dc-3654-471c-a2ec-8e34bedf4d61';
  
  const { data: elms, error } = await supabase.from('mining_elementos').select('cwp_id, count').eq('project_id', projectId);
  
  const { data: grouped } = await supabase.rpc('mining_cwp_element_counts', { p_project_id: projectId });
  console.log('Grouped counts from RPC:', grouped);
  
  const { data: sample } = await supabase.from('mining_elementos').select('cwp_id').eq('project_id', projectId).limit(10);
  console.log('Sample cwp_id in elementos:', sample);
}
check();
