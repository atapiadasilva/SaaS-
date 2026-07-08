import * as xlsx from 'xlsx';

const files = [
  String.raw`C:\Users\atapiad\Downloads\2492 - Form Eco EPC 240626 ESG - rev 1.xlsx`,
  String.raw`C:\Users\atapiad\Downloads\Formularios Económicos EPC_6674.xlsx`
];

for (const filePath of files) {
  try {
    console.log('\n================================');
    console.log('Reading file:', filePath);
    const workbook = xlsx.readFile(filePath, { sheetRows: 15 });

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      if (json.length > 0) {
        console.log(`\n--- Sheet: ${sheetName} ---`);
        // Just print the first 10 rows to understand the structure
        console.log(json.slice(0, 10));
      }
    }
  } catch (err) {
    console.error('Error reading file:', filePath, err.message);
  }
}
