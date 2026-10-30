import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const { clearMintedJwt, mintJwt } = await import('./client');

/**
 * A distinct signed-shaped token per call (header.payload.signature), with an
 * `exp` `secondsFromNow` away so `mintJwt`'s expiry reader can parse it.
 */
let serial = 0;
function token(secondsFromNow: number): string {
  serial += 1;
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow, jti: serial }),
  );
  return `header.${payload}.signature`;
}

/** The single minted token, served from a stubbed `POST /account/jwts`. */
let mint: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // `ensureClient()` refuses to build outside a browser, and the SDK reads a
  // couple of browser globals on the way to its request. The request itself
  // is stubbed, so no network is involved.
  vi.stubGlobal('window', { location: { href: 'http://localhost:4321/' } });
  vi.stubGlobal('document', { cookie: '' });
  mint = vi.fn(async () => Response.json({ jwt: token(900) }));
  vi.stubGlobal('fetch', mint);
  clearMintedJwt();
});

describe('mintJwt', () => {
  it('reuses one token for every call until it is near expiry', async () => {
    const first = await mintJwt();
    const second = await mintJwt();

    expect(second).toBe(first);
    // Without the cache every /api/* call spent one mint against Appwrite's
    // POST /account/jwts quota — the 429 that blanked the org gate.
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('shares a single mint across concurrent callers', async () => {
    const results = await Promise.all([mintJwt(), mintJwt(), mintJwt()]);

    expect(new Set(results).size).toBe(1);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('mints again once the token is inside the refresh margin', async () => {
    mint
      .mockResolvedValueOnce(Response.json({ jwt: token(20) })) // within margin
      .mockResolvedValueOnce(Response.json({ jwt: token(900) }));

    expect(await mintJwt()).not.toBe(await mintJwt());
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it('drops the cached token when the session changes', async () => {
    const before = await mintJwt();
    clearMintedJwt(); // sign-in / sign-out
    const after = await mintJwt();

    expect(after).not.toBe(before);
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it('propagates a failed mint and does not cache the failure', async () => {
    mint
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce(Response.json({ jwt: token(900) }));

    await expect(mintJwt()).rejects.toThrow('rate limited');
    await expect(mintJwt()).resolves.toContain('.');
    expect(mint).toHaveBeenCalledTimes(2);
  });
});
