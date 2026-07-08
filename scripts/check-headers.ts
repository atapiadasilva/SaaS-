import xlsx from 'xlsx';

const path = 'C:\\Users\\atapiad\\EISA\\EIMI00416 - Ingeniería FEED_ - General\\03. AWP BIM\\01. Modelos\\03. Dashboard\\03. Modelo Final\\EPV1_DES_Base_Consolidada_RevC (3).xlsx';
const workbook = xlsx.readFile(path);
const sheet = workbook.Sheets['CONSOLIDADO'];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
let headerRowIdx = 3;
for (let i = headerRowIdx + 1; i < headerRowIdx + 10; i++) {
  const row = data[i] as any[];
  console.log(`Row ${i}: GUID=${row[16]}, MONIKER=${row[21]}`);
}
