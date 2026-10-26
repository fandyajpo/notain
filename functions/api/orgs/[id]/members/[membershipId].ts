import { writeAudit } from '../../../../_lib/audit';
import { apiError, json } from '../../../../_lib/http';
import { deleteRow, getRow } from '../../../../_lib/rows';
import { requireOrg } from '../../../../_lib/orgs';
import type { Env, PagesFunction } from '../../../../_lib/types';

/**
 * `DELETE /api/orgs/<id>/members/<membershipId>` — one row out of the org:
 * either the owner removing a member (or withdrawing a pending invitation),
 * or any member removing THEMSELVES (leaving).
 *
 * Two rules make this safe without extra tables:
 *
 * 1. The row is re-read and its `orgId` must equal the org in the path — a
 *    member of org A can never delete a membership of org B even if they
 *    learn its row id, because `requireOrg` already proved membership in A
 *    and this proves the row belongs to A.
 * 2. **The owner cannot be removed by anyone, including themselves.** A
 *    single-owner org whose owner left would have no one able to rename or
 *    delete it — an orphaned cascade. The owner exits by deleting the
 *    organization; a member exits by removing their own row here. A pending
 *    invitation (empty userId) can only be withdrawn by the owner.
 *
 * Removing membership is the access revocation moment in this architecture
 * (membership, not row permissions, is the gate) — the very next Function
 * call of a removed member 404s, because `requireOrg` never caches.
 */

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  if (request.method !== 'DELETE') {
    return apiError(405, 'method_not_allowed', 'Gunakan DELETE.', { allow: 'DELETE' });
  }

  const orgId = typeof params.id === 'string' ? params.id : '';
  const membershipId = typeof params.membershipId === 'string' ? params.membershipId : '';

  const gate = await requireOrg(request, env, orgId);
  if (!gate.ok) return gate.response;
  const { auth, session, role } = gate.access;

  const row = await getRow(auth, 'memberships', membershipId, env);
  // Wrong org (or no such row): one identical 404 either way, so a membership
  // id in another tenant cannot be probed from here.
  if (!row || (typeof row.orgId === 'string' && row.orgId !== orgId)) {
    return apiError(404, 'not_found', 'Anggota tidak ditemukan.');
  }

  const targetUserId = typeof row.userId === 'string' ? row.userId : '';
  const targetIsOwner = row.role === 'owner';
  const isSelf = targetUserId !== '' && targetUserId === session.userId;
  const pendingInvite = row.status !== 'active';

  if (targetIsOwner) {
    // Nobody removes the owner — not even the owner themselves (see header).
    return apiError(
      409,
      'conflict',
      'Owner tidak bisa keluar dari organisasinya. Hapus organisasi jika ingin berhenti.',
    );
  }
  if (role !== 'owner' && !isSelf) {
    // A plain member may only remove themselves; owner-only otherwise.
    return apiError(403, 'forbidden', 'Hanya owner yang bisa mengeluarkan anggota lain.');
  }
  if (pendingInvite && role !== 'owner') {
    // Pending rows belong to the invite, not yet to a person: a non-owner
    // cannot "withdraw" someone else's invitation by matching its row.
    return apiError(403, 'forbidden', 'Hanya owner yang bisa membatalkan undangan.');
  }

  if (!(await deleteRow(auth, 'memberships', membershipId, env))) {
    return apiError(500, 'unavailable', 'Gagal menghapus anggota. Coba lagi.');
  }

  await writeAudit(env, {
    actorId: session.userId,
    actorEmail: session.email,
    action: pendingInvite ? 'org.invite.revoke' : isSelf ? 'org.leave' : 'org.member.remove',
    targetType: 'organization',
    targetId: orgId,
    detail: JSON.stringify({ membershipId, targetUserId }),
    orgId,
  });

  return json(200, { ok: true, left: isSelf });
};
