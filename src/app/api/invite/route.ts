import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Verifica que el caller puede administrar invitaciones del proyecto
// (org owner/admin o project admin)
async function canManageInvites(
  admin: ReturnType<typeof getAdminClient>,
  callerId: string,
  projectId: string
): Promise<boolean> {
  const { data: project } = await admin
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .single();

  if (!project) return false;

  const { data: orgMember } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', callerId)
    .single();

  if (orgMember && ['owner', 'admin'].includes(orgMember.role)) return true;

  const { data: projectMember } = await admin
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', callerId)
    .single();

  return projectMember?.role === 'admin';
}

// GET /api/invite?project_id=xxx
// Lista todos los links activos de un proyecto
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get('project_id');
  if (!projectId) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const admin = getAdminClient();

  if (!(await canManageInvites(admin, user.id, projectId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: invitations, error } = await admin
    .from('project_invitations')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(invitations ?? []);
}

// POST /api/invite
// Body: { project_id, role?, label?, max_uses?, expires_in_days? }
// Crea un nuevo link de invitación
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, role = 'viewer', label, max_uses, expires_in_days } = await req.json();
  if (!project_id) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });

  const admin = getAdminClient();

  if (!(await canManageInvites(admin, user.id, project_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const expires_at = expires_in_days
    ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
    : null;

  const { data: invite, error } = await admin
    .from('project_invitations')
    .insert({
      project_id,
      created_by: user.id,
      role,
      label: label ?? null,
      max_uses: max_uses ?? null,
      expires_at,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(invite);
}

// DELETE /api/invite?id=xxx
// Revoca (elimina) un link de invitación
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const admin = getAdminClient();

  const { data: invite } = await admin
    .from('project_invitations')
    .select('project_id')
    .eq('id', id)
    .single();

  if (!invite) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!(await canManageInvites(admin, user.id, invite.project_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await admin.from('project_invitations').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
