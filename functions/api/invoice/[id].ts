import {
  invoiceRowToDomain,
  profileRowToDomain,
  templateRowToDomain,
  type InvoiceRow,
  type ProfileRow,
  type TemplateRow,
} from '../../../src/appwrite/mappers';
import { ID_SEGMENT_PATTERN } from '../../../src/lib/edit-route';
import { getRow, tableAuth } from '../../_lib/rows';
import { apiError, json } from '../../_lib/http';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `GET /api/invoice/<id>` — the payload behind the public print/share page.
 *
 * Unauthenticated on purpose: the page at `/invoice/print/<id>` is a
 * capability URL the owner hands to a customer, so it cannot depend on a
 * session. Appwrite row permissions would refuse an anonymous read, which is
 * why this Function reads the row with the server's API key instead — the
 * invoice id (an unguessable 64-char segment) is the only credential.
 *
 * The response is deliberately narrower than the row: the domain invoice
 * minus `ownerId` (an internal user id the customer has no use for), the
 * profile fields the letterhead renders, and the resolved template — enough
 * for `InvoicePreview` and nothing that reveals another tenant.
 */
export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  if (request.method !== 'GET') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'GET' });
  }

  const id = typeof params.id === 'string' ? params.id : '';
  if (!ID_SEGMENT_PATTERN.test(id)) {
    return apiError(404, 'not_found', 'Invoice tidak ditemukan.');
  }

  const auth = tableAuth(env);
  if (!auth) {
    return apiError(500, 'validation', 'Konfigurasi server tidak lengkap.');
  }

  const row = await getRow(auth, 'invoices', id);
  if (!row) return apiError(404, 'not_found', 'Invoice tidak ditemukan.');

  const invoice = invoiceRowToDomain(row as InvoiceRow);
  // The customer never needs the internal owner id or the row timestamps —
  // the print view renders the document, not the audit trail.
  const publicInvoice = omitFields(invoice, ['ownerId', 'createdAt', 'updatedAt']);

  // Profile and template are fetched on a best-effort basis: a missing profile
  // still prints (the letterhead degrades to the customer's own view), and a
  // missing template falls back to a built-in on the client — the same
  // fallback the signed-in print view has.
  const profileRow = await getRow(auth, 'profiles', invoice.ownerId);
  const business = profileRow ? publicBusinessFromRow(profileRow as ProfileRow) : null;

  const templateRow = invoice.templateId
    ? await getRow(auth, 'templates', invoice.templateId)
    : null;
  const template = templateRow ? templateRowToDomain(templateRow as TemplateRow) : null;

  return json(
    200,
    { invoice: publicInvoice, business, template },
    // The invoice changes underneath this URL (status flips, a proof lands),
    // so nothing here may sit in a shared cache.
    { 'cache-control': 'no-store' },
  );
};

/** The letterhead fields `InvoicePreview` reads, plus the computed logo URL. */
function publicBusinessFromRow(row: ProfileRow) {
  const profile = profileRowToDomain(row);
  // Plan details and the raw R2 id stay server-side; the letterhead only
  // needs the rendered URL.
  const rest = omitFields(profile, ['plan', 'planExpiresAt', 'logoFileId']);
  return {
    ...rest,
    logoUrl: profile.logoFileId ? `/api/logo/${profile.logoFileId}` : undefined,
  };
}

/** Shallow copy of `value` minus the listed keys. */
function omitFields<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}
