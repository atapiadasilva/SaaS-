import { cookies } from 'next/headers';
import type { PreviewRole } from './rolePreview';
import { VALID } from './rolePreview';

/**
 * Lee la cookie __role_preview del request.
 * Solo debe aplicarse cuando el usuario real es owner de la org.
 */
export async function getPreviewRole(): Promise<PreviewRole | null> {
  const cookieStore = await cookies();
  const val = cookieStore.get('__role_preview')?.value;
  if (!val) return null;
  return VALID.includes(val as PreviewRole) ? (val as PreviewRole) : null;
}
