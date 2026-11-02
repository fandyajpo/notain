import { apiError, fetchUpstream } from '../../_lib/http';
import type { Env, PagesFunction } from '../../_lib/types';

/**
 * `ALL /api/appwrite/*` — same-origin proxy in front of Appwrite's REST API.
 *
 * Why this exists: Appwrite's SDK authenticates with a cookie
 * (`a_session_<project>`) that the server sets for **its own** domain. When the
 * browser is on this origin, that cookie is third-party, and every browser that
 * blocks third-party cookies by default (Brave Shields, Safari ITP, Firefox
 * ETP) silently drops it — the sign-in succeeds server-side, the next
 * `account.get()` goes out without a session, and the app bounces straight back
 * to `/login`. The official Appwrite answer for a browser app is to put the API
 * on a custom domain so the cookie is first-party; for a static site with
 * Pages Functions that is this proxy.
 *
 * It is deliberately a transparent relay, not an authorization layer: it adds
 * no API key and makes no decisions, it only moves the browser's own session
 * cookie onto a first-party origin. Every rule below exists to keep the relay
 * *invisible* — the SDK must see the exact status, body and headers it would
 * have seen talking to Appwrite directly (minus the cross-site cookie domain).
 */

/** Request path this function answers; the rest is Appwrite's own path. */
const PREFIX = '/api/appwrite';

/** Default from `src/appwrite/config.ts`, used when `[vars]` is absent (tests). */
const DEFAULT_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';

/**
 * Headers that describe *this* hop, not the request: forwarding them would
 * either break the subrequest or describe the wrong client.
 *
 * - `host` must be Appwrite's, and `fetch` derives it from the URL.
 * - Hop-by-hop headers (`connection`, `te`, `trailer`, `transfer-encoding`,
 *   `upgrade`, keep-alive, proxy-*) belong to one connection and must not be
 *   forwarded by a proxy.
 * - `content-length` is recomputed from the body we actually send.
 * - `accept-encoding` is dropped so the upstream answers identity-encoded: the
 *   body is buffered and the compression headers stripped below, and this way
 *   there is never a disagreement about whether those bytes are encoded.
 * - `origin`/`referer` are dropped so Appwrite treats the call exactly like the
 *   server-side SDKs do (no browser CORS origin checks), which is what makes it
 *   behave the same from localhost, a preview deploy and production.
 * - `cf-*` / `x-forwarded-*` are set by the runtime for the real client; a
 *   stale copy from the browser would only misdescribe this hop.
 */
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'accept-encoding',
  'origin',
  'referer',
]);

/** Same hop-by-hop set, on the way back. */
const STRIPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
]);

/** Methods whose requests never carry a body. */
const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

/**
 * Appwrite marks its session cookie `Domain=.sgp.cloud.appwrite.io`. A browser
 * on our origin rejects a cookie for a domain it is not on, so — with or
 * without third-party cookie blocking — the session would be dropped at the
 * door. Removing the attribute makes the cookie host-only for the origin that
 * actually received it. Everything else (HttpOnly, Secure, SameSite, path,
 * expiry) is left exactly as Appwrite sent it.
 */
function hostOnlyCookie(cookie: string): string {
  return cookie.replace(/;\s*domain=[^;]*/gi, '');
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const endpoint = (env.PUBLIC_APPWRITE_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/+$/, '');
  const incoming = new URL(request.url);
  const appwritePath = incoming.pathname.startsWith(PREFIX)
    ? incoming.pathname.slice(PREFIX.length)
    : incoming.pathname;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (
      STRIPPED_REQUEST_HEADERS.has(key) ||
      key.startsWith('cf-') ||
      key.startsWith('x-forwarded-')
    ) {
      return;
    }
    headers.set(key, value);
  });

  const body = BODYLESS_METHODS.has(request.method.toUpperCase())
    ? undefined
    : await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetchUpstream(`${endpoint}${appwritePath}${incoming.search}`, {
      method: request.method,
      headers,
      body,
      // A redirect from Appwrite (the OAuth token endpoint is one) must reach
      // the browser as a redirect; following it here would swallow the hop.
      redirect: 'manual',
    });
  } catch {
    return apiError(502, 'unavailable', 'Server tidak dapat dihubungi. Coba lagi.');
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (STRIPPED_RESPONSE_HEADERS.has(key) || key === 'set-cookie') return;
    responseHeaders.set(key, value);
  });

  // `set-cookie` is the one header that may repeat, and it cannot survive the
  // usual `Headers` round-trip (iteration joins the values with ", " and the
  // comma inside an `Expires` date makes the result unparsable). Appwrite sends
  // two on session creation, so they are read and re-appended one by one.
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', hostOnlyCookie(cookie));
  }

  // Session-bearing JSON: never let a browser or the edge reuse it. Appwrite's
  // own caching headers are not a policy we want to inherit for an auth proxy.
  responseHeaders.set('cache-control', 'no-store');

  const emptyBody = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
  const payload = emptyBody ? null : await upstream.arrayBuffer();

  return new Response(payload, { status: upstream.status, headers: responseHeaders });
};
