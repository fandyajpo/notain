/**
 * Redirect targets for the auth flow.
 *
 * `?next=` is attacker-controllable, so it is treated as untrusted input: it is
 * only ever allowed to be a same-origin absolute path. Anything else silently
 * falls back to the default rather than being rejected loudly, because a bad
 * redirect should never block signing in.
 */

export const DEFAULT_REDIRECT = '/dashboard';

/**
 * Accepts only a same-origin absolute path.
 *
 * `//evil.com` and `/\evil.com` are the two that matter: browsers treat both
 * as protocol-relative URLs and leave the origin entirely, yet both "look"
 * relative to a naive `startsWith('/')` check. Backslashes are rejected
 * outright because browsers normalise them to forward slashes in URLs.
 */
export function isSafeRedirectPath(value: string): boolean {
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  if (value.includes('\\')) return false;
  return true;
}

/**
 * Reads `?next=` from a location search string, falling back when it is
 * absent, malformed, or points somewhere unsafe.
 *
 * Must be called on the client: `login.astro` and `register.astro` are
 * statically prerendered, so `Astro.url.searchParams` is empty at build time
 * and bakes `/dashboard` into the island props regardless of the real query.
 */
export function resolveRedirectTarget(search: string, fallback: string = DEFAULT_REDIRECT): string {
  const raw = new URLSearchParams(search).get('next');
  if (raw === null) return fallback;
  const value = raw.trim();
  if (!isSafeRedirectPath(value)) return fallback;
  return value;
}

/**
 * True when the target is the page we are already on. Following it would
 * reload the page with the same query and redirect again, forever.
 */
export function isSelfRedirect(target: string, currentPathname: string): boolean {
  try {
    // Same-origin base: `target` is already known to be a path.
    return new URL(target, 'https://notain.invalid').pathname === currentPathname;
  } catch {
    return true;
  }
}
