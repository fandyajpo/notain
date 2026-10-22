import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { inReconcileWindow, onRequest } from '../functions/api/payments/status';
import { appwriteFake, type AppwriteFake, type Row } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

const CLIENT_ID = 'MCH-0001-10791114622547';
const SECRET = 'sandbox-secret-key';
const STATUS_PATH = '/api/payments/status';
const INVOICE = 'NOTAIN-P-1-ABCD';

const env = {
  DOKU_CLIENT_ID: CLIENT_ID,
  DOKU_SECRET_KEY: SECRET,
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

/**
 * A frozen clock: the reconcile throttle compares the row's age against fixed
 * boundaries (60 s gate, then a 5 s window per 15 s), so tests that expect a
 * probe — or expect to be spared one — must not depend on wall time.
 */
const NOW = Date.parse('2026-10-21T12:00:00.000Z');
/** Exactly on the DOKU gate: the first moment a probe may leave. */
const AGE_AT_GATE = 60_000;
/** Past the gate but outside its window, so the throttle stays shut. */
const AGE_OUTSIDE_WINDOW = 60_000 + 7_000;

type DokuCall = { url: string; method: string; headers: Record<string, string> };

let fake: AppwriteFake;
let dokuCalls: DokuCall[];
let dokuHandler: (call: DokuCall) => Response | Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** DOKU's Check Status body — the same shape as an HTTP notification. */
function statusBody(
  overrides: { status?: string; invoice?: string; amount?: number | null } = {},
): unknown {
  return {
    service: { id: 'CHECKOUT' },
    transaction: { status: overrides.status ?? 'PENDING', date: '2026-10-21T11:59:00Z' },
    order: {
      invoice_number: overrides.invoice ?? INVOICE,
      ...(overrides.amount === null ? {} : { amount: overrides.amount ?? 29_000 }),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });

  dokuCalls = [];
  dokuHandler = () => json(200, statusBody());

  fake = appwriteFake({
    passthrough: (input, init) => {
      const call: DokuCall = {
        url: String(input),
        method: (init.method ?? 'GET').toUpperCase(),
        headers: Object.fromEntries(new Headers(init.headers as HeadersInit).entries()),
      };
      dokuCalls.push(call);
      return dokuHandler(call);
    },
  });

  fake.rows.set('payments/' + INVOICE, payment());
  fake.rows.set('profiles/user-1', { $id: 'user-1', plan: 'free', planExpiresAt: null });
});

afterEach(() => {
  vi.useRealTimers();
});

function payment(overrides: Record<string, unknown> = {}): Row {
  return {
    $id: INVOICE,
    ownerId: 'user-1',
    plan: 'pro',
    amount: 29_000,
    currency: 'IDR',
    status: 'pending',
    paidAt: null,
    checkoutUrl: 'https://sandbox.doku.com/checkout/session/abc',
    dokuExpiredAt: null,
    createdAt: new Date(NOW - AGE_AT_GATE).toISOString(),
    ...overrides,
  };
}

function get(invoice = INVOICE, authorization = 'Bearer jwt-token'): Request {
  return new Request(
    `https://notain.pages.dev${STATUS_PATH}?invoice=${encodeURIComponent(invoice)}`,
    { headers: authorization ? { authorization } : {} },
  );
}

function handle(request: Request): Promise<Response> {
  return (onRequest as unknown as (ctx: unknown) => Promise<Response>)({
    request,
    params: {},
    env,
    waitUntil: () => {},
  });
}

/** Appwrite writes the handler performed, as `${method} ${table}/${id}`. */
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

