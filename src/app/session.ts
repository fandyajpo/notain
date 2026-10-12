import { container } from '../infra/container';
import { ERROR_CODES, AppError } from '../core/shared/errors';
import type { SessionUser } from '../ports/auth-repository';

let cached: SessionUser | null = null;
let inFlight: Promise<SessionUser | null> | null = null;

/**
 * Bumped by every explicit sign-in/sign-out. A lookup started before the bump
 * describes an account the app has already moved on from, so its result is
 * discarded instead of overwriting the newer truth.
 */
let epoch = 0;

/**
 * Memoized session lookup. Pages call `requireSession()` on mount; the cache
 * keeps repeated island mounts from re-hitting the network.
 */
export async function currentSession(): Promise<SessionUser | null> {
  if (cached) return cached;

  if (!inFlight) {
    const seen = epoch;
    const promise: Promise<SessionUser | null> = container.auth
      .getSession()
      .then((user) => {
        // Sign-in or sign-out happened while this request was in the air.
        if (seen !== epoch) return cached;
        cached = user;
        return user;
      })
      .finally(() => {
        // Only retire our own request: a sign-out may already have started a
        // newer one, and clearing that would leak a lookup nobody owns.
        if (inFlight === promise) inFlight = null;
      });
    inFlight = promise;
  }

  return inFlight;
}

export async function requireSession(): Promise<SessionUser> {
  const user = await currentSession();
  if (!user) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Silakan masuk terlebih dahulu.');
  }
  return user;
}

export function rememberSession(user: SessionUser): SessionUser {
  epoch += 1;
  cached = user;
  // Any lookup already running is asking about the previous account.
  inFlight = null;
  return user;
}

export function forgetSession(): void {
  epoch += 1;
  cached = null;
  inFlight = null;
}
