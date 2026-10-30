import { getRow, patchRow } from '../../_lib/rows';
import { requireOrgOwner } from '../../_lib/orgs';
import { apiError, fetchUpstream as fetch, json } from '../../_lib/http';
import { writeAudit } from '../../_lib/audit';
import {
  breakerAllows,
  breakerFailure,
  breakerSuccess,
  count,
  quotaPolicy,
  rateLimit,
} from '../../_lib/quota';
import {
  buildCheckoutBody,
  DOKU_CHECKOUT_ENDPOINT,
  parseCheckoutResponse,
  signRequest,
  utcTimestamp,
} from '../../../src/core/billing/doku';
import {
  isPaidPlan,
  makeInvoiceNumber,
  planAmount,
  planRank,
} from '../../../src/core/billing/plans';
import type { Env, PagesFunction } from '../../_lib/types';

const DATABASE_ID = 'notain_db';
const PAYMENTS_TABLE_ID = 'payments';

/** How long a pending row without a checkout URL is tolerated as an in-flight creation. */
const IN_FLIGHT_GRACE_MS = 2 * 60 * 1000;

type OrgRow = {
  $id: string;
  plan?: string | null;
  planExpiresAt?: string | null;
};

type PendingRow = {
  $id: string;
  status?: string | null;
  checkoutUrl?: string | null;
  dokuExpiredAt?: string | null;
  createdAt?: string | null;
};

