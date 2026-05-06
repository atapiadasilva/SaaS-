"""
Import: Programa CCSS_TRANSELEC_MONTEMINA REV F 01.04.26
Outputs JSON batches ready for Supabase insert.
Total leaf HH = 293,100
"""
import openpyxl
import json
import re
import sys

XLSX = r'C:/Users/atapiad/Downloads/Programa CCSS_TRANSELEC_MONTEMINA en trabajo WBS_REV F  01.04.26.xlsx'
PROJECT_ID = '39ce1776-17e2-4b27-8a52-8066b31ffae6'

SPANISH_DAY_PREFIX = ['lun ', 'mar ', 'mié ', 'jue ', 'vie ', 'sáb ', 'dom ', 'mie ', 'sab ']

def parse_date(s):
    if not s:
        return None
    s = str(s).strip()
    sl = s.lower()
    for pfx in SPANISH_DAY_PREFIX:
        if sl.startswith(pfx):
            s = s[len(pfx):].strip()
            break
    # format: DD-MM-YY
    try:
        parts = s.split('-')
        if len(parts) == 3:
            d, m, y = int(parts[0]), int(parts[1]), int(parts[2])
            if y < 100:
                y += 2000
            return f"{y:04d}-{m:02d}-{d:02d}"
    except Exception:
        pass
    return None

def parse_hh(v):
    if v is None:
        return 0
    s = str(v).replace(',', '').replace(' ', '').strip()
    try:
        return float(s)
    except Exception:
        return 0

def get_parent_wbs(wbs):
    if not wbs or '.' not in str(wbs):
        return None
    parts = str(wbs).split('.')
    if len(parts) <= 1:
        return None
    return '.'.join(parts[:-1])

# ── Discipline rules (order matters — most specific first) ──────────────────
def assign_discipline(nombre, wbs, is_summary):
    if is_summary:
        return None
    n = (nombre or '').lower()

    # Puesta en Servicio (WBS 6.x or keywords)
    if wbs.startswith('6') or any(k in n for k in [
        'prueba', 'puesta en servicio', 'energiz', ' sat', 'comision',
        'dinám', 'estátic', 'funcional', 'precomis'
    ]):
        return 'Puesta en Servicio'

    # Gestión / Hitos (WBS 1-4 or milestone keywords)
    if wbs.split('.')[0] in ('0', '1', '2', '3', '4') or any(k in n for k in [
        'hito', 'procurement', 'permiso', 'convenio', 'ingeniería', 'licitac'
    ]):
        return 'Gestión'

    # Instalaciones Preliminares
    if any(k in n for k in [
        'instalaciones preliminares', 'movilización', 'bodega', 'oficina',
        'cerco perimetral', 'faena', 'preliminar', 'instalación campamento'
    ]):
        return 'Instalaciones Preliminares'

    # Telecomunicaciones
    if any(k in n for k in [
        'fibra óptica', 'fibra optica', 'telecomunic', 'scada',
        'comunicac', 'radiocomunic'
    ]):
        return 'Telecomunicaciones'

    # Instrumentación y Control
    if any(k in n for k in [
        'protección', 'tablero de protec', 'control y protec', 'c&p',
        'instrumentac', 'armario c&', 'sistema de control', 'rele',
        'iec 61850'
    ]):
        return 'Instrumentación y Control'

    # Mecánica (condensadores sincrónicos, machinery, piping)
    if any(k in n for k in [
        'rotor', 'estator', 'condensador sincro', ' ccss', 'montaje ccss',
        'refrigerac', 'lubricac', 'bomba', 'cañería', 'tubería', 'hvac',
        'sala mecánic', 'sistema de aceite', 'sistema de agua', 'ventilac',
        'excitatriz', 'montaje equipo', 'izaje', 'sistema hidráulic'
    ]):
        return 'Mecánica'

    # Eléctrica (AT / MT / BT, earthing, switchgear, cable)
    if any(k in n for k in [
        'conductor', 'cable', 'tendido', 'conexionado', 'mufa', 'empalme',
        'gis ', 'disyuntor', 'seccionador', 'transformador', 'aislador',
        'tablero eléc', 'armario eléc', 'armario de',
        ' at ', ' bt ', ' mt ', '/at', '/bt', '/mt',
        'puesta a tierra', 'malla puesta', ' mpt', 'aterramient',
        'electroducto', 'bandeja portacable', 'charola', 'canalización eléc',
        'luminaria', 'alumbrado', 'alimentador', 'sistema eléc',
        'panel eléc', 'celda', 'barra colectora'
    ]):
        return 'Eléctrica'

    # Estructuras (steel, buildings, enclosures)
    if any(k in n for k in [
        'estructura metálica', 'estructura de acero', 'estructura soporte',
        'marco línea', 'galería', 'cerramiento', 'cubierta', 'mezzanine',
        'sala eléctrica', 'sala control', 'sala baterías',
        'edificio', 'construcción sala', 'obra civil sala',
        'techo', 'pórtico', 'celosía'
    ]):
        return 'Estructuras'

    # Civil (earthworks, foundations, concrete, roads, drainage)
    if any(k in n for k in [
        'fundación', 'fundacion', 'escarpe', 'corte', 'relleno',
        'plataforma', 'terrapl', 'drenaje', 'canaleta', 'pavimento',
        'camino', 'zanja', 'hormigón', 'hormigon', 'excavac',
        'movimiento de tierra', 'tierra armada', 'acceso',
        'muro de contención', 'sostenimiento', 'talud', 'trinchera',
        'radier', 'losa', 'pilote', 'micropilote', 'entibación',
        'sello', 'impermeabilizac'
    ]):
        return 'Civil'

    # Fallback by WBS section
    if wbs.startswith('5.1'):
        return 'Instalaciones Preliminares'
    if wbs.startswith('5.3'):
        return 'Eléctrica'   # Enlace soterrado = underground HV cable
    if wbs.startswith('5.5'):
        return 'Civil'       # Áreas comunes

    # Last resort
    return 'Civil'


