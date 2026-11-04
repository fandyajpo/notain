import { container } from '../infra/container';
import { toAppError } from '../app/errors';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { DEFAULT_REDIRECT, isSafeRedirectPath, isSelfRedirect } from '../lib/redirect';
import type {
  CredentialsWithEmail,
  OAuthCompletion,
  OAuthRedirects,
  RecoveryCompletion,
  SessionUser,
  SignUpInput,
} from '../ports/auth-repository';
import { forgetSession, rememberSession } from './session';

export async function signIn(input: CredentialsWithEmail): Promise<SessionUser> {
  const user = await container.auth.signIn(input);
  return rememberSession(user);
}

export async function signUp(input: SignUpInput): Promise<SessionUser> {
  const user = await container.auth.signUp(input);
  return rememberSession(user);
}

export async function signOut(): Promise<void> {
  try {
    await container.auth.signOut();
  } catch (error) {
    // A blocked account cannot end its own session server-side — Appwrite
    // rejects every request from it — and an already-gone session is a
    // no-op. Both are fine to sign out of locally; anything else keeps the
    // local session so the user does not silently "log out" over a blip.
    const code = toAppError(error).code;
    if (code !== ERROR_CODES.UNAUTHENTICATED && code !== ERROR_CODES.SUSPENDED) throw error;
  }
  forgetSession();
}

/** Emails the reset link. Never reveals whether the email is registered. */
export async function createRecovery(email: string): Promise<void> {
  await container.auth.createRecovery(email.trim());
}

/** Applies the new password from the emailed link's `userId`/`secret`. */
export async function completeRecovery(input: RecoveryCompletion): Promise<void> {
  await container.auth.completeRecovery(input);
}

/**
 * Cookies that carry one OAuth round trip (Google, Discord). Both are
 * short-lived and scoped to the whole site; they exist only between the click
 * and the callback page.
 *
 * `next` is kept here rather than in the success URL's query string because
 * Appwrite appends its own `userId`/`secret`/`state` to that URL, and a query
 * string it has to merge is one more thing that can come out malformed.
 */
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_NEXT_COOKIE = 'oauth_next';
/** A stale round trip should die on its own; ten minutes is generous. */
const OAUTH_FLOW_MAX_AGE_SECONDS = 600;

/** One cookie write. `secure` is omitted on plain http (local dev) only. */
function writeFlowCookie(name: string, value: string): void {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${OAUTH_FLOW_MAX_AGE_SECONDS}; samesite=lax${secure}`;
}

function clearFlowCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

function readFlowCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const entry of document.cookie.split('; ')) {
    if (!entry.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(entry.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Unguessable-enough CSRF nonce for one round trip. Appwrite caps `state` at
 * 256 printable ASCII characters; 32 hex characters is comfortably inside it.
 */
function createOAuthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Kicks off an OAuth round trip ("Masuk dengan Google" / "Masuk dengan
 * Discord") — a full-page hop to the provider, so this returns the moment the
 * browser starts leaving, not with a session.
 *
 * The landing page is `/auth/callback`, not the target: Appwrite's token flow
 * redirects back with `userId`/`secret` rather than a session, and something
 * has to trade those in. The target the user was heading for, and a `state`
 * nonce proving this tab started the round trip, travel in short-lived same-site
 * cookies. `failure` still drops straight on the login page tagged
 * `<provider>_fail=1` — there is nothing to exchange when the provider refused,
 * and the login form surfaces the notice.
 */
function startOAuthFlow(
  start: (redirects: OAuthRedirects) => void,
  redirectTo: string,
  failParam: string,
): void {
  const origin = window.location.origin;
  const target = isSelfRedirect(redirectTo, window.location.pathname)
    ? DEFAULT_REDIRECT
    : redirectTo;
  const state = createOAuthState();
  writeFlowCookie(OAUTH_STATE_COOKIE, state);
  writeFlowCookie(OAUTH_NEXT_COOKIE, target);
  start({
    success: `${origin}/auth/callback`,
    failure: `${origin}/login?${failParam}=1`,
    state,
  });
}

export function signInWithGoogle(redirectTo: string): void {
  startOAuthFlow(
    (redirects) => container.auth.startGoogleOAuth(redirects),
    redirectTo,
    'google_fail',
  );
}

export function signInWithDiscord(redirectTo: string): void {
  startOAuthFlow(
    (redirects) => container.auth.startDiscordOAuth(redirects),
    redirectTo,
    'discord_fail',
  );
}

/**
 * Finishes an OAuth round trip (Google or Discord) on `/auth/callback` and
 * returns where to go.
 *
 * `state` is checked against the cookie this tab wrote before the hop: without
 * that check a link carrying someone else's `userId`/`secret` would silently
 * sign the visitor into the attacker's account (login CSRF). The cookies are
 * cleared either way — a round trip is single-use.
 *
 * On success the session is remembered and the stored target is returned, after
 * the same same-origin check `?next=` gets; a tampered cookie falls back to the
 * dashboard rather than redirecting off-site.
 */
export async function completeOAuth(
  completion: OAuthCompletion & { state: string },
): Promise<string> {
  const expected = readFlowCookie(OAUTH_STATE_COOKIE);
  const storedTarget = readFlowCookie(OAUTH_NEXT_COOKIE);
  clearFlowCookie(OAUTH_STATE_COOKIE);
  clearFlowCookie(OAUTH_NEXT_COOKIE);

  if (!expected || completion.state !== expected) {
    throw new AppError(
      ERROR_CODES.UNAUTHENTICATED,
      'Tautan masuk tidak valid atau sudah kedaluwarsa. Coba lagi dari halaman masuk.',
    );
  }

  const user = await container.auth.completeGoogleOAuth({
    userId: completion.userId,
    secret: completion.secret,
  });
  rememberSession(user);

  return storedTarget && isSafeRedirectPath(storedTarget) ? storedTarget : DEFAULT_REDIRECT;
}

/**
 * Historical name of `completeOAuth`, kept so existing callers and tests are
 * untouched. The exchange itself is provider-agnostic — Appwrite's token flow
 * is the same for every provider.
 */
export const completeGoogleOAuth = completeOAuth;