/**
 * `POST /api/payments/checkout` — start a DOKU sandbox checkout for a paid plan.
 *
 * Trust boundaries:
 * - The caller must be a signed-in MEMBER of the org the order is for
 *   (`requireOrg`: JWT → membership row). The body carries an `orgId` hint;
 *   a foreign or unknown org answers 404 before anything else happens.
 * - The body's only other field is a *plan id*. The amount is looked up in
 *   the server-side plan catalog (`core/billing/plans`), so a tampered price
 *   in the request can't change what DOKU charges.
 * - `free` is not a purchasable plan: free plans never reach payment.
 * - The current-subscription guard reads the ORGANIZATION's row — billing is
 *   per org, so one member's checkout upgrades (and downgrades are blocked
 *   for) the whole organization.
 *
 * Duplicate-submission guard: one pending row per org+plan. A fresh row
 * without a checkout URL is an creation still in flight — a second click gets
 * 409 rather than a second DOKU order. An older stranded row is abandoned and
 * replaced; an unexpired row with a URL is reused so the same checkout page
 * comes back instead of stacking orders.
 *
 * The payment row is written *before* DOKU is called, so every order DOKU
 * ever notifies us about already exists locally (its $id IS the
 * invoice_number, which makes the webhook lookup a single document read).
 * It is stamped with `orgId` (who the plan is for) and `ownerId` (who
 * initiated — the session, for audit and the status endpoint's ownership
 * check); `payment-settle.ts` activates the plan on the org row.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {
    body = null;
  }
  const plan = body?.plan;
  if (!body || !isPaidPlan(plan)) {
    return apiError(400, 'validation', 'Plan tidak valid. Pilih plan Pro.');
  }
  // Business is announced but not sold yet (`PLAN_COMING_SOON` in the shared
  // display copy): refused here, before auth or any provider call, so no
  // order can be created — and no money taken — for a tier the product
  // cannot deliver. The pricing page and billing page read the same flag and
  // never render this control in the first place.
  if (plan === 'business') {
    return apiError(
      400,
      'validation',
      'Plan Business sedang disiapkan dan belum bisa dibeli. Pilih plan Pro dulu.',
    );
  }

  // Owner only: billing is an organization-level decision, so a plain member
  // can never put their org on a paid plan (403 with the standard copy).
  const gate = await requireOrgOwner(request, env, body.orgId);
  if (!gate.ok) return gate.response;
  const { session, auth } = gate.access;
  const orgId = gate.access.orgId;

  const clientId = env.DOKU_CLIENT_ID?.trim() ?? '';
  const secretKey = env.DOKU_SECRET_KEY?.trim() ?? '';
  if (!clientId || !secretKey) {
    return apiError(500, 'validation', 'Pembayaran belum terkonfigurasi di server.');
  }

  const amount = planAmount(plan);

  // Cost fences first — both purely local, before a single provider call:
  // a flood of checkout attempts would otherwise burn Worker invocations,
  // Appwrite reads and DOKU orders in lockstep. 429 carries `retry-after`;
  // the breaker answers 503 while DOKU is failing so a user's click fails
  // fast and cleanly instead of creating rows against a dead gateway.
  const policy = quotaPolicy(env);
  const limited = rateLimit('checkout', session.userId, policy);
  if (!limited.allowed) {
    count('checkout.rate-limited');
    return apiError(
      429,
      'rate_limited',
      'Terlalu banyak percobaan pembayaran. Coba lagi beberapa menit lagi.',
      {
        'retry-after': String(limited.retryAfterSeconds),
      },
    );
  }
  if (!breakerAllows('doku', policy)) {
    count('checkout.breaker-rejected');
    return apiError(
      503,
      'unavailable',
      'Gateway pembayaran sedang tidak tersedia. Coba lagi dalam beberapa menit.',
      { 'retry-after': String(Math.ceil(policy.dokuBreakerCooldownMs / 1000)) },
    );
  }

  // Current subscription of the ORGANIZATION, for downgrade protection and
  // renewal extension. Activation writes `organizations/<orgId>` — without
  // that row the money would be taken and the plan never granted (left as
  // `payment.paid.*` audit rows for manual resolution only). Org creation
  // guarantees the row before `/checkout` can render; this is the backstop
  // for anything that reaches the API without it (org deleted mid-flight).
  const [org, profileRow] = (await Promise.all([
    getRow(auth, 'organizations', orgId),
    // The letterhead row doubles as the payer DOKU sees (name + phone). Both
    // rows share the org id, so this is one id lookup, not a query — and it
    // cannot fail the request: a missing profile just omits the optional
    // customer fields below.
    getRow(auth, 'profiles', orgId),
  ])) as [OrgRow | null, { name?: string | null; phone?: string | null } | null];
  if (!org) {
    return apiError(
      409,
      'conflict',
      'Organisasi tidak ditemukan. Muat ulang halaman lalu coba lagi.',
    );
  }
  const profile = profileRow;
  const currentPlan = org.plan ?? 'free';
  const currentExpiresAt = org.planExpiresAt ?? null;
  const now = Date.now();
  const currentActive =
    currentPlan !== 'free' && (currentExpiresAt === null || Date.parse(currentExpiresAt) > now);
  if (currentActive && planRank(currentPlan) > planRank(plan)) {
    return apiError(
      409,
      'conflict',
      `Akun kamu sudah aktif di plan ${currentPlan === 'business' ? 'Business' : 'Pro'} dan tidak bisa diturunkan lewat checkout.`,
    );
  }

  // Reuse / replace an existing pending row instead of stacking orders —
  // keyed by ORG so two orgs of the same user never share a pending order.
  const pendingList = await fetch(
    `${auth.endpoint}/databases/${DATABASE_ID}/collections/${PAYMENTS_TABLE_ID}/documents?` +
      new URLSearchParams({
        'queries[0]': JSON.stringify({
          method: 'equal',
          attribute: 'orgId',
          values: [orgId],
        }),
        'queries[1]': JSON.stringify({ method: 'equal', attribute: 'status', values: ['pending'] }),
        'queries[2]': JSON.stringify({ method: 'equal', attribute: 'plan', values: [plan] }),
        'queries[3]': JSON.stringify({ method: 'limit', values: [1] }),
      }),
    { headers: auth.headers },
  );
  if (pendingList.ok) {
    const list = (await pendingList.json()) as { documents?: PendingRow[] };
    const existing = list.documents?.[0];
    if (existing) {
      const createdAtMs = Date.parse(existing.createdAt ?? '') || now;
      const unexpired =
        existing.dokuExpiredAt == null ||
        existing.dokuExpiredAt === '' ||
        Date.parse(existing.dokuExpiredAt) > now;

      if (existing.checkoutUrl && unexpired) {
        // Same pending order, still valid: hand back the same checkout page.
        return json(200, { url: existing.checkoutUrl });
      }
      if (!existing.checkoutUrl && now - createdAtMs < IN_FLIGHT_GRACE_MS) {
        // Another tab is creating this checkout right now.
        return apiError(
          409,
          'conflict',
          'Pembayaran sedang diproses. Tunggu sebentar lalu coba lagi.',
        );
      }
      // Stranded (creation failed) or expired: retire it and start a new one.
      await patchRow(auth, 'payments', existing.$id, {
        status: existing.checkoutUrl ? 'expired' : 'failed',
      }).catch(() => false);
    }
  }

  const invoiceNumber = makeInvoiceNumber(plan);
  const callbackOrigin = new URL(request.url).origin;
  const callbackUrl = `${callbackOrigin}/payment/result?invoice=${encodeURIComponent(invoiceNumber)}`;

  const created = await fetch(
    `${auth.endpoint}/databases/${DATABASE_ID}/collections/${PAYMENTS_TABLE_ID}/documents`,
    {
      method: 'POST',
      headers: { ...auth.headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        documentId: invoiceNumber,
        data: {
          // Who the plan is FOR (tenancy) vs who initiated the order (audit,
          // status-endpoint ownership). Settle activates the org row.
          orgId,
          ownerId: session.userId,
          plan,
          amount,
          currency: 'IDR',
          status: 'pending',
          invoiceNumber,
          checkoutUrl: null,
          dokuExpiredAt: null,
          paidAt: null,
          createdAt: new Date(now).toISOString(),
        },
        permissions: [],
      }),
    },
  );
  if (created.status === 409) {
    // Unique $id raced with a concurrent identical request — that request is
    // creating this exact order, so the in-flight answer applies.
    return apiError(409, 'conflict', 'Pembayaran sedang diproses. Tunggu sebentar lalu coba lagi.');
  }
  if (!created.ok) {
    const detail = (await created.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
    return apiError(500, 'validation', `Gagal menyimpan pesanan pembayaran: ${detail}`);
  }

  // --- DOKU sandbox create-checkout -------------------------------------
  const rawBody = buildCheckoutBody({
    amount,
    invoiceNumber,
    callbackUrl,
    notificationUrl: `${callbackOrigin}/api/payments/doku-notify`,
    dueMinutes: 60,
    customer: {
      id: session.userId,
      name: profile?.name ?? undefined,
      email: session.email || undefined,
      phone: profile?.phone ?? undefined,
    },
  });
  const timestamp = utcTimestamp();
  const requestId = crypto.randomUUID();
  const signature = await signRequest({
    secretKey,
    clientId,
    requestId,
    timestamp,
    target: '/checkout/v1/payment',
    rawBody,
  });

  let dokuResponse: Response;
  try {
    dokuResponse = await fetch(DOKU_CHECKOUT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Client-Id': clientId,
        'Request-Id': requestId,
        'Request-Timestamp': timestamp,
        Signature: signature,
        'content-type': 'application/json',
      },
      body: rawBody,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    // Network failure talking to DOKU: the row exists but has no order —
    // retire it so a retry starts cleanly instead of tripping the in-flight
    // guard, then tell the caller this is retryable.
    breakerFailure('doku', policy);
    await patchRow(auth, 'payments', invoiceNumber, { status: 'failed' }).catch(() => false);
    return apiError(
      502,
      'validation',
      'Gateway pembayaran tidak bisa dihubungi. Coba lagi sebentar lagi.',
    );
  }

  const parsed = dokuResponse.ok
    ? parseCheckoutResponse(await dokuResponse.json().catch(() => null))
    : null;
  if (!dokuResponse.ok || !parsed) {
    // A 5xx is DOKU struggling — feed the breaker; a 4xx is a definitive
    // rejection of THIS order (bad request, wrong credentials) and is not.
    if (dokuResponse.status >= 500) breakerFailure('doku', policy);
    else breakerSuccess('doku');
    const detail = (await dokuResponse.text().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
    await patchRow(auth, 'payments', invoiceNumber, { status: 'failed' }).catch(() => false);
    await writeAudit(env, {
      actorId: session.userId,
      actorEmail: session.email,
      action: 'payment.checkout.failed',
      targetType: 'payment',
      targetId: invoiceNumber,
      detail: JSON.stringify({
        plan,
        providerStatus: dokuResponse.status,
        detail: detail.slice(0, 500),
      }),
    });
    return apiError(
      502,
      'validation',
      'Gateway pembayaran menolak permintaan. Coba lagi beberapa saat lagi.',
    );
  }

  const updated = await patchRow(auth, 'payments', invoiceNumber, {
    checkoutUrl: parsed.url,
    dokuExpiredAt: parsed.expiredAt,
  });
  breakerSuccess('doku');
  count('checkout.doku.created');
  if (!updated) {
    // The order exists at DOKU but we couldn't store its page URL; returning
    // it anyway keeps the user unblocked — the row remains pending and the
    // webhook will still find it by id.
    console.error('payments: failed to store checkoutUrl for', invoiceNumber);
  }

  return json(200, { url: parsed.url });
};
