import { redirect } from 'next/navigation';

// La raíz del proyecto va directo al módulo AWP Minería.
export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { org_slug, project_id } = await params;
  redirect(`/${org_slug}/projects/${project_id}/mineria`);
}
