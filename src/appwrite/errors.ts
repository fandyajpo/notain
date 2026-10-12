import { AppwriteException } from 'appwrite';
import { AppError, ERROR_CODES, GENERIC_ERROR_MESSAGE } from '../core/shared/errors';

/** User-facing copy for the auth failures we can anticipate. */
const AUTH_MESSAGES: Record<string, string> = {
  user_already_exists: 'Email ini sudah terdaftar. Silakan masuk.',
  invalid_credentials: 'Email atau kata sandi salah.',
  user_not_found: 'Email belum terdaftar.',
  invalid_password: 'Kata sandi minimal 8 karakter.',
  password_is_weak: 'Kata sandi terlalu lemah. Gunakan minimal 8 karakter.',
  invalid_email: 'Masukkan alamat email yang valid.',
  rate_limit: 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
  rate_limit_exceeded: 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
  general_user_disabled: 'Akun ini dinonaktifkan.',
  invalid_token: 'Tautan reset tidak valid atau sudah dipakai. Minta tautan baru.',
  token_expired: 'Tautan reset sudah kedaluwarsa. Minta tautan baru.',
  recovery_error: 'Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru.',
};

/** Translates any thrown value into an `AppError` the UI can render. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppwriteException) {
    const type = error.type ?? '';
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
  if (status === 404) return ERROR_CODES.NOT_FOUND;
  if (status === 409) return ERROR_CODES.CONFLICT;
  // 429 is keyed by status, not by Appwrite's `type` string, so a new rate-limit
  // type never silently degrades into a retriable UNKNOWN.
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  if (status === 400 || status === 422) return ERROR_CODES.VALIDATION;
  return ERROR_CODES.UNKNOWN;
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
