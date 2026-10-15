import type { Env } from './types';

export type Session = { userId: string; email: string };

/**
 * Resolves the Appwrite session a request carries.
 *
 * The browser mints a JWT with `account.createJWT()` and sends it as
 * `Authorization: Bearer …`; the Function then calls `GET /account` with that
 * JWT to learn *who* is calling. That endpoint answers without an API key, so
 * the project never has to store a server credential — the only secret here is
 * one the caller already holds, and it expires on Appwrite's schedule.
 *
 * Returns `null` for every failure mode: no header, a JWT that is expired or
 * was revoked, or a Function that is missing its `[vars]`.
 */
export async function verifySession(request: Request, env: Env): Promise<Session | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const endpoint = env.PUBLIC_APPWRITE_ENDPOINT?.replace(/\/+$/, '');
  const projectId = env.PUBLIC_APPWRITE_PROJECT_ID;
  if (!endpoint || !projectId) return null;

  try {
    const response = await fetch(`${endpoint}/account`, {
      headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-JWT': token },
    });
    if (!response.ok) return null;
    const account = (await response.json()) as { $id?: unknown; email?: unknown };
    if (typeof account.$id !== 'string' || account.$id === '') return null;
    return { userId: account.$id, email: typeof account.email === 'string' ? account.email : '' };
  } catch {
    // Appwrite unreachable: fail closed. Never let an unverified caller in.
    return null;
  }
}

/**
 * Appwrite ≥2.4 expects each query as a JSON object (`{ method, attribute,
 * values }`) at a numeric-index key — the legacy `limit(100)` string form
 * errors with "Invalid query: Syntax error". Returns a ready-to-append
 * `queries[0]=...` search string; chain several with `&` after renumbering
 * the index (see the admin users list).
 */
export function querySearch(
  method: string,
  values: unknown[],
  attribute: string | null = null,
): string {
  const json = JSON.stringify({ method, attribute, values });
  return `queries[0]=${encodeURIComponent(json)}`;
}