def main():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb['Hoja1']

    raw_rows = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue  # header
        edt, _id, nombre, trabajo, duracion, comienzo, fin = (
            row[0], row[1], row[2], row[3], row[4], row[5], row[6]
        )
        if edt is None:
            continue
        raw_rows.append({
            'wbs': str(edt).strip(),
            'nombre': str(nombre).strip() if nombre else '',
            'hh_raw': trabajo,
            'dur_str': str(duracion).strip() if duracion else '',
            'start_raw': comienzo,
            'end_raw': fin,
            'sort': i,
        })

    # Build set of all WBS codes to detect parents
    all_wbs_set = {r['wbs'] for r in raw_rows}

    def has_children(wbs):
        prefix = wbs + '.'
        return any(w.startswith(prefix) for w in all_wbs_set if w != wbs)

    records = []
    for r in raw_rows:
        wbs = r['wbs']
        is_sum = has_children(wbs)
        is_ms  = r['dur_str'] == '0 d'
        hh     = parse_hh(r['hh_raw'])
        disc   = assign_discipline(r['nombre'], wbs, is_sum)

        records.append({
            'project_id':     PROJECT_ID,
            'wbs_code':       wbs,
            'description':    r['nombre'],
            'hh':             hh,
            'start_date':     parse_date(r['start_raw']),
            'end_date':       parse_date(r['end_raw']),
            'is_summary':     is_sum,
            'is_milestone':   is_ms,
            'parent_wbs':     get_parent_wbs(wbs),
            'sort_order':     r['sort'],
            'discipline':     disc,
            'status':         'pending',
            'progress':       0,
            'program_source': 'CCSS_REV_F_01.04.26',
        })

    # Stats
    leaf_hh = sum(r['hh'] for r in records if not r['is_summary'])
    by_disc = {}
    for r in records:
        if not r['is_summary']:
            d = r['discipline'] or 'Sin disciplina'
            by_disc[d] = by_disc.get(d, 0) + r['hh']

    print(f"Total filas: {len(records)}", file=sys.stderr)
    print(f"Summaries:   {sum(1 for r in records if r['is_summary'])}", file=sys.stderr)
    print(f"Milestones:  {sum(1 for r in records if r['is_milestone'])}", file=sys.stderr)
    print(f"Leaf HH sum: {leaf_hh:,.0f} (esperado: 293,100)", file=sys.stderr)
    print(f"\nHH por Disciplina:", file=sys.stderr)
    for d, hh in sorted(by_disc.items(), key=lambda x: -x[1]):
        print(f"  {d:<35} {hh:>10,.0f} HH", file=sys.stderr)

    # Output JSON for SQL insert (stdout)
    print(json.dumps(records, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
