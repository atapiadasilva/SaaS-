import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Verifica que el caller es admin/owner de la org
async function isOrgAdmin(
  admin: ReturnType<typeof getAdminClient>,
  callerId: string,
  orgId: string
): Promise<boolean> {
  const { data } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', callerId)
    .single();
  return !!data && ['owner', 'admin'].includes(data.role);
}

// GET /api/org-members?org_id=xxx
// Lista todos los miembros de la org con email y rol
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = new URL(req.url).searchParams.get('org_id');
  if (!orgId) return NextResponse.json({ error: 'Missing org_id' }, { status: 400 });

  const admin = getAdminClient();

  // Verificar que el caller pertenece a la org
  const { data: callerMember } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!callerMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Miembros de la org
  const { data: members } = await admin
    .from('organization_members')
    .select('id, user_id, role, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });

  if (!members?.length) return NextResponse.json([]);

  // Emails desde auth.users
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map(authUsers.map(u => [u.id, u.email ?? '']));

  const result = members.map(m => ({
    id:         m.id,
    user_id:    m.user_id,
    email:      emailMap.get(m.user_id) ?? m.user_id,
    role:       m.role,
    created_at: m.created_at,
    is_self:    m.user_id === user.id,
  }));

  return NextResponse.json({ members: result, caller_role: callerMember.role });
}

// POST /api/org-members
// Body: { org_id, email, role? }
// Invita a un usuario por email. Si ya existe en auth.users, lo añade.
// Si no existe, envía invitación de Supabase.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { org_id, email, role = 'member' } = await req.json();
  if (!org_id || !email) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const admin = getAdminClient();

  if (!(await isOrgAdmin(admin, user.id, org_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Buscar si el usuario ya existe en auth.users
  const { data: { users: allUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = allUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());

  let targetUserId: string;
  let wasInvited = false;

  if (existing) {
    targetUserId = existing.id;
  } else {
    // Invitar al usuario — Supabase crea la cuenta y manda el email
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email);
    if (inviteErr || !invited?.user) {
      return NextResponse.json({ error: inviteErr?.message ?? 'Error al invitar' }, { status: 500 });
    }
    targetUserId = invited.user.id;
    wasInvited = true;
  }

  // Verificar que no esté ya en la org
  const { data: alreadyMember } = await admin
    .from('organization_members')
    .select('id')
    .eq('organization_id', org_id)
    .eq('user_id', targetUserId)
    .single();

  if (alreadyMember) {
    return NextResponse.json({ error: 'El usuario ya es miembro de la organización' }, { status: 409 });
  }

  // Añadir a la org
  const { error: insertErr } = await admin
    .from('organization_members')
    .insert({ organization_id: org_id, user_id: targetUserId, role });

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ success: true, was_invited: wasInvited });
}

// PATCH /api/org-members
// Body: { member_id, role, org_id }
// Cambia el rol de un miembro de la org
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { member_id, role, org_id } = await req.json();
  if (!member_id || !role || !org_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const admin = getAdminClient();

  if (!(await isOrgAdmin(admin, user.id, org_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // No permitir que se cambie el rol del único owner
  if (role !== 'owner') {
    const { data: target } = await admin
      .from('organization_members')
      .select('role, user_id')
      .eq('id', member_id)
      .single();

    if (target?.role === 'owner') {
      const { count } = await admin
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org_id)
        .eq('role', 'owner');

      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: 'Debe haber al menos un owner en la organización' }, { status: 400 });
      }
    }
  }

  const { error } = await admin
    .from('organization_members')
    .update({ role })
    .eq('id', member_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/org-members?member_id=xxx&org_id=xxx
// Elimina un miembro de la org
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const memberId = params.get('member_id');
  const orgId    = params.get('org_id');
  if (!memberId || !orgId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const admin = getAdminClient();

  if (!(await isOrgAdmin(admin, user.id, orgId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Proteger al único owner
  const { data: target } = await admin
    .from('organization_members')
    .select('role')
    .eq('id', memberId)
    .single();

  if (target?.role === 'owner') {
    const { count } = await admin
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('role', 'owner');

    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'No se puede eliminar al único owner' }, { status: 400 });
    }
  }

  const { error } = await admin.from('organization_members').delete().eq('id', memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
