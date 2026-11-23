import { fetchUpstream as fetch } from './http';
import { count, logQuota } from './quota';
import type { Env } from './types';

/**
 * The Notain half of the email contract.
 *
 * Every message goes through the `mailer/` service, which is the only place
 * `@sendust/ts` runs: it is a native Node-API addon and this app's entire
 * server side is Cloudflare Workers, where a native addon cannot load. So a
 * Function's job is narrow and stable — validate, address, POST, report.
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
 * Submits one message to the mailer.
 *
 * 10 s deadline through `fetchUpstream`, so a wedged relay cannot hold a Pages
 * invocation open. A non-2xx answer is a failure, not a retry: the mailer has
 * already applied its own bounded retry policy for transient SMTP failures,
 * and retrying here would double-send on the next attempt instead of the next
 * user action.
 */
export async function sendMail(env: Env, message: MailMessage): Promise<MailResult> {
  const base = serviceBaseUrl(env);
  const token = serviceToken(env);
  if (!base || !token) {
    count('mail.skipped');
    return 'skipped';
  }

  try {
    const response = await fetch(`${base}/send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(message),
    });
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
