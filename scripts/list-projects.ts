import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('projects').select('id, name, organization_id, description');
  if (error) {
    console.error('Error fetching projects:', error);
    return;
  }
  console.log('--- CURRENT PROJECTS ---');
  console.log(JSON.stringify(data, null, 2));
}

main();
