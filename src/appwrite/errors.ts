import { AppwriteException } from 'appwrite';
import { AppError, ERROR_CODES, GENERIC_ERROR_MESSAGE } from '../core/shared/errors';

/** User-facing copy for the auth failures we can anticipate. */
const AUTH_MESSAGES: Record<string, string> = {
  user_already_exists: 'Email ini sudah terdaftar. Silakan masuk.',
  invalid_credentials: 'Email atau kata sandi salah.',
  // The type Appwrite actually sends on a failed email/password session.
  // Without this key a wrong password fell through to the generic message.
  user_invalid_credentials: 'Email atau kata sandi salah.',
  user_not_found: 'Email belum terdaftar.',
  invalid_password: 'Kata sandi minimal 8 karakter.',
  password_is_weak: 'Kata sandi terlalu lemah. Gunakan minimal 8 karakter.',
  invalid_email: 'Masukkan alamat email yang valid.',
  rate_limit: 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
  rate_limit_exceeded: 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
  general_user_disabled: 'Akun ini dinonaktifkan.',
  // A blocked account also surfaces as a 401, but it is a deliberate state —
  // not "your JWT expired" — so it gets its own code and is never retried.
  user_blocked: 'Akun kamu dinonaktifkan. Hubungi admin untuk informasi lebih lanjut.',
  invalid_token: 'Tautan reset tidak valid atau sudah dipakai. Minta tautan baru.',
  token_expired: 'Tautan reset sudah kedaluwarsa. Minta tautan baru.',
  recovery_error: 'Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru.',
};

/** Translates any thrown value into an `AppError` the UI can render. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppwriteException) {
    const type = error.type ?? '';
    // `user_blocked` answers with 401, but the *reason* is a permanent state,
    // not an expired token — key off the type, not the status.
    if (type === 'user_blocked') {
      return new AppError(
        ERROR_CODES.SUSPENDED,
        AUTH_MESSAGES.user_blocked ?? 'Akun kamu dinonaktifkan.',
        { cause: error },
      );
    }
    const code = mapStatusCode(error.code);

    return new AppError(code, AUTH_MESSAGES[type] ?? fallbackFor(code), { cause: error });
  }

  if (error instanceof TypeError) {
    return new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
      {
        cause: error,
      },
    );
  }

  if (error instanceof AppError) return error;

  return new AppError(ERROR_CODES.UNKNOWN, GENERIC_ERROR_MESSAGE, { cause: error });
}

function mapStatusCode(status: number): (typeof ERROR_CODES)[keyof typeof ERROR_CODES] {
  if (status === 401) return ERROR_CODES.UNAUTHENTICATED;
  if (status === 403) return ERROR_CODES.FORBIDDEN;
  // 402 Payment Required: the endpoint exists and the request was valid, but
  // the caller's plan does not cover it (the public invoice link). It is a
  // permanent denial for the current plan, so it maps to FORBIDDEN — never
  // retried, always shown with the server's upgrade copy.
  if (status === 402) return ERROR_CODES.FORBIDDEN;
  if (status === 404) return ERROR_CODES.NOT_FOUND;
  if (status === 409) return ERROR_CODES.CONFLICT;
  // 429 is keyed by status, not by Appwrite's `type` string, so a new rate-limit
  // type never silently degrades into a retriable UNKNOWN.
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  // 503 is our own controlled "temporarily unavailable, retry after N"
  // answer (the quota circuit breaker / a provider outage). It is transient
  // by definition, so it classifies as a connection-style failure that a
  // query may retry — mutations are never replayed regardless.
  if (status === 503) return ERROR_CODES.NETWORK;
  if (status === 400 || status === 413 || status === 422) return ERROR_CODES.VALIDATION;
  return ERROR_CODES.UNKNOWN;
}

/**
 * Maps a status from a first-party API route (the logo proxy) to an AppError.
 *
 * Separate from `toAppError` because there is no `AppwriteException` behind
 * it: the body is ours, and for 4xx it carries the copy a user should see.
 * 5xx deliberately falls back to generic copy — a server stack message is
 * never something to put in front of a person.
 */
export function appErrorFromStatus(status: number, message?: string): AppError {
  const code = mapStatusCode(status);
  // Other 5xx deliberately fall back to generic copy — a server or upstream
  // stack message is never something to put in front of a person. 503 is the
  // exception: its body is our own curated "try again in N" guidance, which
  // is exactly what the reader needs in order to know when retrying helps.
  const showMessage = (status < 500 || status === 503) && message;
  return new AppError(code, showMessage ? message : fallbackFor(code));
}

/** Copy for codes whose Appwrite `type` string is not one we recognise. */
function fallbackFor(code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES]): string {
  if (code === ERROR_CODES.RATE_LIMITED) {
    return 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.';
  }
  return GENERIC_ERROR_MESSAGE;
}

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof AppError && error.code === ERROR_CODES.UNAUTHENTICATED;
}

/**
 * True when the backend throttled us. Callers must not retry these — a retry
 * only makes the throttle window longer.
 */
export function isRateLimited(error: unknown): boolean {
  return error instanceof AppError && error.code === ERROR_CODES.RATE_LIMITED;
}

/**
 * True when Appwrite refused a write because the row already exists —
 * a duplicate document id (the deterministic invoice-number claim) or a
 * unique-index violation behind it. Keyed on the exception's 409 rather than
 * a `type` string, because Appwrite spells those differently per mechanism
 * and both mean the same thing to the caller: "that number is taken".
 */
export function isConflict(error: unknown): boolean {
  return error instanceof AppwriteException && error.code === 409;
}
