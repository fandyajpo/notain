import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { onRequest } from '../functions/api/payments/portal';
import { appwriteFake, type AppwriteFake, type Row } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

const PORTAL_PATH = '/api/payments/portal';
/** Billing is per organization; the query names the org to inspect. */
const ORG = 'org_0123456789abcdef';

const env = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

let fake: AppwriteFake;

/** Seeds the org (billing lives here) plus the caller's active membership. */
function seedOrg(options: { plan?: string; planExpiresAt?: string | null } = {}): void {
  fake.rows.set('organizations/' + ORG, {
    $id: ORG,
    name: 'Kopi Senja',
    ownerId: 'user-1',
    plan: options.plan ?? 'free',
    planExpiresAt: options.planExpiresAt ?? null,
  });
  fake.rows.set('memberships/mem_' + ORG, {
    $id: 'mem_' + ORG,
    orgId: ORG,
    userId: 'user-1',
    role: 'owner',
    status: 'active',
  });
}

beforeEach(() => {
  fake = appwriteFake();
  seedOrg();
});

function get(query = `?orgId=${ORG}`): Request {
  return new Request('https://notain.pages.dev' + PORTAL_PATH + query, {
    headers: { authorization: 'Bearer jwt-token' },
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

function payment(overrides: Record<string, unknown>): Row {
  return {
    $id: 'NOTAIN-P-1-ABCD',
    orgId: ORG,
    ownerId: 'user-1',
    plan: 'pro',
    amount: 29_000,
    currency: 'IDR',
    status: 'pending',
    paidAt: null,
    checkoutUrl: null,
    dokuExpiredAt: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('GET /api/payments/portal', () => {
  it('refuses an unauthenticated caller', async () => {
    fake.account = null;

    const response = await handle(get());

    expect(response.status).toBe(401);
  });

  it.each(['POST', 'PUT', 'DELETE'])('refuses %s', async (method) => {
    const response = await handle(
      new Request('https://notain.pages.dev' + PORTAL_PATH, { method }),
    );
    expect(response.status).toBe(405);
  });

  it('answers free for an organization without a profile row, not an error', async () => {
    fake.rows.delete('organizations/' + ORG);

    const response = await handle(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      plan: 'free',
      planExpiresAt: null,
      active: false,
      payments: [],
    });
  });

  it('refuses a caller who is not a member of the org', async () => {
    fake.rows.delete('memberships/mem_' + ORG);

    const response = await handle(get());

    // Same 404 a nonexistent org gets — the gate never confirms an id exists.
    expect(response.status).toBe(404);
  });

  it('refuses an orgId the caller cannot even name', async () => {
    const response = await handle(get('?orgId=org_notreal'));

    expect(response.status).toBe(400);
  });

  it('reports an active paid plan with its expiry', async () => {
    seedOrg({ plan: 'pro', planExpiresAt: '2999-01-01T00:00:00.000Z' });

    const response = await handle(get());

    await expect(response.json()).resolves.toMatchObject({
      plan: 'pro',
      planExpiresAt: '2999-01-01T00:00:00.000Z',
      active: true,
    });
  });

  it('marks an expired plan inactive', async () => {
    seedOrg({ plan: 'business', planExpiresAt: '2020-01-01T00:00:00.000Z' });

    const response = await handle(get());

    await expect(response.json()).resolves.toMatchObject({
      plan: 'business',
      active: false,
    });
  });

  it('keeps another organization’s payments out even if the backend returns them', async () => {
    // The fake ignores Appwrite query params — exactly the failure mode the
    // handler's own ownership filter has to survive.
    fake.lists.set('payments', [
      payment({ $id: 'NOTAIN-P-1-MINE', status: 'paid', paidAt: '2026-10-20T10:05:00.000Z' }),
      payment({ $id: 'NOTAIN-P-1-THEIRS', orgId: 'org_ffffffffffffffff' }),
    ]);

    const response = await handle(get());
    const body = (await response.json()) as { payments: Array<{ invoiceNumber: string }> };

    expect(body.payments.map((row) => row.invoiceNumber)).toEqual(['NOTAIN-P-1-MINE']);
  });

  it('normalizes statuses and only offers a resume link for a live pending order', async () => {
    fake.lists.set('payments', [
      payment({
        $id: 'NOTAIN-P-1-RESUME',
        checkoutUrl: 'https://sandbox.doku.com/checkout/session/abc',
        dokuExpiredAt: '2999-01-01T00:00:00.000Z',
      }),
      payment({
        $id: 'NOTAIN-P-1-STALE',
        checkoutUrl: 'https://sandbox.doku.com/checkout/session/old',
        dokuExpiredAt: '2020-01-01T00:00:00.000Z',
      }),
      payment({ $id: 'NOTAIN-P-1-WEIRD', status: 'who_knows', checkoutUrl: 'javascript:alert(1)' }),
      payment({ $id: 'NOTAIN-P-1-PAID', status: 'paid', paidAt: '2026-10-20T10:05:00.000Z' }),
    ]);

    const response = await handle(get());
    const body = (await response.json()) as {
      payments: Array<{ invoiceNumber: string; status: string; resumeUrl: string | null }>;
    };
    const byId = new Map(body.payments.map((row) => [row.invoiceNumber, row]));

    expect(byId.get('NOTAIN-P-1-RESUME')).toMatchObject({
      status: 'pending',
      resumeUrl: 'https://sandbox.doku.com/checkout/session/abc',
    });
    // The order expired at DOKU: paying it now would bounce — no link.
    expect(byId.get('NOTAIN-P-1-STALE')?.resumeUrl).toBeNull();
    // An unrecognised status reads as pending, and a non-http URL never
    // becomes a link.
    expect(byId.get('NOTAIN-P-1-WEIRD')).toMatchObject({ status: 'pending', resumeUrl: null });
    expect(byId.get('NOTAIN-P-1-PAID')).toMatchObject({ status: 'paid', resumeUrl: null });
  });

  it('never lands in a shared cache — it is personalised billing state', async () => {
    const response = await handle(get());
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
