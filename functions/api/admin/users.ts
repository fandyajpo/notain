import { writeAudit } from '../../_lib/audit';
import { primaryOrgId, primaryOrgIds, requireAdmin } from '../../_lib/admin';
import { querySearchAll } from '../../_lib/appwrite';
import { apiError, fetchUpstream as fetch, json } from '../../_lib/http';
import type { Env, PagesFunction } from '../../_lib/types';

const PROFILES_TABLE_ID = 'profiles';
const ORGS_TABLE_ID = 'organizations';
const DATABASE_ID = 'notain_db';
const LIST_DEFAULT_LIMIT = 25;
const LIST_MAX_LIMIT = 50;

type AppwriteUser = {
  $id: string;
  email: string;
  name: string;
  $createdAt: string;
  status: boolean;
};

type ProfileRow = {
  $id: string;
  name: string;
  businessName?: string | null;
  phone: string;
  address?: string | null;
  email?: string | null;
  businessType?: string | null;
};

type OrgRow = {
  $id: string;
  /** Billing state lives on the ORGANIZATION since multi-tenancy. */
  plan?: string | null;
  planExpiresAt?: string | null;
};

type AdminUserEntry = {
  userId: string;
  /** Login email from the Appwrite account. */
  email: string;
  createdAt: string;
  /** Appwrite account status: false means the user is blocked (suspended). */
  status: boolean;
  name: string;
  businessName: string;
  phone: string;
  address: string;
  /** Optional business-contact email stored on the profile (not the login). */
  profileEmail: string;
  /** Business-type slug from the taxonomy; '' when the user never chose one. */
  businessType: string;
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
 * `GET /api/admin/users` — one page of registered users joined with the data
 * their PRIMARY organization holds (see `primaryOrgIds` for the resolution).
 * Supports `?limit=` (1–50, default 25) and `?cursorAfter=<userId>`
 * for the "Muat lebih banyak" pattern.
 * `PATCH /api/admin/users` — update the primary org's business profile and
 * (separately, on the row that owns it) its plan.
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

  const gate = await requireAdmin(request, env);
  if (!gate.ok) return gate.response;
  const { endpoint, headers } = gate.admin;

  // Route by method.
  if (request.method === 'GET') {
    return listUsers(endpoint, headers, new URL(request.url), env);
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

  return updateUserProfile(endpoint, headers, body.userId, parsed.value, env, gate.admin.session);
};

async function listUsers(
  endpoint: string,
  headers: Record<string, string>,
  url: URL,
  env: Env,
): Promise<Response> {
  const limitParam = Number(url.searchParams.get('limit'));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), LIST_MAX_LIMIT)
      : LIST_DEFAULT_LIMIT;
  const cursor = url.searchParams.get('cursorAfter');

  // Over-fetch by one so `nextCursor` is exact: a full page means "there may
  // be more", an over-limit fetch means "there is". Numbered keys: sharing
  // `queries[0]` would drop the limit the moment a cursor is added, freezing
  // pagination at Appwrite's default page size.
  const queries: Array<{ method: string; values: unknown[] }> = [
    { method: 'limit', values: [limit + 1] },
  ];
  if (cursor) queries.push({ method: 'cursorAfter', values: [cursor] });

  const usersResponse = await fetch(`${endpoint}/users?${querySearchAll(queries)}`, { headers });
  if (!usersResponse.ok) {
    return apiError(500, 'validation', 'Gagal mengambil daftar user.');
  }
  const usersData = (await usersResponse.json()) as { users: AppwriteUser[]; total: number };

  const hasMore = usersData.users.length > limit;
  const page = hasMore ? usersData.users.slice(0, limit) : usersData.users;

  // Resolve each account's PRIMARY organization (newest active membership),
  // then join the two org-keyed rows. Nothing tenanted is user-keyed since
  // multi-tenancy: the identity is `profiles/<orgId>` and the plan is on
  // `organizations/<orgId>` — the old join (profiles by `$id == userId`)
  // would now show every account as free with empty fields.
  const orgByUser = await primaryOrgIds(
    { endpoint, headers },
    page.map((user) => user.$id),
    env,
  );
  const orgIds = [...new Set(orgByUser.values())];

  const orgMap = new Map<string, OrgRow>();
  const profileMap = new Map<string, ProfileRow>();
  if (orgIds.length > 0) {
    // `equal` wants the ids as its own value array — passing `[ids]` nests
    // them and Appwrite answers 400. The explicit limit covers every id on
    // this page (Appwrite would otherwise stop at its default 25).
    const [orgsResponse, profilesResponse] = await Promise.all([
      fetch(
        `${endpoint}/databases/${DATABASE_ID}/collections/${ORGS_TABLE_ID}/documents?${querySearchAll(
          [
            { method: 'equal', attribute: '$id', values: orgIds },
            { method: 'limit', values: [orgIds.length] },
          ],
        )}`,
        { headers },
      ),
      fetch(
        `${endpoint}/databases/${DATABASE_ID}/collections/${PROFILES_TABLE_ID}/documents?${querySearchAll(
          [
            { method: 'equal', attribute: '$id', values: orgIds },
            { method: 'limit', values: [orgIds.length] },
          ],
        )}`,
        { headers },
      ),
    ]);
    if (orgsResponse.ok) {
      const orgsData = (await orgsResponse.json()) as { documents: OrgRow[] };
      for (const row of orgsData.documents) orgMap.set(row.$id, row);
    }
    if (profilesResponse.ok) {
      const profilesData = (await profilesResponse.json()) as { documents: ProfileRow[] };
      for (const row of profilesData.documents) profileMap.set(row.$id, row);
    }
  }

  const entries: AdminUserEntry[] = page.map((user) => {
    const orgId = orgByUser.get(user.$id);
    const org = orgId ? orgMap.get(orgId) : undefined;
    const profile = orgId ? profileMap.get(orgId) : undefined;
    return {
      userId: user.$id,
      email: user.email,
      createdAt: user.$createdAt,
      status: user.status,
      name: profile?.name || user.name || '',
      businessName: profile?.businessName ?? '',
      phone: profile?.phone ?? '',
      address: profile?.address ?? '',
      profileEmail: profile?.email ?? '',
      businessType: profile?.businessType ?? '',
      // Plan comes from the ORG row; an account with no org reads as free
      // (there is no paid plan anywhere for it to borrow).
      plan: org?.plan ?? 'free',
      planExpiresAt: org?.planExpiresAt ?? null,
    };
  });

  return json(200, {
    users: entries,
    total: usersData.total,
    nextCursor: hasMore && page.length > 0 ? page[page.length - 1].$id : null,
  });
}

