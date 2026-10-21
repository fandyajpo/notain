import { getRow, tableAuth } from '../../_lib/rows';
import { verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import { isSubscriptionActive } from '../../../src/core/billing/plans';
import type { Env, PagesFunction } from '../../_lib/types';

const DATABASE_ID = 'notain_db';
const PAYMENTS_TABLE_ID = 'payments';
/** How much history the settings card shows; older orders stay in the table. */
const HISTORY_LIMIT = 10;

type ProfileRow = {
  $id: string;
  plan?: string | null;
  planExpiresAt?: string | null;
};

type PaymentRow = {
  $id: string;
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
 * `GET /api/payments/portal` — the billing portal's one read: what plan the
 * caller is on, when it ends, and their recent payment history.
 *
 * Trust boundaries:
 * - The caller must be signed in (JWT → `GET /account`, same as the other
 *   payment Functions). The userId comes from that session, never the body.
 * - The `payments` rows are written with empty permissions, so the browser
 *   SDK cannot read them at all — this endpoint (server API key) is the only
 *   way a user ever sees their own orders. Ownership is therefore filtered
 *   here *and* in the Appwrite query: the API key bypasses row permissions,
 *   so a dropped or ignored query must never widen the answer.
 * - It is strictly a read. `active` is computed from the profile row the
 *   verified DOKU notification wrote; nothing this endpoint returns can
 *   change it.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'GET' });
  }

  const session = await verifySession(request, env);
  if (!session) {
    return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');
  }

  const auth = tableAuth(env);
  if (!auth) {
    return apiError(500, 'validation', 'Server belum terkonfigurasi.');
  }

  // A missing profile row means the account never completed onboarding —
  // that is the free plan, not an error.
  const profile = (await getRow(auth, 'profiles', session.userId)) as ProfileRow | null;
  const plan = profile?.plan === 'business' || profile?.plan === 'pro' ? profile.plan : 'free';
  const planExpiresAt = profile?.planExpiresAt ?? null;

  const list = await fetch(
    `${auth.endpoint}/databases/${DATABASE_ID}/collections/${PAYMENTS_TABLE_ID}/documents?` +
      new URLSearchParams({
        'queries[0]': JSON.stringify({ method: 'equal', attribute: 'ownerId', values: [session.userId] }),
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
    // Defence in depth: keep only this account's rows even if the query above
    // was dropped by the transport or ignored by the backend.
    .filter((row) => row.ownerId === session.userId)
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
