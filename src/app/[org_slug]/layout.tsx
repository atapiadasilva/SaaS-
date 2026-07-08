import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PremiumSidebar } from "@/components/layout/PremiumSidebar";
import { previewOrgRole } from "@/lib/rolePreview";
import { getPreviewRole } from "@/lib/rolePreviewServer";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("id, logo_url, name")
    .eq("slug", org_slug)
    .single() as { data: { id: string; logo_url: string | null; name: string } | null };

  if (!org) redirect("/organizaciones");

  const { data: orgMember } = await (supabase as any)
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .single() as { data: { role: string } | null };

  if (!orgMember) redirect("/organizaciones");

  const realIsOwner = orgMember.role === 'owner';

  // Preview solo disponible para el owner real
  const preview = realIsOwner ? await getPreviewRole() : null;

  // Rol efectivo para decidir el layout
  const effectiveOrgRole = preview ? previewOrgRole(preview) : orgMember.role;
  const isOrgAdmin = effectiveOrgRole === 'owner' || effectiveOrgRole === 'admin';

  return (
    <>
      {isOrgAdmin ? (
        <div className="flex min-h-screen w-full bg-background font-sans">
          <PremiumSidebar
            orgSlug={org_slug}
            orgLogoUrl={org.logo_url}
            orgName={org.name}
            orgRole={effectiveOrgRole}
          />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      ) : (
        <div className="min-h-screen w-full bg-background font-sans">
          {children}
        </div>
      )}
    </>
  );
}
