import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { onRequest } from '../functions/api/profile';
import { appwriteFake, type AppwriteFake, type Row } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

/**
 * The profile write gate. What matters here is the plan lock: whatever a
 * caller puts in the body, `plan`/`planExpiresAt` must never reach the row —
 * an update leaves the stored pair alone, a create always starts at `free`.
 */

const env = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

const OWNER = 'user-1';
const PROFILE_URL = 'https://notain.pages.dev/api/profile';

let fake: AppwriteFake;

beforeEach(() => {
  fake = appwriteFake();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function put(body: unknown, authorization = 'Bearer jwt-token'): Request {
  return new Request(PROFILE_URL, {
    method: 'PUT',
    headers: {
      ...(authorization ? { authorization } : {}),
      'content-type': 'application/json',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function handle(request: Request): Promise<Response> {
  return (onRequest as unknown as (ctx: unknown) => Promise<Response>)({
    request,
    params: {},
    env,
    waitUntil: () => {},
  });
}

/** A body that claims a paid plan — the forgery every test tries to land. */
function bodyWithPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Budi',
    businessName: 'Bengkel Budi',
    phone: '081234567890',
    businessType: 'bengkel-mobil',
    plan: 'business',
    planExpiresAt: '2030-01-01',
    ...overrides,
  };
}

function storedProfile(overrides: Record<string, unknown> = {}): Row {
  return {
    $id: OWNER,
    name: 'Budi',
    businessName: 'Bengkel Budi',
    phone: '081234567890',
    address: null,
    email: null,
    logoFileId: null,
    businessType: 'bengkel-mobil',
    plan: 'free',
    planExpiresAt: null,
    ...overrides,
  };
}

/**
 * The body of a recorded Appwrite PATCH. The Function re-reads the row after
 * patching, so the PATCH is never the last call — find it by method instead.
 */
function patchBody(): { data: Record<string, unknown> } {
  const call = [...fake.calls].reverse().find((c) => c.method === 'PATCH');
  if (!call) throw new Error(`no PATCH recorded: ${JSON.stringify(fake.calls)}`);
  return call.body as { data: Record<string, unknown> };
}

/** Appwrite writes the handler made, as `${method} ${table}/${id or '(create)'}`. */
function writes(): string[] {
  return fake.calls
    .filter((call) => call.method !== 'GET')
    .filter((call) => call.url.startsWith('https://appwrite.test'))
    .map((call) => {
      const match = /\/collections\/([^/]+)\/documents(?:\/([^/?]+))?/.exec(
        new URL(call.url).pathname,
      );
      return `${call.method} ${match?.[1]}/${match?.[2] ?? '(create)'}`;
    });
}

describe('PUT /api/profile — gate', () => {
  it('refuses any method but PUT', async () => {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const response = await handle(
        new Request(PROFILE_URL, { method, headers: { authorization: 'Bearer jwt-token' } }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('PUT');
    }
    expect(writes()).toEqual([]);
  });

  it('refuses a caller with no session', async () => {
    fake.account = null;
    const response = await handle(put(bodyWithPlan()));
    expect(response.status).toBe(401);
    expect(writes()).toEqual([]);
  });

  it('refuses a request with no bearer token', async () => {
    const response = await handle(put(bodyWithPlan(), ''));
    expect(response.status).toBe(401);
    expect(writes()).toEqual([]);
  });
});

describe('PUT /api/profile — create', () => {
  it('forces a new row to the free plan and pins owner-read-only permissions', async () => {
    const response = await handle(put(bodyWithPlan()));

    expect(response.status).toBe(201);
    expect(writes()).toEqual([`POST profiles/(create)`]);

    const create = fake.calls.at(-1)!.body as {
      documentId: string;
      data: Record<string, unknown>;
      permissions: string[];
    };
    // The row id comes from the session, never the body.
    expect(create.documentId).toBe(OWNER);
    expect(create.data.plan).toBe('free');
    expect(create.data.planExpiresAt).toBeNull();
    expect(create.permissions).toEqual([`read("user:${OWNER}")`]);
  });

  it('defaults the plan when the body omits it entirely', async () => {
    const response = await handle(
      put({ name: 'Budi', businessName: 'Bengkel Budi', phone: '081234567890' }),
    );

    expect(response.status).toBe(201);
    const create = fake.calls.at(-1)!.body as { data: Record<string, unknown> };
    expect(create.data.plan).toBe('free');
    expect(create.data.planExpiresAt).toBeNull();
  });

  it('answers 500 when Appwrite refuses the create', async () => {
    fake = appwriteFake({ writeFailureFor: 'profiles' });
    const response = await handle(put(bodyWithPlan()));

    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: string }).error).toBe('validation');
  });
});

describe('PUT /api/profile — update', () => {
  beforeEach(() => {
    fake.rows.set(
      `profiles/${OWNER}`,
      storedProfile({ plan: 'business', planExpiresAt: '2030-01-01' }),
    );
  });

  it('keeps the stored plan even when the body claims a different one', async () => {
    const response = await handle(put(bodyWithPlan({ plan: 'free', planExpiresAt: null })));

    expect(response.status).toBe(200);
    expect(writes()).toEqual([`PATCH profiles/${OWNER}`]);

    const patch = patchBody();
    expect(patch.data).not.toHaveProperty('plan');
    expect(patch.data).not.toHaveProperty('planExpiresAt');
    expect(patch.data.name).toBe('Budi');

    const row = fake.rows.get(`profiles/${OWNER}`)!;
    expect(row.plan).toBe('business');
    expect(row.planExpiresAt).toBe('2030-01-01');
  });

  it('writes only whitelisted columns and drops everything else', async () => {
    const response = await handle(
      put(
        bodyWithPlan({
          name: 'Budi Santoso',
          $id: 'someone-else',
          ownerId: 'someone-else',
          inventedColumn: 'nope',
        }),
      ),
    );

    expect(response.status).toBe(200);
    const patch = patchBody();
    expect(patch.data.name).toBe('Budi Santoso');
    expect(patch.data).not.toHaveProperty('$id');
    expect(patch.data).not.toHaveProperty('ownerId');
    expect(patch.data).not.toHaveProperty('inventedColumn');

    const row = fake.rows.get(`profiles/${OWNER}`)!;
    expect(row.$id).toBe(OWNER);
    expect(row).not.toHaveProperty('inventedColumn');
  });

  it('answers 500 when Appwrite refuses the patch', async () => {
    fake = appwriteFake({ writeFailureFor: 'profiles' });
    fake.rows.set(`profiles/${OWNER}`, storedProfile());
    const response = await handle(put(bodyWithPlan()));

    expect(response.status).toBe(500);
  });
});

describe('PUT /api/profile — validation', () => {
  it('rejects a body that is not JSON', async () => {
    const response = await handle(put('not-json'));
    expect(response.status).toBe(400);
    expect(writes()).toEqual([]);
  });

  it('rejects a missing name', async () => {
    const response = await handle(put(bodyWithPlan({ name: undefined })));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('validation');
    expect(writes()).toEqual([]);
  });

  it('rejects a malformed phone', async () => {
    const response = await handle(put(bodyWithPlan({ phone: 'not-a-phone' })));
    expect(response.status).toBe(400);
    expect(writes()).toEqual([]);
  });

  it('stores an unknown business type as null instead of the raw slug', async () => {
    // `profileSchema` is `.catch(null)` on purpose: a slug the taxonomy no
    // longer knows must degrade to "no type", never block a save.
    const response = await handle(put(bodyWithPlan({ businessType: 'not-a-slug' })));

    expect(response.status).toBe(201);
    const create = fake.calls.find((c) => c.method === 'POST')!.body as {
      data: Record<string, unknown>;
    };
    expect(create.data.businessType).toBeNull();
  });
});
