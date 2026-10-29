import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { onRequest } from '../functions/api/invoice/[id]';
import { appwriteFake, type AppwriteFake } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

const INVOICE_ID = 'inv_01HZY6Q8W9K2M4N6P8R0S2T4V6';
/** Every invoice belongs to an organization since multi-tenancy. */
const ORG = 'org_0123456789abcdef';

const env = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

let fake: AppwriteFake;

/** The org row (which owns the plan) plus its letterhead profile row. */
function seedOrg(options: { plan?: string; planExpiresAt?: string | null } = {}): void {
  fake.rows.set('organizations/' + ORG, {
    $id: ORG,
    name: 'Kopi Senja',
    ownerId: 'user-1',
    plan: options.plan ?? 'pro',
    planExpiresAt: options.planExpiresAt ?? '2999-01-01T00:00:00.000Z',
  });
  fake.rows.set('profiles/' + ORG, {
    $id: ORG,
    name: 'Budi',
    plan: 'free',
    planExpiresAt: null,
  });
}

beforeEach(() => {
  // teamMemberships: 0 — the gate tests are about a FREE org's link; the
  // fake's default caller is on the admins team, whose owner-exemption below
  // would skip the 402 entirely.
  fake = appwriteFake({ teamMemberships: 0 });
  fake.rows.set(`invoices/${INVOICE_ID}`, {
    $id: INVOICE_ID,
    orgId: ORG,
    ownerId: 'user-1',
    invoiceNumber: 'INV-001',
    date: '2026-10-20',
    customerName: 'Budi',
    status: '',
    items: '',
    $createdAt: '2026-10-20T10:00:00.000Z',
    $updatedAt: '2026-10-20T10:00:00.000Z',
  });
  seedOrg();
});

function get(id = INVOICE_ID): Request {
  return new Request(`https://notain.pages.dev/api/invoice/${id}`);
}

function handle(request: Request): Promise<Response> {
  return (onRequest as unknown as (ctx: unknown) => Promise<Response>)({
    request,
    params: { id: new URL(request.url).pathname.split('/').pop() },
    env,
    waitUntil: () => {},
  });
}

describe('GET /api/invoice/<id> plan gate', () => {
  it('serves the invoice for an active Pro plan', async () => {
    const response = await handle(get());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { invoice: { invoiceNumber: string } };
    expect(body.invoice.invoiceNumber).toBe('INV-001');
  });

  it('answers 402 with upgrade copy for a free organization', async () => {
    seedOrg({ plan: 'free', planExpiresAt: null });

    const response = await handle(get());
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(402);
    expect(body.error).toBe('plan_required');
    // The copy a customer (and the owner testing their link) actually reads.
    expect(body.message).toContain('plan Pro');
  });

  it('answers 402 when the paid plan has expired', async () => {
    seedOrg({ plan: 'pro', planExpiresAt: '2020-01-01T00:00:00.000Z' });

    const response = await handle(get());
    expect(response.status).toBe(402);
  });

  it("serves a free org's link when its owner is on the admins team", async () => {
    seedOrg({ plan: 'free', planExpiresAt: null });
    fake.teamMemberships = 1; // the org's OWNER joins the admins team

    const response = await handle(get());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { invoice: { invoiceNumber: string } };
    expect(body.invoice.invoiceNumber).toBe('INV-001');
  });

  it('treats a missing org row as free', async () => {
    fake.rows.delete('organizations/' + ORG);

    const response = await handle(get());
    expect(response.status).toBe(402);
  });

  it('answers 402 for a legacy invoice stamped before multi-tenancy', async () => {
    // No orgId: there is no organization whose plan could possibly cover it,
    // so it must never borrow another account's.
    fake.rows.set(`invoices/${INVOICE_ID}`, {
      $id: INVOICE_ID,
      ownerId: 'user-1',
      invoiceNumber: 'INV-001',
      date: '2026-10-20',
      customerName: 'Budi',
      status: '',
      items: '',
    });

    const response = await handle(get());
    expect(response.status).toBe(402);
  });

  it('still 404s an unknown invoice before any plan talk', async () => {
    const response = await handle(get('inv_missing'));
    expect(response.status).toBe(404);
  });
});
