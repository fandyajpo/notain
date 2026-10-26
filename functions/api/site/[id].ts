import {
  catalogRowToDomain,
  profileRowToDomain,
  type CatalogRow,
  type ProfileRow,
} from '../../../src/appwrite/mappers';
import { ID_SEGMENT_PATTERN } from '../../../src/lib/edit-route';
import { apiError, json } from '../../_lib/http';
import { enforceLimit, requestKey } from '../../_lib/quota';
import { getRow, listRows, tableAuth } from '../../_lib/rows';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `GET /api/site/<orgId>` — the payload behind the public business page at
 * `/site/<orgId>`.
 *
 * Unauthenticated on purpose, exactly like `GET /api/invoice/<id>`: the page
 * is a capability URL the org hands out, so no session may stand between a
 * visitor and it — Appwrite row permissions would refuse an anonymous read,
 * which is why this Function reads with the server's API key and the id
 * segment (validated against `ID_SEGMENT_PATTERN`, so it is one clean path
 * segment) is the only credential. Since multi-tenancy the id IS the
 * organization id: its profile row (`profiles/<orgId>`) and its catalog rows
 * (`orgId` column) are exactly the tenant's public data — a foreign org id
 * simply has no rows here, which is the isolation property.
 *
 * The response is the *publishable* view of the profile — never the row:
 * plan, expiry and the raw R2 object id stay server-side (the client only
 * gets the rendered `/api/logo/…` URL), the internal org id is the id
 * itself and is not echoed, and `orgId` never appears in catalog items.
 * That is the whole privacy contract of this endpoint: it may only carry
 * fields the org already typed into their public profile on purpose.
 *
 * Two failure shapes are kept apart on purpose: a missing profile (or one
 * that never named a business — an unnamed business has no page) answers 404,
 * while a provider outage answers 503 (`unavailable`) instead of pretending
 * the page does not exist. A catalog that is merely *empty* is not an error:
 * the page renders without its items section.
 *
 * The catalog list is bounded to 100 rows and rate-limited per IP (the
 * `site` limit in `_lib/quota.ts`) because each hit spends one profile read
 * plus up to a hundred catalog reads against the Appwrite quota.
 */
export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  if (request.method !== 'GET') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'GET' });
  }

  const limited = enforceLimit('site', requestKey(request), env);
  if (limited) return limited;

  const id = typeof params.id === 'string' ? params.id : '';
  if (!ID_SEGMENT_PATTERN.test(id)) {
    return apiError(404, 'not_found', 'Halaman usaha tidak ditemukan.');
  }

  const auth = tableAuth(env);
  if (!auth) {
    return apiError(500, 'validation', 'Konfigurasi server tidak lengkap.');
  }

  const profileRow = await getRow(auth, 'profiles', id, env);
  if (!profileRow) return apiError(404, 'not_found', 'Halaman usaha tidak ditemukan.');

  const profile = profileRowToDomain(profileRow as ProfileRow);
  // No business name, no page: every template leads with it, and a blank
  // profile row is the state of an account that never set itself up.
  if (!profile.businessName) {
    return apiError(404, 'not_found', 'Halaman usaha tidak ditemukan.');
  }

  const itemRows = await listRows(
    auth,
    'catalog',
    [
      // The catalog is org-scoped since multi-tenancy; `id` is the org id.
      { method: 'equal', attribute: 'orgId', values: [id] },
      // `$id` has to be named explicitly or Appwrite drops it from a
      // projection — the row mapper keys off it.
      { method: 'select', values: ['$id', 'name', 'kind', 'unit', 'unitPrice'] },
      { method: 'limit', values: [SITE_ITEMS_LIMIT] },
    ],
    env,
  );
  if (itemRows === null) {
    return apiError(
      503,
      'unavailable',
      'Layanan sedang tidak tersedia. Coba lagi beberapa saat lagi.',
    );
  }

  const items = itemRows
    .map((row) => catalogRowToDomain(row as CatalogRow))
    // A row whose columns fail the shape schema maps to a blank name — the
    // catalog list itself skips those, and a blank card would be worse here.
    .filter((item) => item.name !== '')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      name: item.name,
      kind: item.kind,
      // `unitPrice: 0` means "no price configured" (the catalog form's
      // default), which the client renders as "Hubungi" rather than Rp 0.
      unitPrice: item.unitPrice,
      ...(item.unit ? { unit: item.unit } : {}),
    }));

  return json(
    200,
    { site: publicSiteFromProfile(profile), items },
    // The owner edits this data and re-checks the page; a stale copy would
    // look like a save that silently failed. Same rule as the invoice read.
    { 'cache-control': 'no-store' },
  );
};

/** How many catalog rows one page load may pull — the cost ceiling per hit. */
const SITE_ITEMS_LIMIT = 100;

/** The display-only profile view the templates render. */
function publicSiteFromProfile(profile: ReturnType<typeof profileRowToDomain>) {
  return {
    businessName: profile.businessName,
    ownerName: profile.name,
    ...(profile.phone ? { phone: profile.phone } : {}),
    ...(profile.address ? { address: profile.address } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    businessType: profile.businessType,
    // Plan details and the raw R2 id stay server-side; only the URL the
    // browser fetches the image from is handed over.
    ...(profile.logoFileId
      ? { logoUrl: `/api/logo/${encodeURIComponent(profile.logoFileId)}` }
      : {}),
  };
}
