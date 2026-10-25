import { afterEach, describe, expect, it } from 'vite-plus/test';
import { onRequest as quotaOnRequest } from '../functions/api/quota/invoices';
import { appwriteFake, type AppwriteFake, type Row } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

/**
 * `GET`/`POST /api/quota/invoices` — the free tier's monthly allowance.
 *
 * The counter itself (`freeInvoiceBudget`, month keys, paid-plan bypass) is
 * unit-tested in `src/core/billing/plans.test.ts`; this file covers the
 * endpoint's contract on top of it: session gate, the answer's shape, the 402
 * a spent month produces, and the fact that a paid plan is never counted.
 */

const ENV = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

let fake: AppwriteFake | null = null;

afterEach(() => {
  fake = null;
});

function handle(method: string): Promise<Response> {
  return (quotaOnRequest as (ctx: unknown) => Promise<Response>)({
    request: new Request('https://notain.pages.dev/api/quota/invoices', {
      method,
      headers: { authorization: 'Bearer jwt-token' },
    }),
    params: {},
    env: ENV,
    waitUntil: () => {},
  });
}

/** Rows stamped inside the *current* calendar month, whatever today is. */
function thisMonthInvoice(count: number): Row[] {
  const now = new Date();
  return Array.from({ length: count }, (_unused, index) => ({
    $id: `inv-${index}`,
    ownerId: 'user-1',
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-0${(index % 9) + 1}`,
    $createdAt: new Date(now.getFullYear(), now.getMonth(), (index % 9) + 1, 9).toISOString(),
  }));
}

function seed(profile: Record<string, unknown>, invoices: Row[]): void {
  fake = appwriteFake();
  fake.rows.set('profiles/user-1', { $id: 'user-1', ...profile });
  if (invoices.length > 0) fake.lists.set('invoices', invoices);
}

describe('GET /api/quota/invoices', () => {
  it('refuses without a session', async () => {
    seed({ plan: 'free', planExpiresAt: null }, []);

    const response = await (quotaOnRequest as (ctx: unknown) => Promise<Response>)({
      request: new Request('https://notain.pages.dev/api/quota/invoices'),
      params: {},
      env: ENV,
      waitUntil: () => {},
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'unauthenticated' });
  });

  it('counts this month rows against the free limit and is never cached', async () => {
    seed({ plan: 'free', planExpiresAt: null }, thisMonthInvoice(3));

    const response = await handle('GET');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const quota = (await response.json()) as Record<string, unknown>;
    expect(quota).toMatchObject({ remaining: 7, used: 3, limit: 10 });
    expect(Number.isFinite(Date.parse(String(quota.resetsAt)))).toBe(true);
  });

  it('reports an unlimited allowance for an active paid plan', async () => {
    seed(
      { plan: 'pro', planExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() },
      thisMonthInvoice(12),
    );

    const response = await handle('GET');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ remaining: null, limit: 10 });
  });
});

describe('POST /api/quota/invoices', () => {
  it('claims room for another invoice while the month has budget', async () => {
    seed({ plan: 'free', planExpiresAt: null }, thisMonthInvoice(9));

    const response = await handle('POST');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      quota: { remaining: 1, used: 9 },
    });
  });

  it('answers 402 plan_required with the quota once the month is spent', async () => {
    seed({ plan: 'free', planExpiresAt: null }, thisMonthInvoice(10));

    const response = await handle('POST');

    expect(response.status).toBe(402);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.error).toBe('plan_required');
    expect(String(body.message)).toContain('Kuota invoice gratis');
    expect(body.quota).toMatchObject({ remaining: 0, used: 10, limit: 10 });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('never counts a paid account, however many invoices it made', async () => {
    seed(
      { plan: 'business', planExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() },
      thisMonthInvoice(40),
    );

    const response = await handle('POST');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, quota: { remaining: null } });
  });

  it('refuses methods other than GET and POST', async () => {
    seed({ plan: 'free', planExpiresAt: null }, []);

    const response = await handle('DELETE');

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({ error: 'method_not_allowed' });
  });
});
