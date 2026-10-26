import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { onRequest } from '../functions/api/admin/users';
import { onRequest as drillOnRequest } from '../functions/api/admin/users/[id]';
import { appwriteFake, type AppwriteFake, type Row } from './appwrite-fake';
import type { Env, PagesFunction } from '../functions/_lib/types';

/**
 * The admin user surface since multi-tenancy: nothing tenanted is user-keyed,
 * so every admin operation addressed by `userId` must resolve the account's
 * PRIMARY organization first (its newest active membership) and touch
 * `profiles/<orgId>` + `organizations/<orgId>` — never `profiles/<userId>`.
 *
 * This file pins exactly that: the list join reads the primary org's
 * identity and plan, the PATCH writes each half to the row that owns it, and
 * an account with no membership answers "nothing to edit" instead of
 * resurrecting a user-keyed row.
 */

const ENV = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

const ORG_OLD = 'org_2222222222222222';
const ORG_NEW = 'org_1111111111111111';

let fake: AppwriteFake | null = null;

function handle(
  handler: PagesFunction<Env>,
  request: Request,
  params: Record<string, string> = {},
): Promise<Response> {
  return Promise.resolve(handler({ request, params, env: ENV, waitUntil: () => {} }));
}

function get(path: string): Request {
  return new Request(`https://notain.pages.dev${path}`, {
    headers: { authorization: 'Bearer jwt-token' },
  });
}

