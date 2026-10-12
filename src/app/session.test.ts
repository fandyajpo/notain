import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '../ports/auth-repository';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('../infra/container', () => ({
  container: { auth: { getSession } },
}));

const { currentSession, forgetSession, rememberSession, requireSession } =
  await import('./session');

const ALICE: SessionUser = { id: 'user-a', email: 'a@example.com', name: 'Alice' };
const BOB: SessionUser = { id: 'user-b', email: 'b@example.com', name: 'Bob' };

beforeEach(() => {
  forgetSession();
  getSession.mockReset();
});

describe('currentSession', () => {
  it('serves repeated lookups from the cache', async () => {
    getSession.mockResolvedValueOnce(ALICE);

    await expect(currentSession()).resolves.toEqual(ALICE);
    await expect(currentSession()).resolves.toEqual(ALICE);

    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('shares a single request between concurrent callers', async () => {
    getSession.mockResolvedValueOnce(ALICE);

    await Promise.all([currentSession(), currentSession()]);

    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh lookup after sign-out', async () => {
    getSession.mockResolvedValueOnce(ALICE);
    await expect(currentSession()).resolves.toEqual(ALICE);

    forgetSession();

    getSession.mockResolvedValueOnce(null);
    await expect(currentSession()).resolves.toBeNull();
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('discards a lookup that resolves after sign-out', async () => {
    let settle: (user: SessionUser | null) => void = () => undefined;
    getSession.mockReturnValueOnce(
      new Promise<SessionUser | null>((resolve) => {
        settle = resolve;
      }),
    );

    const pending = currentSession();
    forgetSession();

    // The stale response lands after the user has signed out.
    settle(ALICE);

    await expect(pending).resolves.toBeNull();

    getSession.mockResolvedValueOnce(null);
    await expect(currentSession()).resolves.toBeNull();
  });

  it('discards a lookup that resolves after a new sign-in', async () => {
    let settle: (user: SessionUser | null) => void = () => undefined;
    getSession.mockReturnValueOnce(
      new Promise<SessionUser | null>((resolve) => {
        settle = resolve;
      }),
    );

    const pending = currentSession();
    rememberSession(BOB);

    settle(ALICE);

    await expect(pending).resolves.toEqual(BOB);
    await expect(currentSession()).resolves.toEqual(BOB);
  });
});

describe('requireSession', () => {
  it('throws UNAUTHENTICATED when nobody is signed in', async () => {
    getSession.mockResolvedValueOnce(null);

    await expect(requireSession()).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('returns the signed-in user', async () => {
    getSession.mockResolvedValueOnce(ALICE);

    await expect(requireSession()).resolves.toEqual(ALICE);
  });
});
