import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

// Puerta de entrada. Antes era un spinner en el cliente que saltaba al "primer"
// proyecto sin ORDER BY (aterrizaba en cualquiera). Ahora resuelve en el servidor:
// una sola organización → directo a ella; varias → lista para elegir.
export default async function OrganizacionesPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data } = await (supabase as any)
    .from('organizations')
    .select('slug, name, plan')
    .order('created_at', { ascending: true });

  const orgs = (data ?? []) as { slug: string; name: string; plan: string }[];

  if (orgs.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Tu cuenta no pertenece a ninguna organización todavía. Pide una invitación al administrador.
        </p>
      </div>
    );
  }

  if (orgs.length === 1) redirect(`/${orgs[0].slug}`);

  return (
    <div className="max-w-2xl mx-auto py-16 px-6">
      <h1 className="text-2xl font-black text-primary mb-1">Mis empresas</h1>
      <p className="text-sm text-muted-foreground mb-8">Elige con cuál quieres trabajar.</p>
      <div className="space-y-3">
        {orgs.map(org => (
          <Link
            key={org.slug}
            href={`/${org.slug}`}
            className="flex items-center gap-4 p-5 rounded-2xl border border-border bg-white hover:border-primary/40 hover:shadow-sm transition group"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-foreground">{org.name}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{org.plan}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition" />
          </Link>
        ))}
      </div>
    </div>
  );
}
