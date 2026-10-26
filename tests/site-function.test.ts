import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { onRequest } from '../functions/api/site/[id]';
import { appwriteFake, type AppwriteFake } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

const ORG_ID = 'org_0123456789abcdef';

const env = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

let fake: AppwriteFake;

beforeEach(() => {
  fake = appwriteFake();
  fake.rows.set(`profiles/${ORG_ID}`, {
    $id: ORG_ID,
    name: 'Fandy Ahmad',
    businessName: 'Warung Uji Coba',
    phone: '081234567890',
    address: 'Jl. Melati No. 12, Bandung',
    email: 'halo@ujicoba.test',
    logoFileId: 'logo-key-1',
    businessType: 'warung-makan',
    plan: 'free',
    planExpiresAt: null,
  });
  fake.lists.set('catalog', [
    {
      $id: 'cat-nasi',
      orgId: ORG_ID,
      name: 'Nasi Goreng',
      kind: 'barang',
      unit: 'porsi',
      unitPrice: 25_000,
      lastUsedAt: '2026-10-01T00:00:00.000Z',
    },
    {
      $id: 'cat-es',
      orgId: ORG_ID,
      name: 'Es Teh',
      kind: 'barang',
      unit: 'gelas',
      unitPrice: 0,
      lastUsedAt: '2026-10-02T00:00:00.000Z',
    },
    {
      $id: 'cat-kirim',
      orgId: ORG_ID,
      name: 'Jasa Antar',
      kind: 'jasa',
      unit: null,
      unitPrice: 10_000,
      lastUsedAt: '2026-10-03T00:00:00.000Z',
    },
    // Another tenant's row: the org filter must never surface it here.
    {
      $id: 'cat-asing',
      orgId: 'org_ffffffffffffffff',
      name: 'Makanan Asing',
      kind: 'barang',
      unit: null,
      unitPrice: 99_000,
      lastUsedAt: '2026-10-04T00:00:00.000Z',
    },
  ]);
});

function get(id = ORG_ID): Request {
  return new Request(`https://notain.pages.dev/api/site/${id}`);
}

function handle(request: Request): Promise<Response> {
  return (onRequest as unknown as (ctx: unknown) => Promise<Response>)({
    request,
    params: { id: decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? '') },
    env,
    waitUntil: () => {},
  });
}

describe('GET /api/site/<orgId>', () => {
  it('answers with the publishable profile view and the catalog', async () => {
    const response = await handle(get());

    expect(response.status).toBe(200);
    // The owner edits this data and re-checks the page: never cacheable.
    expect(response.headers.get('cache-control')).toBe('no-store');

    const body = (await response.json()) as {
      site: Record<string, unknown>;
      items: Array<Record<string, unknown>>;
    };
    expect(body.site).toEqual({
      businessName: 'Warung Uji Coba',
      ownerName: 'Fandy Ahmad',
      phone: '081234567890',
      address: 'Jl. Melati No. 12, Bandung',
      email: 'halo@ujicoba.test',
      businessType: 'warung-makan',
      logoUrl: '/api/logo/logo-key-1',
    });
    // Deterministic display order, `unit` omitted when the row has none —
    // and only this org's rows: the foreign catalog row above is absent.
    expect(body.items.map((item) => item.name)).toEqual(['Es Teh', 'Jasa Antar', 'Nasi Goreng']);
    expect(body.items.find((item) => item.name === 'Jasa Antar')).not.toHaveProperty('unit');
    // A zero price is "never configured", not a number the client must show.
    expect(body.items.find((item) => item.name === 'Es Teh')?.unitPrice).toBe(0);
  });

  it('never leaks internal profile fields', async () => {
    const response = await handle(get());
    const raw = JSON.stringify(await response.json());

    // No plan state, no raw R2 object id, no row id echoed back.
    expect(raw).not.toContain('plan');
    expect(raw).not.toContain('logoFileId');
    expect(raw).not.toContain('ownerId');
    expect(raw).not.toContain('orgId');
    expect(raw).not.toContain(ORG_ID);
  });

  it('serves a profile with only the required name (everything else optional)', async () => {
    fake.rows.set(`profiles/${ORG_ID}`, {
      $id: ORG_ID,
      name: '',
      businessName: 'Toko Minim',
      phone: '',
      address: null,
      email: null,
      logoFileId: null,
      businessType: null,
      plan: 'free',
      planExpiresAt: null,
    });
    fake.lists.set('catalog', []);

    const response = await handle(get());
    const body = (await response.json()) as { site: Record<string, unknown>; items: unknown[] };

    expect(response.status).toBe(200);
    expect(body.site).toEqual({
      businessName: 'Toko Minim',
      ownerName: '',
      businessType: null,
    });
    // An empty catalog is a valid page, not an error: sections hide client-side.
    expect(body.items).toEqual([]);
  });

  it('404s a profile that never named a business', async () => {
    fake.rows.set(`profiles/${ORG_ID}`, {
      $id: ORG_ID,
      name: 'Fandy',
      businessName: null,
      phone: '',
      address: null,
      email: null,
      logoFileId: null,
      plan: 'free',
      planExpiresAt: null,
    });

    const response = await handle(get());
    expect(response.status).toBe(404);
  });

  it('404s an unknown org id', async () => {
    const response = await handle(get('user_tidak_ada'));
    expect(response.status).toBe(404);
  });

  it('404s an id that is not one clean path segment', async () => {
    const response = await handle(get('bukan.id.legal'));
    expect(response.status).toBe(404);
  });

  it('405s non-GET methods', async () => {
    const response = await handle(
      new Request(`https://notain.pages.dev/api/site/${ORG_ID}`, { method: 'POST' }),
    );
    expect(response.status).toBe(405);
  });

  it('rate-limits a flood per IP once the window is full', async () => {
    const flood = Array.from({ length: 60 }, () => handle(get()));
    const allowed = await Promise.all(flood);
    expect(allowed.every((response) => response.status === 200)).toBe(true);

    const over = await handle(get());
    expect(over.status).toBe(429);
    expect(over.headers.get('retry-after')).toBeTruthy();
  });
});
