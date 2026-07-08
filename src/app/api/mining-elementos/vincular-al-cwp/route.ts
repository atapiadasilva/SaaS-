import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type Nivel = 'cwa' | 'cv' | 'cwp' | 'swp';

function deriveCwaCv(cwpId: string) {
  const m = cwpId.match(/^(\d{6})\.[A-Za-z]+\d+/);
  if (!m) return { cwa_id: null, cv_id: null };
  const cv = m[1];
  return { cwa_id: cv.slice(0, 4), cv_id: cv };
}
function fieldsForNivel(nivel: Nivel, codigo: string): Record<string, string | null> {
  if (nivel === 'swp')  return { swp_id: codigo };
  if (nivel === 'cwp')  return { cwp_id: codigo, ...deriveCwaCv(codigo) };
  if (nivel === 'cv')   return { cv_id: codigo, cwa_id: codigo.slice(0, 4), cwp_id: `${codigo}.SIN-CWP` };
  const cv = `${codigo}.SIN-CV`;
  return { cwa_id: codigo, cv_id: cv, cwp_id: `${cv}.SIN-CWP` };
}

// POST /api/mining-elementos/vincular-al-cwp
// Body: { project_id, nivel, codigo, monikers: string[] }
// Vincula una lista de sp3d_moniker a un código CWP/CWA/CV/SWP.
// — Si el moniker ya existe en mining_elementos → actualiza los campos de clasificación.
// — Si no existe → crea una fila nueva (requiere_alta_sp3d=true) para que aparezca
//   como pendiente de dar de alta en SmartPlant 3D.
// Esto hace la vinculación permanente y compartida con la vista Minería.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, monikers } = body ?? {};
  const nivel: Nivel = ['cwa', 'cv', 'cwp', 'swp'].includes(body?.nivel) ? body.nivel : 'cwp';
  const codigo = String(body?.codigo ?? '').trim();

  if (!project_id) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  if (!codigo)     return NextResponse.json({ error: 'Missing codigo'     }, { status: 400 });
  if (!Array.isArray(monikers) || !monikers.length)
    return NextResponse.json({ error: 'monikers must be a non-empty array' }, { status: 400 });

  const sb = supabase as any;
  const fields = fieldsForNivel(nivel, codigo);

  // 1. Update rows that already exist in DB
  const { data: updated, error: updErr } = await sb
    .from('mining_elementos')
    .update(fields)
    .eq('project_id', project_id)
    .in('sp3d_moniker', monikers)
    .select('sp3d_moniker');

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // 2. Insert rows for monikers not found in DB
  const updatedSet = new Set<string>((updated ?? []).map((r: any) => r.sp3d_moniker));
  const missing = monikers.filter((m: string) => !updatedSet.has(m));

  if (missing.length) {
    const newRows = missing.map((m: string) => ({
      project_id, sp3d_moniker: m,
      requiere_alta_sp3d: true,
      ...fields,
    }));
    const { error: insErr } = await sb
      .from('mining_elementos')
      .upsert(newRows, { onConflict: 'project_id,sp3d_moniker' });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 3. Log the classification change
  const logRows = monikers.flatMap((m: string) => {
    return Object.entries(fields).map(([campo, valor_nuevo]) => ({
      project_id, sp3d_moniker: m, campo,
      valor_anterior: null, valor_nuevo,
      origen: `vincular_4d_${nivel}`, usuario_id: user.id,
    }));
  });
  if (logRows.length) {
    await sb.from('mining_cambios_log').insert(logRows).then(() => {});
  }

  return NextResponse.json({ ok: true, updated: updated?.length ?? 0, inserted: missing.length });
}
