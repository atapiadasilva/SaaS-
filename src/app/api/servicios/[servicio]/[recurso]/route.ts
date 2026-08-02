import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SERVICIO_BY_KEY, esRecursoPublicado, vistaPub } from '@/lib/servicios';

// Puerta única al contrato publicado de un servicio.
//
//   GET /api/servicios/recursos/hh_por_cwp?project_id=…&cwp=312101.C001
//
// Lee SIEMPRE del schema `pub`, nunca de las tablas internas de un servicio. Por eso
// no hace falta autorizar por departamento: lo que está en `pub` es exactamente lo que
// ese servicio decidió compartir, y la RLS multi-tenant de la tabla base sigue vigente
// porque las vistas son `security_invoker`.
//
// Ver docs/ARQUITECTURA_SERVICIOS.md

const LIMITE_MAX = 5000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ servicio: string; recurso: string }> }
) {
  const { servicio, recurso } = await params;

  const def = SERVICIO_BY_KEY[servicio];
  if (!def) {
    return NextResponse.json({ error: `Servicio desconocido: "${servicio}"` }, { status: 404 });
  }
  if (!esRecursoPublicado(servicio, recurso)) {
    return NextResponse.json({
      error: `El servicio "${def.label}" no publica "${recurso}".`,
      publica: def.publica,
    }, { status: 404 });
  }
  if (!def.migrado) {
    return NextResponse.json({
      error: `El servicio "${def.label}" todavía no está migrado a su schema propio.`,
      detalle: 'Su contrato está declarado pero aún no existe en la base. Ver la Etapa 3 en docs/ARQUITECTURA_SERVICIOS.md.',
    }, { status: 501 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const pid = sp.get('project_id');
  if (!pid) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const limite = Math.min(Number(sp.get('limit')) || 1000, LIMITE_MAX);

  let q = (supabase as any).schema('pub').from(vistaPub(def.key, recurso))
    .select('*').eq('project_id', pid).limit(limite);

  // Filtros comunes a todos los contratos. Se aplican solo si el recurso los tiene:
  // pedir un filtro que la vista no expone es un error del llamador, no un silencio.
  const cwp = sp.get('cwp');
  if (cwp) q = q.eq('cwp_id', cwp);
  const desde = sp.get('desde');
  if (desde) q = q.gte('fecha', desde);
  const hasta = sp.get('hasta');
  if (hasta) q = q.lte('fecha', hasta);

  const { data, error } = await q;

  if (error) {
    // El schema `pub` debe estar en los "Exposed schemas" de la API de Supabase.
    // Sin eso el contrato existe en la base pero PostgREST no lo sirve.
    if (/schema must be one of/i.test(error.message)) {
      return NextResponse.json({
        error: 'El schema "pub" no está expuesto en la API de Supabase.',
        remedio: 'Dashboard → Settings → API → Exposed schemas: agregar "pub".',
      }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filas: any[] = data ?? [];
  return NextResponse.json({
    servicio: def.key,
    recurso,
    // La versión del dato que se está entregando: quien guarde este resultado debe
    // guardar también este número (ver calculo_lineage).
    n_version: filas[0]?.n_version ?? null,
    total: filas.length,
    truncado: filas.length === limite,
    datos: filas,
  });
}
