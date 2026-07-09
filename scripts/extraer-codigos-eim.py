# Extrae el código interno EIM (ej: EIM-PRO-AMB-001-417) de la carátula de cada PDF
# local del contrato PRC25031 y arma el mapeo CMDIC -> interno en un CSV.
import os, re, json, sys
from pypdf import PdfReader

ROOTS = [
    r'C:\Users\atapiad\EISA\EIMI00417 - Puerto Collahuasi_ - General\11. AWP BIM\05. Exportaciones de Aconex',
    r'C:\Users\atapiad\OneDrive - EISA\Puerto Collhahuasi IA\03. Comunicacion por Aconex',
]
DOC_RE = re.compile(r'[0-9]+-[A-Z0-9]+-[0-9]+-[0-9]+-[A-Z]+-[0-9]+')
# Código interno EISA/EIM: EIM-XXX-YYY-NNN-NNN (tolerante a variantes EIMISA/EIMI y 2-4 bloques)
EIM_RE = re.compile(r'\bEIM[A-Z]{0,4}[-_][A-Z]{2,5}[-_][A-Z0-9]{2,5}[-_]\d{2,4}(?:[-_]\d{2,4})?\b')

# 1 archivo por código (primera aparición)
pdf_por_codigo = {}
for root in ROOTS:
    for dirpath, _, files in os.walk(root):
        for f in files:
            if not f.lower().endswith('.pdf'):
                continue
            for code in DOC_RE.findall(f):
                if 'PRC25031' in code and code not in pdf_por_codigo:
                    pdf_por_codigo[code] = os.path.join(dirpath, f)

print(f'PDFs PRC25031 a escanear: {len(pdf_por_codigo)}')

mapeo = {}
errores = 0
for i, (code, path) in enumerate(sorted(pdf_por_codigo.items())):
    try:
        reader = PdfReader(path)
        texto = ''
        for page in reader.pages[:2]:
            texto += page.extract_text() or ''
        m = EIM_RE.search(texto.upper().replace('–', '-'))
        if m:
            mapeo[code] = m.group(0).replace('_', '-')
    except Exception:
        errores += 1
    if (i + 1) % 100 == 0:
        print(f'  {i + 1} procesados, {len(mapeo)} con codigo EIM...')

print(f'\nTotal: {len(pdf_por_codigo)} PDFs, {len(mapeo)} con codigo interno EIM, {errores} ilegibles')
print('\nMuestras:')
for k, v in list(mapeo.items())[:10]:
    print(f'  {k} -> {v}')

out = r'C:\tmp\mapeo_eim.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump(mapeo, f, ensure_ascii=False, indent=1)
print(f'\nGuardado: {out}')

csv_out = os.path.join(os.environ.get('USERPROFILE', '.'), 'Downloads', 'mapeo_cmdic_eim.csv')
with open(csv_out, 'w', encoding='utf-8-sig') as f:
    f.write('n_cmdic,n_interno_eim\n')
    for k, v in sorted(mapeo.items()):
        f.write(f'{k},{v}\n')
print(f'CSV: {csv_out}')