describe('GET /api/payments/status', () => {
  it('refuses an unauthenticated caller without touching DOKU', async () => {
    fake.account = null;

    const response = await handle(get());

    expect(response.status).toBe(401);
    expect(dokuCalls).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it('refuses to read someone else’s order', async () => {
    fake.rows.set('payments/' + INVOICE, payment({ ownerId: 'user-2' }));

    const response = await handle(get());

    expect(response.status).toBe(404);
    expect(dokuCalls).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it('refuses a missing invoice', async () => {
    const response = await handle(get(''));

    expect(response.status).toBe(400);
    expect(dokuCalls).toEqual([]);
  });

  it('reports a young pending order without asking DOKU yet', async () => {
    fake.rows.set(
      'payments/' + INVOICE,
      payment({
        createdAt: new Date(NOW - 30_000).toISOString(),
      }),
    );

    const response = await handle(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'pending' });
    expect(dokuCalls).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it('stays quiet outside the reconcile window even once the order is old', async () => {
    fake.rows.set(
      'payments/' + INVOICE,
      payment({
        createdAt: new Date(NOW - AGE_OUTSIDE_WINDOW).toISOString(),
      }),
    );

    const response = await handle(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'pending' });
    expect(dokuCalls).toEqual([]);
  });

  it('asks DOKU about an old pending order with a signed GET and no Digest', async () => {
    dokuHandler = () => json(200, statusBody({ status: 'PENDING' }));

    const response = await handle(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'pending' });

    expect(dokuCalls).toHaveLength(1);
    const call = dokuCalls[0]!;
    expect(call.method).toBe('GET');
    expect(call.url).toBe(`https://api-sandbox.doku.com/orders/v1/status/${INVOICE}`);
    expect(call.headers['client-id']).toBe(CLIENT_ID);
    expect(call.headers['request-timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(call.headers['signature']).toMatch(/^HMACSHA256=/);
    expect(call.headers['digest']).toBeUndefined();
    // Nothing changed: PENDING is not a final state.
    expect(writes()).toEqual([]);
    expect(fake.rows.get('payments/' + INVOICE)?.status).toBe('pending');
  });

  it('activates the plan when DOKU reports SUCCESS for the amount we stored', async () => {
    dokuHandler = () => json(200, statusBody({ status: 'SUCCESS' }));

    const response = await handle(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'paid' });

    const stored = fake.rows.get('payments/' + INVOICE);
    expect(stored?.status).toBe('paid');
    expect(stored?.paidAt).toBeTypeOf('string');

    const profile = fake.rows.get('profiles/user-1');
    expect(profile?.plan).toBe('pro');
    const expiry = new Date(String(profile?.planExpiresAt)).getTime();
    const paidAt = new Date(String(stored?.paidAt)).getTime();
    expect(expiry - paidAt).toBe(30 * 24 * 60 * 60 * 1000);

    expect(writes()).toContain('PATCH payments/' + INVOICE);
    expect(writes()).toContain('PATCH profiles/user-1');
  });

  it('never extends the plan twice, however often it is polled after success', async () => {
    dokuHandler = () => json(200, statusBody({ status: 'SUCCESS' }));

    await handle(get());
    const firstExpiry = fake.rows.get('profiles/user-1')?.planExpiresAt;
    dokuCalls = [];

    const second = await handle(get());

    await expect(second.json()).resolves.toMatchObject({ status: 'paid' });
    // The row is final, so the probe is never sent again.
    expect(dokuCalls).toEqual([]);
    expect(fake.rows.get('profiles/user-1')?.planExpiresAt).toBe(firstExpiry);
  });

  it('ignores a SUCCESS whose amount does not match the stored order', async () => {
    dokuHandler = () => json(200, statusBody({ status: 'SUCCESS', amount: 1_000 }));

    const response = await handle(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'pending' });
    // Left pending for manual review — not expired, not activated.
    expect(fake.rows.get('payments/' + INVOICE)?.status).toBe('pending');
    expect(fake.rows.get('profiles/user-1')?.plan).toBe('free');
    expect(writes()).toContain('POST audit_logs/(create)');
  });

  it('ignores a reply naming a different order', async () => {
    dokuHandler = () => json(200, statusBody({ status: 'SUCCESS', invoice: 'NOTAIN-P-9-FORGED' }));

    const response = await handle(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'pending' });
    expect(fake.rows.get('profiles/user-1')?.plan).toBe('free');
    expect(writes()).toEqual([]);
  });

  it('expires the order when DOKU reports EXPIRED', async () => {
    dokuHandler = () => json(200, statusBody({ status: 'EXPIRED' }));

    const response = await handle(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'expired' });
    expect(fake.rows.get('profiles/user-1')?.plan).toBe('free');
  });

  it('reports the row as it stands when DOKU has never seen the order', async () => {
    dokuHandler = () =>
      json(404, {
        error: { code: 'data_not_found', type: 'not_found', message: 'Invoice Number not found' },
      });

    const response = await handle(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'pending' });
    expect(writes()).toEqual([]);
  });

  it('survives DOKU being unreachable — a poll is never an error', async () => {
    dokuHandler = () => {
      throw new Error('ECONNREFUSED');
    };

    const response = await handle(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'pending' });
    expect(writes()).toEqual([]);
  });

  it('survives an unparseable DOKU body', async () => {
    dokuHandler = () => new Response('<html>bad gateway</html>', { status: 200 });

    const response = await handle(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'pending' });
    expect(writes()).toEqual([]);
  });

  it('does not probe DOKU at all when the credentials are missing', async () => {
    const unconfigured = {
      ...env,
      DOKU_CLIENT_ID: '',
      DOKU_SECRET_KEY: '',
    } as Env;

    const response = await (onRequest as unknown as (ctx: unknown) => Promise<Response>)({
      request: get(),
      params: {},
      env: unconfigured,
      waitUntil: () => {},
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'pending' });
    expect(dokuCalls).toEqual([]);
  });

  it('never lands in a shared cache — it may have just changed the billing state', async () => {
    const response = await handle(get());
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['POST', 'PUT', 'DELETE'])('refuses %s', async (method) => {
    const response = await handle(
      new Request(`https://notain.pages.dev${STATUS_PATH}?invoice=${INVOICE}`, { method }),
    );
    expect(response.status).toBe(405);
  });
});

describe('inReconcileWindow', () => {
  it('refuses anything younger than DOKU’s 60 second gate', () => {
    expect(inReconcileWindow(0)).toBe(false);
    expect(inReconcileWindow(59_999)).toBe(false);
    expect(inReconcileWindow(NaN)).toBe(false);
  });

  it('opens exactly at the gate, then once per 15 seconds', () => {
    expect(inReconcileWindow(60_000)).toBe(true);
    expect(inReconcileWindow(64_999)).toBe(true);
    expect(inReconcileWindow(65_000)).toBe(false);
    expect(inReconcileWindow(74_999)).toBe(false);
    expect(inReconcileWindow(75_000)).toBe(true);
    expect(inReconcileWindow(210_000)).toBe(true);
  });
});
