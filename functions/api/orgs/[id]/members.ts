import { apiError, json } from '../../../_lib/http';
import { getRow, listRows } from '../../../_lib/rows';
import { requireOrg, requireOrgOwner } from '../../../_lib/orgs';
import type { Env, PagesFunction } from '../../../_lib/types';

/**
 * `GET  /api/orgs/<id>/members` — everyone attached to the org: active
 *   members plus invitations still pending (any member may read this).
 * `POST /api/orgs/<id>/members` — invite by email (owner only) — **coming
 *   soon**: the invitation EMAIL is not wired up yet (no resend service), so
 *   the endpoint refuses instead of stranding a pending row nobody is told
 *   about. The UI shows the same "segera hadir" state. GET keeps listing
 *   whatever invitations already exist, and `accept` keeps sweeping them.
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

    return apiError(
      503,
      'unavailable',
      'Undang anggota segera hadir — undangan otomatis belum bisa dikirim.',
    );
  }

  return apiError(405, 'method_not_allowed', 'Gunakan GET atau POST.', { allow: 'GET, POST' });
};
