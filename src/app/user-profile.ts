import { mintJwt } from '../appwrite/client';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { appErrorFromStatus } from './errors';

/**
 * The SHARED user identity (`userProfiles/<userId>`): username and phone,
 * owned by the account — not by any organization. Served by the session-gated
 * `GET/PUT /api/profile/user`, which works even while the account has zero
 * organizations, so it never requires an active-org id the way the per-org
 * letterhead flows do.
 *
 * The login email is deliberately absent: it is owned by the Appwrite account
 * and the settings UI renders it read-only from the session. Nothing here can
 * touch authentication credentials — the endpoint only writes the two
 * identity columns.
 */
export type UserIdentity = { username: string; phone: string };

export type UserIdentityInput = { username?: string; phone?: string };

async function bearerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let jwt: string;
  try {
    jwt = await mintJwt();
  } catch (error) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Silakan masuk terlebih dahulu.', {
      cause: error,
    });
  }
  try {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${jwt}`);
    return await fetch(path, { ...init, headers });
  } catch {
    throw new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
    );
  }
}

async function serverMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body?.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

function identityOf(body: Partial<UserIdentity>): UserIdentity {
  return {
    username: typeof body.username === 'string' ? body.username : '',
    phone: typeof body.phone === 'string' ? body.phone : '',
  };
}

export async function getUserIdentity(): Promise<UserIdentity> {
  const response = await bearerFetch('/api/profile/user');
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  return identityOf((await response.json()) as Partial<UserIdentity>);
}

export async function saveUserIdentity(input: UserIdentityInput): Promise<UserIdentity> {
  const response = await bearerFetch('/api/profile/user', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  return identityOf((await response.json()) as Partial<UserIdentity>);
}
