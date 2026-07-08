import { redirect } from 'next/navigation';

export default function VistasPage({ params }: { params: { org_slug: string; project_id: string } }) {
  redirect(`/${params.org_slug}/projects/${params.project_id}/mineria`);
}
