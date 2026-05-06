import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * Verifica que el usuario autenticado es owner o admin de la organización.
 * Si no, redirige a /organizaciones.
 * Retorna el user y el orgId para uso posterior.
 */
export async function requireOrgAdmin(org_slug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: org } = await (supabase as any)
    .from('organizations')
    .select('id, name')
    .eq('slug', org_slug)
    .single() as { data: { id: string; name: string } | null };

  if (!org) redirect('/organizaciones');

  const { data: orgMember } = await (supabase as any)
    .from('organization_members')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .single() as { data: { role: string } | null };

  if (!orgMember || !['owner', 'admin'].includes(orgMember.role)) {
    redirect('/organizaciones');
  }

  return { user, org, orgRole: orgMember.role };
}
