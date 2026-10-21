import { describe, expect, it } from 'vitest';
import {
  buildCheckoutBody,
  DOKU_SIGNATURE_PREFIX,
  parseCheckoutResponse,
  parseExpiredDate,
  parseNotification,
  requestDigest,
  signRequest,
  signatureComponents,
  utcTimestamp,
  verifyNotificationSignature,
} from './doku';

const SECRET = 'sandbox-secret-key';
const CLIENT_ID = 'MCH-0001-10791114622547';

describe('utcTimestamp', () => {
  it('renders UTC ISO 8601 with Z and second precision', () => {
    expect(utcTimestamp(new Date('2026-10-20T10:00:00.123Z'))).toBe('2026-10-20T10:00:00Z');
  });
});

describe('requestDigest', () => {
  it('is base64 SHA-256 of the exact body bytes', async () => {
    // SHA-256("abc") — the canonical NIST example vector, standard base64
    // (DOKU's own digest samples use `+`/`/`, not the URL-safe alphabet).
    expect(await requestDigest('abc')).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
  });
});

describe('signatureComponents', () => {
  it('lays out one labelled component per line with no trailing newline', () => {
    const value = signatureComponents({
      clientId: CLIENT_ID,
      requestId: 'req-1',
      timestamp: '2026-10-20T10:00:00Z',
      target: '/checkout/v1/payment',
      digest: 'DIGEST==',
    });
    expect(value).toBe(
      [
        `Client-Id:${CLIENT_ID}`,
        'Request-Id:req-1',
        'Request-Timestamp:2026-10-20T10:00:00Z',
        'Request-Target:/checkout/v1/payment',
        'Digest:DIGEST==',
      ].join('\n'),
    );
    expect(value.endsWith('\n')).toBe(false);
  });

  it('omits Digest for GET requests', () => {
    const value = signatureComponents({
      clientId: CLIENT_ID,
      requestId: 'req-1',
      timestamp: '2026-10-20T10:00:00Z',
      target: '/orders/v1/status/INV-1',
    });
    expect(value).not.toContain('Digest');
  });
});

describe('signRequest', () => {
  it('produces the HMACSHA256= prefix over the documented components', async () => {
    const signature = await signRequest({
      secretKey: SECRET,
      clientId: CLIENT_ID,
      requestId: 'req-1',
      timestamp: '2026-10-20T10:00:00Z',
      target: '/checkout/v1/payment',
      rawBody: '{"order":{"amount":29000}}',
    });
    expect(signature.startsWith(DOKU_SIGNATURE_PREFIX)).toBe(true);
    // Deterministic: same inputs must always sign the same.
    expect(signature).toBe(
      await signRequest({
        secretKey: SECRET,
        clientId: CLIENT_ID,
        requestId: 'req-1',
        timestamp: '2026-10-20T10:00:00Z',
        target: '/checkout/v1/payment',
        rawBody: '{"order":{"amount":29000}}',
      }),
    );
  });

  it('changes when the body changes', async () => {
    const base = {
      secretKey: SECRET,
      clientId: CLIENT_ID,
      requestId: 'req-1',
      timestamp: '2026-10-20T10:00:00Z',
      target: '/checkout/v1/payment',
    };
    const a = await signRequest({ ...base, rawBody: '{"a":1}' });
    const b = await signRequest({ ...base, rawBody: '{"a":2}' });
    expect(a).not.toBe(b);
  });
});

describe('verifyNotificationSignature', () => {
  const notification = JSON.stringify({
    transaction: { status: 'SUCCESS', date: '2026-10-20T10:05:00Z' },
    order: { invoice_number: 'NOTAIN-P-1-ABCD', amount: 29000 },
  });

  async function headerFor(overrides: { secretKey?: string; target?: string } = {}) {
    const signature = await signRequest({
      secretKey: overrides.secretKey ?? SECRET,
      clientId: CLIENT_ID,
      requestId: 'notif-1',
      timestamp: '2026-10-20T10:05:01Z',
      target: overrides.target ?? '/api/payments/doku-notify',
      rawBody: notification,
    });
    return {
      clientIdHeader: CLIENT_ID,
      requestIdHeader: 'notif-1',
      timestampHeader: '2026-10-20T10:05:01Z',
      signatureHeader: signature,
    };
  }

  const base = {
    secretKey: SECRET,
    expectedClientId: CLIENT_ID,
    requestTarget: '/api/payments/doku-notify',
    rawBody: notification,
  };

  it('accepts a correctly signed notification', async () => {
    expect(await verifyNotificationSignature({ ...base, ...(await headerFor()) })).toBe(true);
  });

  it('rejects a wrong secret key', async () => {
    const headers = await headerFor({ secretKey: 'attacker-key' });
    expect(await verifyNotificationSignature({ ...base, ...headers })).toBe(false);
  });

  it('rejects a tampered body (digest no longer matches)', async () => {
    const headers = await headerFor();
    expect(
      await verifyNotificationSignature({ ...base, ...headers, rawBody: notification + ' ' }),
    ).toBe(false);
  });

  it('rejects a replay signed for a different path', async () => {
    const headers = await headerFor({ target: '/somewhere/else' });
    expect(await verifyNotificationSignature({ ...base, ...headers })).toBe(false);
  });

  it('rejects a different merchant’s client id', async () => {
    const headers = await headerFor();
    expect(
      await verifyNotificationSignature({
        ...base,
        ...headers,
        expectedClientId: 'MCH-0001-someone-else',
      }),
    ).toBe(false);
  });

  it('rejects missing headers', async () => {
    expect(
      await verifyNotificationSignature({
        ...base,
        clientIdHeader: CLIENT_ID,
        requestIdHeader: null,
        timestampHeader: '2026-10-20T10:05:01Z',
        signatureHeader: 'HMACSHA256=whatever=',
      }),
    ).toBe(false);
  });
});

