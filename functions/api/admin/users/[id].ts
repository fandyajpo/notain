import { writeAudit } from '../../../_lib/audit';
import { requireAdmin } from '../../../_lib/admin';
import { querySearch } from '../../../_lib/appwrite';
import { apiError, json } from '../../../_lib/http';
import type { Env, PagesFunction } from '../../../_lib/types';

const DATABASE_ID = 'notain_db';
const PROFILES_TABLE_ID = 'profiles';
const DRILLDOWN_LIMIT_DEFAULT = 20;
const DRILLDOWN_LIMIT_MAX = 50;

type ProfileRow = {
  name?: string | null;
  businessName?: string | null;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
  businessType?: string | null;
  plan?: string | null;
  planExpiresAt?: string | null;
};

type DrillResource = 'overview' | 'invoices' | 'customers' | 'templates';

const DRILL_RESOURCES: readonly DrillResource[] = ['overview', 'invoices', 'customers', 'templates'];

/**
 * `PATCH /api/admin/users/[id]` — suspend or unsuspend a user's Appwrite
 * account (`{ action: 'suspend' | 'unsuspend' }`). A blocked account cannot
 * sign in, and the Appwrite middleware rejects every request from it, so an
 * already-signed-in suspended user is locked out on their next call; the
 * client maps that `user_blocked` failure to the SuspendedScreen.
 *
 * `GET /api/admin/users/[id]?resource=…` — read-only drill-down into one
 * user's data: `overview` (profile + per-table totals), or a cursor-paged
 * slice of `invoices` / `customers` / `templates`.
 *
 * Admin-only (same wall as the collection routes).
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const userId = params.id;
  if (!userId) {
    return apiError(400, 'validation', 'userId wajib diisi.');
  }

  if (request.method !== 'GET' && request.method !== 'PATCH') {
    return apiError(405, 'method_not_allowed', 'Gunakan GET atau PATCH.');
  }

  const gate = await requireAdmin(request, env);
  if (!gate.ok) return gate.response;
  const { endpoint, headers, session } = gate.admin;

  if (request.method === 'PATCH') {
    return setUserStatus(endpoint, headers, session.userId, session.email, userId, request, env);
  }

  return drillDown(endpoint, headers, userId, new URL(request.url));
};

async function setUserStatus(
  endpoint: string,
  headers: Record<string, string>,
  actorId: string,
  actorEmail: string,
  userId: string,
  request: Request,
  env: Env,
): Promise<Response> {
  if (userId === actorId) {
    return apiError(400, 'validation', 'Kamu tidak bisa menonaktifkan akun sendiri.');
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === 'string' ? body.action : '';
  if (action !== 'suspend' && action !== 'unsuspend') {
    return apiError(400, 'validation', 'action harus suspend atau unsuspend.');
  }

  const response = await fetch(`${endpoint}/users/${userId}/status`, {
    method: 'PATCH',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ status: action === 'unsuspend' }),
  });

  if (response.status === 404) {
    return apiError(404, 'not_found', 'User tidak ditemukan.');
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return apiError(500, 'validation', `Gagal mengubah status user: ${text.slice(0, 200)}`);
  }

  await writeAudit(env, {
    actorId,
    actorEmail,
    action: `user.${action}`,
    targetType: 'user',
    targetId: userId,
    detail: JSON.stringify({ status: action === 'unsuspend' }),
  });

  return json(200, { success: true, status: action === 'unsuspend' });
}

async function drillDown(
  endpoint: string,
  headers: Record<string, string>,
  userId: string,
  url: URL,
): Promise<Response> {
  const resourceParam = url.searchParams.get('resource') ?? 'overview';
  if (!(DRILL_RESOURCES as readonly string[]).includes(resourceParam)) {
    return apiError(400, 'validation', 'resource harus overview, invoices, customers, atau templates.');
  }
  const resource = resourceParam as DrillResource;

  if (resource === 'overview') {
    return overview(endpoint, headers, userId);
  }
  return listResource(endpoint, headers, userId, resource, url);
}

async function overview(
  endpoint: string,
  headers: Record<string, string>,
  userId: string,
): Promise<Response> {
  const userResponse = await fetch(`${endpoint}/users/${userId}`, { headers });
  if (userResponse.status === 404) {
    return apiError(404, 'not_found', 'User tidak ditemukan.');
  }
  if (!userResponse.ok) {
    return apiError(500, 'validation', 'Gagal mengambil data user.');
  }
  const user = (await userResponse.json()) as {
    $id: string;
    email: string;
    name?: string;
    $createdAt: string;
    status: boolean;
  };

  const profileResponse = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${PROFILES_TABLE_ID}/documents/${userId}`,
    { headers },
  );
  const profile: ProfileRow | null = profileResponse.ok
    ? ((await profileResponse.json()) as ProfileRow)
    : null;

  const counts = {
    invoices: await countRows(endpoint, headers, 'invoices', userId),
    customers: await countRows(endpoint, headers, 'customers', userId),
    templates: await countRows(endpoint, headers, 'templates', userId),
  };

  return json(200, {
    user: {
      userId: user.$id,
      email: user.email,
      name: profile?.name || user.name || '',
      createdAt: user.$createdAt,
      status: user.status,
      businessName: profile?.businessName ?? '',
      phone: profile?.phone ?? '',
      address: profile?.address ?? '',
      profileEmail: profile?.email ?? '',
      businessType: profile?.businessType ?? '',
      plan: profile?.plan ?? 'free',
      planExpiresAt: profile?.planExpiresAt ?? null,
    },
    counts,
  });
}

async function countRows(
  endpoint: string,
  headers: Record<string, string>,
  tableId: string,
  ownerId: string,
): Promise<number> {
  // `total` is reported independent of `limit`, so a limit-1 read counts
  // without shipping rows.
  const response = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${tableId}/documents?${querySearch('equal', [ownerId], 'ownerId')}&${querySearch('limit', [1])}`,
    { headers },
  );
  if (!response.ok) return 0;
  const data = (await response.json()) as { total?: number };
  return data.total ?? 0;
}

const DRILL_SELECT: Record<'invoices' | 'customers' | 'templates', string[]> = {
  invoices: ['invoiceNumber', 'customerName', 'status', 'total', 'date'],
  customers: ['name', 'phone', 'email', 'lastUsedAt'],
  templates: ['name'],
};

async function listResource(
  endpoint: string,
  headers: Record<string, string>,
  userId: string,
  resource: 'invoices' | 'customers' | 'templates',
  url: URL,
): Promise<Response> {
  const limitParam = Number(url.searchParams.get('limit'));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), DRILLDOWN_LIMIT_MAX)
      : DRILLDOWN_LIMIT_DEFAULT;
  const cursor = url.searchParams.get('cursorAfter');

  const queries = [
    querySearch('equal', [userId], 'ownerId'),
    querySearch('limit', [limit]),
    querySearch('select', [DRILL_SELECT[resource], '$id']),
  ];
  if (cursor) queries.push(querySearch('cursorAfter', [cursor]));

  const response = await fetch(
    `${endpoint}/databases/${DATABASE_ID}/collections/${resource}/documents?${queries.join('&')}`,
    { headers },
  );
  if (!response.ok) {
    return apiError(500, 'validation', `Gagal mengambil ${resource}.`);
  }
  const data = (await response.json()) as {
    documents: Array<Record<string, unknown> & { $id: string }>;
    total: number;
  };

  const rows = data.documents.map((doc) => {
    const { $id, ...rest } = doc;
    return { id: $id, ...rest };
  });

  return json(200, {
    rows,
    total: data.total,
    nextCursor: rows.length === limit && rows.length > 0 ? rows[rows.length - 1].id : null,
  });
}
