import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.from('projects').insert([
    {
      name: 'Ingeniería FEED - EPV1',
      organization_id: '96aa5951-6849-45f4-8d86-2aeb853ef47b'
    }
  ]).select();

  if (error) {
    console.error('Error creating project:', error);
    return;
  }
  console.log('Project created successfully!');
  console.log(JSON.stringify(data, null, 2));
}

main();
