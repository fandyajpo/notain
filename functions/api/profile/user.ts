import { verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import { createRow, getRow, patchRow, tableAuth } from '../../_lib/rows';
import { fetchUpstream as fetch } from '../../_lib/http';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `GET /api/profile/user` — the SHARED user identity: username and phone,
 * one row per Appwrite account (`userProfiles/<userId>`).
 * `PUT /api/profile/user` — updates either field.
 *
 * Deliberately NOT org-gated: this is the account's identity, shared across
 * every organization the user owns or joins, and it must be editable while
 * the account still has zero orgs (the onboarding screen writes it before any
 * workspace exists). The only gate is the session JWT.
 *
 * The login email is deliberately absent — it is owned by the Appwrite
 * account, displayed read-only in the UI from the session, and no endpoint
 * here (or anywhere in settings) can touch it. Saving this profile therefore
 * never modifies authentication credentials.
 *
 * The username is also mirrored onto the Appwrite account's `name`
 * (best-effort — the `userProfiles` row is the source of truth; the mirror
 * exists so the admin panel and OAuth-imported names read the same identity).
 *
 * Row permissions are empty like every other table: only this Function,
 * through the server API key, touches `userProfiles`.
 */

const USERNAME_MAX = 128;
const PHONE_MAX = 32;
// Same shape the profile model and the admin panel enforce.
const PHONE_PATTERN = /^(?:\+?62|0)8\d{7,12}$/;

type UserIdentity = { username: string; phone: string };

function identityView(row: Record<string, unknown> | null): UserIdentity {
  return {
    username: typeof row?.username === 'string' ? row.username : '',
    phone: typeof row?.phone === 'string' ? row.phone : '',
  };
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'PUT') {
    return apiError(405, 'method_not_allowed', 'Gunakan GET atau PUT.', { allow: 'GET, PUT' });
  }

  const session = await verifySession(request, env);
  if (!session) return apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');

  const auth = tableAuth(env);
  if (!auth) return apiError(503, 'unavailable', 'Layanan sedang tidak tersedia.');

  const current = await getRow(auth, 'userProfiles', session.userId, env);

  if (request.method === 'GET') {
    return json(200, identityView(current));
  }

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!body) return apiError(400, 'validation', 'Format permintaan tidak valid.');

  // Patch semantics: absent key = untouched, `''` = clear, a value = set.
  const data: UserIdentity = {
    username: identityView(current).username,
    phone: identityView(current).phone,
  };
  if (Object.prototype.hasOwnProperty.call(body, 'username')) {
    const raw = body.username;
    if (raw === null || raw === undefined) {
      return apiError(400, 'validation', 'Nama pengguna tidak valid.');
    }
    const value = String(raw).trim();
    if (value.length > USERNAME_MAX) {
      return apiError(400, 'validation', 'Nama pengguna terlalu panjang.');
    }
    data.username = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
    const raw = body.phone;
    if (raw === null || raw === undefined) {
      return apiError(400, 'validation', 'Nomor WhatsApp tidak valid.');
    }
    const value = String(raw).trim();
    if (value !== '' && !PHONE_PATTERN.test(value)) {
      return apiError(
        400,
        'validation',
        'Masukkan nomor WhatsApp yang valid, contoh 081234567890.',
      );
    }
    if (value.length > PHONE_MAX) {
      return apiError(400, 'validation', 'Nomor WhatsApp terlalu panjang.');
    }
    data.phone = value;
  }
  if (
    data.username === identityView(current).username &&
    data.phone === identityView(current).phone
  ) {
    return json(200, data);
  }

  const saved = current
    ? (await patchRow(auth, 'userProfiles', session.userId, { ...data }))
      ? data
      : null
    : ((await createRow(
        auth,
        'userProfiles',
        session.userId,
        { ...data },
        [],
      )) as Record<string, unknown> | null);
  if (!saved) {
    return apiError(503, 'unavailable', 'Gagal menyimpan profil. Coba lagi.');
  }

  // Mirror the username onto the account. Best-effort: the row above is the
  // source of truth, so a failed mirror never fails the save.
  if (data.username !== '') {
    const endpoint = (env.PUBLIC_APPWRITE_ENDPOINT ?? '').replace(/\/+$/, '');
    const projectId = env.PUBLIC_APPWRITE_PROJECT_ID;
    if (endpoint && projectId) {
      try {
        const response = await fetch(`${endpoint}/users/${encodeURIComponent(session.userId)}`, {
          method: 'PATCH',
          headers: {
            ...auth.headers,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: data.username }),
        });
        if (!response.ok) {
          const detail = (await response.text().catch(() => '')).slice(0, 200);
          console.error('profile.user: account rename failed:', detail);
        }
      } catch (error) {
        console.error('profile.user: account rename failed:', error);
      }
    }
  }

  return json(200, data);
};