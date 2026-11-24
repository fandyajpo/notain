import { fetchUpstream as fetch } from './http';
import { count, logQuota } from './quota';
import type { Env } from './types';

/**
 * The Notain half of the email contract.
 *
 * Every message goes through the `mailer/` service, which is the only place
 * `@sendust/ts` runs: it is a native Node-API addon and this app's entire
 * server side is Cloudflare Workers, where a native addon cannot load. The
 * mailer therefore runs as an Appwrite Function (`mailer/src/appwrite.mjs`), and
 * a Function's job is narrow and stable — validate, address, POST, report.
 *
 * Sending is best-effort by construction. `sendMail` never throws: a mail
 * outage must not turn a successful account creation or a saved invoice into
 * an error the user cannot act on. Callers decide whether an unset
 * `MAIL_SERVICE_*` pair is a 503 they surface (the two endpoints a person
 * explicitly asks for email from) or a silent skip (the welcome message).
 */

/** One message type per template the mailer renders. */
export type MailMessage =
  | { type: 'welcome'; to: string; name: string; loginUrl: string }
  | {
      type: 'password-reset';
      to: string;
      name: string;
      resetUrl: string;
      expiresMinutes: number;
    }
  | {
      type: 'invoice';
      to: string;
      customerName: string;
      invoiceNumber: string;
      businessName: string;
      total: number;
      date: string;
      dueDate?: string;
      note?: string;
      invoiceUrl: string;
      senderName: string;
    };

export type MailResult = 'sent' | 'skipped' | 'failed';

/**
 * How long one send may take, before the request is abandoned.
 *
 * Deliberately longer than the shared 10 s (`UPSTREAM_TIMEOUT_MS`): a mailer on
 * a free host sleeps when idle, and the first request of the day has to boot the
 * process before it can even open the SMTP session. Ten seconds turns that cold
 * start into a reported failure; 25 s usually absorbs it. A cold Appwrite
 * container can still take longer than that, which is why a timed-out send is
 * reported as a failure to retry and never silently dropped. Anything slower is a
 * wedged relay, not a wake-up.
 */
const MAIL_TIMEOUT_MS = 25_000;

function serviceBaseUrl(env: Env): string | null {
  const raw = env.MAIL_SERVICE_URL?.trim();
  if (!raw) return null;
  const trimmed = raw.replace(/\/+$/, '');
  // https everywhere except a loopback address, so a local mailer can be used
  // from `wrangler pages dev` without demanding a tunnel.
  if (trimmed.startsWith('https://')) return trimmed;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(trimmed)) return trimmed;
  return null;
}

function serviceToken(env: Env): string | null {
  const token = env.MAIL_SERVICE_TOKEN?.trim();
  return token ? token : null;
}

/** Whether this deployment can send at all — the four endpoints check it first. */
export function mailConfigured(env: Env): boolean {
  return serviceBaseUrl(env) !== null && serviceToken(env) !== null;
}

/**
 * Hands one payload to the mailer.
 *
 * One way in, one way out: the mailer is an Appwrite Function, reached over
 * HTTPS at `MAIL_SERVICE_URL` (its generated domain) with the shared token.
 * There is no Cloudflare-side route to it — a service binding can only point at
 * a Worker in this account, and no Worker can run this service.
 */
async function deliver(
  env: Env,
  body: string,
  headers: Record<string, string>,
): Promise<Response | null> {
  const base = serviceBaseUrl(env);
  if (base === null) return null;
  return fetch(`${base}/send`, { method: 'POST', headers, body }, MAIL_TIMEOUT_MS);
}

/**
 * Submits one message to the mailer.
 *
 * The deadline is `MAIL_TIMEOUT_MS` (25 s, not the shared 10) because a sleeping
 * free instance has to boot before it can answer. A non-2xx answer is a failure,
 * not a retry: the mailer has already applied its own bounded retry policy for
 * transient SMTP failures, and retrying here would double-send on the next
 * attempt instead of the next user action.
 */
export async function sendMail(env: Env, message: MailMessage): Promise<MailResult> {
  const token = serviceToken(env);
  // Both halves are needed: a URL with no token is a 401 waiting to happen.
  if (serviceBaseUrl(env) === null || token === null) {
    count('mail.skipped');
    return 'skipped';
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    // The mailer compares this before it reads the body; a wrong one is a 401.
    authorization: `Bearer ${token}`,
  };

  try {
    const response = await deliver(env, JSON.stringify(message), headers);
    if (response === null) {
      count('mail.skipped');
      return 'skipped';
    }
    if (!response.ok) {
      count(`mail.failed.${response.status}`);
      logQuota('mail', 'rejected', { type: message.type, status: response.status });
      return 'failed';
    }
    count('mail.sent');
    logQuota('mail', 'sent', { type: message.type });
    return 'sent';
  } catch {
    // Timeout, DNS, TLS, or a body the mailer refused to hand back.
    count('mail.failed');
    logQuota('mail', 'error', { type: message.type });
    return 'failed';
  }
}
