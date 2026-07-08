'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

// Redirige directo al primer proyecto disponible → módulo Minería
export default function OrganizacionesPage() {
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/auth/login'; return; }

      const { data: orgs } = await (supabase as any)
        .from('organizations')
        .select('slug, projects(id)')
        .limit(1)
        .single();

      if (orgs?.slug && orgs?.projects?.[0]?.id) {
        window.location.href = `/${orgs.slug}/projects/${orgs.projects[0].id}`;
      } else {
        // Fallback: ir al login si no hay proyecto
        window.location.href = '/auth/login';
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm font-semibold">Cargando proyecto...</span>
      </div>
    </div>
  );
}
