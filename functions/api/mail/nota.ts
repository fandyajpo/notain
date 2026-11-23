import { isSubscriptionActive } from '../../../src/core/billing/plans';
import { calculateTotals } from '../../../src/core/invoice/calculator';
import { ID_SEGMENT_PATTERN } from '../../../src/lib/edit-route';
import { invoiceRowToDomain, type InvoiceRow } from '../../../src/appwrite/mappers';
import { isAdminUser } from '../../_lib/admin';
import { verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import { mailConfigured, sendMail } from '../../_lib/mail';
import { findMembership } from '../../_lib/orgs';
import { enforceLimit } from '../../_lib/quota';
import { getRow, patchRow, tableAuth } from '../../_lib/rows';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `POST /api/mail/nota` — mails one saved invoice to the customer.
 *
 * ## Gate
 *
 * The caller must be a *member* of the organization that owns the invoice,
 * exactly like every other tenant read. Order matters: session first, then the
 * row, then the membership row — a non-member and a missing id both get the
 * same 404, so an invoice id cannot be probed.
 *
 * ## Plan gate
 *
 * The email carries `/invoice/print/<id>`, and that page is a Pro benefit
 * (`GET /api/invoice/<id>` answers 402 on a free or expired plan). Mailing a
 * link that will refuse to open would be worse than not mailing at all, so this
 * endpoint applies the same gate and the same admin exemption, keyed off the
 * owning organization's owner.
 *
 * ## Why the PDF is not attached
 *
 * PDFs in Notain are the browser's print dialog (ADR 0007) — there is no
 * server-side renderer, so there is no file to attach. The message carries the
 * numbers instead: number, dates, total and the capability link.
 *
 * ## Status
 *
 * A successful send moves an *unset* invoice to `sent`. That is the one
 * forward-only transition `core/invoice/status.ts` allows from `null`, and it
 * is what "Terkirim" means. `paid`/`void` are never touched, and a second send
 * is a no-op on the status.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  const session = await verifySession(request, env);
  if (!session) {
    return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');
  }

  let invoiceId = '';
  let recipient = '';
  let note = '';
  try {
    const body = (await request.json()) as { invoiceId?: unknown; to?: unknown; note?: unknown };
    invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId.trim() : '';
    recipient = typeof body.to === 'string' ? body.to.trim() : '';
    note = typeof body.note === 'string' ? body.note.trim().slice(0, 1_000) : '';
  } catch {
    return apiError(400, 'validation', 'Format permintaan tidak valid.');
  }
  if (!ID_SEGMENT_PATTERN.test(invoiceId)) {
    return apiError(404, 'not_found', 'Nota tidak ditemukan.');
  }

  const auth = tableAuth(env);
  if (!auth) return apiError(503, 'unavailable', 'Layanan sedang tidak tersedia.');
  if (!mailConfigured(env)) {
    return apiError(
      503,
      'unavailable',
      'Pengiriman email belum aktif di server ini. Atur MAIL_SERVICE_URL dan MAIL_SERVICE_TOKEN.',
    );
  }

  const row = await getRow(auth, 'invoices', invoiceId, env);
  const orgId = typeof row?.orgId === 'string' ? row.orgId : '';
  if (!row || orgId === '') return apiError(404, 'not_found', 'Nota tidak ditemukan.');

  const membership = await findMembership(auth, orgId, session.userId, env);
  if (!membership) return apiError(404, 'not_found', 'Nota tidak ditemukan.');

  const org = await getRow(auth, 'organizations', orgId, env);
  if (!org) return apiError(503, 'unavailable', 'Data organisasi belum bisa dibaca. Coba lagi.');

  const ownerIsAdmin =
    typeof org.ownerId === 'string' && org.ownerId !== ''
      ? await isAdminUser(org.ownerId, env)
      : false;
  if (
    !ownerIsAdmin &&
    !isSubscriptionActive(
      typeof org.plan === 'string' ? org.plan : 'free',
      typeof org.planExpiresAt === 'string' ? org.planExpiresAt : null,
    )
  ) {
    return apiError(
      402,
      'plan_required',
      'Kirim nota lewat email memakai halaman tagihan, fitur plan Pro. Upgrade dulu untuk mengirim nota sebagai email.',
    );
  }

  const to = recipient !== '' ? recipient : customerEmailOf(row);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) {
    return apiError(
      400,
      'validation',
      'Email pelanggan belum ada atau tidak valid. Isi alamat email tujuan dulu.',
    );
  }

  const limited = enforceLimit('mail-nota', orgId, env);
  if (limited) return limited;

  const draft = invoiceRowToDomain(row as InvoiceRow);
  const totals = calculateTotals(draft);
  const origin = new URL(request.url).origin;

  const result = await sendMail(env, {
    type: 'invoice',
    to,
    customerName: draft.customerName,
    invoiceNumber: draft.invoiceNumber,
    businessName: typeof org.name === 'string' ? org.name : '',
    total: totals.grandTotal,
    date: draft.date,
    ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
    ...(note !== '' ? { note } : {}),
    invoiceUrl: `${origin}/invoice/print/${encodeURIComponent(row.$id)}`,
    senderName: session.name,
  });

  if (result !== 'sent') {
    return apiError(503, 'unavailable', 'Nota belum terkirim. Coba lagi beberapa saat lagi.');
  }

  // `''` is how the data endpoint stores "unset" (`parsed.draft.status ?? ''`).
  const statusChanged = typeof row.status !== 'string' || row.status === '';
  if (statusChanged) {
    await patchRow(auth, 'invoices', row.$id, { status: 'sent' });
  }

  return json(200, { ok: true, to, status: statusChanged ? 'sent' : row.status ?? null });
};

function customerEmailOf(row: Record<string, unknown>): string {
  return typeof row.customerEmail === 'string' ? row.customerEmail.trim() : '';
}