function patch(path: string, body: unknown): Request {
  return new Request(`https://notain.pages.dev${path}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer jwt-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Seeds user-1 with two orgs (newest wins) plus the org-keyed rows. */
function seed(): void {
  fake = appwriteFake({
    users: {
      'user-1': { $id: 'user-1', email: 'budi@example.com' },
      'user-2': { $id: 'user-2', email: 'tamu@example.com' },
    },
  });

  const membership = (id: string, orgId: string, createdAt: string): Row =>
    ({
      $id: id,
      orgId,
      userId: 'user-1',
      role: 'owner',
      status: 'active',
      inviteEmail: 'budi@example.com',
      createdAt,
    }) as Row;

  fake.rows.set('memberships/mem_old', membership('mem_old', ORG_OLD, '2026-01-01T00:00:00.000Z'));
  fake.rows.set('memberships/mem_new', membership('mem_new', ORG_NEW, '2026-06-01T00:00:00.000Z'));

  fake.rows.set('organizations/' + ORG_OLD, {
    $id: ORG_OLD,
    name: 'Org Lama',
    ownerId: 'user-1',
    plan: 'free',
    planExpiresAt: null,
    businessType: null,
  } as Row);
  fake.rows.set('organizations/' + ORG_NEW, {
    $id: ORG_NEW,
    name: 'Kopi Senja',
    ownerId: 'user-1',
    plan: 'pro',
    planExpiresAt: '2999-01-01T00:00:00.000Z',
    businessType: 'kafe',
  } as Row);

  fake.rows.set('profiles/' + ORG_NEW, {
    $id: ORG_NEW,
    name: 'Budi',
    phone: '081234567890',
    address: null,
    email: null,
    plan: 'free', // vestigial on the profile row; billing lives on the org
    planExpiresAt: null,
  } as Row);
}

beforeEach(seed);

describe('GET /api/admin/users', () => {
  it('joins the primary org’s identity and plan, never a user-keyed row', async () => {
    const response = await handle(onRequest, get('/api/admin/users'));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      users: Array<{
        userId: string;
        name: string;
        businessName: string;
        plan: string;
        planExpiresAt: string | null;
      }>;
    };
    const entry = body.users.find((user) => user.userId === 'user-1');
    // Identity from `profiles/<newest-org>`, plan from `organizations/<same>` —
    // the two rows this user's switcher would open first.
    expect(entry).toMatchObject({
      name: 'Budi',
      businessName: 'Kopi Senja',
      plan: 'pro',
      planExpiresAt: '2999-01-01T00:00:00.000Z',
    });
    // The old join's address must never be read again: there is no
    // `profiles/user-1` row and the response must not pretend there is.
    const profileReads = (fake as AppwriteFake).calls.filter((call) =>
      call.url.includes('/collections/profiles/documents/user-1'),
    );
    expect(profileReads).toEqual([]);
  });

  it('shows an account with no membership as free with empty fields', async () => {
    const response = await handle(onRequest, get('/api/admin/users'));

    const body = (await response.json()) as {
      users: Array<{ userId: string; name: string; businessName: string; plan: string }>;
    };
    const entry = body.users.find((user) => user.userId === 'user-2');
    expect(entry).toMatchObject({ name: '', businessName: '', plan: 'free' });
  });

  it('refuses a signed-in non-admin', async () => {
    (fake as AppwriteFake).teamMemberships = 0;

    const response = await handle(onRequest, get('/api/admin/users'));
    expect(response.status).toBe(403);
  });

  it('refuses an unauthenticated caller', async () => {
    (fake as AppwriteFake).account = null;

    const response = await handle(onRequest, get('/api/admin/users'));
    expect(response.status).toBe(401);
  });

  it('refuses methods other than GET and PATCH', async () => {
    const response = await handle(
      onRequest,
      new Request('https://notain.pages.dev/api/admin/users', { method: 'DELETE' }),
    );
    expect(response.status).toBe(405);
  });
});

describe('PATCH /api/admin/users', () => {
  const update = (body: Record<string, unknown>) =>
    patch('/api/admin/users', {
      userId: 'user-1',
      name: 'Budi Santoso',
      businessName: 'Kopi Senja Baru',
      phone: '081234567890',
      address: '',
      email: '',
      plan: 'business',
      planExpiresAt: '2027-01-01T00:00:00.000Z',
      ...body,
    });

  it('writes the person to profiles/<orgId> and name+plan to organizations/<orgId>', async () => {
    const response = await handle(onRequest, update({}));

    expect(response.status).toBe(200);

    // The person's contact fields live on the profile row…
    expect(fake!.rows.get('profiles/' + ORG_NEW)).toMatchObject({
      name: 'Budi Santoso',
    });
    expect(fake!.rows.get('profiles/' + ORG_NEW)).not.toHaveProperty('businessName');
    // …while the business name (the org's `name`) and plan live on the org.
    expect(fake!.rows.get('organizations/' + ORG_NEW)).toMatchObject({
      name: 'Kopi Senja Baru',
      plan: 'business',
      planExpiresAt: '2027-01-01T00:00:00.000Z',
    });
    // …the OTHER org untouched (primary = newest membership only)…
    expect(fake!.rows.get('profiles/' + ORG_OLD)).toBeUndefined();
    expect(fake!.rows.get('organizations/' + ORG_OLD)).toMatchObject({ plan: 'free' });
    // …and no user-keyed profile row ever comes back into existence.
    expect(fake!.rows.get('profiles/user-1')).toBeUndefined();
  });

  it('creates the org profile row when the org never opened settings', async () => {
    fake!.rows.delete('profiles/' + ORG_NEW);

    const response = await handle(onRequest, update({}));

    expect(response.status).toBe(200);
    const created = fake!.rows.get('profiles/' + ORG_NEW);
    expect(created).toMatchObject({
      name: 'Budi Santoso',
      // The vestigial columns start at the free defaults, exactly as the
      // profile Function seeds them; the real plan lives on the org row.
      plan: 'free',
      planExpiresAt: null,
    });
    expect(fake!.rows.get('organizations/' + ORG_NEW)).toMatchObject({ plan: 'business' });
  });

  it('answers 404 for an account with no organization, writing nothing', async () => {
    const response = await handle(
      onRequest,
      patch('/api/admin/users', {
        userId: 'user-2',
        name: 'Tamu',
        businessName: '',
        phone: '',
        address: '',
        email: '',
        plan: 'pro',
        planExpiresAt: null,
      }),
    );

    expect(response.status).toBe(404);
    expect(fake!.rows.get('profiles/user-2')).toBeUndefined();
    const writes = (fake as AppwriteFake).calls.filter((call) => call.method !== 'GET');
    expect(writes).toEqual([]);
  });

  it('rejects an unknown plan before touching any row', async () => {
    const response = await handle(onRequest, update({ plan: 'platinum' }));

    expect(response.status).toBe(400);
    expect(fake!.rows.get('organizations/' + ORG_NEW)).toMatchObject({ plan: 'pro' });
    expect(fake!.rows.get('profiles/' + ORG_NEW)).toMatchObject({ name: 'Budi' });
  });
});

describe('GET /api/admin/users/<id>?resource=overview', () => {
  it('reads the primary org’s profile and plan in the overview', async () => {
    const response = await handle(
      drillOnRequest,
      get('/api/admin/users/user-1?resource=overview'),
      { id: 'user-1' },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      user: { name: string; businessName: string; plan: string; planExpiresAt: string | null };
      counts: Record<string, number>;
    };
    expect(body.user).toMatchObject({
      name: 'Budi',
      businessName: 'Kopi Senja',
      plan: 'pro',
      planExpiresAt: '2999-01-01T00:00:00.000Z',
    });
    // The per-table totals still count by ownerId (creator provenance), which
    // survives multi-tenancy untouched.
    expect(body.counts).toEqual({ invoices: 0, customers: 0, templates: 0 });
  });

  it('answers free and empty for an account with no membership', async () => {
    const response = await handle(
      drillOnRequest,
      get('/api/admin/users/user-2?resource=overview'),
      { id: 'user-2' },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { name: string; plan: string } };
    expect(body.user).toMatchObject({ name: '', plan: 'free' });
  });

  it('404s an account that does not exist', async () => {
    const response = await handle(
      drillOnRequest,
      get('/api/admin/users/user-ghost?resource=overview'),
      { id: 'user-ghost' },
    );
    expect(response.status).toBe(404);
  });
});
