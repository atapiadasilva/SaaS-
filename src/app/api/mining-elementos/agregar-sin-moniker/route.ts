import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Nivel = 'cwa' | 'cv' | 'cwp';

// Misma convención de derivación que /api/mining-elementos (mantener en sync).
function deriveCwaCv(cwpId: string): { cwa_id: string | null; cv_id: string | null } {
  const m = cwpId.match(/^(\d{6})\.[A-Za-z]+\d+/);
  if (!m) return { cwa_id: null, cv_id: null };
  const cv = m[1];
  return { cwa_id: cv.slice(0, 4), cv_id: cv };
}
function fieldsForNivel(nivel: Nivel, trimmed: string): Record<string, string | null> {
  if (trimmed === 'SIN-CWA' || trimmed === 'SIN-CV') return { cwa_id: null, cv_id: null, cwp_id: null };
  if (nivel === 'cwp') return { cwp_id: trimmed, ...deriveCwaCv(trimmed) };
  if (nivel === 'cv') return { cv_id: trimmed, cwa_id: trimmed.slice(0, 4), cwp_id: `${trimmed}.SIN-CWP` };
  const cv = `${trimmed}.SIN-CV`;
  return { cwa_id: trimmed, cv_id: cv, cwp_id: `${cv}.SIN-CWP` };
}

// POST /api/mining-elementos/agregar-sin-moniker
// Body: { project_id, nivel, codigo, guid, name? }
// Para elementos del modelo que NO tienen la propiedad SP3D_MONIKER (geometría que nunca se exportó
// correctamente desde SmartPlant 3D / no se subió al Navisworks con su tag). En vez de bloquear la
// clasificación, se crea una fila nueva en mining_elementos con un moniker SINTÉTICO basado en el GUID
// nativo del modelo (estable, único), marcada con requiere_alta_sp3d=true — así queda clasificada
// visualmente Y aparece en "Exportar cambios" como pendiente de dar de alta en SmartPlant 3D.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, guid, name } = body ?? {};
  const nivel: Nivel = ['cwa', 'cv', 'cwp'].includes(body?.nivel) ? body.nivel : 'cwp';
  const codigo = String(body?.codigo ?? '').trim();
  if (!project_id) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  if (!guid) return NextResponse.json({ error: 'Missing guid' }, { status: 400 });
  if (!codigo) return NextResponse.json({ error: 'Missing codigo' }, { status: 400 });

  const sb = supabase as any;
  const sp3dMoniker = `SIN-MONIKER::${guid}`;
  const fields = fieldsForNivel(nivel, codigo);

  const row = {
    project_id, sp3d_moniker: sp3dMoniker, name: name ?? null,
    requiere_alta_sp3d: true, guid_modelo: guid, ...fields,
  };
  const { error } = await sb.from('mining_elementos').upsert(row, { onConflict: 'project_id,sp3d_moniker' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const campos = (['cwa_id', 'cv_id', 'cwp_id'] as const).filter(c => c in fields);
  const logRows = campos.map(campo => ({
    project_id, sp3d_moniker: sp3dMoniker, campo,
    valor_anterior: null, valor_nuevo: (fields as any)[campo],
    origen: `alta_sin_moniker_3d_${nivel}`, usuario_id: user.id,
  }));
  if (logRows.length) {
    const { error: logErr } = await sb.from('mining_cambios_log').insert(logRows);
    if (logErr) console.error('[mining-elementos/agregar-sin-moniker] error guardando log de cambios:', logErr.message);
  }

  return NextResponse.json({ ok: true, sp3d_moniker: sp3dMoniker });
}
