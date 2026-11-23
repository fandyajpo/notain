/**
 * The only file that imports the native email engine.
 *
 * `@sendust/ts` is a thin TypeScript facade over a Sendust-owned Node-API
 * addon: it speaks SMTP itself, over TLS with certificate and hostname
 * verification always on. That is the reason this service exists at all —
 * Cloudflare Workers (where every `/api/*` route runs) cannot load a native
 * addon, so the relay call has to happen on a Node runtime.
 *
 * One transport per process: the addon pools and reuses SMTP sessions, queues
 * concurrent sends and retries only transient failures, so creating a
 * transport per request would throw all of that away.
 */

import { createTransport } from '@sendust/ts';

/** @type {import('@sendust/ts').Transport | null} */
let transport = null;

function getTransport(config) {
  if (transport === null) {
    transport = createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      ...(config.smtp.auth === null ? {} : { auth: config.smtp.auth }),
    });
  }
  return transport;
}

/**
 * `accepted` | `rejected` | `unknown`, normalised.
 *
 * The distinction is the whole contract: `accepted` means the relay took
 * responsibility for the message (never "it reached a mailbox"), `rejected`
 * means it refused, and `unknown` means the result of the transaction could not
 * be established — which must never be retried or reported as success.
 */
function normaliseStatus(result) {
  const status = result && typeof result.status === 'string' ? result.status : '';
  if (status === 'accepted' || status === 'rejected') return status;
  return 'unknown';
}

/**
 * Submits one message and reports what the relay said.
 *
 * @param {ReturnType<import('./config.mjs').loadConfig>} config
 * @param {{ to: string, subject: string, text: string, html: string }} message
 * @returns {Promise<{ status: 'accepted' | 'rejected' | 'unknown' }>}
 */
export async function deliverMessage(config, message) {
  const result = await getTransport(config).send({
    from: config.from.email,
    to: [message.to],
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { status: normaliseStatus(result) };
}

/** Releases the pooled sessions. Called once, on shutdown. */
export async function closeTransport() {
  const current = transport;
  transport = null;
  if (current === null) return;
  try {
    await current.close();
  } catch {
    // Closing a broken pool is not worth failing a shutdown over.
  }
}
