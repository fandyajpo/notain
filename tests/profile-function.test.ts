import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { onRequest } from '../functions/api/profile';
import { appwriteFake, type AppwriteFake, type Row } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

/**
 * The profile write gate, now org-scoped. Two properties matter here:
 *
 * 1. The membership gate — the row id IS the org id, so a caller without an
 *    ACTIVE membership must never read or write it (404, not 403).
 * 2. The plan lock — whatever a caller puts in the body, `plan`/`planExpiresAt`
 *    must never reach the row: an update leaves the stored pair alone, a
 *    create always starts at `free`.
 */

const env = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

const OWNER = 'user-1';
const ORG = 'org_aaaaaaaaaaaaaaaa';
const OTHER_ORG = 'org_bbbbbbbbbbbbbbbb';
const PROFILE_URL = `https://notain.pages.dev/api/profile?orgId=${ORG}`;

let fake: AppwriteFake;

beforeEach(() => {
  fake = appwriteFake();
  seedMembership(ORG, OWNER);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function seedMembership(orgId: string, userId: string): void {
  fake.rows.set(`memberships/${orgId}_${userId}`, {
    $id: `${orgId}_${userId}`,
    orgId,
    userId,
    role: 'owner',
    status: 'active',
    inviteEmail: `${userId}@example.com`,
    invitedBy: userId,
    createdAt: new Date('2026-10-01T00:00:00.000Z').toISOString(),
  } as Row);
}

function put(body: unknown, authorization = 'Bearer jwt-token', url = PROFILE_URL): Request {
  return new Request(url, {
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
    $id: ORG,
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
 * The body of a recorded Appwrite PATCH. Looked up by method rather than by
 * position: a create's POST, or nothing at all, may sit after it.
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

/** Reads of the profile row. One on an update (the existence probe), never two. */
function profileReads(): number {
  return fake.calls.filter(
    (call) => call.method === 'GET' && call.url.includes(`/collections/profiles/documents/${ORG}`),
  ).length;
}

describe('profile gate', () => {
  it('refuses any method but GET and PUT', async () => {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const response = await handle(
        new Request(PROFILE_URL, { method, headers: { authorization: 'Bearer jwt-token' } }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, PUT');
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

  it('refuses a missing or malformed orgId before anything else', async () => {
    const noOrg = await handle(
      new Request('https://notain.pages.dev/api/profile', {
        method: 'PUT',
        headers: { authorization: 'Bearer jwt-token', 'content-type': 'application/json' },
        body: JSON.stringify(bodyWithPlan()),
      }),
    );
    expect(noOrg.status).toBe(400);

    const badOrg = await handle(
      put(bodyWithPlan(), 'Bearer jwt-token', 'https://notain.pages.dev/api/profile?orgId=nope'),
    );
    expect(badOrg.status).toBe(400);
    expect(writes()).toEqual([]);
  });

  it('answers 404 for a caller without an active membership', async () => {
    // Same org id, but the membership row belongs to someone else — an invite
    // still pending must not grant access either.
    seedMembership(ORG, OWNER);
    fake.rows.set(`memberships/${ORG}_${OWNER}`, {
      $id: `${ORG}_${OWNER}`,
      orgId: ORG,
      userId: OWNER,
      role: 'member',
      status: 'pending',
      inviteEmail: 'budi@example.com',
      invitedBy: 'user-2',
      createdAt: new Date('2026-10-01T00:00:00.000Z').toISOString(),
    } as Row);

    const response = await handle(put(bodyWithPlan()));
    expect(response.status).toBe(404);
    expect(writes()).toEqual([]);
  });
});

describe('GET /api/profile', () => {
  it('returns the personal projection to a member, never publicly cacheable', async () => {
    fake.rows.set(`profiles/${ORG}`, storedProfile());

    const response = await handle(
      new Request(PROFILE_URL, { headers: { authorization: 'Bearer jwt-token' } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as Record<string, unknown>;
    // The personal columns, projected — never the raw row.
    expect(body).toMatchObject({ name: 'Budi', phone: '081234567890', plan: 'free' });
    // Legacy business columns (still physically on old rows) and row
    // internals must not leak through the contract.
    expect(body).not.toHaveProperty('businessName');
    expect(body).not.toHaveProperty('businessType');
    expect(body).not.toHaveProperty('$id');
    expect(body).not.toHaveProperty('ownerId');
    expect(body).not.toHaveProperty('orgId');
    expect(writes()).toEqual([]);
  });

  it('answers 404 when the org has no profile row yet', async () => {
    const response = await handle(
      new Request(PROFILE_URL, { headers: { authorization: 'Bearer jwt-token' } }),
    );
    expect(response.status).toBe(404);
  });
});

describe('PUT /api/profile — create', () => {
  it('forces a new row to the free plan and pins the row id to the org', async () => {
    const response = await handle(put(bodyWithPlan()));

    expect(response.status).toBe(201);
    expect(writes()).toEqual([`POST profiles/(create)`]);

    const create = fake.calls.at(-1)!.body as {
      documentId: string;
      data: Record<string, unknown>;
      permissions: string[];
    };
    // The row id comes from the gated orgId, never the body.
    expect(create.documentId).toBe(ORG);
    expect(create.data.plan).toBe('free');
    expect(create.data.planExpiresAt).toBeNull();
    // No session gets a direct path — the Function is the only reader/writer.
    expect(create.permissions).toEqual([]);
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
    seedMembership(ORG, OWNER);
    const response = await handle(put(bodyWithPlan()));

    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: string }).error).toBe('validation');
  });
});

describe('PUT /api/profile — update', () => {
  beforeEach(() => {
    fake.rows.set(
      `profiles/${ORG}`,
      storedProfile({ plan: 'business', planExpiresAt: '2030-01-01' }),
    );
  });

  it('keeps the stored plan even when the body claims a different one', async () => {
    const response = await handle(put(bodyWithPlan({ plan: 'free', planExpiresAt: null })));

    expect(response.status).toBe(200);
    expect(writes()).toEqual([`PATCH profiles/${ORG}`]);
    // One existence probe, and no read-back: the saved row is built from what
    // was already known plus what was just written.
    expect(profileReads()).toBe(1);

    const body = (await response.json()) as { name: string; plan: string; planExpiresAt: string };
    expect(body.name).toBe('Budi');
    expect(body.plan).toBe('business');
    expect(body.planExpiresAt).toBe('2030-01-01');

    const patch = patchBody();
    expect(patch.data).not.toHaveProperty('plan');
    expect(patch.data).not.toHaveProperty('planExpiresAt');
    expect(patch.data.name).toBe('Budi');

    const row = fake.rows.get(`profiles/${ORG}`)!;
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
          orgId: OTHER_ORG,
          inventedColumn: 'nope',
        }),
      ),
    );

    expect(response.status).toBe(200);
    const patch = patchBody();
    expect(patch.data.name).toBe('Budi Santoso');
    expect(patch.data).not.toHaveProperty('$id');
    expect(patch.data).not.toHaveProperty('ownerId');
    expect(patch.data).not.toHaveProperty('orgId');
    expect(patch.data).not.toHaveProperty('inventedColumn');

    const row = fake.rows.get(`profiles/${ORG}`)!;
    expect(row.$id).toBe(ORG);
    expect(row).not.toHaveProperty('inventedColumn');
  });

  it('answers 500 when Appwrite refuses the patch', async () => {
    fake = appwriteFake({ writeFailureFor: 'profiles' });
    seedMembership(ORG, OWNER);
    fake.rows.set(`profiles/${ORG}`, storedProfile());
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

  it('drops business identity from the body — it is not a profile column', async () => {
    // The business name/type belong to the organization, so a PUT carrying
    // them must never write them onto the profile row.
    const response = await handle(
      put(bodyWithPlan({ businessName: 'Bengkel Palsu', businessType: 'not-a-slug' })),
    );

    expect(response.status).toBe(201);
    const create = fake.calls.find((c) => c.method === 'POST')!.body as {
      data: Record<string, unknown>;
    };
    expect(create.data).not.toHaveProperty('businessName');
    expect(create.data).not.toHaveProperty('businessType');
  });
});
