import { verifySession, type Session } from './appwrite';
import { apiError } from './http';
import { deleteRow, getRow, listRows, tableAuth, type ListQuery, type TableAuth } from './rows';
import type { Env } from './types';

/**
 * The tenancy gate every organization-scoped Function walks through.
 *
 * Multi-tenancy decision (recorded in `docs/multi-tenancy.md`): every
 * tenanted read/write is served by a Pages Function with the API key, and the
 * ONLY authority for "may this caller touch org X" is an `active` row in
 * `memberships` matching (orgId, session.userId). The browser never supplies
 * membership — it supplies an orgId *hint*, which this module resolves.
 *
 * Read cost per call: one membership read (`byOrg` index: orgId + userId is
 * effectively a lookup). Deliberately NOT cached in-isolate: a member the
 * owner just removed must lose access on the very next request, and a cached
 * membership would keep them in for the TTL. `verifySession` still caches the
 * session probe itself, so the JWT verification is not repeated per call.
 */

export type OrgRole = 'owner' | 'member';

/** A membership row, exactly as stored. */
export type MembershipRow = Record<string, unknown> & { $id: string };

/** Everything an authorized tenanted handler is handed. */
export type OrgAccess = {
  session: Session;
  auth: TableAuth;
  /** The organization the caller is acting inside (validated format). */
  orgId: string;
  membership: MembershipRow;
  /** Owner or member — endpoints that manage the org itself check this. */
  role: OrgRole;
};

export type OrgGate = { ok: true; access: OrgAccess } | { ok: false; response: Response };

/**
 * Org ids are server-generated (`org_` + 16 hex). The format check exists so
 * a garbage or oversized id dies as a 400 before it reaches an index lookup —
 * not as a security boundary (membership lookup is that).
 */
export function isValidOrgId(value: unknown): value is string {
  return typeof value === 'string' && /^org_[0-9a-f]{16}$/.test(value);
}

/** The caller's membership row for `orgId`, or `null` (absent or not active). */
export async function findMembership(
  auth: TableAuth,
  orgId: string,
  userId: string,
  env?: Env,
): Promise<MembershipRow | null> {
  const queries: ListQuery[] = [
    { method: 'equal', attribute: 'orgId', values: [orgId] },
    // `status` participates in the match, not just as a filter: a pending
    // invite must never grant access, even to its own email address.
    { method: 'equal', attribute: 'userId', values: [userId] },
    { method: 'equal', attribute: 'status', values: ['active'] },
    { method: 'limit', values: [1] },
  ];
  const rows = await listRows(auth, 'memberships', queries, env);
  return rows?.[0] ?? null;
}

/**
 * Verifies session + membership in one step. Every failure mode is chosen so
 * the response cannot be used to probe: an unknown org and a known-but-foreign
 * org both answer the same 404, and only a *member* can ever learn that an id
 * exists.
 *
 * - bad orgId shape → 400 `validation`
 * - no session → 401 `unauthenticated`
 * - no API key env → 503 `unavailable` (the gate cannot fail open)
 * - no active membership → 404 `not_found`
 */
export async function requireOrg(request: Request, env: Env, orgId: unknown): Promise<OrgGate> {
  if (!isValidOrgId(orgId)) {
    return { ok: false, response: apiError(400, 'validation', 'Organisasi tidak valid.') };
  }
  const session = await verifySession(request, env);
  if (!session) {
    return {
      ok: false,
      response: apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.'),
    };
  }
  const auth = tableAuth(env);
  if (!auth) {
    return { ok: false, response: apiError(503, 'unavailable', 'Layanan sedang tidak tersedia.') };
  }
  const membership = await findMembership(auth, orgId, session.userId, env);
  if (!membership) {
    return {
      ok: false,
      response: apiError(404, 'not_found', 'Organisasi tidak ditemukan.'),
    };
  }
  const role: OrgRole = membership.role === 'owner' ? 'owner' : 'member';
  return { ok: true, access: { session, auth, orgId, membership, role } };
}

/**
 * Same gate, plus the owner check — for endpoints that manage the org itself
 * (rename, delete, invite, remove). A *member* has legitimately seen the org,
 * so they get a 403 they understand; a non-member never gets this far (404).
 */
export async function requireOrgOwner(
  request: Request,
  env: Env,
  orgId: unknown,
): Promise<OrgGate> {
  const gate = await requireOrg(request, env, orgId);
  if (!gate.ok) return gate;
  if (gate.access.role !== 'owner') {
    return {
      ok: false,
      response: apiError(403, 'forbidden', 'Hanya owner organisasi yang bisa melakukan ini.'),
    };
  }
  return gate;
}

/** The organization row, or `null`. */
export async function readOrg(
  auth: TableAuth,
  orgId: string,
  env?: Env,
): Promise<(Record<string, unknown> & { $id: string }) | null> {
  return getRow(auth, 'organizations', orgId, env);
}

/**
 * Every organization `userId` has an ACTIVE membership in, newest join first.
 * The login gate asks this: zero rows means "force create first organization".
 * `null` means the provider failed — never rendered as "you have no orgs".
 */
export async function listActiveMemberships(
  auth: TableAuth,
  userId: string,
  env?: Env,
): Promise<MembershipRow[] | null> {
  return listRows(
    auth,
    'memberships',
    [
      { method: 'equal', attribute: 'userId', values: [userId] },
      { method: 'equal', attribute: 'status', values: ['active'] },
      { method: 'orderDesc', attribute: 'createdAt', values: [] },
      { method: 'limit', values: [100] },
    ],
    env,
  );
}

/** Every ACTIVE membership row of one org — the cascade-delete page walk. */
export async function listOrgMemberships(
  auth: TableAuth,
  orgId: string,
  env?: Env,
): Promise<MembershipRow[] | null> {
  return listRows(
    auth,
    'memberships',
    [
      { method: 'equal', attribute: 'orgId', values: [orgId] },
      { method: 'equal', attribute: 'status', values: ['active'] },
      { method: 'limit', values: [100] },
    ],
    env,
  );
}

/**
 * Removes one member from one org (owner's "remove member" action, and the
 * self-leave action). Idempotent: an already-gone row still answers `true`,
 * because "they are not in the org anymore" is the outcome both callers want.
 * The pending-invite twin of this row goes too — an email must not keep a
 * dangling invitation to an org the user has left.
 */
export async function removeMembership(
  auth: TableAuth,
  membershipRowId: string,
  env?: Env,
): Promise<boolean> {
  return deleteRow(auth, 'memberships', membershipRowId, env);
}
