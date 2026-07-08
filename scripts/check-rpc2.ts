import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data, error } = await supabase.rpc('exec_sql', { query: "SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname LIKE 'get_monikers%'" });
  if (error) console.error(error);
  else console.log(data);
}
check();
