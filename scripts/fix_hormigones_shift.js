const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public', 'costanera');

// The shift mapping for CWAs based on user feedback
// Concrete Model -> Architecture Model
const CWA_SHIFT = {
  'CWA-F00': 'CWA-S03', // Fundaciones -> Subte 3
  'CWA-S03': 'CWA-S02', // Subte 3 -> Subte 2
  'CWA-S02': 'CWA-S01', // Subte 2 -> Subte 1
  'CWA-S01': 'CWA-P01', // Subte 1 -> Piso 1
  'CWA-P01': 'CWA-P02', // Piso 1 -> Piso 2
  'CWA-P02': 'CWA-P03',
  'CWA-P03': 'CWA-P04',
  'CWA-P04': 'CWA-P05',
  'CWA-P05': 'CWA-P06',
  'CWA-P06': 'CWA-P07',
  'CWA-P07': 'CWA-P08',
  'CWA-P08': 'CWA-P09',
  'CWA-P09': 'CWA-P10',
  'CWA-P10': 'CWA-P11',
  'CWA-P11': 'CWA-P12',
  'CWA-P12': 'CWA-P13',
  'CWA-P13': 'CWA-P14',
  'CWA-P14': 'CWA-P15',
  'CWA-P15': 'CWA-P16',
  'CWA-P16': 'CWA-P17' // Or maybe CWA-SM? We'll see.
};

const NOMBRE_CWA_SHIFT = {
  'CWA-S03': 'Subterraneo -3',
  'CWA-S02': 'Subterraneo -2',
  'CWA-S01': 'Subterraneo -1',
  'CWA-P01': 'Piso 01',
  'CWA-P02': 'Piso 02',
  'CWA-P03': 'Piso 03',
  'CWA-P04': 'Piso 04',
  'CWA-P05': 'Piso 05',
  'CWA-P06': 'Piso 06',
  'CWA-P07': 'Piso 07',
  'CWA-P08': 'Piso 08',
  'CWA-P09': 'Piso 09',
  'CWA-P10': 'Piso 10',
  'CWA-P11': 'Piso 11',
  'CWA-P12': 'Piso 12',
  'CWA-P13': 'Piso 13',
  'CWA-P14': 'Piso 14',
  'CWA-P15': 'Piso 15',
  'CWA-P16': 'Piso 16',
  'CWA-P17': 'Sala de Máquinas' // Assuming
};

function getNewId(oldId, newCwa) {
  // PWP-F00-ES-01 -> PWP-S03-ES-01
  const parts = oldId.split('-');
  if (parts.length >= 3) {
    // newCwa is like CWA-S03
    const cwaCode = newCwa.replace('CWA-', '');
    parts[1] = cwaCode;
    return parts.join('-');
  }
  return oldId;
}

// 1. Process hormigones.json
const hormigonesPath = path.join(publicDir, 'hormigones.json');
const hormigones = JSON.parse(fs.readFileSync(hormigonesPath, 'utf8'));

// We need a mapping from old PWP ID to new PWP ID for the other files
const pwpIdMap = {};

hormigones.pwps = hormigones.pwps.map(p => {
  const oldCwa = p.cwa;
  const newCwa = CWA_SHIFT[oldCwa] || oldCwa;
  const newNombre = NOMBRE_CWA_SHIFT[newCwa] || p.nombreCWA;
  const newId = getNewId(p.id, newCwa);
  
  pwpIdMap[p.id] = newId;
  
  return {
    ...p,
    id: newId,
    cwa: newCwa,
    nombreCWA: newNombre
  };
});

fs.writeFileSync(hormigonesPath, JSON.stringify(hormigones, null, 2));
console.log('Updated hormigones.json');

// 2. Process guid-by-estructura-pwp.json
const pwpPath = path.join(publicDir, 'guid-by-estructura-pwp.json');
const pwpGuids = JSON.parse(fs.readFileSync(pwpPath, 'utf8'));
const newPwpGuids = {};

for (const [oldId, guids] of Object.entries(pwpGuids)) {
  const newId = pwpIdMap[oldId] || oldId;
  newPwpGuids[newId] = guids;
}

fs.writeFileSync(pwpPath, JSON.stringify(newPwpGuids, null, 2));
console.log('Updated guid-by-estructura-pwp.json');

// 3. Process guid-by-estructura-cwa.json
const cwaPath = path.join(publicDir, 'guid-by-estructura-cwa.json');
const cwaGuids = JSON.parse(fs.readFileSync(cwaPath, 'utf8'));
const newCwaGuids = {};

for (const [oldCwa, guids] of Object.entries(cwaGuids)) {
  const newCwa = CWA_SHIFT[oldCwa] || oldCwa;
  // If multiple old CWAs map to the same new CWA, merge their arrays
  if (!newCwaGuids[newCwa]) {
    newCwaGuids[newCwa] = [];
  }
  newCwaGuids[newCwa] = newCwaGuids[newCwa].concat(guids);
}

fs.writeFileSync(cwaPath, JSON.stringify(newCwaGuids, null, 2));
console.log('Updated guid-by-estructura-cwa.json');
