import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST /api/invite/accept
// Body: { token }
// El usuario autenticado acepta el link de invitación.
// 1. Valida el token (no expirado, no agotado)
// 2. Agrega al usuario a la organización (si no está)
// 3. Agrega al usuario al proyecto con el rol del invite
// 4. Incrementa use_count
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const admin = getAdminClient();

  // Buscar invitación + datos del proyecto
  const { data: invite } = await admin
    .from('project_invitations')
    .select('*, projects(id, name, organization_id, organizations(name, slug))')
    .eq('token', token)
    .single();

  if (!invite) return NextResponse.json({ error: 'Invitación no válida' }, { status: 404 });

  // Verificar expiración
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'El link de invitación ha expirado' }, { status: 410 });
  }

  // Verificar límite de usos
  if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
    return NextResponse.json({ error: 'Este link ya alcanzó el límite de usos' }, { status: 410 });
  }

  const project = invite.projects as any;
  const orgId   = project.organization_id;
  const projectId = project.id;

  // 1. Añadir a la org si no es miembro
  const { data: existingOrgMember } = await admin
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!existingOrgMember) {
    const { error: orgErr } = await admin
      .from('organization_members')
      .insert({ organization_id: orgId, user_id: user.id, role: 'member' });

    if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });
  }

  // 2. Añadir al proyecto (upsert)
  const { error: projErr } = await admin
    .from('project_members')
    .upsert(
      { project_id: projectId, user_id: user.id, role: invite.role, module_access: {} },
      { onConflict: 'project_id,user_id' }
    );

  if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 });

  // 3. Incrementar use_count
  await admin
    .from('project_invitations')
    .update({ use_count: invite.use_count + 1 })
    .eq('id', invite.id);

  return NextResponse.json({
    success: true,
    project_name: project.name,
    org_slug: project.organizations?.slug,
    project_id: projectId,
    role: invite.role,
  });
}
