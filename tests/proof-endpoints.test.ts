import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { onRequest as uploadOnRequest } from '../functions/api/invoice/[id]/proof';
import { onRequest as proofOnRequest } from '../functions/api/proof/[key]';
import type { Env, R2Bucket, R2Object } from '../functions/_lib/types';
import { appwriteFake, type AppwriteFake, type Row } from './appwrite-fake';

const APPWRITE_ENV = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
  TURNSTILE_SECRET_KEY: 'turnstile_test',
} as Env;
const INVOICE = 'inv_123';
const KEY = 'proofs_inv_123_abcd1234.png';

let fake: AppwriteFake;
let bucket: R2Bucket;
let objects: Map<string, StoredObject>;
let env: Env;
let etagCounter = 0;

type StoredObject = R2Object & {
  body?: unknown;
  httpMetadata?: { contentType?: string };
};

function makeBucket(): { bucket: R2Bucket; objects: Map<string, StoredObject> } {
  const stored = new Map<string, StoredObject>();
  const bucketLike = {
    head: vi.fn(async (key: string) => {
      const object = stored.get(key);
      return object ? { ...object, customMetadata: { ...object.customMetadata } } : null;
    }),
    get: vi.fn(async () => null),
    put: vi.fn(
      async (
        key: string,
        value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
        options: {
          httpMetadata?: { contentType?: string };
          customMetadata?: Record<string, string>;
          onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string };
        } = {},
      ) => {
        const current = stored.get(key);
        if (options.onlyIf?.etagDoesNotMatch === '*' && current) return null;
        if (options.onlyIf?.etagMatches && current?.etag !== options.onlyIf.etagMatches) return null;
        const size = typeof value === 'string' ? new TextEncoder().encode(value).byteLength : 3;
        const object: StoredObject = {
          key,
          size,
          etag: `etag-${++etagCounter}`,
          uploaded: new Date(),
          customMetadata: options.customMetadata ? { ...options.customMetadata } : undefined,
          httpMetadata: options.httpMetadata,
        };
        stored.set(key, object);
        return { ...object };
      },
    ),
    delete: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) stored.delete(key);
    }),
  };
  return { bucket: bucketLike as unknown as R2Bucket, objects: stored };
}

function handle(
  handler: typeof uploadOnRequest | typeof proofOnRequest,
  request: Request,
  keyOrId: string,
): Promise<Response> {
  return Promise.resolve(
    handler({
      request,
      params: handler === uploadOnRequest ? { id: keyOrId } : { key: keyOrId },
      env,
      waitUntil: () => {},
    }),
  );
}

function seedInvoice(overrides: Record<string, unknown> = {}): void {
  fake.rows.set(`invoices/${INVOICE}`, {
    $id: INVOICE,
    orgId: 'org_aaaaaaaaaaaaaaaa',
    ownerId: 'user-1',
    status: 'sent',
    paymentProofKey: null,
    paymentProofUploadedAt: null,
    ...overrides,
  } as Row);
}

function uploadRequest(): Request {
  const form = new FormData();
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'proof.png', { type: 'image/png' }));
  form.set('turnstileToken', 'valid-token');
  return new Request(`https://notain.pages.dev/api/invoice/${INVOICE}/proof`, {
    method: 'POST',
    body: form,
  });
}

function deleteRequest(): Request {
  return new Request(`https://notain.pages.dev/api/proof/${KEY}`, {
    method: 'DELETE',
    headers: { authorization: 'Bearer jwt-token' },
  });
}

beforeEach(() => {
  etagCounter = 0;
  const made = makeBucket();
  bucket = made.bucket;
  objects = made.objects;
  fake = appwriteFake({
    passthrough: (input) => {
      if (String(input).includes('/siteverify')) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    },
  });
  env = { ...APPWRITE_ENV, LOGOS: bucket } as Env;
  seedInvoice();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/invoice/<id>/proof', () => {
  it('serializes concurrent public proof uploads so only one can win', async () => {
    const [first, second] = await Promise.all([
      handle(uploadOnRequest, uploadRequest(), INVOICE),
      handle(uploadOnRequest, uploadRequest(), INVOICE),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const savedKey = fake.rows.get(`invoices/${INVOICE}`)?.paymentProofKey;
    expect(typeof savedKey).toBe('string');
    expect([...objects.keys()].filter((key) => key.startsWith('proofs_'))).toEqual([savedKey]);
  });
});

describe('DELETE /api/proof/<key>', () => {
  beforeEach(() => {
    objects.set(KEY, {
      key: KEY,
      size: 3,
      etag: 'proof-etag',
      uploaded: new Date(),
      customMetadata: { owner: 'user-1', invoice: INVOICE },
      httpMetadata: { contentType: 'image/png' },
    });
    seedInvoice({ paymentProofKey: KEY, paymentProofUploadedAt: '2026-10-01T00:00:00.000Z' });
  });

  it('keeps the proof object and invoice pointer when clearing the pointer fails', async () => {
    fake = appwriteFake({ writeFailureFor: `/collections/invoices/documents/${INVOICE}` });
    seedInvoice({ paymentProofKey: KEY, paymentProofUploadedAt: '2026-10-01T00:00:00.000Z' });

    const response = await handle(proofOnRequest, deleteRequest(), KEY);

    expect(response.status).toBe(503);
    expect(objects.has(KEY)).toBe(true);
    expect(fake.rows.get(`invoices/${INVOICE}`)?.paymentProofKey).toBe(KEY);
  });

  it('clears the invoice pointer before deleting its proof object', async () => {
    const response = await handle(proofOnRequest, deleteRequest(), KEY);

    expect(response.status).toBe(204);
    expect(objects.has(KEY)).toBe(false);
    expect(fake.rows.get(`invoices/${INVOICE}`)).toMatchObject({
      paymentProofKey: null,
      paymentProofUploadedAt: null,
    });
  });
});
