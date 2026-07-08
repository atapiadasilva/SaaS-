import * as xlsx from 'xlsx';

const filePath = String.raw`C:\Users\atapiad\EISA\EIMI00416 - Ingeniería FEED_ - General\03. AWP BIM\01. Modelos\03. Dashboard\03. Modelo Final\EPV1_DES_Base_Consolidada_RevC (3).xlsx`;

console.log('Reading file:', filePath);
const workbook = xlsx.readFile(filePath, { sheetRows: 5 });

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  if (json.length > 0) {
    console.log(`\n=== Sheet: ${sheetName} ===`);
    console.log(json.slice(0, 5));
  }
}
