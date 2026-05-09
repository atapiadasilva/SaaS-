import { createClient } from './client';

/**
 * Atomically sets one key inside projects.module_config using a server-side RPC.
 * Prevents the read-modify-write race condition where concurrent writers
 * overwrite each other's changes.
 */
export async function setModuleConfigKey(
  projectId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const supabase = createClient();
  const { error } = await (supabase as any).rpc('merge_module_config', {
    p_project_id: projectId,
    p_key: key,
    p_value: value === null ? null : JSON.parse(JSON.stringify(value)),
  });
  if (error) throw error;
}

/**
 * Atomically sets one key inside projects.module_config->'bim_linker'.
 */
export async function setBimLinkerKey(
  projectId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const supabase = createClient();
  const { error } = await (supabase as any).rpc('set_bim_linker_key', {
    p_project_id: projectId,
    p_key: key,
    p_value: value === null ? null : JSON.parse(JSON.stringify(value)),
  });
  if (error) throw error;
}
