import type { Env } from './types';

/**
 * Talking to the Appwrite REST API with the server's API key — the one
 * credential pattern admin uses (`functions/api/admin/*`), reused here for the
 * public invoice read and the customer's payment-proof write. The key never
 * reaches the browser.
 *
 * `documents.*` scopes cover rows; the collection ids match
 * `src/appwrite/config.ts`, which the browser uses through the SDK. Keep the
 * two in sync when adding tables.
 */

const DATABASE_ID = 'notain_db';

export type TableId = 'invoices' | 'profiles' | 'templates' | 'payments';

/** API-key headers against Appwrite, or `null` when the env is incomplete. */
export type TableAuth = { endpoint: string; headers: Record<string, string> };

export function tableAuth(env: Env): TableAuth | null {
  const endpoint = env.PUBLIC_APPWRITE_ENDPOINT?.replace(/\/+$/, '');
  const projectId = env.PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY;
  if (!endpoint || !projectId || !apiKey) return null;
  return {
    endpoint,
    headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': apiKey },
  };
}

/**
 * Reads one row by id. A missing row is `null` — indistinguishable from an
 * unreadable one, on purpose: the public invoice endpoint answers 404 for
 * both, so an id cannot be probed for existence separately from ownership.
 */
export async function getRow(
  auth: { endpoint: string; headers: Record<string, string> },
  table: TableId,
  rowId: string,
): Promise<(Record<string, unknown> & { $id: string }) | null> {
  const response = await fetch(
    `${auth.endpoint}/databases/${DATABASE_ID}/collections/${table}/documents/${encodeURIComponent(rowId)}`,
    { headers: auth.headers },
  );
  if (!response.ok) return null;
  try {
    return (await response.json()) as Record<string, unknown> & { $id: string };
  } catch {
    return null;
  }
}

/**
 * Creates a row with an explicit id and permissions. Returns the created row,
 * or `null` when Appwrite refuses (duplicate id, missing required column, …) —
 * the same shape contract as {@link getRow}, so a caller can treat `null` as
 * "did not happen".
 */
export async function createRow(
  auth: { endpoint: string; headers: Record<string, string> },
  table: TableId,
  rowId: string,
  data: Record<string, unknown>,
  permissions: string[],
): Promise<(Record<string, unknown> & { $id: string }) | null> {
  const response = await fetch(
    `${auth.endpoint}/databases/${DATABASE_ID}/collections/${table}/documents`,
    {
      method: 'POST',
      headers: { ...auth.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ documentId: rowId, data, permissions }),
    },
  );
  if (!response.ok) return null;
  try {
    return (await response.json()) as Record<string, unknown> & { $id: string };
  } catch {
    return null;
  }
}

/**
 * Patches only the keys present in `data`; Appwrite's update endpoint ignores
 * absent keys, which is what lets the payment-proof write touch two columns
 * without carrying (or clobbering) the rest of the row.
 *
 * The payload must ride under a top-level `data` key: Appwrite's update
 * endpoint answers `document_missing_payload` for a flat body, regardless of
 * content type.
 */
export async function patchRow(
  auth: { endpoint: string; headers: Record<string, string> },
  table: TableId,
  rowId: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const response = await fetch(
    `${auth.endpoint}/databases/${DATABASE_ID}/collections/${table}/documents/${encodeURIComponent(rowId)}`,
    {
      method: 'PATCH',
      headers: { ...auth.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    },
  );
  return response.ok;
}
