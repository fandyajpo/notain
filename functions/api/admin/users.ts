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
  phone: string;
  address?: string | null;
  email?: string | null;
};

type OrgRow = {
  $id: string;
  /** The org's display name — the business name everywhere in the app. */
  name?: string | null;
  /** The org's trade slug; `null`/absent when never chosen. */
  businessType?: string | null;
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
      // The business name is the org's `name`, and the type its
      // `businessType` — neither is a profile column any more.
      businessName: org?.name ?? '',
      phone: profile?.phone ?? '',
      address: profile?.address ?? '',
      profileEmail: profile?.email ?? '',
      businessType: org?.businessType ?? '',
      // Plan comes from the ORG row; an account with no org reads as free
      // (there is no paid plan anywhere for it to borrow).
      plan: org?.plan ?? 'free',
      planExpiresAt: org?.planExpiresAt ?? null,
    };
  });

  return json(200, {
    users: entries,
    total: usersData.total,
    nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.$id ?? null) : null,
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
  // inside before touching anything. No active membership = nothing to edit.
  const orgId = await primaryOrgId(auth, userId, env);
  if (!orgId) {
    return apiError(
      404,
      'not_found',
      'Akun ini belum punya usaha, jadi belum ada data usaha untuk diubah.',
    );
  }

  // Snapshot both rows before the first write. The API has no transaction, so
  // these snapshots let us undo the profile half if the organization write fails.
  const [profileSnapshot, orgSnapshot] = await Promise.all([
    readAdminDocument(endpoint, headers, PROFILES_TABLE_ID, orgId),
    readAdminDocument(endpoint, headers, ORGS_TABLE_ID, orgId),
  ]);
  if (profileSnapshot.kind === 'error' || orgSnapshot.kind === 'error') {
    console.error('admin.users: could not read rows before update', { orgId });
    return apiError(503, 'unavailable', 'Data organisasi tidak bisa dibaca. Coba lagi.');
  }
  if (orgSnapshot.kind === 'missing') {
    return apiError(404, 'not_found', 'Organisasi tidak ditemukan.');
  }

  const profileData = {
    name: profile.name,
    phone: profile.phone,
    address: profile.address || null,
    email: profile.email || null,
  };
  const profileUrl = adminDocumentUrl(endpoint, PROFILES_TABLE_ID, orgId);
  let profileResponse: Response | null = null;
  try {
    profileResponse =
      profileSnapshot.kind === 'found'
        ? await fetch(profileUrl, {
            method: 'PATCH',
            headers: { ...headers, 'content-type': 'application/json' },
            body: JSON.stringify({ data: profileData }),
          })
        : await fetch(
            `${endpoint}/databases/${DATABASE_ID}/collections/${PROFILES_TABLE_ID}/documents`,
            {
              method: 'POST',
              headers: { ...headers, 'content-type': 'application/json' },
              body: JSON.stringify({
                documentId: orgId,
                data: { ...profileData, plan: 'free', planExpiresAt: null },
                permissions: [],
              }),
            },
          );

    // A profile can be removed between the snapshot and PATCH. Preserve the
    // previous create-if-missing behavior, still under the same compensation.
    if (profileResponse.status === 404 && profileSnapshot.kind === 'found') {
      profileResponse = await fetch(
        `${endpoint}/databases/${DATABASE_ID}/collections/${PROFILES_TABLE_ID}/documents`,
        {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            documentId: orgId,
            data: { ...profileData, plan: 'free', planExpiresAt: null },
            permissions: [],
          }),
        },
      );
    }
  } catch {
    profileResponse = null;
  }

  if (!profileResponse?.ok) {
    const detail = profileResponse
      ? await profileResponse.text().catch(() => '')
      : 'network error';
    console.error('admin.users: profile write failed:', detail.slice(0, 200));
    const restored = await restoreProfileSnapshot(endpoint, headers, orgId, profileSnapshot);
    return restored
      ? apiError(503, 'unavailable', 'Profil tidak tersimpan. Perubahan sebelumnya dibatalkan.')
      : apiError(
          503,
          'unavailable',
          'Profil tidak tersimpan dan pemulihan data gagal. Verifikasi organisasi.',
        );
  }

  // The plan and business name belong to the organization row. Blank business
  // names intentionally leave the current org name untouched.
  const orgData: Record<string, unknown> = {
    plan: profile.plan,
    planExpiresAt: profile.planExpiresAt,
  };
  if (profile.businessName !== '') orgData.name = profile.businessName;
  const orgUrl = adminDocumentUrl(endpoint, ORGS_TABLE_ID, orgId);

  let planResponse: Response | null = null;
  try {
    planResponse = await fetch(orgUrl, {
      method: 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ data: orgData }),
    });
  } catch {
    // A network failure is ambiguous: the server may have applied the org
    // patch before the response was lost, so restore both snapshots.
    const [profileRestored, orgRestored] = await Promise.all([
      restoreProfileSnapshot(endpoint, headers, orgId, profileSnapshot),
      restoreOrgSnapshot(endpoint, headers, orgId, orgSnapshot, orgData),
    ]);
    console.error('admin.users: organization update response was lost', { orgId });
    return profileRestored && orgRestored
      ? apiError(
          503,
          'unavailable',
          'Update tidak bisa dikonfirmasi. Perubahan sebelumnya dibatalkan.',
        )
      : apiError(
          503,
          'unavailable',
          'Update tidak bisa dikonfirmasi dan pemulihan gagal. Verifikasi organisasi.',
        );
  }

  if (!planResponse.ok) {
    const planBody = await planResponse.text().catch(() => '');
    console.error('admin.users: plan update failed:', planBody.slice(0, 200));
    const restored = await restoreProfileSnapshot(endpoint, headers, orgId, profileSnapshot);
    return restored
      ? apiError(
          503,
          'unavailable',
          'Gagal update plan organisasi. Perubahan profil sebelumnya dibatalkan.',
        )
      : apiError(
          503,
          'unavailable',
          'Gagal update plan dan memulihkan profil. Verifikasi organisasi.',
        );
  }

  const auditWritten = await writeAudit(env, {
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
  // The business writes already committed. An audit outage is surfaced as a
  // warning flag, never as a failed update that might be retried blindly.
  return json(200, { success: true, auditWritten });
}

type AdminDocumentSnapshot =
  | { kind: 'found'; data: Record<string, unknown> }
  | { kind: 'missing' }
  | { kind: 'error' };

function adminDocumentUrl(endpoint: string, table: string, id: string): string {
  return `${endpoint}/databases/${DATABASE_ID}/collections/${table}/documents/${encodeURIComponent(
    id,
  )}`;
}

async function readAdminDocument(
  endpoint: string,
  headers: Record<string, string>,
  table: string,
  id: string,
): Promise<AdminDocumentSnapshot> {
  let response: Response;
  try {
    response = await fetch(adminDocumentUrl(endpoint, table, id), { headers });
  } catch {
    return { kind: 'error' };
  }
  if (response.status === 404) return { kind: 'missing' };
  if (!response.ok) return { kind: 'error' };
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return data && typeof data.$id === 'string' ? { kind: 'found', data } : { kind: 'error' };
}

async function restoreProfileSnapshot(
  endpoint: string,
  headers: Record<string, string>,
  orgId: string,
  snapshot: AdminDocumentSnapshot,
): Promise<boolean> {
  if (snapshot.kind === 'missing') {
    const response = await fetch(adminDocumentUrl(endpoint, PROFILES_TABLE_ID, orgId), {
      method: 'DELETE',
      headers,
    }).catch(() => null);
    return response !== null && (response.ok || response.status === 404);
  }
  if (snapshot.kind !== 'found') return false;
  return restoreDocument(
    endpoint,
    headers,
    PROFILES_TABLE_ID,
    orgId,
    {
      name: typeof snapshot.data.name === 'string' ? snapshot.data.name : '',
      phone: typeof snapshot.data.phone === 'string' ? snapshot.data.phone : '',
      address: snapshot.data.address ?? null,
      email: snapshot.data.email ?? null,
    },
  );
}

async function restoreOrgSnapshot(
  endpoint: string,
  headers: Record<string, string>,
  orgId: string,
  snapshot: AdminDocumentSnapshot,
  changed: Record<string, unknown>,
): Promise<boolean> {
  if (snapshot.kind !== 'found') return false;
  const data: Record<string, unknown> = {
    plan: snapshot.data.plan ?? 'free',
    planExpiresAt: snapshot.data.planExpiresAt ?? null,
  };
  if (Object.prototype.hasOwnProperty.call(changed, 'name')) data.name = snapshot.data.name ?? '';
  return restoreDocument(endpoint, headers, ORGS_TABLE_ID, orgId, data);
}

async function restoreDocument(
  endpoint: string,
  headers: Record<string, string>,
  table: string,
  id: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const response = await fetch(adminDocumentUrl(endpoint, table, id), {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
  }).catch(() => null);
  if (!response?.ok) {
    const detail = response ? await response.text().catch(() => '') : 'network error';
    console.error(`admin.users: ${table} rollback failed:`, detail.slice(0, 200));
    return false;
  }
  return true;
}
