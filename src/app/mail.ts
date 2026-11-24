import { appErrorFromStatus } from './errors';
import { bearerFetch } from './bearer-fetch';
import { serverMessage } from './response';
import { AppError, ERROR_CODES } from '../core/shared/errors';

/**
 * The browser's half of the email flows.
 *
 * Three of the four calls are made from screens a **signed-out** person uses
 * (registration greeting, "Lupa password", the reset link itself), so they do
 * not carry a bearer — they are anonymous endpoints, protected on the server by
 * rate fences and, for the reset link, by a 256-bit token. Only mailing a nota
 * needs a session, because only a member of the owning organization may send
 * one.
 *
 * Error mapping is uniform: the server's own `message` wins when it has one,
 * so the copy a user reads is the copy written next to the rule.
 */

/** One anonymous POST with a JSON body. */
async function postJson(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
    );
  }
}

/**
 * "Lupa password", step 1.
 *
 * Resolves for an address that is not registered too — the endpoint answers 204
 * either way on purpose, and the screen says the same thing. A 429 is the one
 * failure worth surfacing: it means "too many tries from here", which the user
 * can act on by waiting.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const response = await postJson('/api/mail/password-reset', { email: email.trim() });
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
}

/**
 * "Lupa password", step 2 — redeems the token from the emailed link.
 *
 * The server deletes the token as it stores the password, so a link is
 * single-use; a retry after a network hiccup therefore fails with "expired",
 * which is the honest answer.
 */
export async function confirmPasswordReset(input: {
  token: string;
  password: string;
}): Promise<void> {
  const response = await postJson('/api/mail/password-reset/confirm', input);
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
}

/**
 * Mails one saved nota to its customer.
 *
 * Returns the address actually used and the resulting status, so the caller can
 * report "dikirim, ditandai Terkirim" without a second read. A 402 means the
 * organization's plan does not cover the invoice link the email carries.
 */
export async function sendInvoiceEmail(input: {
  invoiceId: string;
  to: string;
  note?: string;
}): Promise<{ to: string; status: string | null }> {
  const response = await bearerFetch('/api/mail/nota', { body: input });
  if (!response.ok) {
    throw appErrorFromStatus(response.status, await serverMessage(response));
  }
  const body = (await response.json().catch(() => null)) as {
    to?: unknown;
    status?: unknown;
  } | null;
  if (!body || typeof body.to !== 'string') {
    throw new AppError(ERROR_CODES.UNKNOWN, 'Respons server tidak valid.');
  }
  return { to: body.to, status: typeof body.status === 'string' ? body.status : null };
}

/**
 * The greeting, sent once per account.
 *
 * Fire-and-forget by design: the account already exists and the session is
 * already live, so a mail failure must not be shown as a failed sign-in. Every
 * error is swallowed here rather than at each call site.
 *
 * Called after sign-up, and at the end of an OAuth round trip — the two ways an
 * account is created. Not on a password sign-in: that account already had its
 * greeting, so asking again would cost a request and a prefs read for nothing.
 * The endpoint remembers the send (`welcomeSentAt` on the account), so a repeat
 * call cannot greet twice.
 *
 * `keepalive` is not incidental: every call site navigates immediately after it,
 * and without `keepalive` the browser may abort the request as the document goes
 * away, which would look exactly like "the greeting never arrives".
 */
export async function sendWelcomeEmail(): Promise<void> {
  try {
    await bearerFetch('/api/mail/welcome', { body: {}, keepalive: true });
  } catch {
    // Best effort. The user is signed in either way.
  }
}
