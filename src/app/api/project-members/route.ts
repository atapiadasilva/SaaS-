import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Admin client con service role para leer auth.users
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET /api/project-members?project_id=xxx&org_id=xxx
// Devuelve todos los miembros de la org con su rol en el proyecto
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id');
  const orgId     = searchParams.get('org_id');
  if (!projectId || !orgId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const admin = getAdminClient();

  // 1. Miembros de la organización
  const { data: orgMembers } = await admin
    .from('organization_members')
    .select('user_id, role')
    .eq('organization_id', orgId);

  if (!orgMembers?.length) return NextResponse.json([]);

  const userIds = orgMembers.map(m => m.user_id);

  // 2. Emails desde auth.users
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map(authUsers.map(u => [u.id, u.email ?? '']));

  // 3. Project members actuales
  const { data: projectMembers } = await admin
    .from('project_members')
    .select('user_id, role, module_access, id')
    .eq('project_id', projectId);

  const projectMap = new Map((projectMembers ?? []).map(m => [m.user_id, m]));

  const result = userIds.map(uid => ({
    user_id:      uid,
    email:        emailMap.get(uid) ?? uid,
    org_role:     orgMembers.find(m => m.user_id === uid)?.role ?? 'member',
    project_member: projectMap.get(uid) ?? null,
  }));

  return NextResponse.json(result);
}

// POST /api/project-members — añadir o actualizar miembro
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project_id, user_id, role, module_access } = await req.json();
  const admin = getAdminClient();

  const { data: existing } = await admin
    .from('project_members')
    .select('id')
    .eq('project_id', project_id)
    .eq('user_id', user_id)
    .single();

  if (existing) {
    await admin.from('project_members')
      .update({ role, module_access })
      .eq('id', existing.id);
  } else {
    await admin.from('project_members')
      .insert({ project_id, user_id, role, module_access: module_access ?? {} });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/project-members?member_id=xxx
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get('member_id');
  if (!memberId) return NextResponse.json({ error: 'Missing member_id' }, { status: 400 });

  const admin = getAdminClient();
  await admin.from('project_members').delete().eq('id', memberId);
  return NextResponse.json({ success: true });
}
