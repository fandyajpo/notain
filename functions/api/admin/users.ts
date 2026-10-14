import { verifySession } from '../../_lib/appwrite';
import { apiError, json } from '../../_lib/http';
import type { Env, PagesFunction } from '../../_lib/types';

const ADMIN_TEAM_ID = 'admins';
const PROFILES_TABLE_ID = 'profiles';
const DATABASE_ID = 'notain_db';

type AppwriteUser = {
  $id: string;
  email: string;
  name: string;
  $createdAt: string;
};

type ProfileRow = {
  $id: string;
  name: string;
  businessName?: string | null;
  phone: string;
  address?: string | null;
  email?: string | null;
  plan?: string;
  planExpiresAt?: string | null;
};

type AdminUserEntry = {
  userId: string;
  /** Login email from the Appwrite account. */
  email: string;
  createdAt: string;
  name: string;
  businessName: string;
  phone: string;
  address: string;
  /** Optional business-contact email stored on the profile (not the login). */
  profileEmail: string;
  plan: string;
  planExpiresAt: string | null;
};

type ProfileUpdate = {
  name: string;
  businessName: string;
  phone: string;
  address: string;
  email: string;
  plan: string;
  planExpiresAt: string | null;
};

const PLAN_VALUES = ['free', 'pro', 'business'] as const;
const PHONE_PATTERN = /^(?:\+?62|0)8\d{7,12}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROFILE_LIMITS = { name: 128, businessName: 128, phone: 32, address: 256, email: 128 };

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validates a PATCH body into a full profile update. Mirrors the client-side
 * profile model (`src/core/profile/model.ts`) so a malformed value never
 * reaches the table.
 */
function parseProfileUpdate(
  body: Record<string, unknown>,
): { ok: true; value: ProfileUpdate } | { ok: false; message: string } {
  const name = optionalString(body.name);
  if (name === '') return { ok: false, message: 'Nama wajib diisi.' };
  if (name.length > PROFILE_LIMITS.name) return { ok: false, message: 'Nama terlalu panjang.' };

  const businessName = optionalString(body.businessName);
  if (businessName.length > PROFILE_LIMITS.businessName) {
    return { ok: false, message: 'Nama usaha terlalu panjang.' };
  }

  const phone = optionalString(body.phone);
  if (phone.length > PROFILE_LIMITS.phone) {
    return { ok: false, message: 'Nomor WhatsApp terlalu panjang.' };
  }
  if (phone !== '' && !PHONE_PATTERN.test(phone)) {
    return { ok: false, message: 'Nomor WhatsApp tidak valid.' };
  }

  const address = optionalString(body.address);
  if (address.length > PROFILE_LIMITS.address) {
    return { ok: false, message: 'Alamat terlalu panjang.' };
  }

  const email = optionalString(body.email);
  if (email.length > PROFILE_LIMITS.email) return { ok: false, message: 'Email terlalu panjang.' };
  if (email !== '' && !EMAIL_PATTERN.test(email)) {
    return { ok: false, message: 'Email tidak valid.' };
  }

  const plan = optionalString(body.plan);
  if (!(PLAN_VALUES as readonly string[]).includes(plan)) {
    return { ok: false, message: 'Plan harus free, pro, atau business.' };
  }

  const planExpiresAt =
    typeof body.planExpiresAt === 'string' && body.planExpiresAt.trim() !== ''
      ? body.planExpiresAt.trim()
      : null;

  return { ok: true, value: { name, businessName, phone, address, email, plan, planExpiresAt } };
}

/**
 * `GET /api/admin/users` — list every registered user with their profile.
 * `PATCH /api/admin/users` — update one user's full profile (name, business,
 * contact fields, plan, and expiry).
 *
 * Both require the caller to be a member of the `admins` Appwrite team.
 * The API key lives as an encrypted Pages variable; it is never sent to
 * the browser.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== 'GET' && request.method !== 'PATCH') {
    return apiError(405, 'method_not_allowed', 'Gunakan GET atau PATCH.');
  }

  const session = await verifySession(request, env);
  if (!session) {
    return apiError(401, 'unauthenticated', 'Sesi tidak valid. Masuk ulang.');
  }

  const endpoint = env.PUBLIC_APPWRITE_ENDPOINT?.replace(/\/+$/, '');
  const projectId = env.PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY;
  if (!endpoint || !projectId || !apiKey) {
    return apiError(500, 'validation', 'Konfigurasi server tidak lengkap.');
  }

  const headers = {
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
  };

  // 1. Check admin team membership.
  const isAdmin = await checkAdmin(endpoint, headers, session.userId);
  if (!isAdmin) {
    return apiError(403, 'unauthenticated', 'Kamu bukan admin.');
  }

  // 2. Route by method.
  if (request.method === 'GET') {
    return listUsers(endpoint, headers);
  }

  // PATCH
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body || typeof body.userId !== 'string' || body.userId === '') {
    return apiError(400, 'validation', 'userId wajib diisi.');
  }
  const parsed = parseProfileUpdate(body);
  if (!parsed.ok) {
    return apiError(400, 'validation', parsed.message);
  }

  return updateUserProfile(endpoint, headers, body.userId, parsed.value);
};

/**
 * Appwrite ≥2.4 expects each query as a JSON object (`{ method, attribute,
 * values }`) at a numeric-index key — the legacy `limit(100)` string form
 * errors with "Invalid query: Syntax error". Returns a ready-to-append
 * `queries[0]=...` search string.
 */
