import { checkTurnstile } from '../_lib/turnstile';
import { apiError, fetchUpstream as fetch, json } from '../_lib/http';
import { tableAuth } from '../_lib/rows';
import { enforceLimit, requestKey } from '../_lib/quota';
import type { Env, PagesFunction } from '../_lib/types';

const DATABASE_ID = 'notain_db';
const SUPPORT_TABLE_ID = 'support';
const LIMITS = { name: 128, email: 128, subject: 128, message: 4000 };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE_LENGTH = 10;

/**
 * `POST /api/support` — the public support/contact form (landing page and
 * `/contact`).
 *
 * Anonymous by design — the visitor may not even have an account — so the
 * three defences mirror the payment-proof upload:
 *
 * 1. **Turnstile** — verified server-side before a single row is written; a
 *    missing or rejected token answers 400/502, never stores anything.
 * 2. **Validation** — trimmed, length-capped, email-shaped; the message floor
 *    (`MIN_MESSAGE_LENGTH`) keeps drive-by noise out without turning real
 *    short questions away.
 * 3. **API key write** — rows are created with the server key and empty row
 *    permissions, so nobody can read or edit them from a client. There is no
 *    listing endpoint yet; messages are read in the Appwrite Console.
 */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'POST') {
    return apiError(405, 'method_not_allowed', 'Metode ini tidak didukung.', { allow: 'POST' });
  }

  // Before the Turnstile round trip and the Appwrite write: a flood of
  // submissions would otherwise spend one Worker invocation, one siteverify
  // subrequest and one database write each. `cf-connecting-ip` is assigned by
  // Cloudflare's edge, so it cannot be forged from inside its own network.
  const limited = enforceLimit('support', requestKey(request), env);
  if (limited) return limited;

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!body) return apiError(400, 'validation', 'Format permintaan tidak valid.');

  const text = (key: keyof typeof LIMITS): string =>
    typeof body?.[key] === 'string' ? (body[key] as string).trim() : '';
  const name = text('name');
  const email = text('email');
  const subject = text('subject');
  const message = text('message');
  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';

  if (name === '' || name.length > LIMITS.name) {
    return apiError(400, 'validation', 'Nama wajib diisi (maksimal 128 karakter).');
  }
  if (email === '' || email.length > LIMITS.email || !EMAIL_PATTERN.test(email)) {
    return apiError(400, 'validation', 'Email wajib diisi dengan format yang benar.');
  }
  if (subject.length > LIMITS.subject) {
    return apiError(400, 'validation', 'Subjek terlalu panjang. Maksimal 128 karakter.');
  }
  if (message.length < MIN_MESSAGE_LENGTH || message.length > LIMITS.message) {
    return apiError(
      400,
      'validation',
      `Pesan minimal ${MIN_MESSAGE_LENGTH} dan maksimal ${LIMITS.message} karakter.`,
    );
  }

  const gate = await checkTurnstile(request, env, turnstileToken);
  if (gate.state === 'unconfigured') {
    return apiError(500, 'validation', 'Verifikasi keamanan belum dikonfigurasi.');
  }
  if (gate.state === 'missing_token') {
    return apiError(400, 'validation', 'Token verifikasi belum tersedia.');
  }
  if (gate.state === 'unreachable') {
    return apiError(502, 'validation', 'Verifikasi keamanan gagal dihubungi.');
  }
  if (gate.state === 'rejected') {
    return apiError(
      400,
      'validation',
      'Verifikasi keamanan gagal. Selesaikan kotak Turnstile, lalu coba lagi.',
    );
  }

  const auth = tableAuth(env);
  if (!auth) {
    return apiError(500, 'validation', 'Pengiriman pesan belum terkonfigurasi di server.');
  }

  const source = body.source === 'contact' ? 'contact' : 'landing';
  const response = await fetch(
    `${auth.endpoint}/databases/${DATABASE_ID}/collections/${SUPPORT_TABLE_ID}/documents`,
    {
      method: 'POST',
      headers: { ...auth.headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        documentId: 'unique()',
        data: {
          name,
          email,
          subject,
          message,
          source,
          createdAt: new Date().toISOString(),
        },
        permissions: [],
      }),
    },
  );

  if (response.status === 404) {
    // Table not created yet — say so honestly instead of claiming success.
    return apiError(
      500,
      'validation',
      'Pengiriman pesan belum aktif. Kabari kami lewat email notaindevs@gmail.com.',
    );
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    return apiError(500, 'validation', `Gagal mengirim pesan: ${detail}`);
  }

  return json(200, { success: true });
};
