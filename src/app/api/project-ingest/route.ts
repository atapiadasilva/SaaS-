import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Ingesta de datos del onboarding. El cliente sube el archivo, mapea columnas (CWP es la clave)
// y envía filas normalizadas. Aquí se insertan en la tabla destino, scopeadas al proyecto.
// POST { project_id, entidad: 'cwp'|'programa'|'itemizado', filas: [{...}], reemplazar?:bool }

type Entidad = 'cwp' | 'programa' | 'itemizado';
const TABLA: Record<Entidad, string> = { cwp: 'mining_cwp', programa: 'mining_programa', itemizado: 'mining_itemizado' };

const num = (v: any) => { const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; };
const fecha = (v: any) => {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = s.match(/(\d{2})[/-](\d{2})[/-](\d{4})/); if (d) return `${d[3]}-${d[2]}-${d[1]}`;
  return null;
};

function fila(entidad: Entidad, pid: string, r: any): Record<string, any> | null {
  const cwp = String(r.cwp_id ?? '').trim() || null;
  if (entidad === 'cwp') {
    if (!cwp) return null;
    return { project_id: pid, cwp_id: cwp, cwp_nombre: r.cwp_nombre ?? null, ewp_id: r.ewp_id ?? (cwp + 'E'),
      cwa_id: r.cwa_id ?? null, cv_id: r.cv_id ?? null, disciplina_cod: r.disciplina_cod ?? null,
      disciplina: r.disciplina ?? null, es_oficial: true };
  }
  if (entidad === 'programa') {
    const cod = String(r.cod_actividad ?? '').trim(); if (!cod) return null;
    return { project_id: pid, cod_actividad: cod, nombre_actividad: r.nombre_actividad ?? null,
      hh: num(r.hh), fecha_inicio: fecha(r.fecha_inicio), fecha_fin: fecha(r.fecha_fin),
      cwp_id: cwp, fuente: 'P333' };
  }
  // itemizado
  const item = String(r.item ?? '').trim(); if (!item) return null;
  return { project_id: pid, item, descripcion: r.descripcion ?? null, unidad: r.unidad ?? null,
    cantidad: num(r.cantidad), hh_unidad: num(r.hh_unidad), hh_item: num(r.hh_item),
    cwp_id: cwp, partida_bmp: r.partida_bmp ?? null, commodity: r.commodity ?? null };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, entidad, filas, reemplazar } = await req.json();
  if (!project_id || !entidad || !TABLA[entidad as Entidad]) return NextResponse.json({ error: 'Faltan project_id/entidad' }, { status: 400 });
  if (!Array.isArray(filas)) return NextResponse.json({ error: 'filas debe ser arreglo' }, { status: 400 });
  const sb = supabase as any;
  const tabla = TABLA[entidad as Entidad];

  const rows = filas.map((r: any) => fila(entidad as Entidad, project_id, r)).filter(Boolean);
  if (!rows.length) return NextResponse.json({ error: 'No hay filas válidas (revisa el mapeo de la columna clave).' }, { status: 400 });

  if (reemplazar !== false) await sb.from(tabla).delete().eq('project_id', project_id);

  let insertadas = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(tabla).insert(rows.slice(i, i + 500));
    if (error) return NextResponse.json({ error: `Error insertando: ${error.message}`, insertadas }, { status: 500 });
    insertadas += Math.min(500, rows.length - i);
  }
  return NextResponse.json({ ok: true, insertadas, sin_cwp: rows.filter((r: any) => !r.cwp_id).length });
}
