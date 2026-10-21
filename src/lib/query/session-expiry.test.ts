// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { AppError, ERROR_CODES } from '../../core/shared/errors';
import { queryKeys } from './keys';
import { createSessionExpiryHandler } from './session-expiry';

const unauthenticated = () => new AppError(ERROR_CODES.UNAUTHENTICATED, 'Silakan masuk.');

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  // `window.location.assign` is not writable in jsdom, so the whole location
  // is swapped for a stub we can assert on.
  assign = vi.fn();
  vi.stubGlobal('location', { pathname: '/invoice/new', search: '', assign });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createSessionExpiryHandler', () => {
  it('clears the cached session and flips it to null so AuthGate reacts', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.session, { id: 'u1', email: 'a@example.com', name: 'A' });
    const handle = createSessionExpiryHandler();

    await handle(client, unauthenticated());

    expect(client.getQueryData(queryKeys.session)).toBeNull();
  });

  it('schedules a redirect to login carrying the page it came from', async () => {
    const client = new QueryClient();
    const handle = createSessionExpiryHandler();

    await handle(client, unauthenticated());

    expect(assign).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1200);
    expect(assign).toHaveBeenCalledWith(`/login?next=${encodeURIComponent('/invoice/new')}`);
  });

  it('only announces the expiry once even when several calls fail together', async () => {
    const client = new QueryClient();
    const handle = createSessionExpiryHandler();

    await Promise.all([
      handle(client, unauthenticated()),
      handle(client, unauthenticated()),
      handle(client, unauthenticated()),
    ]);

    vi.advanceTimersByTime(1200);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('ignores errors that are not an expired session', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.session, { id: 'u1', email: 'a@example.com', name: 'A' });
    const handle = createSessionExpiryHandler();

    await handle(client, new AppError(ERROR_CODES.NETWORK, 'hilang koneksi'));

    vi.advanceTimersByTime(1200);
    expect(client.getQueryData(queryKeys.session)).toEqual({
      id: 'u1',
      email: 'a@example.com',
      name: 'A',
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it('leaves an expiry detected on an auth page alone, to avoid a loop', async () => {
    vi.stubGlobal('location', { pathname: '/login', search: '', assign });
    const client = new QueryClient();
    const handle = createSessionExpiryHandler();

    await handle(client, unauthenticated());

    vi.advanceTimersByTime(1200);
    expect(assign).not.toHaveBeenCalled();
  });

  it('keeps the session when a 401 did not actually end it', async () => {
    // Appwrite answers `user_unauthorized` both for a lapsed token and for a
    // table the account cannot touch (one that is missing, say). The verifier
    // is what stops the second from signing the user out and looping.
    const client = new QueryClient();
    client.setQueryData(queryKeys.session, { id: 'u1', email: 'a@example.com', name: 'A' });
    const handle = createSessionExpiryHandler(async () => true);

    await handle(client, unauthenticated());

    vi.advanceTimersByTime(1200);
    expect(client.getQueryData(queryKeys.session)).toEqual({
      id: 'u1',
      email: 'a@example.com',
      name: 'A',
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it('still signs out when the session probe fails outright', async () => {
    const client = new QueryClient();
    const handle = createSessionExpiryHandler(async () => {
      throw new Error('probe blew up');
    });

    await handle(client, unauthenticated());

    vi.advanceTimersByTime(1200);
    expect(assign).toHaveBeenCalledTimes(1);
  });
});
