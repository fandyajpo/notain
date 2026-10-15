/**
 * Domain-level error type. Every layer below the UI throws `AppError` so the
 * presentation layer can render a single, user-friendly message surface.
 */

export const ERROR_CODES = {
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  VALIDATION: 'validation',
  CONFLICT: 'conflict',
  RATE_LIMITED: 'rate_limited',
  NETWORK: 'network',
  /** The account is blocked (Appwrite `user_blocked`) — not a transient failure. */
  SUSPENDED: 'suspended',
  UNKNOWN: 'unknown',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type AppErrorOptions = {
  /** Field-level validation message, keyed by form field. */
  fieldErrors?: Readonly<Record<string, string>>;
  cause?: unknown;
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors: Readonly<Record<string, string>>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.fieldErrors = options.fieldErrors ?? {};
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Fallback copy shown when an unexpected error bubbles up. */
export const GENERIC_ERROR_MESSAGE = 'Terjadi kesalahan. Coba lagi beberapa saat lagi.';

/**
 * Flattens schema issues into the `{ field: message }` shape `AppError`
 * expects, keyed by the dotted path (`items.0.name`). The first message for a
 * path wins — a form shows one error per field, not a queue of them.
 */
export function flattenIssues(
  issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.');
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
