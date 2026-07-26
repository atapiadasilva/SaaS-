import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET ?project_id= → nómina de personal clave del proyecto
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const pid = req.nextUrl.searchParams.get('project_id');
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  const { data, error } = await (supabase as any).from('mining_personal')
    .select('n, nombre, cargo, tipo, cuadrilla, fecha_compromiso, estado_acreditacion')
    .eq('project_id', pid).order('n');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ personal: data ?? [] });
}
