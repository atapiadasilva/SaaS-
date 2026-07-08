import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: elements, error } = await supabase.from('mining_elementos').select('sp3d_moniker, guid_modelo').eq('cwp_id', '1212-A002-CS001').limit(5);
  console.log(`Elements for CWP 1212-A002-CS001:`);
  console.log(elements, error);
}
check();
