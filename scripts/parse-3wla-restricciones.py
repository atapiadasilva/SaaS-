import zipfile, re, json, datetime
from xml.etree import ElementTree as ET

path = r'C:\Users\atapiad\EISA\EIMI00417 - Puerto Collahuasi_ - General\02.Oficina Técnica\02. Planificacion\02.- Trisemanal\PROGRAMA TRISEMANAL CONTRATO-PRC25031 20260718 - CMDIC.xlsx'
M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
z = zipfile.ZipFile(path)
ss = []
root = ET.fromstring(z.read('xl/sharedStrings.xml'))
for si in root.findall(f'{M}si'):
    ss.append(''.join(t.text or '' for t in si.iter(f'{M}t')))
rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
rid2t = {r.get('Id'): r.get('Target') for r in rels}
wb = ET.fromstring(z.read('xl/workbook.xml'))
rid = [s.get(f'{{http://schemas.openxmlformats.org/officeDocument/2006/relationships}}id')
       for s in wb.iter(f'{M}sheet') if s.get('name') == 'Log Restricciones'][0]
sheet = ET.fromstring(z.read('xl/' + rid2t[rid]))

def col(ref): return re.match(r'([A-Z]+)', ref).group(1)
def val(c):
    t = c.get('t')
    if t == 'inlineStr': return ''.join(x.text or '' for x in c.iter(f'{M}t'))
    v = c.find(f'{M}v')
    if v is None or v.text is None: return ''
    if t == 's': return ss[int(v.text)]
    return v.text
def xldate(v):
    try: return (datetime.date(1899,12,30) + datetime.timedelta(days=int(float(v)))).isoformat()
    except: return None

def clasificar(desc):
    d = (desc or '').lower()
    if 'plano' in d or 'rfi' in d or 'ingenier' in d or 'formaliz' in d or 'document' in d: return 'Ingeniería'
    if 'instructivo' in d or 'prevenci' in d or 'permiso' in d or 'segurid' in d: return 'Seguridad'
    if 'acredita' in d or 'cami' in d or 'operador' in d or 'maquin' in d: return 'Maquinaria/Equipo'
    if 'suministro' in d or 'material' in d: return 'Suministro'
    if 'liberaci' in d or 'área' in d or 'area' in d: return 'Liberación de área'
    return 'Otro'

restr = []
for r in sheet.findall(f'.//{M}row'):
    cells = {}
    for c in r.findall(f'{M}c'):
        ref = c.get('r','')
        if ref: cells[col(ref)] = val(c)
    idp6 = str(cells.get('C','')).replace('\n','').strip()
    desc = str(cells.get('B','')).strip()
    if not (idp6.startswith('P333') and desc):
        continue
    restr.append({
        'id_p6': idp6,
        'descripcion': desc,
        'tipo': clasificar(desc),
        'actividad_p6': str(cells.get('D','')).strip() or None,
        'fecha_identificacion': xldate(cells.get('E','')),
        'fecha_compromiso': xldate(cells.get('F','')),
        'responsable': str(cells.get('G','')).strip() or None,
        'entidad': str(cells.get('H','')).strip() or None,
        'status': str(cells.get('I','')).strip() or None,
        'fecha_cierre': xldate(cells.get('J','')),
        'observacion': str(cells.get('K','')).strip() or None,
    })

print(f'Restricciones: {len(restr)}')
for x in restr:
    print(f"  [{x['tipo']:<18}] {x['id_p6']:<22} {x['status']:<8} {x['entidad']:<7} | {x['descripcion'][:45]}")
json.dump(restr, open(r'C:\tmp\trisemanal_restricciones.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'\nGuardado C:\\tmp\\trisemanal_restricciones.json')
