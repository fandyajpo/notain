import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { onRequest } from '../functions/api/admin/content';
import { appwriteFake, type AppwriteFake, type Row } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';
import { draftToRowData } from '../src/appwrite/mappers';
import { invoiceContentFingerprint } from '../src/core/invoice/fingerprint';
import type { InvoiceDraft } from '../src/core/invoice/model';

const PATH = '/api/admin/content';
const YEAR = new Date().getFullYear();

const env = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

const baseDraft: InvoiceDraft = {
  invoiceNumber: `INV-${YEAR}-001`,
  date: '2026-10-01',
  dueDate: '2026-10-15',
  templateId: 'tpl-1',
  status: 'sent',
  customerName: 'Budi',
  customerPhone: '081234567890',
  customerEmail: 'budi@example.com',
  items: [{ id: 'i1', name: 'Apel', quantity: 2, unitPrice: 10_000 }],
  details: {},
  discount: { type: 'amount', value: 0 },
  tax: { type: 'percent', value: 11 },
  sections: { header: '', content: '', footer: '' },
  notes: 'Terima kasih.',
};

let fake: AppwriteFake;

beforeEach(() => {
  fake = appwriteFake();
});

function seedInvoice(draft: InvoiceDraft, id = 'inv-1'): void {
  const row = {
    $id: id,
    $createdAt: '2026-10-01T00:00:00.000Z',
    $updatedAt: '2026-10-02T00:00:00.000Z',
    ownerId: 'user-1',
    ...draftToRowData(draft),
  } as Row;
  fake.rows.set(`invoices/${id}`, row);
  // The duplicate-number check queries the collection, which the fake serves
  // from `lists`; the by-id map alone would answer the write half only.
  fake.lists.set('invoices', [row]);
}

function seedTemplate(id = 'tpl-1'): void {
  fake.rows.set(`templates/${id}`, {
    $id: id,
    $createdAt: '2026-10-01T00:00:00.000Z',
    $updatedAt: '2026-10-02T00:00:00.000Z',
    ownerId: 'user-1',
    name: 'Kop Resmi',
    layout: '[]',
    theme: '{}',
    headerHtml: null,
    contentHtml: null,
    footerHtml: null,
    notes: null,
  } as Row);
}

function post(body: unknown): Request {
  return new Request('https://notain.pages.dev' + PATH, {
    method: 'POST',
    headers: { authorization: 'Bearer jwt-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function get(query: string): Request {
  return new Request('https://notain.pages.dev' + PATH + query, {
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

/** Writes the handler made against one collection, in order. */
function writes(table: string): Array<{ method: string; data?: Record<string, unknown> }> {
  return fake.calls
    .filter(
      (call) =>
        (call.method === 'POST' || call.method === 'PATCH' || call.method === 'DELETE') &&
        call.url.includes(`/collections/${table}/documents`),
    )
    .map((call) => ({
      method: call.method,
      data: (call.body as { data?: Record<string, unknown> })?.data,
    }));
}

describe('GET /api/admin/content', () => {
  it('refuses a caller who is not on the admins team', async () => {
    fake.teamMemberships = 0;

    const response = await handle(get('?userId=user-1&resource=invoices'));

    expect(response.status).toBe(403);
  });

  it('answers the next free invoice number from the rows that exist', async () => {
    fake.lists.set('invoices', [
      { $id: 'a', ownerId: 'user-1', invoiceNumber: `INV-${YEAR}-001` },
      { $id: 'b', ownerId: 'user-1', invoiceNumber: `INV-${YEAR}-003` },
    ] as Row[]);

    const response = await handle(get('?userId=user-1&resource=invoices&nextNumber=1'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ invoiceNumber: `INV-${YEAR}-004` });
  });
});

describe('POST /api/admin/content — invoices', () => {
  it('refuses an update whose content hash is stale, without writing', async () => {
    seedInvoice(baseDraft);
    // The dialog hashed this older version of the content; the row has moved
    // on since (the owner's own builder save, a second admin tab).
    const stale = await invoiceContentFingerprint({ ...baseDraft, customerName: 'Versi lama' });

    const response = await handle(
      post({
        userId: 'user-1',
        resource: 'invoices',
        action: 'update',
        rowId: 'inv-1',
        draft: { ...baseDraft, customerName: 'Baru' },
        expectedContentHash: stale,
      }),
    );

    expect(response.status).toBe(409);
    expect(writes('invoices')).toEqual([]);
  });

  it('saves an update whose hash is fresh, without touching status', async () => {
    seedInvoice(baseDraft);
    const fresh = await invoiceContentFingerprint(baseDraft);

    const response = await handle(
      post({
        userId: 'user-1',
        resource: 'invoices',
        action: 'update',
        rowId: 'inv-1',
        draft: { ...baseDraft, customerName: 'Sudah Diperbarui' },
        expectedContentHash: fresh,
      }),
    );

    expect(response.status).toBe(200);
    const patches = writes('invoices');
    expect(patches).toHaveLength(1);
    expect(patches[0]?.method).toBe('PATCH');
    // The lifecycle column is structurally absent from a content save.
    expect(patches[0]?.data).not.toHaveProperty('status');
    expect(patches[0]?.data?.customerName).toBe('Sudah Diperbarui');
  });

  it('refuses a create whose number is already taken', async () => {
    seedInvoice(baseDraft);

    const response = await handle(
      post({ userId: 'user-1', resource: 'invoices', action: 'create', draft: baseDraft }),
    );

    expect(response.status).toBe(409);
    expect(writes('invoices')).toEqual([]);
  });

  it('lets exactly one of two dialogs racing the same number win', async () => {
    // Nothing is seeded: the fast-path check is blind to both calls, exactly
    // like two admin tabs that opened on the same suggestion. What stops the
    // duplicate is the deterministic document id — Appwrite refuses the
    // second explicit id, and the endpoint must surface that as a 409 rather
    // than a 500 or a silent overwrite.
    const first = await handle(
      post({ userId: 'user-1', resource: 'invoices', action: 'create', draft: baseDraft }),
    );
    const second = await handle(
      post({ userId: 'user-1', resource: 'invoices', action: 'create', draft: baseDraft }),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      error: 'conflict',
      message: 'Nomor invoice ini sudah dipakai. Gunakan nomor lain.',
    });
  });

  it('refuses a write for a user that does not exist', async () => {
    const response = await handle(
      post({ userId: 'ghost', resource: 'invoices', action: 'create', draft: baseDraft }),
    );

    expect(response.status).toBe(404);
    expect(writes('invoices')).toEqual([]);
  });
});

describe('POST /api/admin/content — templates', () => {
  it('refuses a save whose expectedUpdatedAt is stale, without writing', async () => {
    seedTemplate();

    const response = await handle(
      post({
        userId: 'user-1',
        resource: 'templates',
        action: 'update',
        rowId: 'tpl-1',
        template: { name: 'Baru', layout: [], theme: {}, defaults: {}, businessType: null },
        expectedUpdatedAt: '2026-10-01T00:00:00.000Z',
      }),
    );

    expect(response.status).toBe(409);
    expect(writes('templates')).toEqual([]);
  });
});
