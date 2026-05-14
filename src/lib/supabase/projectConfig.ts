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
 * Single UPDATE query — no read round-trip needed.
 * Falls back to merge_module_config if the RPC doesn't exist yet.
 */
export async function setBimLinkerKey(
  projectId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const supabase = createClient() as any;
  const serialized = value === null ? null : JSON.parse(JSON.stringify(value));

  const { error } = await supabase.rpc('set_bim_linker_key', {
    p_project_id: projectId,
    p_key: key,
    p_value: serialized,
  });

  if (!error) return;

  const rpcMissing =
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    error.message?.includes('set_bim_linker_key') ||
    error.message?.includes('could not find');

  // Fallback: read-modify-write if set_bim_linker_key RPC doesn't exist yet
  // Run the SQL in supabase_additions.sql to enable the fast path permanently.
  if (rpcMissing) {
    const { data, error: readErr } = await supabase
      .from('projects').select('module_config').eq('id', projectId).single();
    if (readErr) throw new Error(`[read] ${readErr.message} (${readErr.code})`);
    const mc = data?.module_config ?? {};
    const newMC = { ...mc, bim_linker: { ...(mc.bim_linker ?? {}), [key]: serialized } };
    const { error: writeErr } = await supabase
      .from('projects').update({ module_config: newMC }).eq('id', projectId);
    if (writeErr) throw new Error(`[write] ${writeErr.message} (${writeErr.code})`);
    return;
  }

  throw new Error(`${error.message ?? 'Unknown error'} (code: ${error.code ?? '?'}, hint: ${error.hint ?? '-'})`);
}
