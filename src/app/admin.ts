import { getAccount } from '../appwrite/client';

export type AdminUser = {
  userId: string;
  /** Login email from the Appwrite account. */
  email: string;
  createdAt: string;
  name: string;
  businessName: string;
  phone: string;
  address: string;
  /** Optional business-contact email stored on the profile. */
  profileEmail: string;
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

export async function listAdminUsers(): Promise<AdminUser[]> {
  const response = await adminFetch('/api/admin/users');
  const data = await parseAdminResponse<{ users: AdminUser[] }>(response);
  return data.users;
}

export async function updateAdminUser(update: AdminUserUpdate): Promise<void> {
  const response = await adminFetch('/api/admin/users', {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
  await parseAdminResponse<unknown>(response);
}
