import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { onRequest } from '../functions/api/appwrite/[[path]]';
import type { Env } from '../functions/_lib/types';

/**
 * The Appwrite proxy is the whole reason the browser SDK no longer loses its
 * session: Appwrite's cookie is scoped to its own domain, and a browser that
 * blocks third-party cookies drops it. These tests pin the two rules that make
 * the relay invisible — the request is forwarded faithfully, and the
 * `Set-Cookie` headers come back host-only instead of Appwrite-scoped — plus
 * the failure path, so a broken upstream cannot surface as a hang.
 */

const ENV = {
  PUBLIC_APPWRITE_ENDPOINT: 'https://appwrite.test/v1',
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
} as Env;

function call(path: string, init?: RequestInit): Promise<Response> {
  return onRequest({
    request: new Request(`https://notain.test/api/appwrite${path}`, init),
    params: {},
    env: ENV,
    waitUntil: () => {},
  }) as Promise<Response>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('appwrite proxy', () => {
  it('forwards the Appwrite path, query and method', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await call('/account/sessions/email?x=1', { method: 'POST', body: '{}' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://appwrite.test/v1/account/sessions/email?x=1');
    expect(init.method).toBe('POST');
    expect(await new Response(init.body as ArrayBuffer).text()).toBe('{}');
  });

  it('keeps the session cookie but drops origin and hop-by-hop headers', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await call('/account', {
      headers: {
        cookie: 'a_session_proj_test=abc',
        origin: 'https://notain.test',
        'x-fallback-cookies': '{"a_session_proj_test":"abc"}',
      },
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('cookie')).toBe('a_session_proj_test=abc');
    expect(headers.get('x-fallback-cookies')).toBe('{"a_session_proj_test":"abc"}');
    expect(headers.get('origin')).toBeNull();
    expect(headers.get('host')).toBeNull();
  });

  it('rewrites every Set-Cookie to be host-only and keeps both of them', async () => {
    const session =
      'a_session_proj_test=abc; expires=Wed, 21 Oct 2026 07:28:00 GMT; path=/; domain=.appwrite.test; secure; HttpOnly; SameSite=None';
    const legacy =
      'a_session_proj_test_legacy=abc; expires=Wed, 21 Oct 2026 07:28:00 GMT; path=/; domain=.appwrite.test; HttpOnly';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const headers = new Headers();
        headers.append('set-cookie', session);
        headers.append('set-cookie', legacy);
        return new Response('{}', { status: 201, headers });
      }),
    );

    const response = await call('/account/sessions/email', { method: 'POST', body: '{}' });
    const cookies = response.headers.getSetCookie();

    expect(response.status).toBe(201);
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).not.toMatch(/domain=/i);
    }
    // Non-domain attributes survive untouched.
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('expires=Wed, 21 Oct 2026 07:28:00 GMT');
  });

  it('does not let a session response be cached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}')),
    );

    const response = await call('/account');

    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('passes an empty body through for 204s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    const response = await call('/account/sessions/current', { method: 'DELETE' });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('turns an unreachable upstream into a JSON 502 instead of hanging', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );

    const response = await call('/account');

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'unavailable' });
  });
});
