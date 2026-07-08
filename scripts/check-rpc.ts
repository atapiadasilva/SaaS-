import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data, error } = await supabase.rpc('get_monikers_for_codes', { p_project_id: '643871dc-3654-471c-a2ec-8e34bedf4d61', p_codes: ['1212-A002-CS001'], p_level: 'cwp_id' });
  if (error) console.error(error);
  else console.log(data);
}
check();
