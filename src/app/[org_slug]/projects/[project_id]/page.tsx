import { redirect } from 'next/navigation';

// La raíz del proyecto va al Panel: es el único módulo (junto a Setup) que está
// activo en todos los proyectos, sea cual sea su etapa. Minería puede no estarlo.
export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { org_slug, project_id } = await params;
  redirect(`/${org_slug}/projects/${project_id}/panel`);
}
