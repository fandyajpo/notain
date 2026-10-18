import { AppError, ERROR_CODES } from '../core/shared/errors';

export type SupportSource = 'landing' | 'contact';

export type SupportPayload = {
  name: string;
  email: string;
  subject: string;
  message: string;
  source: SupportSource;
  turnstileToken: string | null;
};

async function serverMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message !== ''
      ? body.message
      : 'Permintaan gagal. Coba lagi.';
  } catch {
    return 'Permintaan gagal. Coba lagi.';
  }
}

/**
 * Sends one public support/contact message to `POST /api/support`.
 *
 * Anonymous by contract: no session, the Turnstile token rides in the body,
 * and a rejection surfaces as an `AppError` with the server's message so the
 * form can show it inline.
 */
export async function sendSupport(payload: SupportPayload): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/support', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AppError(
      ERROR_CODES.NETWORK,
      'Tidak bisa terhubung ke server. Cek koneksi internet kamu.',
    );
  }

  if (!response.ok) {
    throw new AppError(ERROR_CODES.UNKNOWN, await serverMessage(response));
  }
}
