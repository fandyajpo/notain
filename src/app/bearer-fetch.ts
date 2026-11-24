import { mintJwt } from '../appwrite/client';
import { AppError, ERROR_CODES } from '../core/shared/errors';

/**
 * A request to one of this app's own `/api/*` routes, carrying the caller's
 * Appwrite session.
 *
 * The browser never sends a cookie to a Function — it mints a short-lived JWT
 * (`mintJwt`) and sends it as a bearer, which is what `verifySession` on the
 * server reads back. Two failure modes are mapped here, once, so every caller
 * sees the same copy:
 *
 * - minting failed → the session is gone (`UNAUTHENTICATED`), which the global
 *   session-expiry handler already knows how to act on;
 * - the request never left the device → `NETWORK`, retryable.
 *
 * Everything below `fetch` is the caller's business: this returns the raw
 * `Response` so each endpoint can read its own body and error copy.
 */
export type BearerRequest = {
  /** Defaults to `POST` when a body is given, `GET` otherwise. */
  method?: string;
  /** Serialised as JSON when present. */
  body?: unknown;
  /**
   * Let the request outlive the page. Set on the calls nobody waits for that sit
   * immediately before a redirect — without it the browser may abort the request
   * as the document is torn down, and the work silently never happens.
   */
  keepalive?: boolean;
};

export async function bearerFetch(path: string, init: BearerRequest = {}): Promise<Response> {
  let jwt: string;
  try {
    jwt = await mintJwt();
  } catch (error) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Silakan masuk terlebih dahulu.', {
      cause: error,
    });
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${jwt}` };
  const request: RequestInit = {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(init.keepalive ? { keepalive: true } : {}),
  };
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    request.body = JSON.stringify(init.body);
  }

  try {
    return await fetch(path, request);
  } catch {
    throw new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
    );
  }
}
