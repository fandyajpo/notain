import { fetchUpstream as fetch } from './http';
import type { Env } from './types';

/**
 * "Has the greeting already gone out?" — remembered on the Appwrite ACCOUNT.
 *
 * The welcome mail is best-effort and is requested from three places (sign-up,
 * sign-in, and the end of an OAuth round trip), so it needs a once-per-account
 * marker. Appwrite user preferences are per-account JSON this app otherwise
 * never writes, so a single pref key costs one Users API read and no schema
 * change — and unlike a row in our own tables it exists the moment the account
 * does, before any organization or profile row has been created.
 *
 * Needs an API key with `users.read` and `users.write`. Without them every call
 * here answers "could not tell", and the caller sends anyway: a second greeting
 * is a small annoyance, a missing one is the thing this feature exists for.
 */

const PREF_KEY = 'welcomeSentAt';

/** API-key plumbing for the Users API. `null` when the server config is incomplete. */
export type WelcomeAuth = { endpoint: string; headers: Record<string, string> };

export function welcomeAuth(env: Env): WelcomeAuth | null {
  const endpoint = env.PUBLIC_APPWRITE_ENDPOINT?.replace(/\/+$/, '');
  const projectId = env.PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY;
  if (!endpoint || !projectId || !apiKey) return null;
  return { endpoint, headers: { 'X-Appwrite-Project': projectId, 'X-Appwrite-Key': apiKey } };
}

function accountUrl(auth: WelcomeAuth, userId: string, suffix = ''): string {
  return `${auth.endpoint}/users/${encodeURIComponent(userId)}${suffix}`;
}

type AccountProbe = { ok: true; prefs: Record<string, unknown> } | { ok: false };

/** One account read. `ok: false` is the honest "could not tell". */
async function probeAccount(auth: WelcomeAuth, userId: string): Promise<AccountProbe> {
  try {
    const response = await fetch(accountUrl(auth, userId), { headers: auth.headers });
    if (!response.ok) return { ok: false };
    const account = (await response.json()) as { prefs?: unknown };
    const prefs = account.prefs;
    return {
      ok: true,
      prefs: typeof prefs === 'object' && prefs !== null ? (prefs as Record<string, unknown>) : {},
    };
  } catch {
    return { ok: false };
  }
}

/**
 * `true` = already greeted, `false` = never greeted, `null` = could not tell.
 *
 * The third state is deliberate. It lets the route send when the probe fails
 * instead of silently skipping a brand-new account because Appwrite had a blip.
 */
export async function welcomeAlreadySent(
  auth: WelcomeAuth,
  userId: string,
): Promise<boolean | null> {
  const probe = await probeAccount(auth, userId);
  if (!probe.ok) return null;
  const sentAt = probe.prefs[PREF_KEY];
  return typeof sentAt === 'string' && sentAt !== '';
}

/**
 * Stamps the account so a later sign-in does not greet it again.
 *
 * Appwrite replaces the prefs object wholesale, so the existing keys are merged
 * in rather than dropped. A failed stamp is not an error the caller can act on:
 * it costs one duplicate greeting on the next sign-in.
 */
export async function markWelcomeSent(auth: WelcomeAuth, userId: string): Promise<void> {
  const probe = await probeAccount(auth, userId);
  const prefs = {
    ...(probe.ok ? probe.prefs : {}),
    [PREF_KEY]: new Date().toISOString(),
  };
  try {
    await fetch(accountUrl(auth, userId, '/prefs'), {
      method: 'PATCH',
      headers: { ...auth.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prefs }),
    });
  } catch {
    // Best effort — see the header: this never fails the request that mailed.
  }
}
