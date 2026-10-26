import { getRow } from '../../_lib/rows';
import { requireOrg } from '../../_lib/orgs';
import { apiError, fetchUpstream as fetch, json } from '../../_lib/http';
import { isSubscriptionActive } from '../../../src/core/billing/plans';
import type { Env, PagesFunction } from '../../_lib/types';

const DATABASE_ID = 'notain_db';
const PAYMENTS_TABLE_ID = 'payments';
/** How much history the settings card shows; older orders stay in the table. */
const HISTORY_LIMIT = 10;

type OrgRow = {
  $id: string;
  plan?: string | null;
  planExpiresAt?: string | null;
};

type PaymentRow = {
  $id: string;
  orgId?: string | null;
  ownerId?: string | null;
  plan?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  paidAt?: string | null;
  checkoutUrl?: string | null;
  dokuExpiredAt?: string | null;
  createdAt?: string | null;
};

/** The payment states the portal surfaces; anything else reads as pending. */
function normalizeStatus(value: unknown): 'pending' | 'paid' | 'expired' | 'failed' {
  return value === 'paid' || value === 'expired' || value === 'failed' ? value : 'pending';
}

/**
 * `GET /api/payments/portal?orgId=…` — the billing portal's one read: what
 * plan this organization is on, when it ends, and its recent payment history.
 *
 * Trust boundaries:
 * - `requireOrg`: the caller must be a signed-in member of the org. The
 *   `orgId` query value is a hint that resolves to 404 for non-members.
 * - Billing is per organization: `plan`/`planExpiresAt` come from the
 *   `organizations` row the verified DOKU notification wrote, and the
 *   history lists THIS org's orders (not every order the user ever placed).
 * - The `payments` rows are written with empty permissions, so the browser
 *   SDK cannot read them at all — this endpoint (server API key) is the only
 *   way anyone sees orders. Tenancy is therefore filtered here *and* in the
 *   Appwrite query: the API key bypasses row permissions, so a dropped or
 *   ignored query must never widen the answer.
 * - It is strictly a read; nothing this endpoint returns can change it.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'GET' });
  }

  const orgId = new URL(request.url).searchParams.get('orgId');
  const gate = await requireOrg(request, env, orgId);
  if (!gate.ok) return gate.response;
  const { auth } = gate.access;

  // Billing lives on the organization row. A missing row (org deleted
  // mid-flight) reads as free rather than erroring — a downgrade the next
  // create would fix anyway, and the gate already proved membership.
  const org = (await getRow(auth, 'organizations', gate.access.orgId)) as OrgRow | null;
  const plan = org?.plan === 'business' || org?.plan === 'pro' ? org.plan : 'free';
  const planExpiresAt = org?.planExpiresAt ?? null;

  const list = await fetch(
    `${auth.endpoint}/databases/${DATABASE_ID}/collections/${PAYMENTS_TABLE_ID}/documents?` +
      new URLSearchParams({
        'queries[0]': JSON.stringify({
          method: 'equal',
          attribute: 'orgId',
          values: [gate.access.orgId],
        }),
        'queries[1]': JSON.stringify({ method: 'orderDesc', attribute: 'createdAt', values: [] }),
        'queries[2]': JSON.stringify({ method: 'limit', values: [HISTORY_LIMIT] }),
      }),
    { headers: auth.headers },
  );

  const documents = list.ok
    ? (((await list.json().catch(() => null)) as { documents?: PaymentRow[] } | null)?.documents ??
      [])
    : [];

  const now = Date.now();
  const payments = documents
    // Defence in depth: keep only this org's rows even if the query above
    // was dropped by the transport or ignored by the backend.
    .filter((row) => row.orgId === gate.access.orgId)
    .map((row) => {
      const status = normalizeStatus(row.status);
      // A pending order still worth paying: it has a hosted page and DOKU has
      // not expired it yet. That is the only state with a resume link.
      const resumable =
        status === 'pending' &&
        typeof row.checkoutUrl === 'string' &&
        /^https?:\/\//.test(row.checkoutUrl) &&
        (row.dokuExpiredAt == null ||
          row.dokuExpiredAt === '' ||
          Date.parse(row.dokuExpiredAt) > now);
      return {
        invoiceNumber: row.$id,
        plan: row.plan === 'business' ? 'business' : 'pro',
        amount: typeof row.amount === 'number' ? row.amount : null,
        currency: typeof row.currency === 'string' ? row.currency : 'IDR',
        status,
        paidAt: row.paidAt ?? null,
        createdAt: row.createdAt ?? null,
        resumeUrl: resumable ? row.checkoutUrl : null,
      };
    });

  return json(
    200,
    {
      plan,
      planExpiresAt,
      active: isSubscriptionActive(plan, planExpiresAt, new Date(now)),
      payments,
    },
    // Personalised billing state: never a shared cache.
    { 'cache-control': 'no-store' },
  );
};
