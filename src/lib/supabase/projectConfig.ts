import { createClient } from './client';

/**
 * Atomically sets one key inside projects.module_config using the
 * merge_module_config RPC. Falls back to a direct read-modify-write
 * update if the RPC doesn't exist in this Supabase instance yet.
 *
 * SQL to deploy the RPC (run once in Supabase SQL Editor):
 *
 *   CREATE OR REPLACE FUNCTION public.merge_module_config(
 *     p_project_id UUID, p_key TEXT, p_value JSONB
 *   ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
 *   BEGIN
 *     UPDATE public.projects
 *     SET module_config = jsonb_set(
 *       COALESCE(module_config, '{}'::jsonb), ARRAY[p_key],
 *       COALESCE(p_value, 'null'::jsonb), true)
 *     WHERE id = p_project_id;
 *   END; $$;
 *   GRANT EXECUTE ON FUNCTION public.merge_module_config(UUID,TEXT,JSONB) TO authenticated;
 */
export async function setModuleConfigKey(
  projectId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const supabase = createClient() as any;
  const serial = value === null ? null : JSON.parse(JSON.stringify(value));

  const { error } = await supabase.rpc('merge_module_config', {
    p_project_id: projectId,
    p_key: key,
    p_value: serial,
  });

  if (!error) return;

  // Fallback: RPC missing (42883) or any other failure → direct update.
  // Accepts a small read-modify-write race; acceptable for single-editor sessions.
  const { data: row } = await supabase
    .from('projects')
    .select('module_config')
    .eq('id', projectId)
    .single();

  const next = {
    ...(row?.module_config ?? {}),
    [key]: serial,
  };

  const { error: e2 } = await supabase
    .from('projects')
    .update({ module_config: next })
    .eq('id', projectId);

  if (e2) throw new Error(`[config-write] ${e2.message}`);
}

/**
 * Sets one key inside projects.module_config->'bim_linker' using the
 * set_bim_linker_key RPC. Falls back gracefully if the RPC is missing.
 *
 * SQL to deploy (run once in Supabase SQL Editor):
 *
 *   CREATE OR REPLACE FUNCTION public.set_bim_linker_key(
 *     p_project_id UUID, p_key TEXT, p_value JSONB
 *   ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
 *   BEGIN
 *     UPDATE public.projects
 *     SET module_config = jsonb_set(
 *       COALESCE(module_config, '{}'::jsonb),
 *       ARRAY['bim_linker', p_key],
 *       COALESCE(p_value, 'null'::jsonb), true)
 *     WHERE id = p_project_id;
 *   END; $$;
 *   GRANT EXECUTE ON FUNCTION public.set_bim_linker_key(UUID,TEXT,JSONB) TO authenticated;
 */
export async function setBimLinkerKey(
  projectId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const supabase = createClient() as any;
  const serial = value === null ? null : JSON.parse(JSON.stringify(value));

  const { error } = await supabase.rpc('set_bim_linker_key', {
    p_project_id: projectId,
    p_key: key,
    p_value: serial,
  });

  if (!error) return;

  // Fallback: try merge_module_config (nested bim_linker update)
  const { data: row } = await supabase
    .from('projects')
    .select('module_config')
    .eq('id', projectId)
    .single();

  const currentLinker = (row?.module_config as any)?.bim_linker ?? {};
  const nextLinker = { ...currentLinker, [key]: serial };

  // Try the merge_module_config RPC first (atomic, no race)
  const { error: e2 } = await supabase.rpc('merge_module_config', {
    p_project_id: projectId,
    p_key: 'bim_linker',
    p_value: nextLinker,
  });

  if (!e2) return;

  // Last resort: direct table update
  const next = {
    ...(row?.module_config ?? {}),
    bim_linker: nextLinker,
  };

  const { error: e3 } = await supabase
    .from('projects')
    .update({ module_config: next })
    .eq('id', projectId);

  if (e3) throw new Error(`[bim-write] ${e3.message}`);
}
