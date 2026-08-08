import { redirect } from 'next/navigation';

// /proyectos se fusionó con el dashboard de la organización (cuarta limpieza,
// 2026-08-08): mostraban la misma grilla de proyectos en dos URLs distintas.
// Se conserva solo este redirect por los marcadores guardados.
export default async function ProyectosPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;
  redirect(`/${org_slug}/dashboard`);
}
