import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: nullGuids } = await supabase.from('mining_elementos').select('id', { count: 'exact' }).is('guid_modelo', null);
  const { data: notNullGuids } = await supabase.from('mining_elementos').select('id', { count: 'exact' }).not('guid_modelo', 'is', null);
  console.log(`Null GUIDs: ${nullGuids?.length}, Not Null GUIDs: ${notNullGuids?.length}`);
  
  // also check if moniker is ever null
  const { data: nullMonikers } = await supabase.from('mining_elementos').select('id', { count: 'exact' }).is('sp3d_moniker', null);
  console.log(`Null Monikers: ${nullMonikers?.length}`);
}
check();
