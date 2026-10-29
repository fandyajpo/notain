import { afterEach, describe, expect, it } from 'vite-plus/test';
import { onRequest as dataOnRequest } from '../functions/api/data/[resource]';
import { appwriteFake, type AppwriteFake, type Row } from './appwrite-fake';
import type { Env, PagesFunction } from '../functions/_lib/types';

/**
 * `/api/data/<resource>` — the tenant gate around all product data.
 *
 * These tests exist to prove one property above all: **a caller can only ever
 * read or write rows of an organization they hold an ACTIVE membership in.**
 * Every case seeds a second org and checks its rows survive untouched, since
 * membership (not row permissions) is the isolation boundary this
 * architecture chose.
 */

const APPWRITE_ENV = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

const OWNER = { $id: 'user-1', email: 'budi@example.com' };
const A = 'org_aaaaaaaaaaaaaaaa';
const B = 'org_bbbbbbbbbbbbbbbb';

let fake: AppwriteFake | null = null;
let token = 'jwt-token';

function handle(
  handler: PagesFunction<Env>,
  request: Request,
  params: Record<string, string> = {},
  envOverride?: Env,
): Promise<Response> {
  return Promise.resolve(
    handler({ request, params, env: envOverride ?? { ...APPWRITE_ENV }, waitUntil: () => {} }),
  );
}

function req(method: string, path: string, body?: unknown): Request {
  return new Request(`https://notain.pages.dev${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function seedMembership(orgId: string, userId: string): void {
  fake!.rows.set(`memberships/${orgId}_${userId}`, {
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

/** Seeds one invoice row in each of two orgs; returns the ids. */
function seedInvoices(): { mine: string; theirs: string } {
  fake!.rows.set('invoices/inv_mine', {
    $id: 'inv_mine',
    orgId: A,
    ownerId: OWNER.$id,
    invoiceNumber: 'INV-2026-001',
    customerName: 'Budi Santoso',
    status: 'lunas',
    date: '2026-10-01',
  } as Row);
  fake!.rows.set('invoices/inv_theirs', {
    $id: 'inv_theirs',
    orgId: B,
    ownerId: 'user-2',
    invoiceNumber: 'INV-2026-777',
    customerName: 'Orang Lain',
    status: 'draft',
    date: '2026-10-02',
  } as Row);
  return { mine: 'inv_mine', theirs: 'inv_theirs' };
}

function invoices(path: string, init?: RequestInit): Promise<Response> {
  return handle(
    dataOnRequest,
    new Request(`https://notain.pages.dev${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    }),
    { resource: 'invoices' },
  );
}

afterEach(() => {
  fake = null;
  token = 'jwt-token';
});

