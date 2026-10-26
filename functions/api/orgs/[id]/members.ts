import { writeAudit } from '../../../_lib/audit';
import { apiError, json } from '../../../_lib/http';
import { enforceLimit } from '../../../_lib/quota';
import { createRow, getRow, listRows } from '../../../_lib/rows';
import { requireOrg, requireOrgOwner } from '../../../_lib/orgs';
import type { Env, PagesFunction } from '../../../_lib/types';

/**
 * `GET  /api/orgs/<id>/members` — everyone attached to the org: active
 *   members plus invitations still pending (any member may read this).
 * `POST /api/orgs/<id>/members` — invite by email (owner only).
 *
 * The invite model, stated once: an invitation is a `memberships` row with
 * `status: 'pending'`, an empty `userId`, and the invitee's EMAIL. It grants
 * nothing until `POST /api/orgs/accept` (called on every authenticated load)
 * flips it to `active` with the accepter's userId — matched by email, so the
 * invited person may register after the invite and still land in the org.
 *
 * Re-inviting an address is idempotent: the unique `(orgId, inviteEmail)`
 * index makes a duplicate create fail, and the failure is answered by
 * re-reading the existing row and returning it — two admins clicking invite
 * at once, or a double-tap, both end at the same single invitation. An email
 * that is ALREADY an active member is a 409, because re-inviting a member is
 * a real mistake worth surfacing, not a no-op.
 *
 * There is no "add directly" path: inviting *is* adding, and the target
 * accepts on next login. One flow, one row shape, no half-joined members.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 320;

type MemberRow = Record<string, unknown> & { $id: string };

function memberView(row: MemberRow, callerUserId: string, ownerUserId: string) {
  const userId = typeof row.userId === 'string' ? row.userId : '';
  const email = typeof row.inviteEmail === 'string' ? row.inviteEmail : '';
  const role = row.role === 'owner' ? 'owner' : 'member';
  const status = row.status === 'active' ? 'active' : 'pending';
  return {
    id: row.$id,
    email,
    role,
    status,
    isOwner: row.$id !== undefined && userId === ownerUserId && role === 'owner',
    isMe: userId === callerUserId && status === 'active',
  };
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const orgId = typeof params.id === 'string' ? params.id : '';

  if (request.method === 'GET') {
    const gate = await requireOrg(request, env, orgId);
    if (!gate.ok) return gate.response;
    const { auth, session } = gate.access;

    const rows = await listRows(
      auth,
      'memberships',
      [
        { method: 'equal', attribute: 'orgId', values: [orgId] },
        // Owner first, then everyone else; Appwrite cannot order by two
        // attributes with different directions here, so the small in-memory
        // sort below puts the owner at the top for the settings table.
        { method: 'orderDesc', attribute: 'createdAt', values: [] },
        { method: 'limit', values: [100] },
      ],
      env,
    );
    if (rows === null) {
      return apiError(503, 'unavailable', 'Daftar anggota belum bisa dibaca. Coba lagi.');
    }

    const org = await getRow(auth, 'organizations', orgId, env);
    const ownerUserId = org && typeof org.ownerId === 'string' ? org.ownerId : '';
    const members = rows
      .map((row) => memberView(row, session.userId, ownerUserId))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner));

    return json(200, { members });
  }

  if (request.method === 'POST') {
    const gate = await requireOrgOwner(request, env, orgId);
    if (!gate.ok) return gate.response;
    const { auth, session } = gate.access;

    const limited = enforceLimit('org-invite', `${orgId}:${session.userId}`, env);
    if (limited) return limited;

    let body: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = await request.json();
      if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
    } catch {
      body = null;
    }
    if (!body) return apiError(400, 'validation', 'Format permintaan tidak valid.');

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email === '' || email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
      return apiError(400, 'validation', 'Masukkan alamat email yang valid.');
    }

    // Same-address row? Idempotent re-invite or a genuine conflict (below).
    const existing = await listRows(
      auth,
      'memberships',
      [
        { method: 'equal', attribute: 'orgId', values: [orgId] },
        { method: 'equal', attribute: 'inviteEmail', values: [email] },
        { method: 'limit', values: [1] },
      ],
      env,
    );
    if (existing === null) {
      return apiError(503, 'unavailable', 'Undangan gagal diproses. Coba lagi.');
    }
    const found = existing[0];
    if (found && found.status === 'active') {
      return apiError(409, 'conflict', 'Email ini sudah menjadi anggota organisasi.');
    }
    if (found) {
      return json(200, { invite: memberView(found, session.userId, '') });
    }

    const created = await createRow(
      auth,
      'memberships',
      'mem_' + cryptoId(),
      {
        orgId,
        userId: '', // empty until the invitee accepts (see header)
        role: 'member',
        status: 'pending',
        inviteEmail: email,
        invitedBy: session.userId,
        createdAt: new Date().toISOString(),
      },
      [],
    );
    if (!created) {
      // Lost a create race against the unique (orgId, inviteEmail) index:
      // the invitation now exists — return it rather than an error.
      const raced = await listRows(
        auth,
        'memberships',
        [
          { method: 'equal', attribute: 'orgId', values: [orgId] },
          { method: 'equal', attribute: 'inviteEmail', values: [email] },
          { method: 'limit', values: [1] },
        ],
        env,
      );
      if (raced?.[0]) {
        return json(200, { invite: memberView(raced[0], session.userId, '') });
      }
      return apiError(500, 'unavailable', 'Undangan gagal dibuat. Coba lagi.');
    }

    await writeAudit(env, {
      actorId: session.userId,
      actorEmail: session.email,
      action: 'org.invite',
      targetType: 'organization',
      targetId: orgId,
      detail: JSON.stringify({ email }),
      orgId,
    });

    return json(201, { invite: memberView(created, session.userId, '') });
  }

  return apiError(405, 'method_not_allowed', 'Gunakan GET atau POST.', { allow: 'GET, POST' });
};

/** 16 hex chars — same shape the org ids use, from the same source. */
function cryptoId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