describe('buildCheckoutBody', () => {
  it('emits only documented snake_case fields with whole-IDR amounts', () => {
    const body = JSON.parse(
      buildCheckoutBody({
        amount: 29_000,
        invoiceNumber: 'NOTAIN-P-1-ABCD',
        callbackUrl: 'https://notain.pages.dev/payment/result',
        notificationUrl: 'https://notain.pages.dev/api/payments/doku-notify',
        customer: { id: 'user123', name: 'Budi', email: 'budi@example.com' },
      }),
    );
    expect(body).toEqual({
      order: {
        amount: 29_000,
        invoice_number: 'NOTAIN-P-1-ABCD',
        currency: 'IDR',
        callback_url: 'https://notain.pages.dev/payment/result',
        auto_redirect: true,
      },
      payment: { payment_due_date: 60 },
      customer: { id: 'user123', name: 'Budi', email: 'budi@example.com' },
      additional_info: {
        override_notification_url: 'https://notain.pages.dev/api/payments/doku-notify',
      },
    });
  });

  it('omits absent customer fields rather than sending empties', () => {
    const body = JSON.parse(
      buildCheckoutBody({
        amount: 99_000,
        invoiceNumber: 'NOTAIN-B-1-EFGH',
        callbackUrl: 'https://notain.pages.dev/payment/result',
        notificationUrl: 'https://notain.pages.dev/api/payments/doku-notify',
        customer: { id: 'user123' },
      }),
    );
    expect(body.customer).toEqual({ id: 'user123' });
  });
});

describe('parseCheckoutResponse', () => {
  it('extracts response.payment.url and the expiry', () => {
    const parsed = parseCheckoutResponse({
      response: {
        payment: {
          url: 'https://sandbox.doku.com/checkout/session/abc',
          token_id: 'tk-1',
          expired_date: '20261020173000',
        },
      },
    });
    expect(parsed?.url).toBe('https://sandbox.doku.com/checkout/session/abc');
    expect(parsed?.tokenId).toBe('tk-1');
    // 17:30 UTC+7 → 10:30 UTC.
    expect(parsed?.expiredAt).toBe('2026-10-20T10:30:00.000Z');
  });

  it('returns null when the URL is missing or not a URL', () => {
    expect(parseCheckoutResponse({ response: { payment: {} } })).toBeNull();
    expect(parseCheckoutResponse({ response: { payment: { url: 'javascript:alert(1)' } } })).toBeNull();
    expect(parseCheckoutResponse(null)).toBeNull();
  });
});

describe('parseExpiredDate', () => {
  it('converts yyyyMMddHHmmss UTC+7 to ISO', () => {
    expect(parseExpiredDate('20261020000000')).toBe('2026-10-19T17:00:00.000Z');
  });

  it('returns null for anything else', () => {
    expect(parseExpiredDate('soon')).toBeNull();
  });
});

describe('parseNotification', () => {
  it('reads the documented fields and ignores unknown extras', () => {
    const parsed = parseNotification({
      service: { id: 'CHECKOUT' },
      transaction: { status: 'SUCCESS', date: '2026-10-20T10:05:00Z', future_field: true },
      order: { invoice_number: 'NOTAIN-P-1-ABCD', amount: 29000 },
      some_new_section: { x: 1 },
    });
    expect(parsed).toEqual({
      status: 'SUCCESS',
      invoiceNumber: 'NOTAIN-P-1-ABCD',
      amount: 29_000,
      transactionDate: '2026-10-20T10:05:00Z',
    });
  });

  it('degrades unknown statuses and missing pieces to safe defaults', () => {
    expect(parseNotification({ transaction: { status: 'WHO_KNOWS' } })).toEqual({
      status: 'UNKNOWN',
      invoiceNumber: null,
      amount: null,
      transactionDate: null,
    });
    expect(parseNotification(null).status).toBe('UNKNOWN');
  });

  it('rejects non-numeric amounts instead of coercing them', () => {
    expect(parseNotification({ order: { amount: '29000' } }).amount).toBeNull();
  });
});
