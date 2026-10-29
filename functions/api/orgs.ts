import { writeAudit } from '../_lib/audit';
import { verifySession } from '../_lib/appwrite';
import { apiError, json } from '../_lib/http';
import { enforceLimit } from '../_lib/quota';
import { isAdminUser } from '../_lib/admin';
import { createRow, deleteRow, getRow, listRows, tableAuth } from '../_lib/rows';
import { isSubscriptionActive } from '../../src/core/billing/plans';
import { businessSubtypeSlugSchema } from '../../src/core/business/schema';
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
 * Writes cost three rows (org + membership + profile). Organizations are
 * capped by PLAN: one per owner on the free tier, any number once an org the
 * caller owns carries an active paid plan (see the plan gate below), plus a
 * loose `org-create` rate fence (10/hour/user) against being used as a mint
 * cannon.
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
  // Validated against the taxonomy on the way out, not just on the way in:
  // rows written before the PATCH guard, or after a slug was retired, read
  // back as `null` instead of flowing through the UI typed as valid.
  const type = businessSubtypeSlugSchema.safeParse(row.businessType);
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
    businessType: type.success ? type.data : null,
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

  // Plan gate — one organization on the free tier, a second one only on an
  // active paid plan (the pricing page's "Buat lebih dari 1 organisasi" is a
  // product fact, so the server refuses instead of the client hiding a
  // button). The FIRST org is always allowed: that is the forced onboarding
  // screen, and it must never be blocked by billing. An existing multi-org
  // account keeps every org it has — this only stops the next creation.
  // Admins skip the gate entirely: limits are for customers, not operators.
  const admin = await isAdminUser(session.userId, env);
  const ownedMemberships = admin
    ? []
    : await listRows(
        auth,
        'memberships',
        [
          { method: 'equal', attribute: 'userId', values: [session.userId] },
          { method: 'equal', attribute: 'status', values: ['active'] },
          { method: 'equal', attribute: 'role', values: ['owner'] },
          { method: 'limit', values: [100] },
        ],
        env,
      );
  if (ownedMemberships === null) {
    return apiError(503, 'unavailable', 'Organisasi belum bisa dibuat. Coba lagi.');
  }
  if (ownedMemberships.length > 0) {
    let hasPaidOrg = false;
    for (const membership of ownedMemberships) {
      const ownedOrgId = typeof membership.orgId === 'string' ? membership.orgId : '';
      if (!ORG_ID_PATTERN.test(ownedOrgId)) continue;
      const ownedOrg = await getRow(auth, 'organizations', ownedOrgId, env);
      if (
        ownedOrg &&
        isSubscriptionActive(
          typeof ownedOrg.plan === 'string' ? ownedOrg.plan : 'free',
          typeof ownedOrg.planExpiresAt === 'string' ? ownedOrg.planExpiresAt : null,
        )
      ) {
        hasPaidOrg = true;
        break;
      }
    }
    if (!hasPaidOrg) {
      return apiError(
        403,
        'forbidden',
        'Plan gratis hanya mendukung 1 organisasi. Upgrade ke Pro untuk membuat organisasi lain.',
      );
    }
  }

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
      // The business type starts unset; Settings picks it once.
      businessType: null,
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
  // The org's name/type stay on the org row — this profile row only carries
  // the contact fields, so the two can never drift.
  const profile = await createRow(
    auth,
    'profiles',
    orgId,
    {
      name,
      phone: '',
      address: null,
      email: session.email,
      logoFileId: null,
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
