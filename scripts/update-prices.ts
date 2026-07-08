import * as xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const projectId = '643871dc-3654-471c-a2ec-8e34bedf4d61'; // Ingeniería FEED - EPV1
const filePath = String.raw`C:\Users\atapiad\Downloads\Formularios Económicos EPC_6674.xlsx`;

async function main() {
  console.log('Reading Excel file...');
  const workbook = xlsx.readFile(filePath);

  const sheet = workbook.Sheets['ECO-01B'];
  if (!sheet) {
    console.error('Sheet ECO-01B not found');
    return;
  }

  const data: any[] = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  // Find header row
  let headerRowIdx = -1;
  let codeIdx = -1;
  let puIdx = -1;
  let totalIdx = -1;

  for (let i = 0; i < 20; i++) {
    const row = data[i];
    if (row && row.includes('CODIGO PARTIDA')) {
      headerRowIdx = i;
      codeIdx = row.findIndex((c: any) => c === 'CODIGO PARTIDA');
      puIdx = row.findIndex((c: any) => c === 'P.U. (CLP)');
      totalIdx = row.findIndex((c: any) => c === 'P. TOTAL (CLP)');
      break;
    }
  }

  if (headerRowIdx === -1) {
    console.error('Could not find header row');
    return;
  }

  console.log(`Found headers at row ${headerRowIdx + 1}. Codigo: ${codeIdx}, PU: ${puIdx}, Total: ${totalIdx}`);

  const priceMap = new Map<string, { pu: number, total: number }>();

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[codeIdx]) continue;
    
    const cod = String(row[codeIdx]).trim();
    const pu = parseFloat(row[puIdx]) || 0;
    const total = parseFloat(row[totalIdx]) || 0;

    if (cod) {
      priceMap.set(cod, { pu, total });
    }
  }

  console.log(`Parsed ${priceMap.size} prices from Excel.`);

  console.log('Fetching partidas from Supabase...');
  const { data: partidas, error } = await supabase
    .from('mining_partidas')
    .select('id, codigo, pwp_id, cantidad')
    .eq('project_id', projectId);

  if (error) {
    console.error('Error fetching partidas:', error);
    return;
  }

  console.log(`Found ${partidas.length} partidas in DB.`);

  let updatedCount = 0;
  const pwpTotals = new Map<string, number>();

  for (const p of partidas) {
    if (priceMap.has(p.codigo)) {
      const price = priceMap.get(p.codigo)!;
      // In case Excel total is missing but PU is there
      const finalTotal = price.total > 0 ? price.total : (price.pu * (p.cantidad || 0));
      
      await supabase
        .from('mining_partidas')
        .update({ pu_clp: price.pu, total_clp: finalTotal })
        .eq('id', p.id);
      
      updatedCount++;

      // Accumulate for PWP
      const current = pwpTotals.get(p.pwp_id) || 0;
      pwpTotals.set(p.pwp_id, current + finalTotal);
    }
  }

  console.log(`Updated ${updatedCount} partidas.`);

  // Update CWP Costs
  console.log('Fetching PWPs to map to CWPs...');
  const { data: pwps } = await supabase.from('mining_pwp').select('pwp_id, cwp_id').eq('project_id', projectId);
  
  if (pwps) {
    const cwpTotals = new Map<string, number>();
    for (const pwp of pwps) {
      const tot = pwpTotals.get(pwp.pwp_id) || 0;
      if (tot > 0) {
        const current = cwpTotals.get(pwp.cwp_id) || 0;
        cwpTotals.set(pwp.cwp_id, current + tot);
      }
    }

    console.log(`Updating ${cwpTotals.size} CWPs with total costs...`);
    for (const [cwp_id, total] of cwpTotals.entries()) {
      await supabase
        .from('mining_cwp')
        .update({ costo_oferta_clp: total })
        .eq('project_id', projectId)
        .eq('cwp_id', cwp_id);
    }
  }

  console.log('All prices updated successfully!');
}

main().catch(console.error);
