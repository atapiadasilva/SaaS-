import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PID = '3a32fa60-2f23-441b-be0b-9b3aef900b58';

const { data: proy } = await sb.from('projects').select('name,module_config').eq('id', PID).single();
console.log('PROYECTO:', proy?.name);
console.log('bim config:', JSON.stringify(proy?.module_config?.bim));

let all = [], from = 0;
for (;;) {
  const { data, error } = await sb.from('mining_elementos')
    .select('sp3d_moniker,cwp_id').eq('project_id', PID).range(from, from + 999);
  if (error) { console.error(error.message); break; }
  all = all.concat(data); if (data.length < 1000) break; from += 1000;
}
console.log('elementos en BD:', all.length, '| con cwp:', all.filter(e => e.cwp_id).length);

const props = JSON.parse(fs.readFileSync('graphify-out/propiedades-modelo.json', 'utf8'));
const porExt = new Set(props.map(p => p.externalId));
console.log('elementos en el modelo (JSON APS):', props.length);

const calzan = all.filter(e => porExt.has(String(e.sp3d_moniker || '').trim()));
console.log('\ncalzan por externalId:', calzan.length, `(${(calzan.length/all.length*100).toFixed(1)}%)`);
const no = all.filter(e => !porExt.has(String(e.sp3d_moniker || '').trim()));
console.log('NO calzan:', no.length);
console.log('ejemplos que no calzan:', no.slice(0, 8).map(e => e.sp3d_moniker).join(' | '));
console.log('ejemplos externalId del modelo:', props.slice(0, 4).map(p => p.externalId).join(' | '));
