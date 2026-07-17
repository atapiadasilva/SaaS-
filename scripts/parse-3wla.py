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
       for s in wb.iter(f'{M}sheet') if s.get('name') == '3WLA'][0]
sheet = ET.fromstring(z.read('xl/' + rid2t[rid]))

def col(ref): return re.match(r'([A-Z]+)', ref).group(1)
def val(c):
    t = c.get('t')
    if t == 'inlineStr': return ''.join(x.text or '' for x in c.iter(f'{M}t'))
    v = c.find(f'{M}v')
    if v is None or v.text is None: return ''
    if t == 's': return ss[int(v.text)]
    return v.text
def num(v):
    try: return round(float(v), 3)
    except: return None
def xldate(v):
    try: return (datetime.date(1899,12,30) + datetime.timedelta(days=int(float(v)))).isoformat()
    except: return None

RESTR = {'DM':'Ingeniería/RFI','DN':'Seguridad/Permisos','DO':'Liberación de área','DP':'Suministro',
         'DQ':'Mano de obra','DR':'Maquinaria','DS':'Equipos y herramientas','DT':'Mano de obra 2',
         'DU':'Clima','DV':'Otro'}

acts = []
for r in sheet.findall(f'.//{M}row'):
    cells = {}
    for c in r.findall(f'{M}c'):
        ref = c.get('r','')
        if ref: cells[col(ref)] = val(c)
    idp6 = str(cells.get('B','')).strip()
    nombre = str(cells.get('F','')).strip()
    # actividad real: tiene nombre y un ID P6 en formato P333
    if not (idp6.startswith('P333') and nombre and nombre not in ('TOTAL','HITOS','Actividad')):
        continue
    restricciones = [lbl for c, lbl in RESTR.items() if str(cells.get(c,'')).strip()]
    acts.append({
        'id_p6': idp6,
        'id_3wla': str(cells.get('C','')).strip() or None,
        'actividad': nombre,
        'especialidad': str(cells.get('T','')).strip() or None,
        'commodity': str(cells.get('U','')).strip() or None,
        'alcance': str(cells.get('S','')).strip() or None,
        'wbs': str(cells.get('V','')).strip() or None,
        'unidad': str(cells.get('G','')).strip() or None,
        'cantidad': num(cells.get('I','')),
        'hh_total': num(cells.get('K','')),
        'fecha_ini': xldate(cells.get('X','')),
        'fecha_fin': xldate(cells.get('Y','')),
        'hh_sem1': num(cells.get('CQ','')),
        'hh_sem2': num(cells.get('DA','')),
        'hh_sem3': num(cells.get('DK','')),
        'restricciones': restricciones,
        'fecha_levant': xldate(cells.get('DW','')),
        'responsable': str(cells.get('DX','')).strip() or None,
        'observacion': str(cells.get('DY','')).strip() or None,
    })

print(f'Actividades 3WLA: {len(acts)}')
print(f'Con restricciones: {sum(1 for a in acts if a["restricciones"])}')
print(f'HH total sumadas: {sum(a["hh_total"] or 0 for a in acts):,.0f}')
print()
for a in acts:
    r = f" [{', '.join(a['restricciones'])}]" if a['restricciones'] else ''
    print(f"  {a['id_p6']:<22} HH={str(a['hh_total'] or ''):<8} {a['fecha_ini'] or '?'}->{a['fecha_fin'] or '?'} | {a['actividad'][:40]}{r}")

json.dump(acts, open(r'C:\tmp\trisemanal_3wla_full.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'\nGuardado C:\\tmp\\trisemanal_3wla_full.json ({len(acts)} actividades)')
