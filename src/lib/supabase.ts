import { createClient } from './supabase/client';

// Exportación singleton para garantizar compatibilidad con los módulos
// heredados de "01. Datos AWP" que usaban `import { supabase } from '@/lib/supabase'`
export const supabase = createClient();
