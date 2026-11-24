/**
 * Appwrite Function entry point — the host this repository actually uses.
 *
 * Appwrite Functions run a real Node container (not an isolate), so the
 * Node-API addon inside `@sendust/ts` loads normally. That makes an Appwrite
 * Function the one place this mailer can live for free: the project's own
 * Appwrite organization already runs it, no card, no second provider.
 *
 * Configure it as:
 *
 *   runtime      Node.js 22 (`node-22`)
 *   root dir     `mailer/` — or, when the field is absent, build command
 *                `cd mailer && npm install --omit=dev`
 *   entrypoint   `src/appwrite.mjs` — or `mailer/src/appwrite.mjs`
 *   variables    SMTP_USER, SMTP_PASS, MAIL_SERVICE_TOKEN, optionally
 *                SMTP_HOST, SMTP_PORT, SMTP_SECURITY, MAIL_FROM,
 *                MAIL_APP_NAME, MAIL_LOGO_URL
 *   execute      Any — the generated domain is public, and the bearer token
 *                below is what actually decides who may send
 *
 * Then point `MAIL_SERVICE_URL` at the function's generated domain
 * (`https://<hash>.<region>.appwrite.run`) and give the Pages project the same
 * `MAIL_SERVICE_TOKEN`. A domain execution passes method, path, headers and
 * body through untouched, so the contract is identical to `src/server.mjs`:
 * `POST /send` with the JSON message, `GET /healthz` for a liveness check.
 */

import { authorized } from './auth.mjs';
import { ConfigError, loadConfig } from './config.mjs';
import { handleSend } from './service.mjs';
import { deliverMessage } from './transport.mjs';

/** Appwrite lowercases header names, but nothing promises that forever. */
function bearer(req) {
  const headers = req?.headers ?? {};
  return headers.authorization ?? headers.Authorization ?? '';
}

export default async ({ req, res, log, error }) => {
  let config;
  try {
    // The token is required in this mode. Execute access has to be `Any` for
    // the Pages Function to call the domain without a session, so without the
    // check this would be an open relay anyone could post mail through.
    config = loadConfig(process.env, { requireServiceToken: true });
  } catch (cause) {
    const message = cause instanceof ConfigError ? cause.message : String(cause);
    error(`mailer: ${message}`);
    return res.json({ error: 'unavailable', message }, 503);
  }

  const path = String(req.path ?? '/').split('?')[0];

  if (path === '/healthz') {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.json({ error: 'method_not_allowed' }, 405);
    }
    // No SMTP session is opened, so this is safe to poll.
    return res.json({ ok: true, configured: true });
  }

  // Everything else is the send route: the domain is single-purpose, and it may
  // hand the request over as `/` or as the path the caller used.
  if (req.method !== 'POST') {
    return res.json({ error: 'method_not_allowed' }, 405);
  }
  if (!authorized(bearer(req), config.serviceToken)) {
    return res.json({ error: 'unauthenticated' }, 401);
  }

  let body = req.bodyJson;
  if (body === undefined) {
    try {
      body = JSON.parse(req.bodyText ?? '');
    } catch {
      return res.json({ error: 'validation', message: 'Body bukan JSON yang valid.' }, 400);
    }
  }

  const result = await handleSend(body, {
    config,
    deliver: (message) => deliverMessage(config, message),
  });

  // The relay's own text is logged, never returned: it can name the upstream
  // host, the mailbox or the SMTP reply code.
  if (result.status >= 500) {
    error(`mailer: send.failed ${result.status} ${String(body?.type ?? '-')}`);
  } else {
    log(`mailer: ${result.status} ${String(body?.type ?? '-')}`);
  }
  return res.json(result.body, result.status);
};
