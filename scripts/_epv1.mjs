import * as XLSX from 'xlsx';
import fs from 'node:fs';
const f = "C:/Users/atapiad/EISA/EIMI00416 - Ingeniería FEED_ - General/03. AWP BIM/01. Modelos/03. Dashboard/01. CWA/CWA.xlsx";
const wb = XLSX.read(fs.readFileSync(f), {type:'buffer'});
const s1 = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { defval:'', raw:false });
const cols = Object.keys(s1[0]);
const kCwp = cols.find(c => c.trim() === 'CWP');
const kMon = cols.find(c => /moniker/i.test(c));
const cwps = new Map();
for (const r of s1) { const c = String(r[kCwp]??'').trim(); if (c) cwps.set(c, (cwps.get(c)??0)+1); }
console.log(`Sheet1: ${s1.length} filas · columna CWP="${kCwp}" · moniker="${(kMon||'').replace(/\n/g,' ')}"`);
console.log(`CWP distintos: ${cwps.size}`);
console.log('Muestra:', [...cwps].slice(0,10).map(([k,v])=>`${k}(${v})`).join(' · '));
const conMon = s1.filter(r => String(r[kMon]??'').trim()).length;
console.log(`Filas con moniker: ${conMon}`);
// CWP del modelo APS de EPV1
const props = 'graphify-out/props-Modelo_EPV1_(28-26-26).nwd.json';
if (fs.existsSync(props)) {
  const filas = JSON.parse(fs.readFileSync(props,'utf8'));
  const delModelo = new Map();
  for (const x of filas) { const c = String(x['EIMI_EPV1::CWP 1']??'').trim(); if (c) delModelo.set(c,(delModelo.get(c)??0)+1); }
  console.log(`\nModelo APS: ${delModelo.size} CWP distintos en EIMI_EPV1::CWP 1`);
  console.log('Muestra:', [...delModelo].slice(0,8).map(([k,v])=>`${k}(${v})`).join(' · '));
  const enAmbos = [...delModelo.keys()].filter(c => cwps.has(c));
  console.log(`Coinciden con CWA.xlsx: ${enAmbos.length}`);
}
