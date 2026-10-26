import {
  invoiceRowToDomain,
  profileRowToDomain,
  templateRowToDomain,
  type InvoiceRow,
  type ProfileRow,
  type TemplateRow,
} from '../../../src/appwrite/mappers';
import { ID_SEGMENT_PATTERN } from '../../../src/lib/edit-route';
import { isBusinessSubtypeSlug } from '../../../src/core/business/taxonomy';
import { getRow, tableAuth } from '../../_lib/rows';
import { apiError, json } from '../../_lib/http';
import { isSubscriptionActive } from '../../../src/core/billing/plans';
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
 * minus `ownerId`/`orgId` (internal ids the customer has no use for), the
 * profile fields the letterhead renders, and the resolved template — enough
 * for `InvoicePreview` and nothing that reveals another tenant.
 *
 * Multi-tenancy: the invoice row carries `orgId` (stamped server-side by the
 * data endpoint), the letterhead row IS `profiles/<orgId>`, and the plan the
 * gate reads lives on `organizations/<orgId>`. A legacy row without `orgId`
 * has no org behind it, so its plan can never be active — it answers 402,
 * never someone else's letterhead.
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
  const orgId = typeof row.orgId === 'string' ? row.orgId : null;

  // The org's plan row and its letterhead row share the same id, so both are
  // read in one parallel step — the profile serves the gate's fallback and
  // the letterhead below.
  const [orgRow, profileRow] = orgId
    ? await Promise.all([getRow(auth, 'organizations', orgId), getRow(auth, 'profiles', orgId)])
    : [null, null];

  // "Invoice link" is the headline Pro benefit on the pricing page — the
  // customer opening the nota without a download is what the sender pays for.
  // Free (or expired) organizations get a 402 with actionable copy; the
  // signed-in builder and dashboard never come through this endpoint, so
  // nothing the org does inside the app is affected.
  const org = orgRow as { plan?: string | null; planExpiresAt?: string | null } | null;
  if (!isSubscriptionActive(org?.plan ?? 'free', org?.planExpiresAt ?? null)) {
    return apiError(
      402,
      'plan_required',
      'Invoice link adalah fitur plan Pro. Minta file PDF-nya ke pengirim, atau berlangganan Pro untuk membuka tautan seperti ini.',
    );
  }

  // The customer never needs the internal owner/org ids or the row
  // timestamps — the print view renders the document, not the audit trail.
  const publicInvoice = omitFields(invoice, ['ownerId', 'createdAt', 'updatedAt']);

  // A missing profile cannot happen past the gate above (an org always has
  // its letterhead row), and a missing template falls back to a built-in on
  // the client — the same fallback the signed-in print view has.
  const profile = profileRow ? (profileRow as ProfileRow) : null;
  const business = profile ? publicBusinessFromRow(profile, orgRow) : null;

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
function publicBusinessFromRow(
  row: ProfileRow,
  orgRow: (Record<string, unknown> & { $id: string }) | null,
) {
  const profile = profileRowToDomain(row);
  // Plan details and the raw R2 id stay server-side; the letterhead only
  // needs the rendered URL. The business NAME and TYPE come from the org row,
  // the single source of truth since they are not profile columns.
  const rest = omitFields(profile, ['plan', 'planExpiresAt', 'logoFileId']);
  return {
    ...rest,
    businessName: typeof orgRow?.name === 'string' ? orgRow.name : '',
    businessType:
      typeof orgRow?.businessType === 'string' && isBusinessSubtypeSlug(orgRow.businessType)
        ? orgRow.businessType
        : null,
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
