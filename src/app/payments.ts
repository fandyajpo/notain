import { getAccount } from '../appwrite/client';
import { appErrorFromStatus } from '../app/errors';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { isSubscriptionActive, type PaidPlan } from '../core/billing/plans';
import { PLAN_VALUES, type Plan } from '../core/profile/model';

/**
 * The browser's half of paid checkout — deliberately tiny.
 *
 * The client never sends prices, never learns other people's orders, and
 * never decides subscription state: it asks the Pages Function to start a
 * checkout (which prices the plan server-side) and later *reads back* the
 * status of that order. The redirect from DOKU carries only the invoice number
 * as a pointer — activation happens server-side, from DOKU's own data
 * (`functions/_lib/payment-settle.ts`).
 */

export type PaymentStatusValue = 'pending' | 'paid' | 'expired' | 'failed';

export type PaymentStatusView = {
  invoiceNumber: string;
  plan: string;
  amount: number | null;
  currency: string;
  status: PaymentStatusValue;
  paidAt: string | null;
  expiresAt: string | null;
};

async function bearerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let jwt: string;
  try {
    ({ jwt } = await getAccount().createJWT());
  } catch (error) {
    // No session to mint from: the caller is effectively signed out.
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Silakan masuk terlebih dahulu.', {
      cause: error,
    });
  }
  try {
    return await fetch(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${jwt}` },
    });
  } catch {
    throw new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
    );
  }
}

async function serverMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Starts (or resumes) a sandbox checkout for a paid plan and returns the
 * hosted DOKU page URL to redirect to. The plan id is the ONLY thing sent —
 * the amount is resolved from the server-side catalog.
 */
export async function startCheckout(plan: PaidPlan): Promise<{ url: string }> {
  const response = await bearerFetch('/api/payments/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan }),
  });

  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }

  const body = (await response.json().catch(() => null)) as { url?: unknown } | null;
  if (!body || typeof body.url !== 'string' || !/^https?:\/\//.test(body.url)) {
    throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  }
  return { url: body.url };
}

/**
 * Reads back the persisted status of one of the caller's payments. Whatever
 * the page's query string says, nothing here can activate a plan: the server
 * decides from DOKU's own data, not from anything the caller supplies.
 */
export async function fetchPaymentStatus(invoice: string): Promise<PaymentStatusView> {
  const response = await bearerFetch(`/api/payments/status?invoice=${encodeURIComponent(invoice)}`);

  if (!response.ok) {
    const message = await serverMessage(response);
    if (response.status === 404) {
      throw new AppError(ERROR_CODES.NOT_FOUND, message ?? 'Pembayaran tidak ditemukan.');
    }
    throw appErrorFromStatus(response.status, message);
  }

  const body = (await response.json().catch(() => null)) as Partial<PaymentStatusView> | null;
  if (!body || typeof body.invoiceNumber !== 'string' || typeof body.status !== 'string') {
    throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  }
  const status: PaymentStatusValue =
    body.status === 'paid' || body.status === 'expired' || body.status === 'failed'
      ? body.status
      : 'pending';
  return {
    invoiceNumber: body.invoiceNumber,
    plan: typeof body.plan === 'string' ? body.plan : 'pro',
    amount: typeof body.amount === 'number' ? body.amount : null,
    currency: typeof body.currency === 'string' ? body.currency : 'IDR',
    status,
    paidAt: typeof body.paidAt === 'string' ? body.paidAt : null,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
  };
}

/** One row of the billing portal's payment history. */
export type PortalPayment = {
  invoiceNumber: string;
  plan: string;
  amount: number | null;
  currency: string;
  status: PaymentStatusValue;
  paidAt: string | null;
  createdAt: string | null;
  /** Hosted DOKU page for a still-payable pending order; null otherwise. */
  resumeUrl: string | null;
};

/** The billing portal's read: current subscription plus recent payments. */
export type PortalSession = {
  plan: Plan;
  planExpiresAt: string | null;
  active: boolean;
  payments: PortalPayment[];
};

/**
 * Reads the caller's subscription state and payment history from the billing
 * portal endpoint. Strictly a read — activation lives in the verified DOKU
 * notification, and the `payments` rows are unreadable from the browser SDK
 * (empty row permissions), so this Function is the only window onto them.
 */
export async function readPortalSession(): Promise<PortalSession> {
  const response = await bearerFetch('/api/payments/portal');

  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }

  const body = (await response.json().catch(() => null)) as {
    plan?: unknown;
    planExpiresAt?: unknown;
    active?: unknown;
    payments?: unknown;
  } | null;
  if (!body || typeof body !== 'object') {
    throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  }

  const plan: Plan =
    typeof body.plan === 'string' && (PLAN_VALUES as readonly string[]).includes(body.plan)
      ? (body.plan as Plan)
      : 'free';
  const planExpiresAt = typeof body.planExpiresAt === 'string' ? body.planExpiresAt : null;

  const payments: PortalPayment[] = Array.isArray(body.payments)
    ? body.payments.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const row = entry as Record<string, unknown>;
        if (typeof row.invoiceNumber !== 'string' || row.invoiceNumber === '') return [];
        const status: PaymentStatusValue =
          row.status === 'paid' || row.status === 'expired' || row.status === 'failed'
            ? row.status
            : 'pending';
        return [
          {
            invoiceNumber: row.invoiceNumber,
            plan: typeof row.plan === 'string' ? row.plan : 'pro',
            amount: typeof row.amount === 'number' ? row.amount : null,
            currency: typeof row.currency === 'string' ? row.currency : 'IDR',
            status,
            paidAt: typeof row.paidAt === 'string' ? row.paidAt : null,
            createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
            resumeUrl:
              typeof row.resumeUrl === 'string' && /^https?:\/\//.test(row.resumeUrl)
                ? row.resumeUrl
                : null,
          },
        ];
      })
    : [];

  return {
    plan,
    planExpiresAt,
    // Trust the server's verdict when it sends one; recompute from the same
    // shared rule otherwise, so the two can never disagree.
    active:
      typeof body.active === 'boolean' ? body.active : isSubscriptionActive(plan, planExpiresAt),
    payments,
  };
}
