import { profileSchema } from '../../src/core/profile/model';
import { verifySession } from '../_lib/appwrite';
import { apiError, json } from '../_lib/http';
import { createRow, getRow, patchRow, tableAuth } from '../_lib/rows';
import type { Env, PagesFunction } from '../_lib/types';

/**
 * `PUT /api/profile` — the only writer of a user's own profile row.
 *
 * Appwrite has no per-column permissions, so any session that can write its
 * row can write *every* column on it — including `plan` and `planExpiresAt`,
 * which used to make the client-side "never change the plan" lock in
 * `saveProfile` a suggestion anyone could skip with a hand-rolled request.
 * This route closes that: the row id is taken from the verified session (never
 * from the body), the writable columns are a fixed whitelist below, and plan
 * columns are simply not on it — an update leaves them untouched, a create
 * always starts at `free`.
 *
 * The API key that performs the Appwrite write bypasses row security, so this
 * also survives the permission hardening that removes every session's direct
 * write path (`scripts/harden-profile-permissions.mjs`).
 */

/** Everything a session may write. `plan`/`planExpiresAt` are absent by design. */
const editableProfileSchema = profileSchema.omit({ plan: true, planExpiresAt: true });

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'PUT') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'PUT' });
  }

  const session = await verifySession(request, env);
  if (!session) {
    return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');
  }

  const auth = tableAuth(env);
  if (!auth) {
    return apiError(500, 'validation', 'Konfigurasi server tidak lengkap.');
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
  // $id, an invented column) is dropped right here. `phone` is a required
  // column, so "no phone" is the empty string rather than null.
  const data = {
    name: parsed.data.name,
    businessName: parsed.data.businessName || null,
    phone: parsed.data.phone ?? '',
    address: parsed.data.address ?? null,
    email: parsed.data.email ?? null,
    logoFileId: parsed.data.logoFileId ?? null,
    businessType: parsed.data.businessType ?? null,
  };

  const existing = await getRow(auth, 'profiles', session.userId);
  if (existing) {
    // Patch, not upsert: absent keys keep their stored value, so plan and
    // planExpiresAt survive every settings save untouched — only checkout and
    // the admin API (both on the API key) ever move a row between plans.
    if (!(await patchRow(auth, 'profiles', session.userId, data))) {
      return apiError(500, 'validation', 'Gagal menyimpan profil.');
    }
    const row = await getRow(auth, 'profiles', session.userId);
    if (!row) {
      return apiError(500, 'validation', 'Gagal menyimpan profil.');
    }
    return json(200, row);
  }

  const created = await createRow(
    auth,
    'profiles',
    session.userId,
    {
      ...data,
      // A brand-new account is always free; nothing a caller sends can
      // bootstrap it onto a paid plan.
      plan: 'free',
      planExpiresAt: null,
    },
    ownerReadPermissions(session.userId),
  );
  if (!created) {
    return apiError(500, 'validation', 'Gagal menyimpan profil.');
  }
  return json(201, created);
};

/**
 * Read-only permission for the owner — deliberately *not* `ownerRowPermissions`
 * from `src/appwrite/permissions.ts` (update/delete would hand sessions the
 * direct write path this route exists to replace). The string form is
 * inlined because importing the appwrite SDK for one string would drag the
 * whole client bundle into the Function; the two definitions must stay in
 * sync by hand.
 */
function ownerReadPermissions(ownerId: string): string[] {
  return [`read("user:${ownerId}")`];
}
