import { mintJwt } from '../appwrite/client';
import { appErrorFromStatus } from './errors';
import { AppError, ERROR_CODES } from '../core/shared/errors';

/**
 * The browser's half of `/api/orgs…` — tenancy management (list, create,
 * rename, cascade-delete, invites, membership) the same way the rest of the
 * app talks to its Functions:
 *
 * - the session JWT is minted here and the server resolves *who* is calling;
 * - the org id always rides as a path/query value the server re-verifies
 *   against the caller's membership row (`requireOrg`), never as authority;
 * - failures map through the shared status mapping, so the UI sees a typed
 *   `conflict` for "already a member" and a `forbidden` for "not the owner".
 *
 * The shapes below mirror `functions/api/orgs*.ts` exactly — one place where
 * the contract is written down on the client.
 */

export type OrgRole = 'owner' | 'member';

/** One row of the switcher, from `GET /api/orgs`. */
export type OrgView = {
  id: string;
  name: string;
  role: OrgRole;
  isOwner: boolean;
  plan: string;
  /** Whether the org's paid plan is currently active (not expired). */
  active: boolean;
  /** The org's business-type slug (taxonomy), or `null` when never chosen. */
  businessType: string | null;
};

/** An invitation addressed to this account's email, still unaccepted. */
export type PendingInvite = { orgId: string; name: string };

/** One row of `GET /api/orgs/<id>/members`. */
export type OrgMember = {
  id: string;
  email: string;
  role: OrgRole;
  status: 'active' | 'pending';
  isOwner: boolean;
  isMe: boolean;
};

/**
 * Ceiling on cascade rounds. Each `DELETE` wipes up to 30 rows, so 200 rounds
 * covers six thousand rows — far beyond any real workspace — and a loop that
 * somehow never terminates fails loudly instead of spinning forever.
 */
const DELETE_MAX_ROUNDS = 200;

async function bearerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let jwt: string;
  try {
    jwt = await mintJwt();
  } catch (error) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Silakan masuk terlebih dahulu.', {
      cause: error,
    });
  }
  try {
    // `Headers` normalises whatever shape the caller passed (object, array,
    // another Headers) instead of spreading it — a spread of the array form
    // would produce numeric index keys, not header names.
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${jwt}`);
    return await fetch(path, { ...init, headers });
  } catch {
    throw new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
    );
  }
}

async function serverMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  return body;
}

/** Validates an id against the server's own format before it reaches a URL. */
function assertOrgId(orgId: string): void {
  if (!/^org_[0-9a-f]{16}$/.test(orgId)) {
    throw new AppError(ERROR_CODES.VALIDATION, 'Organisasi tidak valid.');
  }
}

/**
 * Every organization this account has an ACTIVE membership in, plus invites
 * still waiting for the email. `no-store` server-side: it is the caller's own
 * tenancy map.
 */
export async function listOrgs(): Promise<{ orgs: OrgView[]; pending: PendingInvite[] }> {
  const response = await bearerFetch('/api/orgs');
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  const body = await readJson(response);
  const orgs = Array.isArray(body.orgs) ? (body.orgs as OrgView[]) : [];
  const pending = Array.isArray(body.pending) ? (body.pending as PendingInvite[]) : [];
  return { orgs, pending };
}

/**
 * Turns every invitation addressed to this account's email into an active
 * membership. Called once per authenticated load by the org gate — the moment
 * an invited address signs up or logs in, its orgs become theirs without a
 * click. Returns the org ids that flipped (empty is the normal case).
 */
export async function acceptPendingInvites(): Promise<string[]> {
  const response = await bearerFetch('/api/orgs/accept', { method: 'POST' });
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  const body = await readJson(response);
  return Array.isArray(body.accepted) ? (body.accepted as string[]) : [];
}

/**
 * Creates an organization — the forced "first organization" screen posts here,
 * and the same call makes a second workspace later. The response is the view
 * the switcher renders, ready to be made active.
 */
export async function createOrg(name: string): Promise<OrgView> {
  const response = await bearerFetch('/api/orgs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  const body = await readJson(response);
  const org = body.org as OrgView | undefined;
  if (!org?.id) throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  return org;
}

/** Renames an organization (owner only; the server answers 403 otherwise). */
export async function renameOrg(orgId: string, name: string): Promise<void> {
  assertOrgId(orgId);
  const response = await bearerFetch(`/api/orgs/${orgId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
}

/**
 * Sets (or clears, with `null`) the organization's business type. Owner only;
 * the server validates the slug against the taxonomy and answers 400 for an
 * unknown one.
 */
export async function setOrgBusinessType(
  orgId: string,
  businessType: string | null,
): Promise<void> {
  assertOrgId(orgId);
  const response = await bearerFetch(`/api/orgs/${orgId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ businessType }),
  });
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
}

/**
 * Deletes an organization and everything under it, driving the server's
 * budgeted cascade to completion: each call wipes up to 30 rows and answers
 * `{ done: false }` until the wipe finishes. The loop is bounded so a server
 * that never answers `done` fails loudly instead of hanging the tab.
 */
export async function deleteOrgCascade(orgId: string): Promise<void> {
  assertOrgId(orgId);
  for (let round = 0; round < DELETE_MAX_ROUNDS; round += 1) {
    const response = await bearerFetch(`/api/orgs/${orgId}`, { method: 'DELETE' });
    if (!response.ok) {
      throw appErrorFromStatus(response.status, await serverMessage(response));
    }
    const body = await readJson(response);
    if (body.done === true) return;
  }
  throw new AppError(
    ERROR_CODES.UNKNOWN,
    'Penghapusan melebihi batas. Muat ulang lalu coba lagi — penghapusan akan dilanjutkan.',
  );
}

/** Everyone attached to the org: active members plus pending invitations. */
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  assertOrgId(orgId);
  const response = await bearerFetch(`/api/orgs/${orgId}/members`);
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  const body = await readJson(response);
  return Array.isArray(body.members) ? (body.members as OrgMember[]) : [];
}

/**
 * Invites an email to the org (owner only). Idempotent on the server: a
 * duplicate invite returns the existing row, while inviting someone who is
 * already an active member is a `conflict` worth showing.
 */
export async function inviteOrgMember(orgId: string, email: string): Promise<OrgMember> {
  assertOrgId(orgId);
  const response = await bearerFetch(`/api/orgs/${orgId}/members`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  const body = await readJson(response);
  const invite = body.invite as OrgMember | undefined;
  if (!invite?.id) throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  return invite;
}

/**
 * One membership row out of the org — the owner removing someone (or
 * withdrawing an invitation), or any member removing themselves (leaving).
 * The owner cannot be removed this way, including by themselves; the server
 * decides all of that, this just surfaces its answer.
 */
export async function removeOrgMember(orgId: string, membershipId: string): Promise<void> {
  assertOrgId(orgId);
  const response = await bearerFetch(
    `/api/orgs/${orgId}/members/${encodeURIComponent(membershipId)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
}
