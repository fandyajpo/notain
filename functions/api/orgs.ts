import { writeAudit } from '../_lib/audit';
import { verifySession } from '../_lib/appwrite';
import { apiError, json } from '../_lib/http';
import { enforceLimit } from '../_lib/quota';
import { createRow, deleteRow, getRow, listRows, tableAuth } from '../_lib/rows';
import { isSubscriptionActive } from '../../src/core/billing/plans';
import type { Env, PagesFunction } from '../_lib/types';

/**
 * `GET  /api/orgs` — the org switcher's data: every organization the caller
 *   has an ACTIVE membership in, plus invites still waiting for their email.
 * `POST /api/orgs` — create an organization (and the caller's owner
 *   membership, and its business-identity profile row). This is the endpoint
 *   the forced "create your first organization" screen posts to, and the same
 *   one a signed-in user hits later to make a second workspace.
 *
 * Why one route file: Pages Functions route `/api/orgs` to this file and
 * `/api/orgs/<id>` to `functions/api/orgs/[id].ts` — keeping list/create
 * together mirrors how the app treats "my organizations" as one view.
 *
 * Writes cost three rows (org + membership + profile) and the product has no
 * per-month cap on organizations, so the only fence is `org-create`
 * (10/hour/user) — enough for any human setup flow, useless as a mint cannon.
 *
 * Every row is created with permissions `[]`: tenanted rows are API-key-only
 * in this architecture, and membership — not row permissions — is the gate.
 */

const ORG_ID_PATTERN = /^org_[0-9a-f]{16}$/;
const NAME_MAX = 128;

function newOrgId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `org_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** The shape the switcher renders, per membership. */
function orgView(row: Record<string, unknown>, role: string, isOwner: boolean) {
  const plan = typeof row.plan === 'string' ? row.plan : 'free';
  return {
    id: row.$id,
    name: typeof row.name === 'string' && row.name !== '' ? row.name : 'Organisasi',
    role,
    isOwner,
    plan,
    active: isSubscriptionActive(
      plan,
      typeof row.planExpiresAt === 'string' ? row.planExpiresAt : null,
    ),
  };
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Gunakan GET atau POST.', { allow: 'GET, POST' });
  }

  const session = await verifySession(request, env);
  if (!session) return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');

  const auth = tableAuth(env);
  if (!auth) return apiError(503, 'unavailable', 'Layanan sedang tidak tersedia.');

  if (request.method === 'GET') {
    const memberships = await listRows(
      auth,
      'memberships',
      [
        { method: 'equal', attribute: 'userId', values: [session.userId] },
        { method: 'equal', attribute: 'status', values: ['active'] },
        { method: 'orderDesc', attribute: 'createdAt', values: [] },
        { method: 'limit', values: [100] },
      ],
      env,
    );
    if (memberships === null) {
      return apiError(503, 'unavailable', 'Daftar organisasi belum bisa dibaca. Coba lagi.');
    }

    // Invites addressed to this account's email that it has not accepted yet.
    // Matched by EMAIL, not userId: an invite is created before the invited
    // person ever exists as a member (they may not even have an account).
    const pendingRows = await listRows(
      auth,
      'memberships',
      [
        { method: 'equal', attribute: 'inviteEmail', values: [session.email.toLowerCase()] },
        { method: 'equal', attribute: 'status', values: ['pending'] },
        { method: 'limit', values: [50] },
      ],
      env,
    );
    if (pendingRows === null) {
      return apiError(503, 'unavailable', 'Undangan belum bisa dibaca. Coba lagi.');
    }

    // One org row per membership — bounded by the 100-membership cap above,
    // so this is a handful of id lookups for any real account, never a scan.
    const orgs = [];
    for (const membership of memberships) {
      const orgId = typeof membership.orgId === 'string' ? membership.orgId : '';
      if (!ORG_ID_PATTERN.test(orgId)) continue;
      const org = await getRow(auth, 'organizations', orgId, env);
      if (!org) continue; // org deleted under a stale membership row — skip it
      const role = membership.role === 'owner' ? 'owner' : 'member';
      orgs.push(orgView(org, role, role === 'owner'));
    }

    const pending = [];
    for (const invite of pendingRows) {
      const orgId = typeof invite.orgId === 'string' ? invite.orgId : '';
      if (!ORG_ID_PATTERN.test(orgId)) continue;
      const org = await getRow(auth, 'organizations', orgId, env);
      if (!org) continue;
      pending.push({ orgId, name: typeof org.name === 'string' ? org.name : 'Organisasi' });
    }

    // `no-store` is the json() default: this is the caller's own tenancy map.
    return json(200, { orgs, pending });
  }

  // ── POST: create ────────────────────────────────────────────────────────
  const limited = enforceLimit('org-create', session.userId, env);
  if (limited) return limited;

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!body) return apiError(400, 'validation', 'Format permintaan tidak valid.');

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name === '' || name.length > NAME_MAX) {
    return apiError(400, 'validation', 'Nama organisasi wajib diisi (maksimal 128 karakter).');
  }
  const businessName =
    typeof body.businessName === 'string' && body.businessName.trim() !== ''
      ? body.businessName.trim().slice(0, NAME_MAX)
      : null;

  const orgId = newOrgId();
  const now = new Date().toISOString();

  const org = await createRow(
    auth,
    'organizations',
    orgId,
    {
      name,
      ownerId: session.userId,
      // Billing is per organization: every new org starts free. Nothing a
      // caller sends here can bootstrap a plan — only checkout/settlement
      // (API key, server-priced) ever writes these two columns.
      plan: 'free',
      planExpiresAt: null,
      createdAt: now,
    },
    [],
  );
  if (!org) return apiError(500, 'unavailable', 'Gagal membuat organisasi. Coba lagi.');

  const membership = await createRow(
    auth,
    'memberships',
    // Explicit id so org + owner-membership creation is distinguishable from
    // a partial failure: if this returns null the org exists WITHOUT an owner
    // and must be cleaned up before answering (below).
    newOrgId(),
    {
      orgId,
      userId: session.userId,
      role: 'owner',
      status: 'active',
      inviteEmail: session.email.toLowerCase(),
      invitedBy: session.userId,
      createdAt: now,
    },
    [],
  );
  if (!membership) {
    // Never leave an ownerless org behind: it would be undeletable by anyone.
    await deleteRow(auth, 'organizations', orgId, env);
    return apiError(500, 'unavailable', 'Gagal membuat organisasi. Coba lagi.');
  }

  // The business identity row, keyed by orgId (its document id IS the org).
  // `name` seeds from the org name; everything else is filled in Settings.
  // Written with the profile Function's column whitelist so an unknown key
  // can never reject the row.
  const profile = await createRow(
    auth,
    'profiles',
    orgId,
    {
      name,
      businessName,
      phone: '',
      address: null,
      email: session.email,
      logoFileId: null,
      businessType: null,
      plan: 'free',
      planExpiresAt: null,
    },
    [`read("user:${session.userId}")`],
  );
  if (!profile) {
    // Non-fatal: an org without a profile row is still fully usable — the
    // profile Function creates the row on the first settings save. The owner
    // membership above is the part that must not fail, and it succeeded.
    console.error(`org.create: profile row failed for ${orgId}`);
  }

  await writeAudit(env, {
    actorId: session.userId,
    actorEmail: session.email,
    action: 'org.create',
    targetType: 'organization',
    targetId: orgId,
    detail: JSON.stringify({ name }),
    orgId,
  });

  return json(201, { org: orgView(org, 'owner', true) });
};
