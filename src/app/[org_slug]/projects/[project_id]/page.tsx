import { redirect } from 'next/navigation';

// El resumen del proyecto ya no existe — vamos directo a AWP Costanera
export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { org_slug, project_id } = await params;
  redirect(`/${org_slug}/projects/${project_id}/costanera`);
}