function querySearch(method: string, values: unknown[], attribute: string | null = null): string {
  const json = JSON.stringify({ method, attribute, values });
  return `queries[0]=${encodeURIComponent(json)}`;
}

async function checkAdmin(
  endpoint: string,
  headers: Record<string, string>,
  userId: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${endpoint}/teams/${ADMIN_TEAM_ID}/memberships?${querySearch('equal', [userId], 'userId')}`,
      { headers },
    );
    if (!response.ok) return false;
    const data = (await response.json()) as { total?: number };
    return (data.total ?? 0) > 0;
  } catch {
    return false;
  }
}

async function listUsers(
  endpoint: string,
  headers: Record<string, string>,
): Promise<Response> {
  // Fetch all users (Appwrite paginates at 25 by default; request up to 100).
  const usersResponse = await fetch(
    `${endpoint}/users?${querySearch('limit', [100])}`,
    { headers },
  );
  if (!usersResponse.ok) {
    return apiError(500, 'validation', 'Gagal mengambil daftar user.');
  }
  const usersData = (await usersResponse.json()) as { users: AppwriteUser[]; total: number };

  // Fetch all profiles.
  const profilesResponse = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${PROFILES_TABLE_ID}/documents?${querySearch('limit', [100])}`,
    { headers },
  );
  const profilesData = profilesResponse.ok
    ? ((await profilesResponse.json()) as { documents: ProfileRow[] })
    : { documents: [] };

  // Index profiles by $id (which equals the owner's userId).
  const profileMap = new Map<string, ProfileRow>();
  for (const row of profilesData.documents) {
    profileMap.set(row.$id, row);
  }

  const entries: AdminUserEntry[] = usersData.users.map((user) => {
    const profile = profileMap.get(user.$id);
    return {
      userId: user.$id,
      email: user.email,
      createdAt: user.$createdAt,
      name: profile?.name || user.name || '',
      businessName: profile?.businessName ?? '',
      phone: profile?.phone ?? '',
      address: profile?.address ?? '',
      profileEmail: profile?.email ?? '',
      plan: profile?.plan ?? 'free',
      planExpiresAt: profile?.planExpiresAt ?? null,
    };
  });

  return json(200, { users: entries, total: usersData.total });
}

async function updateUserProfile(
  endpoint: string,
  headers: Record<string, string>,
  userId: string,
  profile: ProfileUpdate,
): Promise<Response> {
  // Shape matches the app's `profileToRowData` so empty optionals persist as
  // null (the same value the client writes).
  const data = {
    name: profile.name,
    businessName: profile.businessName || null,
    phone: profile.phone,
    address: profile.address || null,
    email: profile.email || null,
    plan: profile.plan,
    planExpiresAt: profile.planExpiresAt,
  };

  // Update the profile document (document id = userId). Appwrite ≥2.4 wraps
  // attribute values in a `data` object.
  const updateResponse = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${PROFILES_TABLE_ID}/documents/${userId}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    },
  );

  if (!updateResponse.ok) {
    const errorBody = await updateResponse.text().catch(() => '');
    // 404 means the profile doesn't exist yet — create it, granting the owner
    // the same read/update/delete access the app sets on its own rows.
    if (updateResponse.status === 404) {
      const createResponse = await fetch(
        `${endpoint}/databases/${DATABASE_ID}/collections/${PROFILES_TABLE_ID}/documents`,
        {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            documentId: userId,
            data,
            permissions: [
              `read("user:${userId}")`,
              `update("user:${userId}")`,
              `delete("user:${userId}")`,
            ],
          }),
        },
      );
      if (!createResponse.ok) {
        const createBody = await createResponse.text().catch(() => '');
        return apiError(
          500,
          'validation',
          `Gagal membuat profil user: ${createBody.slice(0, 200)}`,
        );
      }
      return json(200, { success: true });
    }
    return apiError(500, 'validation', `Gagal update profil: ${errorBody.slice(0, 200)}`);
  }

  return json(200, { success: true });
}
