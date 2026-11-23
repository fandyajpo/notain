/**
 * Optional second entry point: an Appwrite Function instead of a hosted
 * service, for operators who would rather not run another host.
 *
 * Appwrite Functions run a real Node 22 container (not an isolate), so the
 * Node-API addon inside `@sendust/ts` loads normally. Configure it as:
 *
 *   runtime   node-22
 *   command   npm install && node src/appwrite.mjs   (built at deploy time)
 *   variables SMTP_USER, SMTP_PASS (that is all Gmail needs — the host defaults
 *             to smtp.gmail.com), optionally SMTP_HOST, SMTP_PORT,
 *             SMTP_SECURITY, MAIL_FROM, MAIL_APP_NAME, MAIL_LOGO_URL
 *
 * and execute it over HTTP (POST with a JSON body) from the Pages Functions,
 * pointed at through `MAIL_SERVICE_URL` / `MAIL_SERVICE_TOKEN`.
 *
 * No shared token is required in this mode: Appwrite itself decides who may
 * execute the function, and the payload can only send the three templates this
 * module renders.
 */

import { ConfigError, loadConfig } from './config.mjs';
import { handleSend } from './service.mjs';
import { deliverMessage } from './transport.mjs';

export default async ({ req, res, log, error }) => {
  let config;
  try {
    config = loadConfig(process.env, { requireServiceToken: false });
  } catch (cause) {
    const message = cause instanceof ConfigError ? cause.message : String(cause);
    error(`mailer: ${message}`);
    return res.json({ error: 'unavailable', message }, 503);
  }

  if (req.method !== 'POST') {
    return res.json({ error: 'method_not_allowed' }, 405);
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

  log(`mailer: ${result.status} ${String(body?.type ?? '-')} ${String(body?.to ?? '-')}`);
  return res.json(result.body, result.status);
};
