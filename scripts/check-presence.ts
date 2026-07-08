import xlsx from 'xlsx';

const path = 'C:\\Users\\atapiad\\EISA\\EIMI00416 - Ingeniería FEED_ - General\\03. AWP BIM\\01. Modelos\\03. Dashboard\\03. Modelo Final\\EPV1_DES_Base_Consolidada_RevC (3).xlsx';
const workbook = xlsx.readFile(path);
const sheet = workbook.Sheets['CONSOLIDADO'];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
let headerRowIdx = 3;

let both = 0;
let guidOnly = 0;
let monikerOnly = 0;
let none = 0;

for (let i = headerRowIdx + 1; i < data.length; i++) {
  const row = data[i] as any[];
  const guid = row[16] ? String(row[16]).trim() : null;
  const moniker = row[21] ? String(row[21]).trim() : null;
  
  if (guid && moniker && moniker !== '0') both++;
  else if (guid) guidOnly++;
  else if (moniker && moniker !== '0') monikerOnly++;
  else none++;
}
console.log(`Both: ${both}, GUID only: ${guidOnly}, MONIKER only: ${monikerOnly}, None: ${none}`);
