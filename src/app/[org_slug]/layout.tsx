import { createClient } from "@/lib/supabase/server";
import { PremiumSidebar } from "@/components/layout/PremiumSidebar";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;
  const supabase = await createClient();

  const { data: org } = await (supabase as any)
    .from("organizations")
    .select("logo_url, name")
    .eq("slug", org_slug)
    .single() as { data: { logo_url: string | null; name: string } | null };

  return (
    <div className="flex min-h-screen w-full bg-background font-sans">
      <PremiumSidebar
        orgSlug={org_slug}
        orgLogoUrl={org?.logo_url ?? null}
        orgName={org?.name ?? org_slug}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
