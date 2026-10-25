import {
  claimInvoiceQuota,
  INVOICE_QUOTA_MESSAGE,
  readInvoiceQuota,
} from '../../_lib/invoice-quota';
import { verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import { enforceLimit } from '../../_lib/quota';
import { tableAuth } from '../../_lib/rows';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `GET /api/quota/invoices`  — how much of the free tier's monthly allowance
 * this account has left (the meter the invoice builder renders).
 * `POST /api/quota/invoices` — the claim the builder asks for immediately
 * before saving a *new* invoice: 200 with the quota when there is room, 402
 * `plan_required` with {@link INVOICE_QUOTA_MESSAGE} when the month is spent.
 *
 * Session-scoped (the browser's own JWT, exactly like `/api/logo`), never
 * admin: this is the caller's own allowance. The answer is private — it
 * describes one account — so `json`'s default `no-store` stands: no browser
 * or shared cache may hold one user's quota under a key another user could
 * hit. The rate fence (`invoice-quota`, a burst cap) runs before any Appwrite
 * read so a loop asking "am I over?" cannot spend read quota.
 *
 * What this does and does not guarantee is written down in
 * `functions/_lib/invoice-quota.ts`: a real product gate, not a security
 * boundary — the invoice row itself is still written from the browser.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Gunakan GET atau POST.', { allow: 'GET, POST' });
  }

  const session = await verifySession(request, env);
  if (!session) {
    return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');
  }

  const limited = enforceLimit('invoice-quota', session.userId, env);
  if (limited) return limited;

  const auth = tableAuth(env);
  if (!auth) {
    return apiError(503, 'unavailable', 'Layanan sedang tidak tersedia. Coba lagi nanti.');
  }

  if (request.method === 'GET') {
    const quota = await readInvoiceQuota(auth, session.userId, env);
    // An unreadable answer is an outage, never "you have 0 left" — a false
    // empty meter would tell a paying-feeling user they are out of room.
    if (quota === null) {
      return apiError(503, 'unavailable', 'Kuota belum bisa dibaca. Coba lagi beberapa saat lagi.');
    }
    return json(200, quota);
  }

  const claim = await claimInvoiceQuota(auth, session.userId, env);
  if (claim.quota === null) {
    return apiError(503, 'unavailable', 'Kuota belum bisa dicek. Coba lagi beberapa saat lagi.');
  }
  if (!claim.ok) {
    // 402, the same signal the invoice-link gate uses: a valid request the
    // current plan does not cover. The quota rides along so a client that
    // wants to show "9 dari 10" beside the message does not need a second call.
    return json(402, {
      error: 'plan_required',
      message: INVOICE_QUOTA_MESSAGE,
      quota: claim.quota,
    });
  }
  return json(200, { ok: true, quota: claim.quota });
};
