import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: p } = await supabase.from('projects').select('id, name').ilike('name', '%EPV1%').single();
  if (!p) { console.log('no project'); return; }
  console.log('Project EPV1:', p.id);
  
  const { data: cwps } = await supabase.from('cwps').select('id, code, description').eq('project_id', p.id);
  console.log(`CWPs count EPV1: ${cwps?.length || 0}`);
  
  const { data: p2 } = await supabase.from('projects').select('id, name').ilike('name', '%Collahuasi%').single();
  if (p2) {
    console.log('Project Collahuasi:', p2.id);
    const { data: cwps2 } = await supabase.from('cwps').select('id, code, description').eq('project_id', p2.id);
    console.log(`CWPs count Collahuasi: ${cwps2?.length || 0}`);
  }
}
check();
