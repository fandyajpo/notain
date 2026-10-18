import { z } from 'zod';
import { invoiceDraftShapeSchema } from '../core/invoice/schema';
import { invoiceTemplateShapeSchema } from '../core/template/schema';
import { businessSubtypeSlugSchema } from '../core/business/schema';
import { prepareProofFile } from '../lib/payment-proof';
import { appErrorFromStatus, toAppError } from '../appwrite/errors';
import { getAccount } from '../appwrite/client';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import type { InvoiceDraft, InvoicePaymentProof } from '../core/invoice/model';
import type { InvoiceTemplate } from '../core/template/model';
import type { BusinessSubtypeSlug } from '../core/business/taxonomy';

/**
 * The public, capability-URL half of the invoice app: what a customer sees at
 * `/invoice/print/<id>`, and how they hand back a payment proof.
 *
 * Every call here is unauthenticated *by design* — the invoice id is the
 * credential. The one exception is `deletePaymentProof`, which is the owner's
 * (from the dashboard or builder) and carries a session JWT.
 */

/** Letterhead fields the print view renders, as the public endpoint sends them. */
export type PublicBusiness = {
  name: string;
  businessName: string;
  phone: string;
  address?: string;
  email?: string;
  businessType: BusinessSubtypeSlug | null;
  logoUrl?: string;
};

/**
 * What `GET /api/invoice/<id>` answers with: the invoice (minus internal
 * fields), the letterhead, and the resolved template — or a template of
 * `null` when the invoice names one that no longer exists, in which case the
 * client falls back to a built-in.
 */
export type PublicInvoicePayload = {
  invoice: InvoiceDraft & { id: string; paymentProof?: InvoicePaymentProof | null };
  business: PublicBusiness | null;
  template: InvoiceTemplate | null;
};

export async function getPublicInvoice(id: string): Promise<PublicInvoicePayload> {
  let response: Response;
  try {
    response = await fetch(`/api/invoice/${encodeURIComponent(id)}`);
  } catch {
    throw new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
    );
  }
  if (response.status === 404) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Invoice tidak ditemukan.');
  }
  if (!response.ok) throw appErrorFromStatus(response.status);

  return parsePayload(await response.json());
}

/**
 * The customer's upload: re-encodes the file (HEIC → JPEG → WebP) client-side,
 * then POSTs it with the Turnstile token. Throws the server's copy for 4xx —
 * including the 409 "already uploaded" the one-shot endpoint answers.
 */
export async function uploadPaymentProof(
  invoiceId: string,
  file: File,
  turnstileToken: string | null,
): Promise<{ key: string; uploadedAt: string; url: string }> {
  const prepared = await prepareProofFile(file);
  const body = new FormData();
  body.append('file', prepared.file, prepared.file.name);
  if (turnstileToken) body.append('turnstileToken', turnstileToken);

  let response: Response;
  try {
    response = await fetch(`/api/invoice/${encodeURIComponent(invoiceId)}/proof`, {
      method: 'POST',
      body,
    });
  } catch {
    throw new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
    );
  }

  if (!response.ok) {
    const message = await serverMessage(response);
    throw appErrorFromStatus(response.status, message);
  }

  const result = (await response.json()) as { key?: unknown; uploadedAt?: unknown; url?: unknown };
  if (
    typeof result.key !== 'string' ||
    typeof result.uploadedAt !== 'string' ||
    typeof result.url !== 'string'
  ) {
    throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  }
  return { key: result.key, uploadedAt: result.uploadedAt, url: result.url };
}

/**
 * The owner removes a proof so the customer can upload a corrected one.
 * Session-scoped: the Function checks the object's owner against the JWT.
 */
export async function deletePaymentProof(key: string): Promise<void> {
  try {
    const { jwt } = await getAccount().createJWT();
    const response = await fetch(`/api/proof/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    // Already gone is the outcome this call wanted.
    if (response.ok || response.status === 404) return;
    throw appErrorFromStatus(response.status, await serverMessage(response));
  } catch (error) {
    throw toAppError(error);
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
 * Validates the public endpoint's response. Shape-level only — a corrupt
 * field degrades (`.catch(...)`) rather than blanking the whole page, the
 * same reasoning as `invoiceDraftShapeSchema` for autosaved drafts. A wholly
 * malformed body is what 404s the page in the app.
 */
function parsePayload(raw: unknown): PublicInvoicePayload {
  const result = publicInvoicePayloadSchema.safeParse(raw);
  if (!result.success) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Invoice tidak ditemukan.');
  }
  const { invoice, business, template } = result.data;
  return {
    invoice: invoice as PublicInvoicePayload['invoice'],
    business: business as PublicBusiness | null,
    template: template as InvoiceTemplate | null,
  };
}

const publicInvoicePayloadSchema = z.object({
  invoice: invoiceDraftShapeSchema.extend({
    id: z.string().min(1),
    paymentProof: z
      .object({ key: z.string().min(1), uploadedAt: z.string().min(1) })
      .nullable()
      .catch(null),
  }),
  business: z
    .object({
      name: z.string().catch(''),
      businessName: z.string().catch(''),
      phone: z.string().catch(''),
      address: z.string().optional().catch(undefined),
      email: z.string().optional().catch(undefined),
      businessType: businessSubtypeSlugSchema.nullable().catch(null),
      logoUrl: z.string().optional().catch(undefined),
    })
    .nullable()
    .catch(null),
  template: invoiceTemplateShapeSchema.nullable().catch(null),
});
