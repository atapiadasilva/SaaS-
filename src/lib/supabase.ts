import { createBrowserClient } from '@supabase/ssr';

// Singleton sin tipado estricto para compatibilidad con módulos AWP heredados.
// Para código nuevo, usar createClient() de '@/lib/supabase/client' (tipado con Database).
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
