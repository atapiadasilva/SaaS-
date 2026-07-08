import * as xlsx from 'xlsx';

const filePath = String.raw`C:\Users\atapiad\EISA\EIMI00416 - Ingeniería FEED_ - General\03. AWP BIM\01. Modelos\03. Dashboard\03. Modelo Final\EPV1_DES_Base_Consolidada_RevC (3).xlsx`;

function check() {
  const workbook = xlsx.readFile(filePath);
  const consSheet = workbook.Sheets['CONSOLIDADO'];
  const consData: any[] = xlsx.utils.sheet_to_json(consSheet, { header: 1 });
  
  // Find the header row (probably row 0, 1, 2, or 3)
  for (let i = 0; i < 4; i++) {
    console.log(`Row ${i}:`, consData[i]);
  }
}
check();
