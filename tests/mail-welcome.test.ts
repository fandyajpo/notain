import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { onRequest } from '../functions/api/mail/welcome';
import { appwriteFake, requestUrl, type AppwriteFake } from './appwrite-fake';
import type { Env } from '../functions/_lib/types';

/**
 * `POST /api/mail/welcome` — the greeting, sent once per account.
 *
 * This is what makes "a new user gets a welcome email" true for every way in:
 * the client asks after sign-up, after sign-in, and at the end of an OAuth round
 * trip, and only the first of those sends. The marker is the account's own
 * `welcomeSentAt` pref (`functions/_lib/welcome.ts`), so no table is involved.
 *
 * The relay is answered here instead of by the fake, because the mailer is not
 * Appwrite: `passthrough` counts the sends and can refuse them, which is what
 * proves a greeting the relay refused is retried by the next sign-in rather than
 * remembered as done.
 */

const ENDPOINT = 'https://appwrite.test/v1';

const ENV = {
  APPWRITE_API_KEY: 'key_test',
  PUBLIC_APPWRITE_ENDPOINT: ENDPOINT,
  PUBLIC_APPWRITE_PROJECT_ID: 'proj_test',
  MAIL_SERVICE_URL: 'https://mailer.test',
  MAIL_SERVICE_TOKEN: 'token-that-is-long-enough-to-send',
  // Both caches off, so every case really re-checks the account and the window.
  QUOTA_SESSION_CACHE_TTL_MS: '0',
  QUOTA_LIMIT_MAIL_WELCOME_PER_HOUR: '10',
} as unknown as Env;

let fake: AppwriteFake;
let relay: { sends: number; status: number };

beforeEach(() => {
  relay = { sends: 0, status: 200 };
  fake = appwriteFake({
    endpoint: ENDPOINT,
    passthrough: (input) => {
      if (!requestUrl(input).startsWith('https://mailer.test')) {
        return new Response('{}', { status: 404 });
      }
      relay.sends += 1;
      return new Response(
        JSON.stringify(
          relay.status === 200 ? { ok: true, status: 'accepted' } : { error: 'relay_refused' },
        ),
        { status: relay.status, headers: { 'content-type': 'application/json' } },
      );
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function call(token: string | null = 'Bearer jwt-token'): Promise<Response> {
  return onRequest({
    request: new Request('https://notain.test/api/mail/welcome', {
      method: 'POST',
      headers: token ? { authorization: token } : {},
    }),
    params: {},
    env: ENV,
    waitUntil: () => {},
  } as never) as Promise<Response>;
}

describe('POST /api/mail/welcome', () => {
  it('sends the greeting once and remembers it on the account', async () => {
    const response = await call();

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, sent: true });
    expect(relay.sends).toBe(1);
    expect(typeof fake.prefs.get('user-1')?.welcomeSentAt).toBe('string');
  });

  it('answers 200 without sending when the account was already greeted', async () => {
    await call();
    const second = await call();

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, sent: false });
    expect(relay.sends).toBe(1);
  });

  it('forgets a greeting the relay refused, so the next sign-in retries', async () => {
    relay.status = 502;
    const refused = await call();

    expect(refused.status).toBe(503);
    expect(relay.sends).toBe(1);
    expect(fake.prefs.get('user-1')).toBeUndefined();

    relay.status = 200;
    const retried = await call();

    expect(retried.status).toBe(202);
    expect(relay.sends).toBe(2);
    expect(typeof fake.prefs.get('user-1')?.welcomeSentAt).toBe('string');
  });

  it('refuses an anonymous caller', async () => {
    fake.account = null;

    const response = await call(null);

    expect(response.status).toBe(401);
    expect(relay.sends).toBe(0);
  });
});
