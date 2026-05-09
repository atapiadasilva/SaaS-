'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OrgsGrid } from '@/components/organizations/OrgsGrid';
import { Loader2 } from 'lucide-react';
import type { OrgPlan } from '@/lib/supabase/types';

type Org = {
  id: string; name: string; slug: string; logo_url: string | null;
  plan: OrgPlan; created_at: string; updated_at: string;
  projectCount: number; memberCount: number;
};

// Skeleton card for loading state
function OrgSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3 bg-slate-100 rounded w-2/3" />
          <div className="h-2 bg-slate-50 rounded w-1/3" />
        </div>
      </div>
      <div className="h-2 bg-slate-50 rounded w-full" />
      <div className="h-2 bg-slate-50 rounded w-4/5" />
      <div className="flex gap-2 mt-2">
        <div className="h-6 bg-slate-100 rounded-lg flex-1" />
        <div className="h-6 bg-slate-100 rounded-lg flex-1" />
      </div>
    </div>
  );
}

export default function OrganizacionesPage() {
  const [orgs, setOrgs]           = useState<Org[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = '/auth/login'; return; }
        setUserEmail(user.email ?? '');

        const { data: raw, error: qErr } = await (supabase as any)
          .from('organizations')
          .select('id, name, slug, logo_url, plan, created_at, updated_at, projects(count), organization_members(count)')
          .order('created_at', { ascending: false });

        if (qErr) throw qErr;
        setOrgs((raw ?? []).map((org: any) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          logo_url: org.logo_url,
          plan: org.plan as OrgPlan,
          created_at: org.created_at,
          updated_at: org.updated_at,
          projectCount: org.projects?.[0]?.count ?? 0,
          memberCount: org.organization_members?.[0]?.count ?? 0,
        })));
      } catch (e: any) {
        setError(e?.message ?? 'Error cargando organizaciones');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div>
        <div className="h-7 w-40 bg-slate-100 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => <OrgSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-2">
          <p className="text-sm font-bold text-red-500">Error cargando organizaciones</p>
          <p className="text-xs text-slate-400">{error}</p>
          <button onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded-lg transition">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return <OrgsGrid orgs={orgs} userEmail={userEmail} />;
}
