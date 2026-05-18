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
 * Sets one key inside projects.module_config->'bim_linker' using a direct
 * read-modify-write. The RPC path (set_bim_linker_key) is skipped because
 * PostgreSQL's jsonb_set() silently returns the original JSON unchanged when
 * the nested path doesn't exist yet (create_missing defaults to false),
 * causing data loss with no error signal.
 */
export async function setBimLinkerKey(
  projectId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const supabase = createClient() as any;
  const serialized = value === null ? null : JSON.parse(JSON.stringify(value));

  const { data, error: readErr } = await supabase
    .from('projects').select('module_config').eq('id', projectId).single();
  if (readErr) throw new Error(`[bim-read] ${readErr.message} (${readErr.code})`);

  const mc = data?.module_config ?? {};
  const newMC = {
    ...mc,
    bim_linker: { ...(mc.bim_linker ?? {}), [key]: serialized },
  };

  const { error: writeErr } = await supabase
    .from('projects').update({ module_config: newMC }).eq('id', projectId);
  if (writeErr) throw new Error(`[bim-write] ${writeErr.message} (${writeErr.code})`);
}
