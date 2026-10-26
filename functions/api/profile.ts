import { profileSchema } from '../../src/core/profile/model';
import { requireOrg } from '../_lib/orgs';
import { apiError, json } from '../_lib/http';
import { createRow, getRow, patchRow } from '../_lib/rows';
import type { Env, PagesFunction } from '../_lib/types';

/**
 * `GET  /api/profile?orgId=…` — read the org's PERSONAL profile row.
 * `PUT  /api/profile?orgId=…` — the only writer of that row.
 *
 * Multi-tenancy: the row id IS the org id (`ensure-orgs.mjs` rekeys it), so
 * one organization has exactly one profile row no matter how many members
 * edit it. Both methods walk `requireOrg` first: the caller's membership row
 * is the only authority, and the `orgId` query value is just a hint that
 * resolves to 404 for anyone outside the org.
 *
 * The row is deliberately PERSONAL only — the person's name, contact fields
 * and logo. The business NAME and TYPE belong to the organization
 * (`organizations/<orgId>`); the invoice and public-site Functions read them
 * from there. This endpoint neither stores nor returns them, so the two can
 * never drift.
 *
 * The plan lock is why writes stayed on this route at all: Appwrite has no
 * per-column permissions, so any session that can write its row can write
 * *every* column — including `plan`/`planExpiresAt`, which used to make the
 * client-side "never change the plan" guard a suggestion. The row id comes
 * from the validated `orgId` (never the body), the writable columns are the
 * fixed whitelist below, and plan columns are simply not on it.
 *
 * The API key that performs the Appwrite write bypasses row security, so
 * nothing here depends on session permissions — and no session has a write
 * path to `profiles` at all (`scripts/harden-profile-permissions.mjs`).
 */

/** Everything a member may write. `plan`/`planExpiresAt` are absent by design. */
const editableProfileSchema = profileSchema.omit({ plan: true, planExpiresAt: true });

/**
 * The response shape of this endpoint: exactly the personal columns the
 * domain mapper reads. Legacy rows still physically carry `businessName`
 * and `businessType` from before the split — echoing the row would make
 * those look authoritative again, so every response goes through this
 * projection instead.
 */
function profileView(row: Record<string, unknown>) {
  const str = (value: unknown): string => (typeof value === 'string' ? value : '');
  const opt = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;
  return {
    name: str(row.name),
    phone: str(row.phone),
    address: opt(row.address),
    email: opt(row.email),
    logoFileId: opt(row.logoFileId),
    plan: typeof row.plan === 'string' && row.plan !== '' ? row.plan : 'free',
    planExpiresAt: opt(row.planExpiresAt),
  };
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'PUT') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', {
      allow: 'GET, PUT',
    });
  }

  const orgId = new URL(request.url).searchParams.get('orgId');
  const gate = await requireOrg(request, env, orgId);
  if (!gate.ok) return gate.response;
  const { auth } = gate.access;

  if (request.method === 'GET') {
    const row = await getRow(auth, 'profiles', gate.access.orgId, env);
    if (!row) return apiError(404, 'not_found', 'Profil tidak ditemukan.');
    // Personalised to the org's members; never a shared cache. The row is
    // projected — never echoed — so legacy business columns cannot leak.
    return json(200, profileView(row), { 'cache-control': 'no-store' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'validation', 'Data yang dikirim tidak bisa dibaca.');
  }

  const parsed = editableProfileSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      'validation',
      parsed.error.issues[0]?.message ?? 'Data profil tidak valid.',
    );
  }

  // The column whitelist, spelled out: whatever else the body carried (plan,
  // businessName, businessType, $id, an invented column) is dropped right
  // here. `phone` is a required column, so "no phone" is the empty string
  // rather than null.
  const data = {
    name: parsed.data.name,
    phone: parsed.data.phone ?? '',
    address: parsed.data.address ?? null,
    email: parsed.data.email ?? null,
    logoFileId: parsed.data.logoFileId ?? null,
  };

  const existing = await getRow(auth, 'profiles', gate.access.orgId, env);
  if (existing) {
    // Patch, not upsert: absent keys keep their stored value, so the vestigial
    // plan columns survive every settings save untouched — only checkout and
    // the admin API (both on the API key) ever move a row between plans.
    if (!(await patchRow(auth, 'profiles', gate.access.orgId, data))) {
      return apiError(500, 'validation', 'Gagal menyimpan profil.');
    }
    // `existing` is every column the row holds and `data` is exactly the set
    // the patch just wrote, so their merge *is* the saved row — a third
    // Appwrite round trip would only fetch those same columns back. The
    // projection keeps plan columns (checkout moves them) and nothing else.
    return json(200, profileView({ ...existing, ...data }));
  }

  const created = await createRow(
    auth,
    'profiles',
    gate.access.orgId,
    {
      ...data,
      // A brand-new profile row is always free; nothing a caller sends can
      // bootstrap it onto a paid plan.
      plan: 'free',
      planExpiresAt: null,
    },
    // API-key reads are the only path the app uses now (this Function and
    // the admin Functions); sessions get nothing directly.
    [],
  );
  if (!created) {
    return apiError(500, 'validation', 'Gagal menyimpan profil.');
  }
  return json(201, profileView(created));
};
