"""Extrae actividades (hoja 3WLA) y restricciones (hoja Log Restricciones) de TODOS los
programas trisemanales de una carpeta, y escribe dos JSON combinados (con fecha_control por fila).

Uso: python parse-3wla.py <carpeta_trisemanales> [out_acts.json] [out_restr.json]
"""
import zipfile, re, json, datetime, sys, glob, os
import xml.etree.ElementTree as ET

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

CARPETA = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\atapiad\EISA\EIMI00417 - Puerto Collahuasi_ - General\02.Oficina Técnica\02. Planificacion\02.- Trisemanal'
OUT_ACTS = sys.argv[2] if len(sys.argv) > 2 else r'C:\tmp\trisemanal_acts_all.json'
OUT_RESTR = sys.argv[3] if len(sys.argv) > 3 else r'C:\tmp\trisemanal_restr_all.json'

def col(ref): return re.match(r'([A-Z]+)', ref).group(1)
def xldate(v):
    try: return (datetime.date(1899,12,30) + datetime.timedelta(days=int(float(v)))).isoformat()
    except: return None
def numf(v):
    try: return round(float(v), 3)
    except: return None

def load_ss(z):
    ss = []
    try:
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall(f'{M}si'):
            ss.append(''.join(t.text or '' for t in si.iter(f'{M}t')))
    except KeyError: pass
    return ss

def sheet_by_name(z, name):
    wbx = ET.fromstring(z.read('xl/workbook.xml'))
    rid = None
    for s in wbx.iter(f'{M}sheet'):
        if s.get('name') == name: rid = s.get(f'{R}id')
    if not rid: return None
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    target = {r.get('Id'): r.get('Target') for r in rels}[rid]
    return ET.fromstring(z.read('xl/' + target))

def val(c, ss):
    t = c.get('t')
    if t == 'inlineStr': return ''.join(x.text or '' for x in c.iter(f'{M}t'))
    v = c.find(f'{M}v')
    if v is None or v.text is None: return ''
    if t == 's': return ss[int(v.text)]
    return v.text

def rows_of(sheet, ss):
    out = []
    for r in sheet.findall(f'.//{M}row'):
        cells = {}
        for c in r.findall(f'{M}c'):
            ref = c.get('r','')
            if ref: cells[col(ref)] = val(c, ss)
        out.append(cells)
    return out

def tipo_restr(d):
    if re.search(r'plano|rfi|ingenier|formaliz|document', d, re.I): return 'Ingeniería'
    if re.search(r'instructivo|prevenci|permiso|segurid', d, re.I): return 'Seguridad'
    if re.search(r'acredita|cami|operador|maquin|gr[uú]a', d, re.I): return 'Maquinaria/Equipo'
    if re.search(r'suministro|material', d, re.I): return 'Suministro'
    if re.search(r'liberaci|[aá]rea', d, re.I): return 'Liberación de área'
    return 'Otro'

all_acts, all_restr = [], []
files = sorted(glob.glob(os.path.join(CARPETA, '*.xlsx')))
print(f'Archivos trisemanal: {len(files)}')
for path in files:
    m = re.search(r'(\d{8})', os.path.basename(path))
    if not m:
        print(f'  SKIP (sin fecha): {os.path.basename(path)}'); continue
    d = m.group(1)
    fecha = f'{d[:4]}-{d[4:6]}-{d[6:8]}'
    z = zipfile.ZipFile(path)
    ss = load_ss(z)
    sh = sheet_by_name(z, '3WLA')
    n_a = 0
    if sh is not None:
        for cells in rows_of(sh, ss):
            idp6 = str(cells.get('B','')).strip()
            nombre = str(cells.get('F','')).strip()
            if not (idp6.startswith('P333') and nombre and nombre not in ('TOTAL','HITOS','Actividad')): continue
            all_acts.append({'fecha_control': fecha, 'id_p6': idp6, 'id_3wla': str(cells.get('C','')).strip() or None,
                'actividad': nombre, 'especialidad': str(cells.get('T','')).strip() or None,
                'commodity': str(cells.get('U','')).strip() or None, 'alcance': str(cells.get('S','')).strip() or None,
                'wbs': str(cells.get('V','')).strip() or None, 'unidad': str(cells.get('G','')).strip() or None,
                'cantidad': numf(cells.get('I','')), 'hh_total': numf(cells.get('K','')),
                'fecha_ini': xldate(cells.get('X','')), 'fecha_fin': xldate(cells.get('Y','')),
                'hh_sem1': numf(cells.get('CQ','')), 'hh_sem2': numf(cells.get('DA','')), 'hh_sem3': numf(cells.get('DK',''))})
            n_a += 1
    shr = sheet_by_name(z, 'Log Restricciones')
    n_r = 0
    if shr is not None:
        for cells in rows_of(shr, ss):
            idp6 = str(cells.get('C','')).replace('\n','').strip()
            desc = str(cells.get('B','')).strip()
            if not (idp6.startswith('P333') and desc): continue
            all_restr.append({'fecha_control': fecha, 'id_p6': idp6, 'descripcion': desc, 'tipo': tipo_restr(desc),
                'actividad_p6': str(cells.get('D','')).strip() or None, 'fecha_identificacion': xldate(cells.get('E','')),
                'fecha_compromiso': xldate(cells.get('F','')), 'responsable': str(cells.get('G','')).strip() or None,
                'entidad': str(cells.get('H','')).strip() or None, 'status': str(cells.get('I','')).strip() or None,
                'fecha_cierre': xldate(cells.get('J','')), 'observacion': str(cells.get('K','')).strip() or None})
            n_r += 1
    print(f'  {fecha}: {n_a} act, {n_r} restr  ({os.path.basename(path)})')

json.dump(all_acts, open(OUT_ACTS,'w',encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(all_restr, open(OUT_RESTR,'w',encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'\nTOTAL: {len(all_acts)} actividades, {len(all_restr)} restricciones')
