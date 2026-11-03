import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { onRequest } from '../functions/api/me/admin';
import { appwriteFake, type AppwriteFake } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

/**
 * `/api/me/admin` — the client-safe operator probe.
 *
 * The point of the endpoint is the status code: a signed-in non-admin must get
 * `200 { isAdmin: false }`, not Appwrite's `404 team_not_found` (which is what
 * asking the team directly produced, because Appwrite hides team existence from
 * non-members). Both caches are disabled so each case really re-checks the
 * team instead of reading a previous case's answer.
 *
 * Organizations are NOT teams: their membership is the `memberships`
 * collection, asserted by `tests/org-endpoints.test.ts`.
 */

const env = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
  QUOTA_SESSION_CACHE_TTL_MS: '0',
  QUOTA_ADMIN_CACHE_TTL_MS: '0',
} as Env;

let fake: AppwriteFake;

beforeEach(() => {
  fake = appwriteFake();
  vi.stubGlobal('fetch', fake.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function call(token: string | null = 'Bearer jwt-token'): Promise<Response> {
  return onRequest({
    request: new Request('https://notain.test/api/me/admin', {
      headers: token ? { authorization: token } : {},
    }),
    params: {},
    env,
    waitUntil: () => {},
  } as never) as Promise<Response>;
}

describe('GET /api/me/admin', () => {
  it('answers true for an account on the admins team', async () => {
    // `appwriteFake`'s caller is an admin unless a test says otherwise.
    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ isAdmin: true });
  });

  it('answers false — 200, never Appwrite’s 404 — for a normal user', async () => {
    fake.teamMemberships = 0;

    const response = await call('Bearer normal-user-token');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ isAdmin: false });
  });

  it('refuses an anonymous caller with 401', async () => {
    fake.account = null;

    const response = await call(null);

    expect(response.status).toBe(401);
  });

  it('refuses methods other than GET', async () => {
    const response = (await onRequest({
      request: new Request('https://notain.test/api/me/admin', { method: 'POST' }),
      params: {},
      env,
      waitUntil: () => {},
    } as never)) as Response;

    expect(response.status).toBe(405);
  });
});
