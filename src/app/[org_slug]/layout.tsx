import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Guard común de todo /[org_slug]: sesión y membresía. Sin chrome — la barra
// lateral de la organización vive en el route group (org), así las pantallas de
// proyecto quedan a pantalla completa (el visor 3D y la Mesa usan cada pixel).
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
    .select("id")
    .eq("slug", org_slug)
    .single() as { data: { id: string } | null };

  if (!org) redirect("/organizaciones");

  const { data: orgMember } = await (supabase as any)
    .from("organization_members")
    .select("role")
    .eq("organization_id", org.id)
    .eq("user_id", user.id)
    .single() as { data: { role: string } | null };

  if (!orgMember) redirect("/organizaciones");

  return <div className="min-h-screen w-full bg-background font-sans">{children}</div>;
}
