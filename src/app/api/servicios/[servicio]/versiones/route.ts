import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SERVICIO_BY_KEY } from '@/lib/servicios';

// Ciclo de vida de las versiones de un servicio.
//
//   GET  /api/servicios/recursos/versiones?project_id=…
//   POST /api/servicios/recursos/versiones   { project_id, accion:'publicar', nota }
//   POST /api/servicios/recursos/versiones   { project_id, accion:'retirar', n_version, motivo }
//
// Publicar es un acto deliberado del departamento dueño: mientras no ocurra, lo cargado
// queda en el borrador y nadie más lo ve.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ servicio: string }> }
) {
  const { servicio } = await params;
  const def = SERVICIO_BY_KEY[servicio];
  if (!def) return NextResponse.json({ error: `Servicio desconocido: "${servicio}"` }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pid = req.nextUrl.searchParams.get('project_id');
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const { data, error } = await (supabase as any).from('servicio_version')
    .select('n_version, estado, titulo, nota, creada_at, publicada_at')
    .eq('project_id', pid).eq('servicio', servicio)
    .order('n_version', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const versiones: any[] = data ?? [];
  const publicadas = versiones.filter(v => v.estado === 'publicada');
  return NextResponse.json({
    servicio: def.key,
    label: def.label,
    dueno: def.dueno,
    vigente: publicadas[0]?.n_version ?? null,
    borrador: versiones.find(v => v.estado === 'draft')?.n_version ?? null,
    versiones,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ servicio: string }> }
) {
  const { servicio } = await params;
  const def = SERVICIO_BY_KEY[servicio];
  if (!def) return NextResponse.json({ error: `Servicio desconocido: "${servicio}"` }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pid = body.project_id;
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const sb = (supabase as any);

  if (body.accion === 'publicar') {
    const { data, error } = await sb.schema('pub').rpc('publicar_version', {
      p_project: pid, p_servicio: servicio, p_nota: body.nota ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ publicada: data });
  }

  if (body.accion === 'retirar') {
    if (!body.n_version || !body.motivo) {
      return NextResponse.json({ error: 'Retirar una versión exige n_version y motivo.' }, { status: 400 });
    }
    const { data, error } = await sb.schema('pub').rpc('retirar_version', {
      p_project: pid, p_servicio: servicio,
      p_n_version: body.n_version, p_motivo: body.motivo,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ retirada: data });
  }

  return NextResponse.json({ error: 'accion debe ser "publicar" o "retirar".' }, { status: 400 });
}
