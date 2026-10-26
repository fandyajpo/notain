import { querySearch, verifySession, type Session } from './appwrite';
import { apiError, fetchUpstream as fetch } from './http';
import { listRows, type ListQuery, type TableAuth } from './rows';
import { cacheGet, cacheSet, count, quotaPolicy } from './quota';
import type { Env } from './types';

const ADMIN_TEAM_ID = 'admins';

/** Verified caller plus the API-key plumbing every admin call needs. */
export type AdminRequest = {
  session: Session;
  endpoint: string;
  headers: Record<string, string>;
};

/**
 * The shared auth wall for `/api/admin/*`: a real session (JWT → `GET
 * /account`), complete server config, and membership in the `admins` team.
 *
 * Returns a discriminated union so each caller's first lines read as
 * `const gate = await requireAdmin(...); if (!gate.ok) return gate.response;`
 * and the success path holds everything needed to talk to Appwrite with the
 * API key (which never reaches the browser).
 */
export async function requireAdmin(
  request: Request,
  env: Env,
): Promise<{ ok: true; admin: AdminRequest } | { ok: false; response: Response }> {
  const session = await verifySession(request, env);
  if (!session) {
    return {
      ok: false,
      response: apiError(401, 'unauthenticated', 'Sesi tidak valid. Masuk ulang.'),
    };
  }

  const endpoint = env.PUBLIC_APPWRITE_ENDPOINT?.replace(/\/+$/, '');
  const projectId = env.PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY;
  if (!endpoint || !projectId || !apiKey) {
    return {
      ok: false,
      response: apiError(500, 'validation', 'Konfigurasi server tidak lengkap.'),
    };
  }

  const headers = {
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
  };

  const isAdmin = await checkAdmin(endpoint, headers, session.userId, env);
  if (!isAdmin) {
    return { ok: false, response: apiError(403, 'unauthenticated', 'Kamu bukan admin.') };
  }

  return { ok: true, admin: { session, endpoint, headers } };
}

/**
 * The organization a user is *primarily* attached to — their NEWEST active
 * membership.
 *
 * Since multi-tenancy nothing tenanted is user-keyed anymore: the business
 * profile is `profiles/<orgId>` and the plan lives on `organizations/<orgId>`,
 * so every admin operation addressed by `userId` must first resolve WHICH
 * org's rows the user means. Newest join wins, matching the order
 * `GET /api/orgs` returns — the same org the switcher opens first, so admin
 * and user see the same "current" workspace.
 *
 * `null` = the account has no active membership (never set up, or removed
 * from every org). Callers then show free/empty, or answer 404 for writes —
 * never another user's rows.
 */
export async function primaryOrgId(
  auth: TableAuth,
  userId: string,
  env?: Env,
): Promise<string | null> {
  const rows = await listRows(
    auth,
    'memberships',
    [
      { method: 'equal', attribute: 'userId', values: [userId] },
      { method: 'equal', attribute: 'status', values: ['active'] },
      { method: 'orderDesc', attribute: 'createdAt', values: [] },
      { method: 'limit', values: [1] },
    ],
    env,
  );
  const orgId = rows?.[0]?.orgId;
  return typeof orgId === 'string' && orgId !== '' ? orgId : null;
}

/**
 * Batched {@link primaryOrgId} for one page of accounts: ONE membership
 * query (`userId IN [...]`, newest first) instead of a per-user read.
 *
 * First row per user wins because the whole set is ordered newest-first, so
 * "first occurrence" *is* the newest membership. The page holds at most 50
 * accounts and the query caps at Appwrite's 100-row page — an account whose
 * memberships fall outside that window simply resolves to `null` (free/empty
 * in the list) rather than costing a N+1 walk of every membership.
 */
export async function primaryOrgIds(
  auth: TableAuth,
  userIds: string[],
  env?: Env,
): Promise<Map<string, string>> {
  const byUser = new Map<string, string>();
  if (userIds.length === 0) return byUser;

  const queries: ListQuery[] = [
    { method: 'equal', attribute: 'userId', values: userIds },
    { method: 'equal', attribute: 'status', values: ['active'] },
    { method: 'orderDesc', attribute: 'createdAt', values: [] },
    { method: 'limit', values: [100] },
  ];
  const rows = await listRows(auth, 'memberships', queries, env);
  if (rows === null) return byUser; // provider failure → show free, never guess

  for (const row of rows) {
    const userId = typeof row.userId === 'string' ? row.userId : '';
    const orgId = typeof row.orgId === 'string' ? row.orgId : '';
    if (userId === '' || orgId === '' || byUser.has(userId)) continue;
    byUser.set(userId, orgId);
  }
  return byUser;
}

/**
 * Team membership, cached per isolate for a short TTL (default 60 s,
 * `QUOTA_ADMIN_CACHE_TTL_MS`). Every admin endpoint used to pay one `GET
 * /teams/admins/memberships` round trip for a fact that changes rarely; both
 * answers are cached (a denial too, so a non-admin's page loads don't hammer
 * the endpoint either). The client mirrors this with its own 10-minute
 * `adminMembership` staleTime, so a 60 s server-side lag is within the app's
 * existing freshness contract. Membership changes apply at most one minute
 * late on this isolate — removal is not a security emergency because every
 * row also carries `read("team:admins")` permissions Appwrite re-checks with
 * the API key's own authority.
 */
async function checkAdmin(
  endpoint: string,
  headers: Record<string, string>,
  userId: string,
  env: Env,
): Promise<boolean> {
  const policy = quotaPolicy(env);
  const cacheKey = `admin:${userId}`;
  if (policy.adminCacheTtlMs > 0) {
    const cached = cacheGet<boolean>(cacheKey);
    if (typeof cached === 'boolean') return cached;
  }

  try {
    const response = await fetch(
      `${endpoint}/teams/${ADMIN_TEAM_ID}/memberships?${querySearch('equal', [userId], 'userId')}`,
      { headers },
    );
    if (!response.ok) return false;
    const data = (await response.json()) as { total?: number };
    const result = (data.total ?? 0) > 0;
    if (policy.adminCacheTtlMs > 0) {
      cacheSet(cacheKey, result, policy.adminCacheTtlMs);
      count('admin.membership.checked');
    }
    return result;
  } catch {
    // Unreachable or unparseable: fail closed, and cache nothing — a
    // transient blip must not lock the admin out for a whole TTL window.
    return false;
  }
}
