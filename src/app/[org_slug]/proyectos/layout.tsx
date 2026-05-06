import { requireOrgAdmin } from '@/lib/guards';

export default async function ProyectosLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;
  await requireOrgAdmin(org_slug);
  return <>{children}</>;
}
