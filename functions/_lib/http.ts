export function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/** Uniform error body so the client can branch on `error` instead of copy. */
export function apiError(
  status: number,
  error: 'unauthenticated' | 'validation' | 'not_found' | 'method_not_allowed',
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
 */
export const LOGO_RESPONSE_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'cross-origin-resource-policy': 'same-origin',
};
