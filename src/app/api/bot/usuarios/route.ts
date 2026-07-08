import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const { data, error } = await supabase
    .from('mining_bot_usuarios')
    .select('id, telefono, nombre, rol, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ usuarios: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { project_id, telefono, nombre, rol } = body as { project_id?: string; telefono?: string; nombre?: string; rol?: string };
  if (!project_id || !telefono) return NextResponse.json({ error: 'Missing project_id or telefono' }, { status: 400 });
  if (rol !== 'admin' && rol !== 'lector') return NextResponse.json({ error: 'rol debe ser admin o lector' }, { status: 400 });

  const telefonoLimpio = telefono.replace(/[^0-9]/g, '');
  const { error } = await supabase
    .from('mining_bot_usuarios')
    .upsert({ project_id, telefono: telefonoLimpio, nombre: nombre || null, rol }, { onConflict: 'project_id,telefono' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabase.from('mining_bot_usuarios').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
