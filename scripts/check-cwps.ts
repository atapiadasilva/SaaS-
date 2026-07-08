import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: p } = await supabase.from('projects').select('id, name, module_config').ilike('name', '%EPV1%').single();
  if (!p) { console.log('no project'); return; }
  console.log('Project:', p.id);
  console.log('Module Config BIM URN:', (p.module_config as any)?.bim?.urn);
  
  const { data: cwps } = await supabase.from('cwps').select('id, code, description').eq('project_id', p.id);
  console.log(`CWPs count: ${cwps?.length || 0}`);
  if (cwps && cwps.length > 0) console.log('Sample CWP:', cwps[0]);
  
  const { data: part } = await supabase.from('partidas').select('id, code').eq('project_id', p.id);
  console.log(`Partidas count: ${part?.length || 0}`);
}
check();