describe('GET /api/data/<resource> — list isolation', () => {
  it('returns only rows of the gated org, with a truthful total', async () => {
    fake = appwriteFake();
    seedMembership(A, OWNER.$id);
    seedMembership(B, 'user-2');
    seedInvoices();

    const response = await invoices(`/api/data/invoices?orgId=${A}`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { rows: Array<{ $id: string }>; total: number };
    expect(body.rows.map((row) => row.$id)).toEqual(['inv_mine']);
    expect(body.total).toBe(1);
  });

  it('answers 401 without a session, 400 for a malformed org id, 404 for an outsider', async () => {
    fake = appwriteFake();
    seedMembership(A, OWNER.$id);
    seedInvoices();

    // The fake answers /account for ANY bearer, so "signed out" has to be
    // modelled as an account that does not resolve.
    fake.account = null;
    expect((await invoices(`/api/data/invoices?orgId=${A}`)).status).toBe(401);

    fake.account = OWNER;
    token = 'jwt-token';
    expect((await invoices('/api/data/invoices?orgId=drop-table')).status).toBe(400);

    // An org this session has no membership in must be indistinguishable
    // from one that does not exist.
    fake.account = { $id: 'user-9', email: 'asing@example.com' };
    token = 'jwt-user-9';
    expect((await invoices(`/api/data/invoices?orgId=${A}`)).status).toBe(404);
  });

  it('supports the search, prefix, range and status filters the app sends', async () => {
    fake = appwriteFake();
    seedMembership(A, OWNER.$id);
    seedInvoices();

    // Multi-field search (`or` of fulltext branches) ≥3 chars.
    const search = await invoices(`/api/data/invoices?orgId=${A}&search=Santoso`);
    expect(((await search.json()) as { rows: Row[] }).rows.map((row) => row.$id)).toEqual([
      'inv_mine',
    ]);

    // Prefix — the year's invoice numbers.
    const prefix = await invoices(`/api/data/invoices?orgId=${A}&starts_invoiceNumber=INV-2026-`);
    expect(((await prefix.json()) as { total: number }).total).toBe(1);

    // Range — the finance window.
    const range = await invoices(`/api/data/invoices?orgId=${A}&gte_date=2026-10-02`);
    expect(((await range.json()) as { total: number }).total).toBe(0);

    // Equality incl. the empty-string status bucket.
    const status = await invoices(`/api/data/invoices?orgId=${A}&eq_status=lunas`);
    expect(((await status.json()) as { rows: Row[] }).rows).toHaveLength(1);
  });

  it('reads a single own row and refuses a foreign row id', async () => {
    fake = appwriteFake();
    seedMembership(A, OWNER.$id);
    const { mine, theirs } = seedInvoices();

    const own = await invoices(`/api/data/invoices?orgId=${A}&rowId=${mine}`);
    expect(own.status).toBe(200);
    await expect(own.json()).resolves.toMatchObject({ row: { $id: mine } });

    const foreign = await invoices(`/api/data/invoices?orgId=${A}&rowId=${theirs}`);
    expect(foreign.status).toBe(404);
  });
});

describe('POST /api/data/<resource> — create', () => {
  it('stamps orgId and ownerId from the gate/session, dropping forged values', async () => {
    fake = appwriteFake();
    seedMembership(A, OWNER.$id);

    const response = await invoices(`/api/data/invoices?orgId=${A}`, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          // Attacker-controlled attempt: the body cannot choose tenancy.
          orgId: B,
          ownerId: 'user-2',
          invoiceNumber: 'INV-2026-010',
          customerName: 'Baru',
        },
        rowId: 'inv_new',
      }),
    });

    expect(response.status).toBe(201);
    expect(fake.rows.get('invoices/inv_new')).toMatchObject({
      orgId: A,
      ownerId: OWNER.$id,
      invoiceNumber: 'INV-2026-010',
    });
  });

  it('answers 409 with the conflict copy when the deterministic id exists', async () => {
    fake = appwriteFake();
    seedMembership(A, OWNER.$id);
    seedInvoices();

    const response = await invoices(`/api/data/invoices?orgId=${A}`, {
      method: 'POST',
      body: JSON.stringify({
        data: { invoiceNumber: 'INV-2026-001' },
        rowId: 'inv_mine',
      }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: 'conflict' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rate-fences writes per the data-write budget', async () => {
    fake = appwriteFake();
    seedMembership(A, OWNER.$id);
    const limitedEnv = { ...APPWRITE_ENV, QUOTA_LIMIT_DATA_WRITE_PER_MINUTE: '2' } as Env;
    const post = () =>
      handle(
        dataOnRequest,
        req('POST', `/api/data/customers?orgId=${A}`, {
          data: { name: 'Pelanggan' },
        }),
        { resource: 'customers' },
        limitedEnv,
      );

    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429);
  });
});

