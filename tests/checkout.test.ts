import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { onRequest } from '../functions/api/payments/checkout';
import { appwriteFake, type AppwriteFake } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

const CLIENT_ID = 'MCH-0001-10791114622547';
const SECRET = 'sandbox-secret-key';
const CHECKOUT_PATH = '/api/payments/checkout';
/** Billing is per organization: the order names the org it upgrades. */
const ORG = 'org_0123456789abcdef';

const env = {
  DOKU_CLIENT_ID: CLIENT_ID,
  DOKU_SECRET_KEY: SECRET,
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

const DOKU_OK = {
  response: {
    payment: {
      url: 'https://sandbox.doku.com/checkout/session/abc',
      token_id: 'tk-1',
      expired_date: '20261021120000',
    },
  },
};

let fake: AppwriteFake;
let dokuCalls: Array<{ url: string; init: RequestInit }>;
let dokuAnswer: () => Response;

beforeEach(() => {
  dokuCalls = [];
  dokuAnswer = () =>
    new Response(JSON.stringify(DOKU_OK), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  fake = appwriteFake({
    passthrough: (input, init) => {
      dokuCalls.push({ url: String(input), init });
      return dokuAnswer();
    },
  });
  seedOrg();
});

/** Seeds the org (billing lives here), the caller's membership and its letterhead row. */
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
  // The letterhead row (id == orgId) doubles as the payer DOKU sees.
  fake.rows.set('profiles/' + ORG, {
    $id: ORG,
    name: 'Budi',
    phone: '081234567890',
    plan: 'free',
    planExpiresAt: null,
  });
}

function post(body: unknown): Request {
  return new Request('https://notain.pages.dev' + CHECKOUT_PATH, {
    method: 'POST',
    headers: { authorization: 'Bearer jwt-token', 'content-type': 'application/json' },
    body: JSON.stringify({
      orgId: ORG,
      ...(typeof body === 'object' && body !== null ? body : {}),
    }),
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

/** Payment rows the handler created or patched, in order. */
function paymentWrites(): Array<{ method: string; id?: string; data: Record<string, unknown> }> {
  return fake.calls
    .filter(
      (call) =>
        (call.method === 'POST' || call.method === 'PATCH') &&
        call.url.includes('/collections/payments/'),
    )
    .map((call) => {
      const match = /\/collections\/payments\/documents(?:\/([^/?]+))?/.exec(
        new URL(call.url).pathname,
      );
      const payload = call.body as { documentId?: string; data?: Record<string, unknown> };
      return {
        method: call.method,
        id: match?.[1] ?? payload.documentId,
        data: payload.data ?? payload,
      };
    });
}

describe('POST /api/payments/checkout', () => {
  it('refuses an unauthenticated caller', async () => {
    fake.account = null;

    const response = await handle(post({ plan: 'pro' }));

    expect(response.status).toBe(401);
    expect(dokuCalls).toEqual([]);
    expect(paymentWrites()).toEqual([]);
  });

  it('refuses a caller who is not a member of the org', async () => {
    fake.rows.delete('memberships/mem_' + ORG);

    const response = await handle(post({ plan: 'pro' }));

    // Same answer a nonexistent org gets — the gate never confirms an id exists.
    expect(response.status).toBe(404);
    expect(dokuCalls).toEqual([]);
    expect(paymentWrites()).toEqual([]);
  });

  it('refuses when the organization row itself is missing', async () => {
    fake.rows.delete('organizations/' + ORG);

    const response = await handle(post({ plan: 'pro' }));

    expect(response.status).toBe(409);
    // No order, no money, no DOKU call: activation could not have granted it.
    expect(dokuCalls).toEqual([]);
    expect(paymentWrites()).toEqual([]);
  });

  it.each(['GET', 'PUT', 'DELETE'])('refuses %s', async (method) => {
    const response = await handle(
      new Request('https://notain.pages.dev' + CHECKOUT_PATH, { method }),
    );
    expect(response.status).toBe(405);
  });

  it('refuses the free plan — free never reaches payment', async () => {
    const response = await handle(post({ plan: 'free' }));

    expect(response.status).toBe(400);
    expect(dokuCalls).toEqual([]);
    expect(paymentWrites()).toEqual([]);
  });

  it('refuses an unknown plan id', async () => {
    const response = await handle(post({ plan: '<script>' }));

    expect(response.status).toBe(400);
    expect(dokuCalls).toEqual([]);
  });

  it('prices the order from the server catalog, ignoring any client-supplied amount', async () => {
    const response = await handle(post({ plan: 'pro', amount: 1, price: 'gratis' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://sandbox.doku.com/checkout/session/abc',
    });

    // The row and the DOKU request both carry the catalog price.
    const created = paymentWrites().find((write) => write.method === 'POST');
    expect(created?.data.amount).toBe(49_000);
    const dokuBody = JSON.parse(String(dokuCalls[0]!.init.body));
    expect(dokuBody.order.amount).toBe(49_000);
    expect(dokuBody.order.invoice_number).toBe(created?.id);
    expect(dokuBody.additional_info.override_notification_url).toBe(
      'https://notain.pages.dev/api/payments/doku-notify',
    );
    expect(dokuBody.order.callback_url).toContain('/payment/result?invoice=');
  });

  it('signs the DOKU request with the documented headers', async () => {
    await handle(post({ plan: 'pro' }));

    const headers = dokuCalls[0]!.init.headers as Record<string, string>;
    expect(headers['Client-Id']).toBe(CLIENT_ID);
    expect(headers['Request-Id']).toBeTypeOf('string');
    expect(headers['Request-Timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(headers.Signature).toMatch(/^HMACSHA256=.+$/);
  });

  it('stores the checkout URL on the pending row once DOKU answers', async () => {
    await handle(post({ plan: 'pro' }));

    const patch = paymentWrites().find((write) => write.method === 'PATCH');
    expect(patch?.data.checkoutUrl).toBe('https://sandbox.doku.com/checkout/session/abc');
    expect(patch?.data.dokuExpiredAt).toBe('2026-10-21T05:00:00.000Z');
  });

  it('reuses an unexpired pending order instead of stacking a second one', async () => {
    fake.lists.set('payments', [
      {
        $id: 'NOTAIN-P-OLD',
        orgId: ORG,
        ownerId: 'user-1',
        plan: 'pro',
        status: 'pending',
        checkoutUrl: 'https://sandbox.doku.com/checkout/session/old',
        dokuExpiredAt: '2999-01-01T00:00:00.000Z',
        createdAt: new Date().toISOString(),
      },
    ]);

    const response = await handle(post({ plan: 'pro' }));

    await expect(response.json()).resolves.toEqual({
      url: 'https://sandbox.doku.com/checkout/session/old',
    });
    // No second DOKU order, no second row.
    expect(dokuCalls).toEqual([]);
    expect(paymentWrites().filter((write) => write.method === 'POST')).toEqual([]);
  });

  it('blocks a downgrade while an active higher plan is running', async () => {
    seedOrg({ plan: 'business', planExpiresAt: '2999-01-01T00:00:00.000Z' });

    const response = await handle(post({ plan: 'pro' }));

    expect(response.status).toBe(409);
    expect(dokuCalls).toEqual([]);
  });

  it('allows a same-plan renewal and refuses Business, which is not sold yet', async () => {
    seedOrg({ plan: 'pro', planExpiresAt: '2999-01-01T00:00:00.000Z' });

    await expect(handle(post({ plan: 'pro' }))).resolves.toMatchObject({ status: 200 });
    const callsAfterRenewal = dokuCalls.length;

    // Business is announced (`PLAN_COMING_SOON`), not sold: the server
    // refuses it before auth or any provider call, so no order and no
    // payment row can ever exist for that tier.
    const response = await handle(post({ plan: 'business' }));
    expect(response.status).toBe(400);
    expect(dokuCalls).toHaveLength(callsAfterRenewal);
  });

  it('retires a stranded row (creation failed earlier) and starts a fresh one', async () => {
    fake.lists.set('payments', [
      {
        $id: 'NOTAIN-P-STRANDED',
        orgId: ORG,
        ownerId: 'user-1',
        plan: 'pro',
        status: 'pending',
        checkoutUrl: null,
        createdAt: '2026-10-20T00:00:00.000Z',
      },
    ]);

    const response = await handle(post({ plan: 'pro' }));

    expect(response.status).toBe(200);
    const retire = paymentWrites().find((write) => write.method === 'PATCH');
    expect(retire?.data.status).toBe('failed');
    expect(dokuCalls).toHaveLength(1);
  });

  it('reports a DOKU network failure as retryable and retires the row', async () => {
    dokuAnswer = () => {
      throw new TypeError('fetch failed');
    };

    const response = await handle(post({ plan: 'pro' }));

    expect(response.status).toBe(502);
    const patch = paymentWrites().find((write) => write.method === 'PATCH');
    expect(patch?.data.status).toBe('failed');
  });

  it('reports a DOKU rejection as failed without leaking the upstream body', async () => {
    dokuAnswer = () =>
      new Response(JSON.stringify({ error: { message: 'invalid client id internals' } }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });

    const response = await handle(post({ plan: 'pro' }));
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain('invalid client id internals');
    expect(paymentWrites().find((write) => write.method === 'PATCH')?.data.status).toBe('failed');
  });

  it('answers 500 when the payment table cannot be written', async () => {
    // Rebuild the environment with Appwrite payment writes failing.
    fake = appwriteFake({ writeFailureFor: '/collections/payments/' });
    seedOrg();

    const response = await handle(post({ plan: 'pro' }));

    expect(response.status).toBe(500);
    expect(dokuCalls).toEqual([]);
  });
});
