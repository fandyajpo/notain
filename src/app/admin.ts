import { getAccount } from '../appwrite/client';

export type AdminUser = {
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
  /** Optional business-contact email stored on the profile. */
  profileEmail: string;
  /** Business-type slug from the taxonomy; '' when the user never chose one. */
  businessType: string;
  plan: string;
  planExpiresAt: string | null;
};

export type AdminUserUpdate = {
  userId: string;
  name: string;
  businessName: string;
  phone: string;
  address: string;
  /** Profile (business-contact) email — distinct from the login email. */
  email: string;
  plan: string;
  planExpiresAt: string | null;
};

export type AdminUserPage = {
  users: AdminUser[];
  total: number;
  nextCursor: string | null;
};

export type AdminAuditRow = {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  createdAt: string;
};

export type AdminAuditPage = {
  rows: AdminAuditRow[];
  total: number;
  nextCursor: string | null;
};

export type AdminDrillResource = 'overview' | 'invoices' | 'customers' | 'templates';

export type AdminDrillOverview = {
  user: AdminUser;
  counts: { invoices: number; customers: number; templates: number };
};

export type AdminDrillRow = Record<string, unknown> & { id: string };

export type AdminDrillPage = {
  rows: AdminDrillRow[];
  total: number;
  nextCursor: string | null;
};

const DRILL_LIMIT = 20;

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const { jwt } = await getAccount().createJWT();
  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
}

async function parseAdminResponse<T>(response: Response): Promise<T> {
  // Pages Functions do not run under `astro dev`, so the response may be
  // an HTML fallback rather than JSON. Detect that before parsing.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'Admin API tidak tersedia di mode development. Deploy ke Cloudflare Pages untuk menggunakannya.',
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

/** One page of the admin user list (cursor-paginated, newest first). */
export async function listAdminUsers(params: { cursorAfter?: string } = {}): Promise<AdminUserPage> {
  const search = new URLSearchParams({ limit: '25' });
  if (params.cursorAfter) search.set('cursorAfter', params.cursorAfter);
  const response = await adminFetch(`/api/admin/users?${search.toString()}`);
  return parseAdminResponse<AdminUserPage>(response);
}

export async function updateAdminUser(update: AdminUserUpdate): Promise<void> {
  const response = await adminFetch('/api/admin/users', {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
  await parseAdminResponse<unknown>(response);
}

/** Suspends (blocks) or re-activates a user's Appwrite account. */
export async function setAdminUserStatus(
  userId: string,
  action: 'suspend' | 'unsuspend',
): Promise<{ status: boolean }> {
  const response = await adminFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
  return parseAdminResponse<{ status: boolean }>(response);
}

/** Newest-first page of admin action logs. */
export async function listAdminAudit(params: { cursorAfter?: string } = {}): Promise<AdminAuditPage> {
  const search = new URLSearchParams({ limit: '25' });
  if (params.cursorAfter) search.set('cursorAfter', params.cursorAfter);
  const response = await adminFetch(`/api/admin/audit?${search.toString()}`);
  return parseAdminResponse<AdminAuditPage>(response);
}

/** Read-only drill-down into one user's data. */
export async function getAdminUserDrilldown(
  userId: string,
  resource: AdminDrillResource,
  params: { cursorAfter?: string } = {},
): Promise<AdminDrillOverview | AdminDrillPage> {
  const search = new URLSearchParams({ resource, limit: String(DRILL_LIMIT) });
  if (params.cursorAfter) search.set('cursorAfter', params.cursorAfter);
  const response = await adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}?${search.toString()}`,
  );
  return parseAdminResponse<AdminDrillOverview | AdminDrillPage>(response);
}

export function isDrillOverview(
  data: AdminDrillOverview | AdminDrillPage,
): data is AdminDrillOverview {
  return 'user' in data;
}
