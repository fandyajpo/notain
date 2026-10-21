import { getRow, tableAuth } from '../../_lib/rows';
import { verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import type { Env, PagesFunction } from '../../_lib/types';

type PaymentRow = {
  $id: string;
  ownerId?: string | null;
  plan?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  paidAt?: string | null;
  dokuExpiredAt?: string | null;
};

/**
 * `GET /api/payments/status?invoice=…` — what `/payment/result` polls after
 * returning from DOKU.
 *
 * Read-only by design: it reports the row the notification endpoint wrote and
 * NEVER derives state from redirect parameters — a user could edit the query
 * string, and activation must only ever follow a verified DOKU notification.
 * The row is looked up by its id (the invoice number) and ownership is
 * checked against the session, so one account can't probe another's orders
 * (404 for both "nonexistent" and "not yours", same as the invoice endpoint).
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'GET' });
  }

  const session = await verifySession(request, env);
  if (!session) {
    return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');
  }

  const invoice = new URL(request.url).searchParams.get('invoice')?.trim() ?? '';
  if (!invoice || invoice.length > 64) {
    return apiError(400, 'validation', 'Nomor invoice pembayaran tidak valid.');
  }

  const auth = tableAuth(env);
  if (!auth) return apiError(500, 'validation', 'Server belum terkonfigurasi.');

  const payment = (await getRow(auth, 'payments', invoice)) as PaymentRow | null;
  if (!payment || payment.ownerId !== session.userId) {
    return apiError(404, 'not_found', 'Pembayaran tidak ditemukan.');
  }

  return json(200, {
    invoiceNumber: payment.$id,
    plan: payment.plan ?? 'pro',
    amount: payment.amount ?? null,
    currency: payment.currency ?? 'IDR',
    status: payment.status ?? 'pending',
    paidAt: payment.paidAt ?? null,
    expiresAt: payment.dokuExpiredAt ?? null,
  });
};
