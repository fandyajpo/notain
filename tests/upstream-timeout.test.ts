import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { fetchUpstream, UPSTREAM_TIMEOUT_MS } from '../functions/_lib/http';

/**
 * Every outbound call in `functions/` goes through `fetchUpstream` (imported
 * aliased as `fetch`), so these three properties are what keep a stalled
 * Appwrite/DOKU/Turnstile round trip from pinning a request open: a deadline
 * is always attached, a hung call dies with a `TimeoutError` the existing
 * catch paths already understand, and a caller that brought its own signal
 * keeps authority over it.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchUpstream', () => {
  it('binds an abort signal to every call it makes', async () => {
    let seen: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init.signal ?? undefined;
        return new Response('{}', { status: 200 });
      }),
    );

    const response = await fetchUpstream('https://provider.test/v1/ping');

    expect(response.status).toBe(200);
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(UPSTREAM_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('abandons a hung upstream with a TimeoutError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );

    await expect(fetchUpstream('https://provider.test/v1/hang', {}, 20)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('keeps an explicitly supplied signal in charge', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init.signal ?? undefined;
        return new Response('{}', { status: 200 });
      }),
    );

    await fetchUpstream('https://provider.test/v1/ping', { signal: controller.signal });

    expect(seen).toBe(controller.signal);
  });
});
