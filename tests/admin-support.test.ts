import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { onRequest } from '../functions/api/admin/support';
import { onRequest as onPatch } from '../functions/api/admin/support/[id]';
import { appwriteFake, type AppwriteFake, type Row } from './appwrite-fake';
import type { Env, PagesFunction } from '../functions/_lib/types';

const PATH = '/api/admin/support';

const env = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

let fake: AppwriteFake;

beforeEach(() => {
  fake = appwriteFake();
});

function seedSupport(id: string, data: Record<string, unknown>): void {
  const row = { $id: id, ...data } as Row;
  fake.rows.set(`support/${id}`, row);
  fake.lists.set('support', [...(fake.lists.get('support') ?? []), row]);
}

function get(query = ''): Request {
  return new Request('https://notain.pages.dev' + PATH + query, {
    headers: { authorization: 'Bearer jwt-token' },
  });
}

function patch(id: string, body: unknown): Request {
  return new Request(`https://notain.pages.dev${PATH}/${id}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer jwt-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function handle(
  request: Request,
  handler: PagesFunction<Env>,
  params: Record<string, string> = {},
): Promise<Response> {
  return (handler as unknown as (ctx: unknown) => Promise<Response>)({
    request,
    params,
    env,
    waitUntil: () => {},
  });
}

/** Document writes the handler made against one collection, in order. */
function writes(table: string): Array<{ method: string; data?: Record<string, unknown> }> {
  return fake.calls
    .filter(
      (call) =>
        (call.method === 'POST' || call.method === 'PATCH') &&
        call.url.includes(`/collections/${table}/documents`),
    )
    .map((call) => ({
      method: call.method,
      data: (call.body as { data?: Record<string, unknown> })?.data,
    }));
}

describe('GET /api/admin/support', () => {
  it('refuses a caller who is not on the admins team', async () => {
    fake.teamMemberships = 0;
    const response = await handle(get(), onRequest);
    expect(response.status).toBe(403);
  });

  it('lists messages newest-first with solve state', async () => {
    seedSupport('msg-2', {
      name: 'Siti',
      email: 'siti@example.com',
      subject: 'Bug print',
      message: 'Tombol print tidak muncul.',
      source: 'contact',
      createdAt: '2026-10-21T08:00:00.000Z',
      solvedAt: '2026-10-21T09:00:00.000Z',
      solvedBy: 'admin@example.com',
    });
    seedSupport('msg-1', {
      name: 'Budi',
      email: 'budi@example.com',
      subject: 'Minta fitur',
      message: 'Tolong tambah kolom tanda tangan.',
      source: 'landing',
      createdAt: '2026-10-20T08:00:00.000Z',
    });

    const response = await handle(get(), onRequest);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      rows: Array<{
        id: string;
        name: string;
        email: string;
        subject: string;
        message: string;
        source: string;
        createdAt: string;
        solvedAt: string | null;
        solvedBy: string | null;
      }>;
      total: number;
      nextCursor: string | null;
    };

    expect(body.total).toBe(2);
    expect(body.rows.map((row) => row.id)).toEqual(['msg-2', 'msg-1']);
    expect(body.rows[0]).toMatchObject({
      name: 'Siti',
      email: 'siti@example.com',
      subject: 'Bug print',
      solvedAt: '2026-10-21T09:00:00.000Z',
      solvedBy: 'admin@example.com',
    });
    expect(body.rows[1]?.solvedAt).toBeNull();
    expect(body.rows[1]?.solvedBy).toBeNull();
  });

  it('answers an empty page when no message exists', async () => {
    const response = await handle(get(), onRequest);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ rows: [], total: 0, nextCursor: null });
  });
});

describe('PATCH /api/admin/support/[id]', () => {
  it('refuses a caller who is not on the admins team', async () => {
    fake.teamMemberships = 0;
    const response = await handle(patch('msg-1', { solved: true }), onPatch, { id: 'msg-1' });
    expect(response.status).toBe(403);
  });

  it('requires a boolean solved flag', async () => {
    const response = await handle(patch('msg-1', { solved: 'yes' }), onPatch, { id: 'msg-1' });
    expect(response.status).toBe(400);
  });

  it('stamps solvedAt and the solving admin, and audits the action', async () => {
    seedSupport('msg-1', {
      name: 'Budi',
      email: 'budi@example.com',
      subject: 'Minta fitur',
      message: 'Tolong tambah kolom tanda tangan.',
      source: 'landing',
      createdAt: '2026-10-20T08:00:00.000Z',
    });

    const response = await handle(patch('msg-1', { solved: true }), onPatch, { id: 'msg-1' });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; solvedAt: string | null };
    expect(body.success).toBe(true);
    expect(body.solvedAt).not.toBeNull();

    const patched = writes('support').find((call) => call.method === 'PATCH');
    expect(patched?.data).toMatchObject({ solvedBy: 'budi@example.com' });
    expect(typeof patched?.data?.solvedAt).toBe('string');

    expect(writes('audit_logs')).toEqual([
      {
        method: 'POST',
        data: expect.objectContaining({
          action: 'support.solve',
          targetType: 'support',
          targetId: 'msg-1',
        }),
      },
    ]);
  });

  it('clears the stamp when reopened', async () => {
    seedSupport('msg-1', {
      name: 'Budi',
      email: 'budi@example.com',
      subject: 'Minta fitur',
      message: 'Tolong tambah kolom tanda tangan.',
      source: 'landing',
      createdAt: '2026-10-20T08:00:00.000Z',
      solvedAt: '2026-10-21T09:00:00.000Z',
      solvedBy: 'admin@example.com',
    });

    const response = await handle(patch('msg-1', { solved: false }), onPatch, { id: 'msg-1' });
    expect(response.status).toBe(200);

    const patched = writes('support').find((call) => call.method === 'PATCH');
    expect(patched?.data).toEqual({ solvedAt: null, solvedBy: null });
    expect(writes('audit_logs')[0]?.data).toMatchObject({ action: 'support.reopen' });
  });

  it('answers 404 for an unknown message', async () => {
    const response = await handle(patch('missing', { solved: true }), onPatch, { id: 'missing' });
    expect(response.status).toBe(404);
  });
});
