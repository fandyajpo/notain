import {
  claimInvoiceQuota,
  INVOICE_QUOTA_MESSAGE,
  readInvoiceQuota,
  type InvoiceQuota,
} from '../../_lib/invoice-quota';
import { requireOrg } from '../../_lib/orgs';
import { isAdminUser } from '../../_lib/admin';
import { apiError, json } from '../../_lib/http';
import { enforceLimit } from '../../_lib/quota';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `GET /api/quota/invoices?orgId=…`  — how much of the free tier's monthly
 * allowance this ORGANIZATION has left (the meter the invoice builder renders).
 * `POST /api/quota/invoices?orgId=…` — the claim the builder asks for
 * immediately before saving a *new* invoice: 200 with the quota when there is
 * room, 402 `plan_required` with {@link INVOICE_QUOTA_MESSAGE} when the month
 * is spent.
 *
 * Org-scoped since multi-tenancy: `requireOrg` resolves the `orgId` hint
 * against the caller's active membership row, so one member can read the same
 * shared allowance and a non-member gets 404 before any counting happens. The
 * answer is private — it describes one organization — so `json`'s default
 * `no-store` stands: no browser or shared cache may hold one org's quota
 * under a key another caller could hit. The rate fence (`invoice-quota`, a
 * burst cap) keyed by user runs before any Appwrite read so a loop asking
 * "am I over?" cannot spend read quota.
 *
 * What this does and does not guarantee is written down in
 * `functions/_lib/invoice-quota.ts`: a real product gate, not a security
 * boundary — the invoice row itself is still written by the data endpoint
 * without re-counting the month.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Gunakan GET atau POST.', { allow: 'GET, POST' });
  }

  const orgId = new URL(request.url).searchParams.get('orgId');
  const gate = await requireOrg(request, env, orgId);
  if (!gate.ok) return gate.response;
  const { session, auth } = gate.access;

  const limited = enforceLimit('invoice-quota', session.userId, env);
  if (limited) return limited;

  // Admins (the Appwrite `admins` team) are operators, not customers: plan
  // limits are the product's boundary, not theirs. One read keeps `used` and
  // `resetsAt` truthful; `remaining: null` is the same "unlimited" answer a
  // paid org gets, which is exactly what hides the meter on both surfaces.
  if (await isAdminUser(session.userId, env)) {
    const quota = await readInvoiceQuota(auth, gate.access.orgId, env);
    if (quota === null) {
      return apiError(503, 'unavailable', 'Kuota belum bisa dibaca. Coba lagi beberapa saat lagi.');
    }
    const unlimited: InvoiceQuota = { ...quota, remaining: null };
    return request.method === 'GET'
      ? json(200, unlimited)
      : json(200, { ok: true, quota: unlimited });
  }

  if (request.method === 'GET') {
    const quota = await readInvoiceQuota(auth, gate.access.orgId, env);
    // An unreadable answer is an outage, never "you have 0 left" — a false
    // empty meter would tell a paying-feeling org they are out of room.
    if (quota === null) {
      return apiError(503, 'unavailable', 'Kuota belum bisa dibaca. Coba lagi beberapa saat lagi.');
    }
    return json(200, quota);
  }

  const claim = await claimInvoiceQuota(auth, gate.access.orgId, env);
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
