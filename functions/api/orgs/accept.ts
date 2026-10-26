import { verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import { listRows, patchRow, tableAuth } from '../../_lib/rows';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `POST /api/orgs/accept` — turn every invitation addressed to the signed-in
 * account's email into an active membership.
 *
 * Invites are matched by EMAIL: `POST /api/orgs/<id>/members` creates a
 * `pending` row before (and possibly without) the invited person having an
 * account, so the row cannot know their userId yet. Acceptance is the moment
 * the two meet — this endpoint runs the moment an account with a matching
 * email reaches any authenticated screen, which the app calls on load. That
 * also covers the register case: sign up with an invited address and the org
 * is yours without clicking anything.
 *
 * Bounded to 50 rows per call: an inbox-flooding invite burst still resolves
 * in one request, and the loop can never grow into an unbounded workload.
 * Row writes are sequential on purpose — two parallel patches of the same row
 * would race for nothing; the next call picks up anything this one missed.
 */

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Gunakan POST.', { allow: 'POST' });
  }

  const session = await verifySession(request, env);
  if (!session) return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');

  const auth = tableAuth(env);
  if (!auth) return apiError(503, 'unavailable', 'Layanan sedang tidak tersedia.');

  const pending = await listRows(
    auth,
    'memberships',
    [
      { method: 'equal', attribute: 'inviteEmail', values: [session.email.toLowerCase()] },
      { method: 'equal', attribute: 'status', values: ['pending'] },
      { method: 'limit', values: [50] },
    ],
    env,
  );
  if (pending === null) {
    return apiError(503, 'unavailable', 'Undangan belum bisa diproses. Coba lagi.');
  }

  const accepted: string[] = [];
  for (const row of pending) {
    // An invite row can only ever be pending with an empty userId (that is
    // what pending means), but a stale row holding someone else's userId
    // must never be claimed by whoever holds the email now.
    if (typeof row.userId === 'string' && row.userId !== '' && row.userId !== session.userId) {
      continue;
    }
    const orgId = typeof row.orgId === 'string' ? row.orgId : '';
    if (orgId === '') continue;
    const ok = await patchRow(auth, 'memberships', row.$id, {
      userId: session.userId,
      status: 'active',
    });
    if (ok) accepted.push(orgId);
  }

  return json(200, { accepted });
};
