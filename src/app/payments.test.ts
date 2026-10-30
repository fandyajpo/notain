import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { text } from '../core/shared/text';

const { createJWT } = vi.hoisted(() => ({ createJWT: vi.fn() }));

vi.mock('../appwrite/client', () => ({
  getAccount: () => ({ createJWT }),
  // The module now caches this; the mock keeps minting so each test sees a
  // fresh token (and its own rejection) exactly as before.
  mintJwt: async () => (await createJWT()).jwt,
}));

const { fetchPaymentStatus, readPortalSession, startCheckout } = await import('./payments');
const { setActiveOrgId } = await import('./active-org');

/** Billing is per-org: the hint every client call now carries. */
const ORG = 'org_aaaaaaaaaaaaaaaa';

const fetchMock = vi.fn();

beforeEach(() => {
  createJWT.mockReset();
  createJWT.mockResolvedValue({ jwt: 'jwt-token', $id: 'user-1' });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setActiveOrgId(ORG);
});

function response(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('startCheckout', () => {
  it('sends the plan id and the org hint, carrying the session JWT — never a price', async () => {
    fetchMock.mockResolvedValue(response({ url: 'https://sandbox.doku.com/pay/abc' }));

    const result = await startCheckout('pro');

    expect(result).toEqual({ url: 'https://sandbox.doku.com/pay/abc' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/payments/checkout');
    expect(init.method).toBe('POST');
    // `orgId` is the server's `requireOrg` hint, re-verified against the
    // membership row — the amount still never crosses the wire.
    expect(JSON.parse(text(init.body))).toEqual({ plan: 'pro', orgId: ORG });
    // Read through `Headers`: the module normalises whatever header shape
    // the caller passed into a real `Headers` instance.
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer jwt-token');
  });

  it('fails locally before any request when no organization is active', async () => {
    setActiveOrgId(null);

    await expect(startCheckout('pro')).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the server’s copy for a rejected request', async () => {
    fetchMock.mockResolvedValue(
      response({ error: 'conflict', message: 'Akun kamu sudah aktif di plan Business.' }, 409),
    );

    await expect(startCheckout('pro')).rejects.toMatchObject({
      code: ERROR_CODES.CONFLICT,
      message: 'Akun kamu sudah aktif di plan Business.',
    });
  });

  it('falls back to generic copy for a 5xx instead of leaking server detail', async () => {
    fetchMock.mockResolvedValue(response({ error: 'validation', message: 'stack trace-ish' }, 502));

    await expect(startCheckout('pro')).rejects.toMatchObject({ code: ERROR_CODES.UNKNOWN });
  });

  it('reports a dropped connection as a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(startCheckout('pro')).rejects.toMatchObject({ code: ERROR_CODES.NETWORK });
  });

  it('rejects a response without a usable URL rather than navigating nowhere', async () => {
    fetchMock.mockResolvedValue(response({ url: 'javascript:alert(1)' }));

    await expect(startCheckout('pro')).rejects.toMatchObject({ code: ERROR_CODES.UNKNOWN });
  });

  it('fails as unauthenticated when no session JWT can be minted', async () => {
    createJWT.mockRejectedValue(new Error('no session'));

    await expect(startCheckout('pro')).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHENTICATED,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchPaymentStatus', () => {
  it('normalizes the row the server reports', async () => {
    fetchMock.mockResolvedValue(
      response({
        invoiceNumber: 'NOTAIN-P-1-ABCD',
        plan: 'pro',
        amount: 29_000,
        currency: 'IDR',
        status: 'paid',
        paidAt: '2026-10-20T10:05:00.000Z',
        expiresAt: null,
      }),
    );

    await expect(fetchPaymentStatus('NOTAIN-P-1-ABCD')).resolves.toMatchObject({
      invoiceNumber: 'NOTAIN-P-1-ABCD',
      status: 'paid',
      amount: 29_000,
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/payments/status?invoice=NOTAIN-P-1-ABCD');
  });

  it('coerces an unrecognised status to pending rather than guessing a final one', async () => {
    fetchMock.mockResolvedValue(response({ invoiceNumber: 'X', status: 'who_knows' }));

    await expect(fetchPaymentStatus('X')).resolves.toMatchObject({ status: 'pending' });
  });

  it('maps 404 to a typed not-found error (probing another account’s order)', async () => {
    fetchMock.mockResolvedValue(
      response({ error: 'not_found', message: 'Pembayaran tidak ditemukan.' }, 404),
    );

    await expect(fetchPaymentStatus('someone-elses')).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it('rejects a malformed body instead of rendering half a payment', async () => {
    fetchMock.mockResolvedValue(response('<html>gateway page</html>'));

    await expect(fetchPaymentStatus('X')).rejects.toBeInstanceOf(AppError);
  });
});

describe('readPortalSession', () => {
  it('reads the portal with the session JWT and normalizes the payload', async () => {
    fetchMock.mockResolvedValue(
      response({
        plan: 'pro',
        planExpiresAt: '2999-01-01T00:00:00.000Z',
        active: true,
        payments: [
          {
            invoiceNumber: 'NOTAIN-P-1-ABCD',
            plan: 'pro',
            amount: 29_000,
            currency: 'IDR',
            status: 'paid',
            paidAt: '2026-10-20T10:05:00.000Z',
            createdAt: '2026-10-20T10:00:00.000Z',
            resumeUrl: null,
          },
        ],
      }),
    );

    await expect(readPortalSession()).resolves.toMatchObject({
      plan: 'pro',
      active: true,
      payments: [{ invoiceNumber: 'NOTAIN-P-1-ABCD', status: 'paid' }],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/payments/portal?orgId=${ORG}`);
    // Read through `Headers`: the module normalises whatever header shape
    // the caller passed into a real `Headers` instance.
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer jwt-token');
  });

  it('fails locally before any request when no organization is active', async () => {
    setActiveOrgId(null);

    await expect(readPortalSession()).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades an unknown plan and hostile rows to safe defaults', async () => {
    fetchMock.mockResolvedValue(
      response({
        plan: 'enterprise',
        planExpiresAt: 12345,
        active: 'yes',
        payments: [
          { invoiceNumber: '', status: 'paid' }, // empty id: dropped
          { invoiceNumber: 'X', status: 'who_knows', resumeUrl: 'javascript:alert(1)' },
          'not-an-object',
        ],
      }),
    );

    const session = await readPortalSession();
    expect(session.plan).toBe('free');
    expect(session.planExpiresAt).toBeNull();
    // A non-boolean `active` is recomputed from the shared rule (free → false).
    expect(session.active).toBe(false);
    expect(session.payments).toEqual([
      expect.objectContaining({ invoiceNumber: 'X', status: 'pending', resumeUrl: null }),
    ]);
  });

  it('fails as unauthenticated when no session JWT can be minted', async () => {
    createJWT.mockRejectedValue(new Error('no session'));

    await expect(readPortalSession()).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHENTICATED,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the server’s copy for a rejected request', async () => {
    fetchMock.mockResolvedValue(
      response({ error: 'unauthenticated', message: 'Silakan masuk terlebih dahulu.' }, 401),
    );

    await expect(readPortalSession()).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHENTICATED,
    });
  });

  it('rejects a malformed body instead of painting an empty portal', async () => {
    fetchMock.mockResolvedValue(response('<html>gateway page</html>'));

    await expect(readPortalSession()).rejects.toBeInstanceOf(AppError);
  });
});
