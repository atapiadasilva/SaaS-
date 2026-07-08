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
  
  const { data: cwpRes, error: err } = await supabase.from('mining_cwp').select('*').eq('project_id', projectId);
  if (err) console.error(err);
  console.log('mining_cwp count:', cwpRes?.length);
  
  const { data: cwaRes, error: err2 } = await supabase.from('mining_cwa').select('*').eq('project_id', projectId);
  if (err2) console.error(err2);
  console.log('mining_cwa count:', cwaRes?.length);
  
  const { data: cwpsTable, error: err3 } = await supabase.from('cwps').select('*').eq('project_id', projectId);
  console.log('cwps table count (legacy):', cwpsTable?.length);
}
check();