async function updateUserProfile(
  endpoint: string,
  headers: Record<string, string>,
  userId: string,
  profile: ProfileUpdate,
  env: Env,
  actor: { userId: string; email: string },
): Promise<Response> {
  const auth = { endpoint, headers };

  // Nothing tenanted is user-keyed: resolve which org this account works
  // inside before touching anything. No active membership = nothing to edit
  // (an account that never set up has no rows, and inventing a
  // `profiles/<userId>` row would resurrect the pre-multi-tenancy contract).
  const orgId = await primaryOrgId(auth, userId, env);
  if (!orgId) {
    return apiError(
      404,
      'not_found',
      'User belum memiliki organisasi — belum ada data yang bisa diubah.',
    );
  }

  // 1. The org's business identity. Plan columns are deliberately NOT on
  //    this payload: they are vestigial on the profile row and billing state
  //    belongs to `organizations` (written below and by payment settle).
  const data = {
    name: profile.name,
    businessName: profile.businessName || null,
    phone: profile.phone,
    address: profile.address || null,
    email: profile.email || null,
  };

  const updateResponse = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${PROFILES_TABLE_ID}/documents/${orgId}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    },
  );

  if (!updateResponse.ok) {
    const errorBody = await updateResponse.text().catch(() => '');
    // 404 means the org has no profile row yet (org created, settings never
    // opened) — create it keyed by the org id, API-key-only like every row
    // the profile Function itself creates.
    if (updateResponse.status === 404) {
      const createResponse = await fetch(
        `${endpoint}/databases/${DATABASE_ID}/collections/${PROFILES_TABLE_ID}/documents`,
        {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            documentId: orgId,
            data: { ...data, plan: 'free', planExpiresAt: null },
            permissions: [],
          }),
        },
      );
      if (!createResponse.ok) {
        const createBody = await createResponse.text().catch(() => '');
        return apiError(
          500,
          'validation',
          `Gagal membuat profil organisasi: ${createBody.slice(0, 200)}`,
        );
      }
    } else {
      return apiError(500, 'validation', `Gagal update profil: ${errorBody.slice(0, 200)}`);
    }
  }

  // 2. The plan, on the row that owns it. This is the admin's grant — the
  //    same two columns checkout/subscribe write, so the app reads one place
  //    and the plan applies to everyone in the org at once.
  const planResponse = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${ORGS_TABLE_ID}/documents/${orgId}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        data: { plan: profile.plan, planExpiresAt: profile.planExpiresAt },
      }),
    },
  );
  if (!planResponse.ok) {
    const planBody = await planResponse.text().catch(() => '');
    return apiError(500, 'validation', `Gagal update plan organisasi: ${planBody.slice(0, 200)}`);
  }

  await writeAudit(env, {
    actorId: actor.userId,
    actorEmail: actor.email,
    action: 'user.update',
    targetType: 'user',
    targetId: userId,
    detail: JSON.stringify({
      orgId,
      plan: profile.plan,
      planExpiresAt: profile.planExpiresAt,
    }),
  });
  return json(200, { success: true });
}
