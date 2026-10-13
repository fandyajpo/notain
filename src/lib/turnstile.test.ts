import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from './turnstile';

function mockFetch(status: number, body?: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body ?? {}), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyTurnstile', () => {
  it('rejects a missing token without calling the endpoint', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyTurnstile(null)).resolves.toBe('fail');
    await expect(verifyTurnstile('')).resolves.toBe('fail');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports ok when Cloudflare accepts the token', async () => {
    mockFetch(200, { success: true });
    await expect(verifyTurnstile('tok')).resolves.toBe('ok');
  });

  it('reports fail when Cloudflare rejects the token', async () => {
    mockFetch(200, { success: false, 'error-codes': ['invalid-input-response'] });
    await expect(verifyTurnstile('tok')).resolves.toBe('fail');
  });

  it('reports unavailable on 404 so an undeployed Function does not lock dev out', async () => {
    mockFetch(404);
    await expect(verifyTurnstile('tok')).resolves.toBe('unavailable');
  });

  it('reports fail on a server error', async () => {
    mockFetch(500);
    await expect(verifyTurnstile('tok')).resolves.toBe('fail');
  });

  it('reports fail when the response is not readable JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { status: 200 })),
    );
    await expect(verifyTurnstile('tok')).resolves.toBe('fail');
  });

  it('reports fail when the network call throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(verifyTurnstile('tok')).resolves.toBe('fail');
  });
});
