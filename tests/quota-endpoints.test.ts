import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { onRequest as supportOnRequest } from '../functions/api/support';
import { onRequest as cspOnRequest } from '../functions/api/csp-report';
import { onRequest as checkoutOnRequest } from '../functions/api/payments/checkout';
import { onRequest as statusOnRequest } from '../functions/api/payments/status';
import { onRequest as portalOnRequest } from '../functions/api/payments/portal';
import { onRequest as adminContentOnRequest } from '../functions/api/admin/content';
import { onRequest as adminQuotaOnRequest } from '../functions/api/admin/quota';
import { appwriteFake, requestUrl, type AppwriteFake } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

/**
 * Endpoint-level behaviour of the quota policy: rate fences, the DOKU
 * circuit breaker, session-probe caching and the next-number cache. The
 * primitives themselves are covered in `quota.test.ts`.
 *
 * Isolate state is reset before every test by `tests/quota-reset.ts`
 * (registered in `vitest.config.ts`), so caches/rate windows/breakers from
 * one test never decide the next one.
 */

const APPWRITE_ENV = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

const CLIENT_ID = 'MCH-0001-10791114622547';
const SECRET = 'sandbox-secret-key';

let fake: AppwriteFake | null = null;

afterEach(() => {
  fake = null;
  vi.useRealTimers();
});

function handle(
  handler: (ctx: unknown) => Promise<Response>,
  request: Request,
  env: Env,
): Promise<Response> {
  return handler({ request, params: {}, env, waitUntil: () => {} });
}

describe('POST /api/support rate fence', () => {
  it('answers 429 with retry-after once the per-IP budget is spent', async () => {
    const env = { ...APPWRITE_ENV, QUOTA_LIMIT_SUPPORT_PER_HOUR: '2' } as Env;
    const post = () =>
      handle(
        supportOnRequest as (ctx: unknown) => Promise<Response>,
        new Request('https://notain.pages.dev/api/support', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '203.0.113.9' },
          body: JSON.stringify({}),
        }),
        env,
      );

    // Under budget: payload validation rejects them (400) — no provider calls
    // happen, and nothing here may be cached or retried.
    expect((await post()).status).toBe(400);
    expect((await post()).status).toBe(400);

    // Over budget: refused before validation, Turnstile or Appwrite.
    const third = await post();
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
    await expect(third.json()).resolves.toMatchObject({ error: 'rate_limited' });
  });
});

describe('POST /api/csp-report rate fence', () => {
  it('drops a forged flood after the per-IP cap instead of logging it', async () => {
    const env = { ...APPWRITE_ENV, QUOTA_LIMIT_CSP_PER_MINUTE: '3' } as Env;
    const report = JSON.stringify({ 'csp-report': { 'effective-directive': 'script-src' } });
    const post = () =>
      handle(
        cspOnRequest as (ctx: unknown) => Promise<Response>,
        new Request('https://notain.pages.dev/api/csp-report', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '203.0.113.10' },
          body: report,
        }),
        env,
      );

    expect((await post()).status).toBe(204);
    expect((await post()).status).toBe(204);
    expect((await post()).status).toBe(204);
    expect((await post()).status).toBe(429);
  });
});