describe('PATCH /api/data/<resource> — update isolation', () => {
  it('updates an own row and cannot be pointed at a foreign one', async () => {
    fake = appwriteFake();
    seedMembership(A, OWNER.$id);
    const { mine, theirs } = seedInvoices();

    const ok = await invoices(`/api/data/invoices?orgId=${A}&rowId=${mine}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { customerName: 'Nama Baru', status: 'lunas' } }),
    });
    expect(ok.status).toBe(200);
    expect(fake.rows.get(`invoices/${mine}`)).toMatchObject({ customerName: 'Nama Baru' });

    const foreign = await invoices(`/api/data/invoices?orgId=${A}&rowId=${theirs}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { customerName: 'Hacked' } }),
    });
    expect(foreign.status).toBe(404);
    expect(fake.rows.get(`invoices/${theirs}`)).toMatchObject({ customerName: 'Orang Lain' });
  });

  it('ignores a body that tries to reassign tenancy or createdBy', async () => {
    fake = appwriteFake();
    seedMembership(A, OWNER.$id);
    const { mine } = seedInvoices();

    await invoices(`/api/data/invoices?orgId=${A}&rowId=${mine}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { orgId: B, ownerId: 'user-2', plan: 'pro' } }),
    });

    expect(fake.rows.get(`invoices/${mine}`)).toMatchObject({
      orgId: A,
      ownerId: OWNER.$id,
    });
  });
});

describe('DELETE /api/data/<resource> — delete isolation', () => {
  it('deletes own rows only — single and bulk', async () => {
    fake = appwriteFake();
    seedMembership(A, OWNER.$id);
    const { mine, theirs } = seedInvoices();

    const foreign = await invoices(`/api/data/invoices?orgId=${A}&rowId=${theirs}`, {
      method: 'DELETE',
    });
    expect(foreign.status).toBe(404);
    expect(fake.rows.has('invoices/inv_theirs')).toBe(true);

    const own = await invoices(`/api/data/invoices?orgId=${A}&rowId=${mine}`, {
      method: 'DELETE',
    });
    expect(own.status).toBe(200);
    expect(fake.rows.has('invoices/inv_mine')).toBe(false);

    // Bulk: the foreign id is skipped, never errored on, and never deleted.
    seedInvoices();
    const bulk = await invoices(`/api/data/invoices?orgId=${A}&action=bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ ids: ['inv_mine', 'inv_theirs', 'no_such_row'] }),
    });
    expect(bulk.status).toBe(200);
    await expect(bulk.json()).resolves.toEqual({ deleted: 1, requested: 3 });
    expect(fake.rows.has('invoices/inv_theirs')).toBe(true);
  });

  it('refuses unknown resources', async () => {
    fake = appwriteFake();
    seedMembership(A, OWNER.$id);
    const response = await handle(dataOnRequest, req('GET', `/api/data/secrets?orgId=${A}`), {
      resource: 'secrets',
    });
    expect(response.status).toBe(404);
  });
});

describe('templates — the custom-template plan gate', () => {
  function templates(path: string, init?: RequestInit): Promise<Response> {
    return handle(
      dataOnRequest,
      new Request(`https://notain.pages.dev${path}`, {
        ...init,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      }),
      { resource: 'templates' },
    );
  }

  /** The plan the gate reads lives on the ORGANIZATION row, not the membership. */
  function seedOrgRow(orgId: string, plan: string, planExpiresAt: string | null = null): void {
    fake!.rows.set(`organizations/${orgId}`, {
      $id: orgId,
      name: 'Organisasi',
      ownerId: OWNER.$id,
      plan,
      planExpiresAt,
    } as Row);
  }

  const createBody = JSON.stringify({ data: { name: 'Kustom', blocks: [], theme: {} } });

  it('refuses a free org creating a custom template', async () => {
    fake = appwriteFake({ teamMemberships: 0 });
    seedMembership(A, OWNER.$id);
    seedOrgRow(A, 'free');

    const response = await templates(`/api/data/templates?orgId=${A}`, {
      method: 'POST',
      body: createBody,
    });

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: 'plan_required',
      message: expect.stringContaining('fitur plan Pro'),
    });
    // The refusal is before any write.
    expect([...fake.rows.keys()].filter((key) => key.startsWith('templates/'))).toHaveLength(0);
  });

  it('lets a paid org create one', async () => {
    fake = appwriteFake({ teamMemberships: 0 });
    seedMembership(A, OWNER.$id);
    seedOrgRow(A, 'pro');

    const response = await templates(`/api/data/templates?orgId=${A}`, {
      method: 'POST',
      body: createBody,
    });

    expect(response.status).toBe(201);
  });

  it('lets an admin create one even on the free plan', async () => {
    fake = appwriteFake(); // the fake's default caller IS on the admins team
    seedMembership(A, OWNER.$id);
    seedOrgRow(A, 'free');

    const response = await templates(`/api/data/templates?orgId=${A}`, {
      method: 'POST',
      body: createBody,
    });

    expect(response.status).toBe(201);
  });

  it('refuses a free org editing a template it already owns — read-only, never a 404', async () => {
    fake = appwriteFake({ teamMemberships: 0 });
    seedMembership(A, OWNER.$id);
    seedOrgRow(A, 'free');
    fake.rows.set('templates/tpl_mine', {
      $id: 'tpl_mine',
      orgId: A,
      ownerId: OWNER.$id,
      name: 'Lama',
      blocks: '[]',
      theme: '{}',
    } as Row);

    const response = await templates(`/api/data/templates?orgId=${A}&rowId=tpl_mine`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { name: 'Baru' } }),
    });

    expect(response.status).toBe(402);
    expect(fake.rows.get('templates/tpl_mine')?.name).toBe('Lama'); // untouched
  });
});
