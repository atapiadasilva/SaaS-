/**
 * Server-side helpers for APS Object Storage Service (OSS) + Model Derivative.
 * Follows the pattern from aps-simple-viewer-nodejs.
 * All functions run server-side only.
 */

const CLIENT_ID     = process.env.AUTODESK_CLIENT_ID!;
const CLIENT_SECRET = process.env.AUTODESK_CLIENT_SECRET!;

// Bucket key: env override or derived from client ID (3-128 chars, lowercase + numbers + dashes)
export const BUCKET_KEY: string = (
  process.env.APS_BUCKET ??
  `${CLIENT_ID.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50)}-bim`
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** 2-legged token with full data/bucket scopes (backend only, never sent to client). */
export async function getInternalToken(): Promise<string> {
  const res = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope:         'data:read data:create data:write bucket:create bucket:read',
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`APS token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ─── Bucket ───────────────────────────────────────────────────────────────────

/** Creates the OSS bucket if it does not exist yet (idempotent). */
export async function ensureBucket(token: string): Promise<void> {
  const detailRes = await fetch(
    `https://developer.api.autodesk.com/oss/v2/buckets/${BUCKET_KEY}/details`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (detailRes.ok) return;

  const createRes = await fetch('https://developer.api.autodesk.com/oss/v2/buckets', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bucketKey: BUCKET_KEY, policyKey: 'persistent' }),
  });

  // 409 = already exists (race condition) → fine
  if (!createRes.ok && createRes.status !== 409) {
    const txt = await createRes.text();
    throw new Error(`OSS bucket creation failed (${createRes.status}): ${txt}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Base64url-encodes an objectId into an APS URN. */
export function urnify(objectId: string): string {
  return Buffer.from(objectId)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** OSS object key scoped to a project: `{projectId}/{filename}` */
export function objectKey(projectId: string, filename: string): string {
  return `${projectId}/${filename}`;
}

// ─── Models ───────────────────────────────────────────────────────────────────

/** Lists all models in the bucket that belong to a project. */
export async function listModels(
  projectId: string
): Promise<Array<{ name: string; urn: string }>> {
  const token = await getInternalToken();
  await ensureBucket(token);

  const res = await fetch(
    `https://developer.api.autodesk.com/oss/v2/buckets/${BUCKET_KEY}/objects` +
    `?limit=100&beginsWith=${encodeURIComponent(projectId + '/')}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`OSS list failed (${res.status}): ${await res.text()}`);
  const data = await res.json();

  return (data.items ?? []).map((item: any) => ({
    name: (item.objectKey as string).replace(`${projectId}/`, ''),
    urn:  urnify(item.objectId),
  }));
}

/** Uploads a file to the OSS bucket and triggers SVF2 translation. */
export async function uploadAndTranslate(
  projectId: string,
  filename:  string,
  buffer:    Buffer
): Promise<{ name: string; urn: string }> {
  const token = await getInternalToken();
  await ensureBucket(token);

  const key = objectKey(projectId, filename);

  // PUT upload (simple, up to ~100 MB; use signed URLs for larger files)
  const uploadRes = await fetch(
    `https://developer.api.autodesk.com/oss/v2/buckets/${BUCKET_KEY}/objects/${encodeURIComponent(key)}`,
    {
      method:  'PUT',
      headers: {
        Authorization:   `Bearer ${token}`,
        'Content-Type':  'application/octet-stream',
      },
      body: buffer,
      // @ts-ignore — duplex required for Node.js fetch with body
      duplex: 'half',
    } as RequestInit
  );
  if (!uploadRes.ok) {
    const txt = await uploadRes.text();
    throw new Error(`OSS upload failed (${uploadRes.status}): ${txt}`);
  }
  const uploadData = await uploadRes.json();
  const urn = urnify(uploadData.objectId);

  // Submit SVF2 translation job
  await translateModel(urn, token);

  return { name: filename, urn };
}

/** Submits a Model Derivative SVF2 translation job. */
export async function translateModel(urn: string, token?: string): Promise<void> {
  const tok = token ?? (await getInternalToken());

  const res = await fetch(
    'https://developer.api.autodesk.com/modelderivative/v2/designdata/job',
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${tok}`,
        'Content-Type': 'application/json',
        'x-ads-force':  'true',
      },
      body: JSON.stringify({
        input:  { urn },
        output: { formats: [{ type: 'svf2', views: ['2d', '3d'] }] },
      }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Translation job failed (${res.status}): ${txt}`);
  }
}

// ─── Translation Status ───────────────────────────────────────────────────────

export interface TranslationStatus {
  status:    'n/a' | 'pending' | 'inprogress' | 'success' | 'failed' | 'timeout';
  progress:  string;
  messages?: string[];
}

/** Returns the translation manifest status for a given URN. */
export async function getTranslationStatus(urn: string): Promise<TranslationStatus> {
  const token = await getInternalToken();

  const res = await fetch(
    `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/manifest`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status === 404) return { status: 'n/a', progress: '' };
  if (!res.ok) throw new Error(`Manifest check failed (${res.status}): ${await res.text()}`);

  const manifest = await res.json();
  const messages = (manifest.derivatives ?? []).flatMap((d: any) =>
    (d.messages ?? []).map((m: any) => m.message ?? JSON.stringify(m))
  );

  return {
    status:   manifest.status ?? 'n/a',
    progress: manifest.progress ?? '',
    messages: messages.length ? messages : undefined,
  };
}
