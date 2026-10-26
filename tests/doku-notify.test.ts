import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { onRequest } from '../functions/api/payments/doku-notify';
import { signRequest, utcTimestamp } from '../src/core/billing/doku';
import { appwriteFake, type AppwriteFake } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

const CLIENT_ID = 'MCH-0001-10791114622547';
const SECRET = 'sandbox-secret-key';
const NOTIFY_PATH = '/api/payments/doku-notify';

const env = {
  DOKU_CLIENT_ID: CLIENT_ID,
  DOKU_SECRET_KEY: SECRET,
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

const INVOICE = 'NOTAIN-P-1-ABCD';
/** The plan belongs to an organization since multi-tenancy. */
const ORG = 'org_0123456789abcdef';

let fake: AppwriteFake;

beforeEach(() => {
  fake = appwriteFake();
  fake.rows.set('payments/' + INVOICE, {
    $id: INVOICE,
    orgId: ORG,
    ownerId: 'user-1',
    plan: 'pro',
    amount: 29_000,
    status: 'pending',
    paidAt: null,
  });
  // The organization the order upgrades — `plan`/`planExpiresAt` live here.
  fake.rows.set('organizations/' + ORG, {
    $id: ORG,
    name: 'Kopi Senja',
    ownerId: 'user-1',
    plan: 'free',
    planExpiresAt: null,
  });
});

type Notification = {
  status: string;
  invoiceNumber?: string | null;
  amount?: number | null;
};

async function notify(
  notification: Notification,
  options: { secretKey?: string; body?: string } = {},
): Promise<Response> {
  const raw =
    options.body ??
    JSON.stringify({
      service: { id: 'CHECKOUT' },
      transaction: { status: notification.status, date: '2026-10-20T10:05:00Z' },
      order: {
        invoice_number: notification.invoiceNumber ?? INVOICE,
        ...(notification.amount === undefined ? {} : { amount: notification.amount }),
      },
    });
  const timestamp = utcTimestamp();
  const requestId = 'notif-1';
  const signature = await signRequest({
    secretKey: options.secretKey ?? SECRET,
    clientId: CLIENT_ID,
    requestId,
    timestamp,
    target: NOTIFY_PATH,
    rawBody: raw,
  });

  return handle(
    new Request(`https://notain.pages.dev${NOTIFY_PATH}`, {
      method: 'POST',
      headers: {
        'Client-Id': CLIENT_ID,
        'Request-Id': requestId,
        'Request-Timestamp': timestamp,
        Signature: signature,
        'content-type': 'application/json',
      },
      body: raw,
    }),
  );
}

/** Invokes the Pages Function the way the runtime would. */
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
    .map((call) => {
      const match = /\/collections\/([^/]+)\/documents(?:\/([^/?]+))?/.exec(
        new URL(call.url).pathname,
      );
      return `${call.method} ${match?.[1]}/${match?.[2] ?? '(create)'}`;
    });
}

describe('POST /api/payments/doku-notify', () => {
  it('rejects an unsigned request before it can touch a single row', async () => {
    const response = await handle(
      new Request('https://notain.pages.dev' + NOTIFY_PATH, {
        method: 'POST',
        body: JSON.stringify({ order: { invoice_number: INVOICE } }),
      }),
    );

    expect(response.status).toBe(401);
    expect(writes()).toEqual([]);
  });

  it('rejects a notification signed with the wrong secret', async () => {
    const response = await notify(
      { status: 'SUCCESS', amount: 29_000 },
      { secretKey: 'attacker-key' },
    );

    expect(response.status).toBe(401);
    expect(writes()).toEqual([]);
    expect(fake.rows.get('payments/' + INVOICE)?.status).toBe('pending');
    expect(fake.rows.get('organizations/' + ORG)?.plan).toBe('free');
  });

  it('activates the plan on a verified SUCCESS and stamps the payment paid', async () => {
    const response = await notify({ status: 'SUCCESS', amount: 29_000 });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ applied: true, status: 'paid' });

    const payment = fake.rows.get('payments/' + INVOICE);
    expect(payment?.status).toBe('paid');
    expect(payment?.paidAt).toBeTypeOf('string');

    // The upgrade lands on the ORGANIZATION row, not on a user row.
    const org = fake.rows.get('organizations/' + ORG);
    expect(org?.plan).toBe('pro');
    // One 30-day period from the payment time.
    const expiry = new Date(String(org?.planExpiresAt)).getTime();
    const paidAt = new Date(String(payment?.paidAt)).getTime();
    expect(expiry - paidAt).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('is idempotent: a replayed SUCCESS acknowledges but never re-activates', async () => {
    await notify({ status: 'SUCCESS', amount: 29_000 });
    const orgAfterFirst = { ...fake.rows.get('organizations/' + ORG) };

    const replay = await notify({ status: 'SUCCESS', amount: 29_000 });

    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ applied: false, reason: 'duplicate' });
    // Same expiry as the first run — expiry math ran exactly once.
    expect(fake.rows.get('organizations/' + ORG)?.planExpiresAt).toBe(orgAfterFirst.planExpiresAt);
  });

  it('ignores a SUCCESS whose amount does not match the stored order', async () => {
    const response = await notify({ status: 'SUCCESS', amount: 1_000 });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ applied: false });
    // Left pending for manual review — not expired, not activated.
    expect(fake.rows.get('payments/' + INVOICE)?.status).toBe('pending');
    expect(fake.rows.get('organizations/' + ORG)?.plan).toBe('free');
  });

  it('expires a pending order on a verified EXPIRED notification', async () => {
    const response = await notify({ status: 'EXPIRED' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ applied: true, status: 'expired' });
    expect(fake.rows.get('payments/' + INVOICE)?.status).toBe('expired');
    expect(fake.rows.get('organizations/' + ORG)?.plan).toBe('free');
  });

  it('never acts on an order it did not create', async () => {
    const response = await notify({
      status: 'SUCCESS',
      invoiceNumber: 'NOTAIN-P-9-FORGED',
      amount: 29_000,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      applied: false,
      reason: 'unknown_order',
    });
    expect(fake.rows.get('organizations/' + ORG)?.plan).toBe('free');
  });

  it('records the money but resolves nothing when the organization row is gone', async () => {
    // The org was deleted between checkout and notification — a paid row is
    // real, so it stays paid and is audited, never rolled back.
    fake.rows.delete('organizations/' + ORG);

    const response = await notify({ status: 'SUCCESS', amount: 29_000 });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      applied: false,
      reason: 'org_missing',
    });
    // The money is recorded even though the upgrade needs manual resolution.
    expect(fake.rows.get('payments/' + INVOICE)?.status).toBe('paid');
  });
});
