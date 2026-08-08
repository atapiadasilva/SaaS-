import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { previewOrgRole } from '@/lib/rolePreview';
import { getPreviewRole } from '@/lib/rolePreviewServer';

export default async function OrgRootPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: org } = await (supabase as any)
    .from('organizations')
    .select('id')
    .eq('slug', org_slug)
    .single() as { data: { id: string } | null };

  if (!org) redirect('/organizaciones');

  const { data: orgMember } = await (supabase as any)
    .from('organization_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single() as { data: { role: string } | null };

  if (!orgMember) redirect('/organizaciones');

  const realIsOwner = orgMember.role === 'owner';
  const preview = realIsOwner ? await getPreviewRole() : null;
  const effectiveOrgRole = preview ? previewOrgRole(preview) : orgMember.role;
  const isOrgAdmin = effectiveOrgRole === 'owner' || effectiveOrgRole === 'admin';

  // Owner/Admin (real o preview) → dashboard
  if (isOrgAdmin) redirect(`/${org_slug}/dashboard`);

  // Project member (real o preview como member) → primer proyecto con acceso
  // Como owner real, tiene acceso a todos los proyectos de la org
  if (realIsOwner) {
    const { data: firstProject } = await (supabase as any)
      .from('projects')
      .select('id')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single() as { data: { id: string } | null };

    if (firstProject) redirect(`/${org_slug}/projects/${firstProject.id}`);
  } else {
    const { data: projectMember } = await (supabase as any)
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id)
      .limit(1)
      .single() as { data: { project_id: string } | null };

    if (projectMember?.project_id) {
      redirect(`/${org_slug}/projects/${projectMember.project_id}`);
    }
  }

  redirect('/organizaciones');
}
