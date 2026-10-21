import { AppwriteException } from 'appwrite';
import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES } from '../core/shared/errors';
import { appErrorFromStatus, isRateLimited, isUnauthenticated, toAppError } from './errors';

function appwriteError(status: number, type = ''): AppwriteException {
  return new AppwriteException('boom', status, type);
}

describe('toAppError', () => {
  it('maps 429 to a rate-limited error so callers can stop retrying', () => {
    const error = toAppError(appwriteError(429, 'rate_limit'));

    expect(error.code).toBe(ERROR_CODES.RATE_LIMITED);
    expect(error.message).toContain('Terlalu banyak percobaan');
  });

  it('recognises an unlisted Appwrite rate-limit type by status alone', () => {
    // A new rate-limit type string must not silently become a retriable
    // UNKNOWN, which would make the client hammer an already-throttled API.
    const error = toAppError(appwriteError(429, 'some_future_rate_limit_type'));

    expect(error.code).toBe(ERROR_CODES.RATE_LIMITED);
    expect(error.message).toContain('Terlalu banyak percobaan');
  });

  it('keeps the known auth copy for recognised types', () => {
    expect(toAppError(appwriteError(401, 'invalid_credentials')).message).toContain(
      'Email atau kata sandi salah',
    );
  });

  it('maps a blocked account (user_blocked) to SUSPENDED, not UNAUTHENTICATED', () => {
    // Appwrite answers a blocked user with 401, but the reason is a permanent
    // state — retrying or treating it as "your token expired" would mislead
    // the user. Key off the type string, not the status.
    const error = toAppError(appwriteError(401, 'user_blocked'));

    expect(error.code).toBe(ERROR_CODES.SUSPENDED);
    expect(error.message).toContain('dinonaktifkan');
  });

  it('maps the remaining status codes to their own error codes', () => {
    expect(toAppError(appwriteError(401)).code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(toAppError(appwriteError(403)).code).toBe(ERROR_CODES.FORBIDDEN);
    expect(toAppError(appwriteError(404)).code).toBe(ERROR_CODES.NOT_FOUND);
    expect(toAppError(appwriteError(409)).code).toBe(ERROR_CODES.CONFLICT);
    expect(toAppError(appwriteError(422)).code).toBe(ERROR_CODES.VALIDATION);
    expect(toAppError(appwriteError(500)).code).toBe(ERROR_CODES.UNKNOWN);
  });

  it('falls back to the generic message for unrecognised types', () => {
    const error = toAppError(appwriteError(500, 'unexpected_type'));

    expect(error.code).toBe(ERROR_CODES.UNKNOWN);
    expect(error.message).toBe('Terjadi kesalahan. Coba lagi beberapa saat lagi.');
  });

  it('maps a fetch TypeError to a network error', () => {
    const error = toAppError(new TypeError('Failed to fetch'));

    expect(error.code).toBe(ERROR_CODES.NETWORK);
  });

  it('passes AppError through unchanged', () => {
    const original = new AppError(ERROR_CODES.CONFLICT, 'sudah ada');

    expect(toAppError(original)).toBe(original);
  });
});

describe('appErrorFromStatus', () => {
  it('maps the invoice-link plan gate (402) to a permanent FORBIDDEN with the server copy', () => {
    // "Invoice link is a Pro feature" — a denial the client must show as-is
    // and never retry, unlike a transient failure.
    const error = appErrorFromStatus(402, 'Invoice link adalah fitur plan Pro.');

    expect(error.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(error.message).toBe('Invoice link adalah fitur plan Pro.');
  });

  it('never leaks 5xx detail even when the body carried a message', () => {
    const error = appErrorFromStatus(502, 'stack trace-ish');

    expect(error.message).toBe('Terjadi kesalahan. Coba lagi beberapa saat lagi.');
  });
});

describe('isRateLimited', () => {
  it('is true only for a rate-limited AppError', () => {
    expect(isRateLimited(toAppError(appwriteError(429, 'rate_limit')))).toBe(true);
    expect(isRateLimited(toAppError(appwriteError(500)))).toBe(false);
    expect(isRateLimited(new Error('nope'))).toBe(false);
  });
});

describe('isUnauthenticated', () => {
  it('is true only for an unauthenticated AppError', () => {
    expect(isUnauthenticated(toAppError(appwriteError(401)))).toBe(true);
    expect(isUnauthenticated(toAppError(appwriteError(429)))).toBe(false);
  });
});
