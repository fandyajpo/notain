// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { AppError, ERROR_CODES } from '../core/shared/errors';

/**
 * The Google round trip, at the seam that used to be missing.
 *
 * Appwrite's token flow hands `userId`/`secret` back on the success URL and
 * expects the client to trade them for a session; nothing did, so every Google
 * sign-in ended anonymous. These tests cover the exchange, the `state` check
 * that stops a login-CSRF link from signing a visitor into someone else's
 * account, and the target carried across the hop.
 */

const { startGoogleOAuth, startDiscordOAuth, completeGoogleOAuth } = vi.hoisted(() => ({
  startGoogleOAuth: vi.fn(),
  startDiscordOAuth: vi.fn(),
  completeGoogleOAuth: vi.fn(),
}));

vi.mock('../infra/container', () => ({
  container: { auth: { startGoogleOAuth, startDiscordOAuth, completeGoogleOAuth } },
}));

const {
  signInWithGoogle,
  signInWithDiscord,
  completeGoogleOAuth: completeGoogleOAuthUseCase,
} = await import('../app/auth');

const USER = { id: 'user-1', email: 'budi@example.com', name: 'Budi' };

function cookieValue(name: string): string | null {
  const prefix = `${name}=`;
  for (const entry of document.cookie.split('; ')) {
    if (entry.startsWith(prefix)) return decodeURIComponent(entry.slice(prefix.length));
  }
  return null;
}

beforeEach(() => {
  startGoogleOAuth.mockReset();
  startDiscordOAuth.mockReset();
  completeGoogleOAuth.mockReset();
  // jsdom keeps cookies between tests; drop everything this flow writes.
  for (const entry of document.cookie.split('; ')) {
    const name = entry.split('=')[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
  window.history.replaceState({}, '', '/login');
});

describe('signInWithGoogle', () => {
  it('lands on the callback page and carries state + target in cookies', () => {
    signInWithGoogle('/invoices?status=draft');

    const redirects = startGoogleOAuth.mock.calls[0]?.[0];
    expect(redirects.success).toBe('http://localhost:3000/auth/callback');
    expect(redirects.failure).toBe('http://localhost:3000/login?google_fail=1');
    expect(redirects.state).toMatch(/^[0-9a-f]{32}$/);

    expect(cookieValue('oauth_state')).toBe(redirects.state);
    expect(cookieValue('oauth_next')).toBe('/invoices?status=draft');
  });

  it('falls back to the dashboard when the target is the login page itself', () => {
    window.history.replaceState({}, '', '/login');
    signInWithGoogle('/login');

    expect(startGoogleOAuth.mock.calls[0]?.[0].success).toBe('http://localhost:3000/auth/callback');
    expect(cookieValue('oauth_next')).toBe('/dashboard');
  });
});

describe('signInWithDiscord', () => {
  it('lands on the callback page and carries state + target in cookies', () => {
    signInWithDiscord('/invoices?status=draft');

    const redirects = startDiscordOAuth.mock.calls[0]?.[0];
    expect(redirects.success).toBe('http://localhost:3000/auth/callback');
    expect(redirects.failure).toBe('http://localhost:3000/login?discord_fail=1');
    expect(redirects.state).toMatch(/^[0-9a-f]{32}$/);

    expect(cookieValue('oauth_state')).toBe(redirects.state);
    expect(cookieValue('oauth_next')).toBe('/invoices?status=draft');
  });

  it('falls back to the dashboard when the target is the login page itself', () => {
    window.history.replaceState({}, '', '/login');
    signInWithDiscord('/login');

    expect(startDiscordOAuth.mock.calls[0]?.[0].success).toBe(
      'http://localhost:3000/auth/callback',
    );
    expect(cookieValue('oauth_next')).toBe('/dashboard');
  });
});

describe('completeGoogleOAuth', () => {
  function primeFlow(state = 'a'.repeat(32), next = '/dashboard'): void {
    document.cookie = `oauth_state=${state}; path=/`;
    document.cookie = `oauth_next=${encodeURIComponent(next)}; path=/`;
  }

  it('exchanges the credentials, remembers the session and returns the target', async () => {
    primeFlow();
    completeGoogleOAuth.mockResolvedValue(USER);

    const target = await completeGoogleOAuthUseCase({
      userId: 'user-1',
      secret: 'secret-1',
      state: 'a'.repeat(32),
    });

    expect(completeGoogleOAuth).toHaveBeenCalledWith({ userId: 'user-1', secret: 'secret-1' });
    expect(target).toBe('/dashboard');
    // Single use: the cookies cannot replay the exchange.
    expect(cookieValue('oauth_state')).toBeNull();
    expect(cookieValue('oauth_next')).toBeNull();
  });

  it('rejects a state that does not match the cookie, without touching the SDK', async () => {
    primeFlow();

    const attempt = completeGoogleOAuthUseCase({
      userId: 'user-1',
      secret: 'secret-1',
      state: 'b'.repeat(32),
    });

    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({ code: ERROR_CODES.UNAUTHENTICATED });
    expect(completeGoogleOAuth).not.toHaveBeenCalled();
  });

  it('rejects a round trip with no state cookie at all', async () => {
    await expect(
      completeGoogleOAuthUseCase({ userId: 'user-1', secret: 'secret-1', state: 'a'.repeat(32) }),
    ).rejects.toBeInstanceOf(AppError);
    expect(completeGoogleOAuth).not.toHaveBeenCalled();
  });

  it('ignores an off-site target smuggled into the target cookie', async () => {
    primeFlow('a'.repeat(32), '//evil.example');
    completeGoogleOAuth.mockResolvedValue(USER);

    const target = await completeGoogleOAuthUseCase({
      userId: 'user-1',
      secret: 'secret-1',
      state: 'a'.repeat(32),
    });

    expect(target).toBe('/dashboard');
  });

  it('surfaces an exchange failure and still burns the cookies', async () => {
    primeFlow();
    completeGoogleOAuth.mockRejectedValue(new AppError(ERROR_CODES.NETWORK, 'jaringan bermasalah'));

    await expect(
      completeGoogleOAuthUseCase({ userId: 'user-1', secret: 'secret-1', state: 'a'.repeat(32) }),
    ).rejects.toThrow('jaringan bermasalah');
    expect(cookieValue('oauth_state')).toBeNull();
  });
});
