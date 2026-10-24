export function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Every JSON route in this app answers with private user, admin or
      // payment data (or an error about it), so none of it may land in a
      // browser or shared cache — making that the helper's default means a
      // new endpoint is safe by omission rather than by remembering one
      // header. The image routes serve public bytes through their own
      // `Response` and are unaffected; a route that genuinely wants a
      // different policy can still override it by passing the header.
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

/** Uniform error body so the client can branch on `error` instead of copy. */
export function apiError(
  status: number,
  error:
    | 'unauthenticated'
    | 'validation'
    | 'not_found'
    | 'method_not_allowed'
  | 'conflict'
  /** The caller's plan doesn't cover this resource (HTTP 402). */
  | 'plan_required'
  /** A local quota guard refused the request (HTTP 429 + `retry-after`). */
  | 'rate_limited'
  /** A downstream provider is unavailable or its breaker is open (HTTP 5xx). */
  | 'unavailable',
  message: string,
  extra: HeadersInit = {},
): Response {
  return json(status, { error, message }, extra);
}

/**
 * What a browser and a PDF renderer will happily paint.
 *
 * `sandbox` is the important one: an SVG uploaded as a logo is served from our
 * own origin, so without it a script inside it would run against the user's
 * session if anyone ever opened the file URL directly. Inside `<img>` SVG
 * scripts never run at all — this only covers the direct-navigation case.
 * Payment proofs never store SVG (the server only accepts jpeg/png/webp), but
 * they share these headers so both file routes are covered by one rule.
 */
export const IMAGE_RESPONSE_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'cross-origin-resource-policy': 'same-origin',
};
