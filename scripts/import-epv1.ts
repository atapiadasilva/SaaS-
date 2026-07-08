import * as xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const projectId = '643871dc-3654-471c-a2ec-8e34bedf4d61'; // Ingeniería FEED - EPV1
const filePath = String.raw`C:\Users\atapiad\EISA\EIMI00416 - Ingeniería FEED_ - General\03. AWP BIM\01. Modelos\03. Dashboard\03. Modelo Final\EPV1_DES_Base_Consolidada_RevC (3).xlsx`;

function getDisciplineInfo(cwpCode: string) {
  const parts = cwpCode.split('-');
  if (parts.length >= 3) {
    const code = parts[2].substring(0, 2);
    const map: Record<string, string> = {
      'CC': 'Obras Civiles',
      'CS': 'Estructuras',
      'ME': 'Mecánica',
      'PI': 'Piping',
      'EN': 'Eléctrica',
      'IN': 'Instrumentación',
      'AR': 'Arquitectura'
    };
    return { cod: code, name: map[code] || `Especialidad ${code}` };
  }
  return { cod: 'GEN', name: 'General' };
}

async function main() {
  console.log('Reading Excel file...');
  const workbook = xlsx.readFile(filePath);

  // --- 1. RESUMEN CWP ---
  console.log('Parsing RESUMEN CWP...');
  const resumenSheet = workbook.Sheets['RESUMEN CWP'];
  const resumenData: any[] = xlsx.utils.sheet_to_json(resumenSheet, { header: 1 });
  
  const cwaMap = new Map<string, string>();
  const cvMap = new Map<string, { cwa: string; name: string }>();
  const cwpMap = new Map<string, any>();
  const pwpMap = new Map<string, any>();
  const disciplines = new Map<string, string>();

  let currentCwaName = '';
  let currentCwaId = '';

  for (let i = 2; i < resumenData.length; i++) {
    const row = resumenData[i];
    if (!row || row.length === 0) continue;
    
    let cwaVal = row[0] ? String(row[0]).trim() : '';
    if (cwaVal.includes('CWA ') && cwaVal.includes('—')) {
      const match = cwaVal.match(/CWA\s+(\w+)\s+—\s+(.*)/);
      if (match) {
        currentCwaId = match[1];
        currentCwaName = match[2];
        cwaMap.set(currentCwaId, currentCwaName);
      }
      continue;
    }

    const cwa_id = cwaVal || currentCwaId;
    const cv_id = row[1] ? String(row[1]).trim() : '';
    const cwp_id = row[2] ? String(row[2]).trim() : '';
    const desc = row[3] ? String(row[3]).trim() : '';
    const ewp_id = row[9] ? String(row[9]).trim() : '';

    if (!cwaMap.has(cwa_id)) cwaMap.set(cwa_id, `Área ${cwa_id}`);
    if (cv_id && !cvMap.has(cv_id)) cvMap.set(cv_id, { cwa: cwa_id, name: `CV ${cv_id}` });

    if (cwp_id) {
      const disc = getDisciplineInfo(cwp_id);
      disciplines.set(disc.cod, disc.name);
      
      if (!cwpMap.has(cwp_id)) {
        cwpMap.set(cwp_id, {
          project_id: projectId,
          cwa_id,
          cv_id,
          cwp_id,
          ewp_id,
          disciplina_cod: disc.cod,
          disciplina: disc.name,
          cwp_nombre: desc,
          alcance: desc,
          costo_oferta_clp: 0 // Default
        });
      }

      // Simple EWP -> PWP mapping
      const pwp_id = ewp_id.replace('E', 'P') || `${cwp_id}P`;
      if (!pwpMap.has(pwp_id)) {
        pwpMap.set(pwp_id, {
          project_id: projectId,
          cwp_id,
          pwp_id
        });
      }
    }
  }

  // --- 2. ITEMIZADO CANTIDADES ---
  console.log('Parsing ITEMIZADO CANTIDADES...');
  const itemSheet = workbook.Sheets['ITEMIZADO CANTIDADES'];
  const itemData: any[] = xlsx.utils.sheet_to_json(itemSheet, { header: 1 });
  const partidas: any[] = [];
  
  for (let i = 2; i < itemData.length; i++) {
    const row = itemData[i];
    if (!row || row.length === 0) continue;
    
    const cwp_id = row[2] ? String(row[2]).trim() : '';
    const pwp_id = cwp_id ? cwp_id + 'P' : ''; // Fallback
    const codigo = row[5] ? String(row[5]).trim() : '';
    const desc = row[6] ? String(row[6]).trim() : '';
    const un = row[7] ? String(row[7]).trim() : '';
    const qty = parseFloat(row[8]) || 0;

    if (codigo) {
      partidas.push({
        project_id: projectId,
        pwp_id, // needs to link to pwp
        codigo,
        descripcion: desc,
        obra: 'General',
        unidad: un,
        cantidad: qty,
        pu_clp: 0,
        total_clp: 0
      });
    }
  }

  // --- 3. CONSOLIDADO (Elementos) ---
  console.log('Parsing CONSOLIDADO (Elementos)...');
  const consSheet = workbook.Sheets['CONSOLIDADO'];
  const consData: any[] = xlsx.utils.sheet_to_json(consSheet, { header: 1 });
  const elementos: any[] = [];
  
  for (let i = 4; i < consData.length; i++) {
    const row = consData[i];
    if (!row || row.length === 0) continue;

    const cwp_id = row[4] ? String(row[4]).trim() : null;
    const swp_id = row[8] ? String(row[8]).trim() : null;
    const tag = row[15] ? String(row[15]).trim() : null;
    const guid = row[16] ? String(row[16]).trim() : null;
    const moniker = row[21] ? String(row[21]).trim() : guid; // Use GUID if moniker is missing or '0'

    let cwa_id = null;
    let cv_id = null;
    if (cwp_id && cwpMap.has(cwp_id)) {
      const c = cwpMap.get(cwp_id);
      cwa_id = c.cwa_id;
      cv_id = c.cv_id;
    }

    if (moniker && moniker !== '0') {
      elementos.push({
        project_id: projectId,
        cwa_id: cwa_id,
        cv_id: cv_id,
        cwp_id: cwp_id,
        swp_id: swp_id,
        sp3d_moniker: moniker,
        tag_unificado: tag,
        guid_modelo: guid,
        name: row[13] ? String(row[13]).trim() : null
      });
    }
  }

  const cwpList = Array.from(cwpMap.values());
  const pwpList = Array.from(pwpMap.values());
  console.log(`Parsed ${cwaMap.size} CWAs, ${cvMap.size} CVs, ${cwpList.length} CWPs, ${partidas.length} Partidas, ${elementos.length} Elementos.`);

  // --- DELETE EXISTING DATA ---
  console.log('Clearing old data for this project...');
  await supabase.from('mining_elementos').delete().eq('project_id', projectId);
  await supabase.from('mining_partidas').delete().eq('project_id', projectId);
  await supabase.from('mining_pwp').delete().eq('project_id', projectId);
  await supabase.from('mining_cwp').delete().eq('project_id', projectId);
  await supabase.from('mining_cv').delete().eq('project_id', projectId);
  await supabase.from('mining_cwa').delete().eq('project_id', projectId);
  await supabase.from('mining_disciplinas').delete().eq('project_id', projectId);

  // --- BATCH INSERT ---
  console.log('Inserting CWAs...');
  const cwaInserts = Array.from(cwaMap.entries()).map(([id, name]) => ({ project_id: projectId, cwa_id: id, cwa_nombre: name }));
  await supabase.from('mining_cwa').insert(cwaInserts);

  console.log('Inserting CVs...');
  const cvInserts = Array.from(cvMap.entries()).map(([id, val]) => ({ project_id: projectId, cwa_id: val.cwa, cv_id: id, cv_nombre: val.name }));
  await supabase.from('mining_cv').insert(cvInserts);

  console.log('Inserting Disciplines...');
  const discInserts = Array.from(disciplines.entries()).map(([cod, name]) => ({ project_id: projectId, disciplina_cod: cod, disciplina_nombre: name }));
  await supabase.from('mining_disciplinas').insert(discInserts);

  console.log('Inserting CWPs...');
  for (let i = 0; i < cwpList.length; i += 1000) {
    const { error } = await supabase.from('mining_cwp').insert(cwpList.slice(i, i + 1000));
    if (error) console.error('Error inserting CWPs:', error);
  }

  console.log('Inserting PWPs...');
  for (let i = 0; i < pwpList.length; i += 1000) {
    const { error } = await supabase.from('mining_pwp').insert(pwpList.slice(i, i + 1000));
    if (error) console.error('Error inserting PWPs:', error);
  }

  console.log('Inserting Partidas...');
  for (let i = 0; i < partidas.length; i += 1000) {
    await supabase.from('mining_partidas').insert(partidas.slice(i, i + 1000));
  }

  console.log('Inserting Elementos...');
  await supabase.from('mining_elementos').delete().eq('project_id', projectId); // Ensure deleted before inserting
  for (let i = 0; i < elementos.length; i += 1000) {
    const { error } = await supabase.from('mining_elementos').insert(elementos.slice(i, i + 1000));
    if (error) console.error(`Error inserting Elementos (batch ${i}):`, error);
  }

  console.log('Done! All data imported successfully.');
}

main().catch(console.error);
