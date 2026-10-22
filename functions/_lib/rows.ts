import { count, quotaPolicy } from './quota';
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
 *
 * Transient failures (network error, 5xx) get a bounded number of retries
 * with exponential backoff — reads are idempotent, so this cannot duplicate
 * anything. The count defaults to one extra attempt (`QUOTA_APPWRITE_READ_RETRIES`)
 * because a retry spends quota too: the point is to ride out a blip, not to
 * hammer a provider that is already struggling. 4xx answers are never
 * retried, and writes are never retried at all.
 */
export async function getRow(
  auth: { endpoint: string; headers: Record<string, string> },
  table: TableId,
  rowId: string,
  env?: Env,
): Promise<(Record<string, unknown> & { $id: string }) | null> {
  const policy = quotaPolicy(env);
  const url = `${auth.endpoint}/databases/${DATABASE_ID}/collections/${table}/documents/${encodeURIComponent(rowId)}`;

  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { headers: auth.headers });
    } catch {
      if (attempt >= policy.appwriteReadRetries) return null;
      count('appwrite.read.retry');
      await sleep(policy.appwriteRetryBaseDelayMs * 2 ** attempt);
      continue;
    }
    if (!response.ok && response.status >= 500 && attempt < policy.appwriteReadRetries) {
      count('appwrite.read.retry');
      await sleep(policy.appwriteRetryBaseDelayMs * 2 ** attempt);
      continue;
    }
    if (!response.ok) return null;
    try {
      return (await response.json()) as Record<string, unknown> & { $id: string };
    } catch {
      return null;
    }
  }
}

/** Wall-clock sleep — I/O wait, which does not count against the 10 ms CPU budget. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
