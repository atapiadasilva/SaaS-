import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OrgsGrid } from "@/components/organizations/OrgsGrid";

export default async function OrganizacionesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  type OrgRaw = {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    plan: string;
    created_at: string;
    updated_at: string;
    projects: { count: number }[];
    organization_members: { count: number }[];
  };

  // Carga organizaciones con conteo de proyectos y miembros
  const { data: orgsRaw } = (await supabase
    .from("organizations")
    .select(`
      id, name, slug, logo_url, plan, created_at, updated_at,
      projects(count),
      organization_members(count)
    `)
    .order("created_at", { ascending: false })) as unknown as { data: OrgRaw[] | null };

  const orgs = (orgsRaw ?? []).map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    logo_url: org.logo_url,
    plan: org.plan as import("@/lib/supabase/types").OrgPlan,
    created_at: org.created_at,
    updated_at: org.updated_at,
    projectCount: org.projects?.[0]?.count ?? 0,
    memberCount: org.organization_members?.[0]?.count ?? 0,
  }));

  return <OrgsGrid orgs={orgs} userEmail={user.email ?? ""} />;
}
