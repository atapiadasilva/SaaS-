'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserMenu } from '@/components/layout/UserMenu';

export default function OrganizacionesLayout({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState('');

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (user) setEmail(user.email ?? '');
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 bg-white border-b border-border flex items-center justify-between px-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-accent flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-sm">D</span>
          </div>
          <div>
            <h1 className="text-primary font-bold text-lg tracking-tight leading-none">Datos AWP</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Central de Proyectos</p>
          </div>
        </div>
        {email && <UserMenu email={email} />}
      </header>
      <main className="max-w-7xl mx-auto px-8 py-10">
        {children}
      </main>
    </div>
  );
}
