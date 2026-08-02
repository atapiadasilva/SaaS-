import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cargarBanco } from '@/lib/cwp-banco';

// GET /api/mining-cwp-banco?project_id=&cwp_id=
//
// Todo lo que la sesión de Pull Planning necesita para quebrar un CWP: el banco de
// cantidades con su saldo (paso 2), las zonas físicas que el modelo 3D puede ofrecer para
// cortar por adyacencia (paso 4) y el catálogo de turnos y cuadrillas que dimensiona los
// paquetes. Una sola llamada, porque el asistente no sirve de nada a medias.

const n = (v: unknown) => Number(v ?? 0) || 0;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const cwpId = params.get('cwp_id');
  if (!projectId || !cwpId) return NextResponse.json({ error: 'Missing project_id/cwp_id' }, { status: 400 });

  const sb = supabase as any;

  const [cwpRes, turnoRes, cuadrillaRes, elemRes, banco] = await Promise.all([
    sb.from('mining_cwp')
      .select('cwp_id, cwp_nombre, disciplina, disciplina_cod, hh_planner, fecha_ini, fecha_fin')
      .eq('project_id', projectId).eq('cwp_id', cwpId).maybeSingle(),
    sb.from('mining_turno').select('*').eq('project_id', projectId).eq('activo', true)
      .order('es_default', { ascending: false }).order('codigo'),
    sb.from('mining_cuadrilla').select('*').eq('project_id', projectId).eq('activa', true).order('codigo'),
    sb.from('mining_elementos')
      .select('sector, area_unidad, elevacion, sistema_servicio, peso_kg')
      .eq('project_id', projectId).eq('cwp_id', cwpId).limit(20000),
    cargarBanco(sb, projectId, cwpId),
  ]);

  if (cwpRes.error) return NextResponse.json({ error: cwpRes.error.message }, { status: 500 });
  if (!cwpRes.data) return NextResponse.json({ error: `El CWP ${cwpId} no existe en este proyecto` }, { status: 404 });

  // ── Zonas del modelo, para el quiebre por adyacencia ──
  // Se ofrecen sólo las dimensiones que el modelo alcanzó a poblar con al menos dos valores:
  // una dimensión con un solo valor no parte nada.
  const elementos = elemRes.data ?? [];
  const dimensiones: { clave: string; label: string; zonas: { clave: string; nombre: string; peso: number; n: number }[] }[] = [];

  for (const d of [
    { campo: 'sector', label: 'Sector' },
    { campo: 'area_unidad', label: 'Área / unidad' },
    { campo: 'sistema_servicio', label: 'Sistema' },
  ]) {
    const m = new Map<string, { peso: number; n: number }>();
    for (const e of elementos) {
      const k = (e as any)[d.campo];
      if (!k) continue;
      const cur = m.get(k) ?? { peso: 0, n: 0 };
      cur.peso += n((e as any).peso_kg);
      cur.n += 1;
      m.set(k, cur);
    }
    if (m.size >= 2) {
      dimensiones.push({
        clave: d.campo, label: d.label,
        zonas: [...m.entries()]
          // Sin peso en el modelo, la cantidad de elementos es un proxy razonable del alcance.
          .map(([clave, v]) => ({ clave, nombre: clave, peso: v.peso > 0 ? Math.round(v.peso) : v.n, n: v.n }))
          .sort((a, b) => b.peso - a.peso),
      });
    }
  }

  // La elevación es continua: se agrupa cada 5 m para que las zonas sean niveles reconocibles.
  const porNivel = new Map<string, { peso: number; n: number }>();
  for (const e of elementos) {
    const el = (e as any).elevacion;
    if (el == null) continue;
    const k = `Nivel ${Math.floor(Number(el) / 5) * 5} m`;
    const cur = porNivel.get(k) ?? { peso: 0, n: 0 };
    cur.peso += n((e as any).peso_kg);
    cur.n += 1;
    porNivel.set(k, cur);
  }
  if (porNivel.size >= 2) {
    dimensiones.push({
      clave: 'elevacion', label: 'Nivel (cada 5 m)',
      zonas: [...porNivel.entries()]
        .map(([clave, v]) => ({ clave, nombre: clave, peso: v.peso > 0 ? Math.round(v.peso) : v.n, n: v.n }))
        .sort((a, b) => parseFloat(a.clave.replace(/[^\d.-]/g, '')) - parseFloat(b.clave.replace(/[^\d.-]/g, ''))),
    });
  }

  return NextResponse.json({
    cwp: cwpRes.data,
    fuente: banco.fuente,
    banco: banco.banco,
    totales: { ...banco.totales, hh_planner: n(cwpRes.data.hh_planner), n_iwp: banco.iwpIds.length },
    dimensiones,
    turnos: turnoRes.data ?? [],
    cuadrillas: cuadrillaRes.data ?? [],
  });
}
