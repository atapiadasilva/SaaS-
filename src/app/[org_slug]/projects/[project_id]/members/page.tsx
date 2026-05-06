import { redirect } from "next/navigation";

// Esta ruta fue reemplazada por /team — redirigir permanentemente
export default async function MembersRedirect({
  params,
}: {
  params: Promise<{ org_slug: string; project_id: string }>;
}) {
  const { org_slug, project_id } = await params;
  redirect(`/${org_slug}/projects/${project_id}/team`);
}
