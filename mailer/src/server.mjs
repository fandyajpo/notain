/**
 * The HTTP entry point: what Notain's Pages Functions call.
 *
 * Two routes only, and no CORS: this is a server-to-server service, never
 * reached from a browser. A missing or wrong token is a 401 with no detail, so
 * the surface cannot be used as an oracle.
 *
 *   GET  /healthz  → { ok, configured }            (no token: liveness only)
 *   POST /send     → { ok, status } | { error, message }
 */

import { createServer } from 'node:http';
import { authorized } from './auth.mjs';
import { ConfigError, loadConfig } from './config.mjs';
import { handleSend } from './service.mjs';
import { closeTransport, deliverMessage } from './transport.mjs';

/** A send request is a few hundred bytes; anything larger is not one. */
const MAX_BODY_BYTES = 64 * 1024;

function json(status, body) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload_too_large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function send(response, result) {
  response.writeHead(result.status, result.headers);
  response.end(result.body);
}

export function createMailerServer(config) {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://mailer.local');

    if (url.pathname === '/healthz') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        send(response, json(405, { error: 'method_not_allowed' }));
        return;
      }
      send(response, json(200, { ok: true, configured: true }));
      return;
    }

    if (url.pathname !== '/send') {
      send(response, json(404, { error: 'not_found' }));
      return;
    }
    if (request.method !== 'POST') {
      send(response, json(405, { error: 'method_not_allowed' }));
      return;
    }
    if (!authorized(request.headers.authorization, config.serviceToken)) {
      send(response, json(401, { error: 'unauthenticated' }));
      return;
    }

    let raw;
    try {
      raw = await readBody(request);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'payload_too_large';
      send(response, json(tooLarge ? 413 : 400, { error: 'validation' }));
      return;
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      send(response, json(400, { error: 'validation', message: 'Body bukan JSON yang valid.' }));
      return;
    }

    const result = await handleSend(parsedBody, {
      config,
      deliver: (message) => deliverMessage(config, message),
    });
    // The relay's own error text is logged, never returned: it can name the
    // upstream host, the mailbox or the SMTP reply code.
    if (result.status >= 500) {
      console.error(
        JSON.stringify({
          t: 'mailer',
          event: 'send.failed',
          status: result.status,
          type: typeof parsedBody?.type === 'string' ? parsedBody.type : '-',
        }),
      );
    }
    send(response, json(result.status, result.body));
  });
}

function main() {
  let config;
  try {
    config = loadConfig(process.env, { requireServiceToken: true });
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : String(error);
    console.error(`mailer: konfigurasi tidak valid — ${message}`);
    process.exit(1);
  }

  // Warnings are configuration shapes that start fine but usually misbehave
  // later (a 12-character "app password", a From domain Google will rewrite).
  for (const warning of config.warnings ?? []) {
    console.warn(`mailer: ${warning}`);
  }

  const server = createMailerServer(config);

  server.listen(config.httpPort, '0.0.0.0', () => {
    console.log(`mailer: listening on 0.0.0.0:${config.httpPort} (from ${config.from.email})`);
  });

  const shutdown = (signal) => {
    console.log(`mailer: ${signal} received, shutting down`);
    server.close(() => {
      void closeTransport().finally(() => process.exit(0));
    });
    // A hung SMTP session must not keep the container alive forever.
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Only start a listener when run as a process; importing this file (a test, the
// Appwrite entry point) must not open a port.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
