import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const projectId = '643871dc-3654-471c-a2ec-8e34bedf4d61';

async function main() {
  const { data: projData } = await supabase.from('projects').select('id').eq('name', 'Ingeniería FEED - EPV1').single();
  const actualProjectId = projData ? projData.id : projectId;
  console.log(`Using Project ID: ${actualProjectId}`);

  const { data: cwpData } = await supabase.from('mining_cwp').select('cwp_id').eq('project_id', actualProjectId);
  const cwps = (cwpData || []).map(c => c.cwp_id);
  console.log(`Loaded ${cwps.length} CWPs from DB. (e.g. ${cwps[0]})`);

  const filePath = String.raw`C:\Users\atapiad\Downloads\Fw_ Programa En Trabajo\DES Fase 2 15-06-26.xer`;
  const xerContent = fs.readFileSync(filePath, 'utf-8');
  const lines = xerContent.split(/\r?\n/);

  let currentTable = '';
  let currentFields: string[] = [];
  const tables: Record<string, any[]> = {};

  for (const line of lines) {
    if (line.startsWith('%T')) {
      currentTable = line.split('\t')[1].trim();
      tables[currentTable] = [];
    } else if (line.startsWith('%F')) {
      currentFields = line.split('\t').slice(1).map(f => f.trim());
    } else if (line.startsWith('%R')) {
      const values = line.split('\t').slice(1);
      const rowObj: any = {};
      for (let i = 0; i < currentFields.length; i++) {
        rowObj[currentFields[i]] = values[i] ? values[i].trim() : '';
      }
      tables[currentTable].push(rowObj);
    }
  }

  // Check UDF Types
  const udfTypes = tables['UDFTYPE'] || [];
  console.log('UDF Types:', udfTypes.map(u => u.udf_type_label).join(', '));

  // Check how tasks are named
  const tasks = tables['TASK'] || [];
  console.log('Task names sample:', tasks.slice(0, 5).map(t => t.task_name).join(' | '));

  // Check WBS
  const wbs = tables['PROJWBS'] || [];
  console.log('WBS short names sample:', wbs.slice(0, 5).map(w => w.wbs_short_name).join(' | '));

  // Check Actv codes
  const actvTypes = tables['ACTVTYPE'] || [];
  console.log('ACTV Types:', actvTypes.map(a => a.actv_code_type).join(', '));
}
main().catch(console.error);
