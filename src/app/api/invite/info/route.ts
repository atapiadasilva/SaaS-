import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// GET /api/invite/info?token=xxx
// Información pública del link (sin autenticación requerida).
// Devuelve nombre del proyecto, organización y rol — nunca datos sensibles.
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: invite } = await admin
    .from('project_invitations')
    .select('role, expires_at, max_uses, use_count, label, projects(name, organizations(name, slug))')
    .eq('token', token)
    .single();

  if (!invite) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const expired = invite.expires_at && new Date(invite.expires_at) < new Date();
  const exhausted = invite.max_uses !== null && invite.use_count >= invite.max_uses;

  const project = invite.projects as any;

  return NextResponse.json({
    valid: !expired && !exhausted,
    expired: !!expired,
    exhausted: !!exhausted,
    role: invite.role,
    label: invite.label,
    project_name: project?.name ?? 'Proyecto',
    org_name: project?.organizations?.name ?? '',
    org_slug: project?.organizations?.slug ?? '',
  });
}
