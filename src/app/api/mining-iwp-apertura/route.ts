import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizarTipo, normalizarSeveridad } from '@/lib/constraints';

// GET ?project_id=&cwp_id=
//
// Paso 9 de la rutina de Pull Planning: las restricciones que los departamentos ya
// declararon sobre este CWP y que van a bloquear a todos sus IWP. La Mesa de Trabajo las
// muestra en el inspector y las siembra al publicar.
//
// Crear los paquetes es cosa de `mining-apertura-mesa`, que es donde vive la sesión.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const projectId = params.get('project_id');
  const cwpId = params.get('cwp_id');
  if (!projectId || !cwpId) return NextResponse.json({ error: 'Missing project_id/cwp_id' }, { status: 400 });

  const sb = supabase as any;
  const [cwpRes, ifcRes, sumRes, consRes, planosRes] = await Promise.all([
    sb.from('mining_cwp').select('fecha_ifc, status_cwp, suministro')
      .eq('project_id', projectId).eq('cwp_id', cwpId).maybeSingle(),
    sb.from('mining_ewp_ifc').select('documento_ifc, fecha_ifc_plan, fecha_ifc_real, liberado, observacion')
      .eq('project_id', projectId).eq('cwp_id', cwpId),
    sb.from('mining_suministro').select('descripcion_material, proveedor, numero_po, fecha_entrega_plan, liberado')
      .eq('project_id', projectId).eq('cwp_id', cwpId),
    sb.from('mining_consideraciones').select('depto, tipo, titulo, detalle, severidad, estado, fecha_limite, responsable')
      .eq('project_id', projectId).eq('cwp_id', cwpId),
    sb.from('mining_planos').select('codigo_documento', { count: 'exact', head: true })
      .eq('project_id', projectId).eq('cwp_id', cwpId),
  ]);

  const sugeridas: {
    tipo: string; descripcion: string; fecha_necesaria: string | null;
    origen: string; severidad: string;
  }[] = [];

  // Ingeniería: los IFC pendientes son la restricción que más veces mata a un IWP.
  for (const e of (ifcRes.data ?? []).filter((x: any) => !x.liberado)) {
    sugeridas.push({
      tipo: 'INGENIERIA',
      descripcion: `IFC pendiente: ${e.documento_ifc ?? 'documento sin código'}${e.observacion ? ` — ${e.observacion}` : ''}`,
      fecha_necesaria: e.fecha_ifc_plan ?? null,
      origen: 'Ingeniería', severidad: 'alta',
    });
  }
  // Si el CWP no tiene detalle de EWP pero sí una fecha IFC futura, igual hay que avisar.
  if (!(ifcRes.data ?? []).length && cwpRes.data?.fecha_ifc) {
    const pendiente = new Date(cwpRes.data.fecha_ifc).getTime() > Date.now();
    if (pendiente) {
      sugeridas.push({
        tipo: 'INGENIERIA',
        descripcion: `La ingeniería del CWP recién queda IFC el ${new Date(cwpRes.data.fecha_ifc).toLocaleDateString('es-CL')}.`,
        fecha_necesaria: cwpRes.data.fecha_ifc, origen: 'Ingeniería', severidad: 'alta',
      });
    }
  }

  // Suministros: material sin liberar.
  for (const s of (sumRes.data ?? []).filter((x: any) => !x.liberado)) {
    sugeridas.push({
      tipo: 'MATERIAL',
      descripcion: `Material sin liberar: ${s.descripcion_material ?? 'sin descripción'}${s.numero_po ? ` (OC ${s.numero_po})` : ''}${s.proveedor ? ` · ${s.proveedor}` : ''}`,
      fecha_necesaria: s.fecha_entrega_plan ?? null,
      origen: 'Suministros', severidad: 'alta',
    });
  }

  // Los departamentos (calidad, SSO, medio ambiente…) publican por CWP en consideraciones.
  // El tipo se lleva al catálogo COAA: antes se guardaba el nombre del departamento recortado
  // a 20 caracteres, así que cada proyecto inventaba su propia taxonomía y el tablero no
  // podía agrupar nada.
  for (const c of (consRes.data ?? []).filter((x: any) => String(x.estado ?? '').toLowerCase() !== 'cerrada')) {
    sugeridas.push({
      tipo: normalizarTipo(c.tipo ?? c.depto),
      descripcion: `${c.depto}: ${c.titulo}${c.detalle ? ` — ${c.detalle}` : ''}${c.responsable ? ` (${c.responsable})` : ''}`,
      fecha_necesaria: c.fecha_limite ?? null,
      origen: c.depto ?? 'Departamento', severidad: normalizarSeveridad(c.severidad),
    });
  }

  // Sin planos vinculados no hay con qué construir, por muy IFC que esté la ingeniería.
  if ((planosRes.count ?? 0) === 0) {
    sugeridas.push({
      tipo: 'INGENIERIA',
      descripcion: 'Este CWP no tiene planos vinculados en el CDE. Terreno no tiene con qué ejecutar.',
      fecha_necesaria: null, origen: 'Control Documental', severidad: 'alta',
    });
  }

  return NextResponse.json({ sugeridas });
}
