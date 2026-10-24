import { cacheGet, cacheSet, quotaPolicy, singleFlight } from './quota';
import { fetchUpstream as fetch } from './http';
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
 * Every authenticated Function pays one Appwrite round trip for this, so a
 * verified answer is cached **per isolate** for a short, configurable TTL
 * (default 60 s, `QUOTA_SESSION_CACHE_TTL_MS`), keyed by the SHA-256 of the
 * token — the token itself never becomes a map key. The tradeoff is bounded
 * and deliberate: within one isolate a token that was just revoked (logout,
 * suspension taking effect) may be honoured for up to that TTL. Set the TTL
 * to `0` to disable the cache entirely. Concurrent probes for the same token
 * are coalesced so a burst of parallel requests costs one `GET /account`.
 *
 * Returns `null` for every failure mode: no header, a JWT that is expired or
 * was revoked, or a Function that is missing its `[vars]`. Failures are never
 * cached — a transient Appwrite hiccup must not lock everyone out for a
 * minute.
 */
export async function verifySession(request: Request, env: Env): Promise<Session | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const endpoint = env.PUBLIC_APPWRITE_ENDPOINT?.replace(/\/+$/, '');
  const projectId = env.PUBLIC_APPWRITE_PROJECT_ID;
  if (!endpoint || !projectId) return null;

  const policy = quotaPolicy(env);
  if (policy.sessionCacheTtlMs > 0) {
    const cached = cacheGet<Session>(`session:${await sha256Hex(token)}`);
    if (cached) return cached;
  }

  return singleFlight(`session:${token.slice(0, 8)}`, async () => {
    try {
      const response = await fetch(`${endpoint}/account`, {
        headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-JWT': token },
      });
      if (!response.ok) return null;
      const account = (await response.json()) as { $id?: unknown; email?: unknown };
      if (typeof account.$id !== 'string' || account.$id === '') return null;
      const session = { userId: account.$id, email: typeof account.email === 'string' ? account.email : '' };
      if (policy.sessionCacheTtlMs > 0) {
        cacheSet(`session:${await sha256Hex(token)}`, session, policy.sessionCacheTtlMs);
      }
      return session;
    } catch {
      // Appwrite unreachable: fail closed. Never let an unverified caller in.
      return null;
    }
  });
}

/** SHA-256 hex of a token — used to key the session cache without storing the token. */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Appwrite ≥2.4 expects each query as a JSON object (`{ method, attribute,
 * values }`) at a numeric-index key — the legacy `limit(100)` string form
 * errors with "Invalid query: Syntax error".
 *
 * Single query only: returns a ready-to-append `queries[0]=…` string. When
 * more than one query goes on the same URL use {@link querySearchAll} —
 * Appwrite keeps only the *last* value per index, so repeating `queries[0]`
 * silently drops every earlier query (that bug hid the owner filter from the
 * admin drill-down and counted every user's rows as one).
 */
export function querySearch(
  method: string,
  values: unknown[],
  attribute: string | null = null,
): string {
  const json = JSON.stringify({ method, attribute, values });
  return `queries[0]=${encodeURIComponent(json)}`;
}

type QuerySpec = { method: string; values: unknown[]; attribute?: string | null };

/**
 * Several queries on one URL, numbered `queries[0]…queries[n]` so Appwrite
 * honours all of them. `values` must be the query's *own* value array
 * (e.g. `['select']` flattened with the attribute names), never a nested
 * array — Appwrite rejects `[["a","b"]]` with a 400.
 */
export function querySearchAll(queries: ReadonlyArray<QuerySpec>): string {
  return queries
    .map((query, index) => {
      const json = JSON.stringify({
        method: query.method,
        attribute: query.attribute ?? null,
        values: query.values,
      });
      return `queries[${index}]=${encodeURIComponent(json)}`;
    })
    .join('&');
}