describe('POST /api/payments/checkout — breaker and budget', () => {
  /** Billing is per organization: the order names the org it upgrades. */
  const ORG = 'org_0123456789abcdef';

  /** Seeds the org (billing lives here) plus the caller's active membership. */
  function seedOrg(): void {
    fake!.rows.set('organizations/' + ORG, {
      $id: ORG,
      name: 'Kopi Senja',
      ownerId: 'user-1',
      plan: 'free',
      planExpiresAt: null,
    });
    fake!.rows.set('memberships/mem_' + ORG, {
      $id: 'mem_' + ORG,
      orgId: ORG,
      userId: 'user-1',
      role: 'owner',
      status: 'active',
    });
  }

  beforeEach(() => {
    fake = appwriteFake({
      passthrough: (input) => {
        const url = requestUrl(input);
        const calls = (fake as AppwriteFake & { dokuCalls?: string[] }).dokuCalls ?? [];
        calls.push(url);
        (fake as AppwriteFake & { dokuCalls?: string[] }).dokuCalls = calls;
        if ((fake as AppwriteFake & { dokuDown?: boolean }).dokuDown) {
          throw new TypeError('fetch failed');
        }
        return new Response(
          JSON.stringify({
            response: {
              payment: {
                url: 'https://sandbox.doku.com/checkout/session/abc',
                token_id: 'tk-1',
                expired_date: '29990101000000',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    seedOrg();
  });

  const post = (env: Env) =>
    handle(
      checkoutOnRequest as (ctx: unknown) => Promise<Response>,
      new Request('https://notain.pages.dev/api/payments/checkout', {
        method: 'POST',
        headers: { authorization: 'Bearer jwt-token', 'content-type': 'application/json' },
        body: JSON.stringify({ orgId: ORG, plan: 'pro' }),
      }),
      env,
    );

  it('opens the breaker after the threshold and fails fast without spending DOKU calls', async () => {
    const env = {
      ...APPWRITE_ENV,
      DOKU_CLIENT_ID: CLIENT_ID,
      DOKU_SECRET_KEY: SECRET,
      QUOTA_DOKU_FAILURE_THRESHOLD: '1',
      QUOTA_DOKU_BREAKER_COOLDOWN_MS: '60000',
    } as Env;
    const state = fake as AppwriteFake & { dokuCalls?: string[]; dokuDown?: boolean };
    state.dokuDown = true;

    const first = await post(env);
    expect(first.status).toBe(502);

    const second = await post(env);
    expect(second.status).toBe(503);
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
    await expect(second.json()).resolves.toMatchObject({ error: 'unavailable' });

    // One attempt reached DOKU; the breaker refused the second entirely.
    expect(state.dokuCalls).toHaveLength(1);
  });

  it('refuses a user over the checkout budget with 429 before any provider call', async () => {
    const env = {
      ...APPWRITE_ENV,
      DOKU_CLIENT_ID: CLIENT_ID,
      DOKU_SECRET_KEY: SECRET,
      QUOTA_LIMIT_CHECKOUT_PER_HOUR: '2',
    } as Env;
    const state = fake as AppwriteFake & { dokuCalls?: string[] };

    expect((await post(env)).status).toBe(200);
    expect((await post(env)).status).toBe(200);
    // The second call resumed the first call's pending order (the duplicate-
    // order guard) instead of asking DOKU for a new one — the fake exposes
    // created rows to list queries now, exactly as Appwrite would.
    const dokuAfterTwo = state.dokuCalls?.length ?? 0;

    const third = await post(env);
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
    // The refusal happened before DOKU: if the fence ran after the provider
    // call, this third attempt would have reached it and the count would grow.
    expect(state.dokuCalls ?? []).toHaveLength(dokuAfterTwo);
  });
});

describe('GET /api/payments/status — breaker stops probe storms', () => {
  const NOW = Date.parse('2026-10-21T12:00:00.000Z');
  const INVOICE = 'NOTAIN-P-1-ABCD';
  const env = {
    ...APPWRITE_ENV,
    DOKU_CLIENT_ID: CLIENT_ID,
    DOKU_SECRET_KEY: SECRET,
    QUOTA_DOKU_FAILURE_THRESHOLD: '1',
    QUOTA_DOKU_BREAKER_COOLDOWN_MS: '60000',
  } as Env;

  let dokuCalls: number;
  let dokuDown: boolean;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    dokuCalls = 0;
    dokuDown = true;
    fake = appwriteFake({
      passthrough: () => {
        dokuCalls += 1;
        if (dokuDown) throw new TypeError('ECONNREFUSED');
        return new Response(
          JSON.stringify({
            service: { id: 'CHECKOUT' },
            transaction: { status: 'PENDING', date: '2026-10-21T11:59:00Z' },
            order: { invoice_number: INVOICE, amount: 29_000 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    fake.rows.set('payments/' + INVOICE, {
      $id: INVOICE,
      ownerId: 'user-1',
      plan: 'pro',
      amount: 29_000,
      status: 'pending',
      createdAt: new Date(NOW - 60_000).toISOString(),
    });
  });

  const get = () =>
    handle(
      statusOnRequest as (ctx: unknown) => Promise<Response>,
      new Request('https://notain.pages.dev/api/payments/status?invoice=' + INVOICE, {
        headers: { authorization: 'Bearer jwt-token' },
      }),
      env,
    );

  it('probes once, opens the breaker, and answers later polls from the row alone', async () => {
    const first = await get();
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ status: 'pending' });
    expect(dokuCalls).toBe(1);

    // Same reconcile window, breaker still open: the poller keeps working
    // (it answers the row) but no further DOKU call is spent.
    const second = await get();
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ status: 'pending' });
    expect(dokuCalls).toBe(1);
  });

  it('lets one probe through again after the cooldown, and recovers on success', async () => {
    await get();
    expect(dokuCalls).toBe(1);

    // Beyond the 60 s cooldown: half-open, one probe is allowed.
    vi.setSystemTime(new Date(NOW + 61_000));
    fake!.rows.set('payments/' + INVOICE, {
      $id: INVOICE,
      ownerId: 'user-1',
      plan: 'pro',
      amount: 29_000,
      status: 'pending',
      createdAt: new Date(NOW - 60_000).toISOString(),
    });
    dokuDown = false;
    dokuCalls = 0;

    const probe = await get();
    expect(probe.status).toBe(200);
    expect(dokuCalls).toBe(1);
  });
});

describe('GET /api/payments/portal — session probe cache', () => {
  it('verifies the same bearer token with Appwrite exactly once', async () => {
    // The gate needs an org + membership; `verifySession` itself is what is
    // under test here, so a minimal valid world is enough.
    fake = appwriteFake();
    fake.rows.set('organizations/org_0123456789abcdef', {
      $id: 'org_0123456789abcdef',
      name: 'Kopi Senja',
      ownerId: 'user-1',
      plan: 'free',
      planExpiresAt: null,
    });
    fake.rows.set('memberships/mem_org', {
      $id: 'mem_org',
      orgId: 'org_0123456789abcdef',
      userId: 'user-1',
      role: 'owner',
      status: 'active',
    });

    const get = () =>
      handle(
        portalOnRequest as (ctx: unknown) => Promise<Response>,
        new Request('https://notain.pages.dev/api/payments/portal?orgId=org_0123456789abcdef', {
          headers: { authorization: 'Bearer jwt-token' },
        }),
        APPWRITE_ENV,
      );

    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(200);

    const accountProbes = (fake as AppwriteFake).calls.filter((call) =>
      call.url.endsWith('/account'),
    );
    expect(accountProbes).toHaveLength(1);
  });
});

describe('GET /api/admin/quota — snapshot endpoint', () => {
  const get = (authorization?: string) =>
    handle(
      adminQuotaOnRequest as (ctx: unknown) => Promise<Response>,
      new Request('https://notain.pages.dev/api/admin/quota', {
        headers: authorization ? { authorization } : {},
      }),
      APPWRITE_ENV,
    );

  it('refuses an unauthenticated caller', async () => {
    fake = appwriteFake();
    expect((await get()).status).toBe(401);
  });

  it('refuses a signed-in non-admin', async () => {
    fake = appwriteFake({ teamMemberships: 0 });
    expect((await get('Bearer jwt-token')).status).toBe(403);
  });

  it('reports isolate-local counters as measured and dashboards as the source of truth', async () => {
    fake = appwriteFake({ teamMemberships: 1 });

    const response = await get('Bearer jwt-token');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const body = (await response.json()) as {
      isolate: { scope: string; counters: Record<string, number> };
      policy: { sessionCacheTtlMs: number };
      provider: {
        verifiedAt: string;
        cloudflare: { workersRequestsPerDay: number; r2: { billingRisk: string } };
        appwrite: { databaseReadsPerMonth: number; usageSource: string };
      };
      dashboards: { cloudflare: string; appwrite: string };
    };

    expect(body.isolate.scope).toBe('single-isolate');
    // Measured, clearly-bounded local counters — no invented remaining-quota claims.
    expect(body.isolate.counters).toBeTypeOf('object');
    expect(body.policy.sessionCacheTtlMs).toBe(60_000);
    expect(body.provider.cloudflare.workersRequestsPerDay).toBe(100_000);
    expect(body.provider.appwrite.databaseReadsPerMonth).toBe(500_000);
    expect(body.provider.appwrite.usageSource).toMatch(/Console/);
    expect(body.provider.cloudflare.r2.billingRisk).toMatch(/BILLED/i);
    expect(body.dashboards.appwrite).toMatch(/Usage/);
  });

  it('refuses methods other than GET', async () => {
    fake = appwriteFake();
    const response = await handle(
      adminQuotaOnRequest as (ctx: unknown) => Promise<Response>,
      new Request('https://notain.pages.dev/api/admin/quota', { method: 'POST' }),
      APPWRITE_ENV,
    );
    expect(response.status).toBe(405);
  });
});

describe('GET /api/admin/content nextNumber — cache and invalidation', () => {
  const YEAR = new Date().getFullYear();
  const env = { ...APPWRITE_ENV, QUOTA_NEXT_NUMBER_CACHE_TTL_MS: '30000' } as Env;

  /** Derives the next number performed (queries with the scan's page size). */
  function derives(): number {
    return (fake as AppwriteFake).calls.filter(
      (call) =>
        call.method === 'GET' &&
        call.url.includes('/collections/invoices/documents') &&
        call.url.includes('%5B100%5D'),
    ).length;
  }

  const getNumber = () =>
    handle(
      adminContentOnRequest as (ctx: unknown) => Promise<Response>,
      new Request(
        'https://notain.pages.dev/api/admin/content?userId=user-1&resource=invoices&nextNumber=1',
        { headers: { authorization: 'Bearer jwt-token' } },
      ),
      env,
    );

  const createInvoice = (invoiceNumber: string) =>
    handle(
      adminContentOnRequest as (ctx: unknown) => Promise<Response>,
      new Request('https://notain.pages.dev/api/admin/content', {
        method: 'POST',
        headers: { authorization: 'Bearer jwt-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-1',
          resource: 'invoices',
          action: 'create',
          draft: {
            invoiceNumber,
            date: '2026-10-01',
            dueDate: '2026-10-15',
            templateId: 'tpl-1',
            status: 'sent',
            customerName: 'Budi',
            customerPhone: '081234567890',
            customerEmail: 'budi@example.com',
            items: [{ id: 'i1', name: 'Apel', quantity: 1, unitPrice: 1_000 }],
            details: {},
            discount: { type: 'amount', value: 0 },
            tax: { type: 'percent', value: 0 },
            sections: { header: '', content: '', footer: '' },
            notes: '',
          },
        }),
      }),
      env,
    );

  it('serves the second open from cache and re-derives after a create consumes a number', async () => {
    fake = appwriteFake();

    const first = await getNumber();
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ invoiceNumber: `INV-${YEAR}-001` });
    expect(derives()).toBe(1);

    // Same isolate, nothing changed: no second Appwrite scan.
    const second = await getNumber();
    await expect(second.json()).resolves.toMatchObject({
      invoiceNumber: `INV-${YEAR}-001`,
      cached: true,
    });
    expect(derives()).toBe(1);

    // Creating an invoice consumes the number, so the cache is dropped…
    const created = await createInvoice(`INV-${YEAR}-001`);
    expect(created.status).toBe(201);

    // …and the next dialog open performs a fresh derive (not a cache hit).
    const third = await getNumber();
    expect(third.status).toBe(200);
    expect(derives()).toBe(2);
    const thirdBody = (await third.json()) as { invoiceNumber: string; cached?: boolean };
    expect(thirdBody.invoiceNumber).toMatch(/^INV-\d{4}-\d{3}$/);
    expect(thirdBody.cached).toBeUndefined();
  });
});
