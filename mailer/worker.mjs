/**
 * Cloudflare front door for the mailer container.
 *
 * The email engine is `@sendust/ts` — a native Node addon, which a Worker
 * cannot load. Cloudflare Containers is the one Cloudflare product that can run
 * it: this Worker owns a Durable Object that starts the container image built
 * from `./Dockerfile` and forwards requests to the HTTP server inside it.
 *
 * The HTTP shape is deliberately identical to the standalone service
 * (`src/server.mjs`): `POST /send` with a bearer token and `GET /healthz`. That
 * is what `functions/_lib/mail.ts` already speaks, so the Pages Functions need
 * no change — `MAIL_SERVICE_URL` simply points at this Worker instead of a
 * separate host.
 *
 * Deploy: `npx wrangler deploy` from `mailer/` builds and pushes the image with
 * Docker, then ships this Worker. `.github/workflows/deploy.yml` does it on
 * every push to main.
 */

import { DurableObject } from 'cloudflare:workers';

/** The port the container's Node server listens on (`PORT` in the Dockerfile). */
const PORT = 8080;

/** How long the container stays warm after a request, so a burst costs one boot. */
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

/** Readiness probe attempts, 200 ms apart (the container start is asynchronous). */
const READINESS_ATTEMPTS = 150;

/** Everything the container needs at runtime, read from this Worker's env. */
const CONTAINER_ENV_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURITY',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM',
  'MAIL_APP_NAME',
  'MAIL_LOGO_URL',
  'MAIL_SERVICE_TOKEN',
];

/**
 * Length-independent comparison, so a wrong token costs the same time as any
 * other wrong token. Workers have no `crypto.timingSafeEqual`; comparing every
 * character of the longer string (with a length difference folded into the
 * accumulator) is close enough for a shared secret that never leaves a server.
 */
function sameToken(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (provided === '' || expected === '') return false;
  let diff = provided.length ^ expected.length;
  const length = Math.max(provided.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (provided.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return diff === 0;
}

export class MailerContainer extends DurableObject {
  /** One shared startup, so ten concurrent sends boot the container once. */
  #starting = undefined;
  #monitoring = undefined;

  constructor(ctx, env) {
    super(ctx, env);
    if (ctx.container?.running) {
      // The Durable Object restarted while its container kept running: restore
      // the warm window and start watching for an exit again.
      void ctx.blockConcurrencyWhile(() =>
        ctx.container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS),
      );
      this.#observeExit();
    }
  }

  async fetch(request) {
    if (!this.ctx.container) {
      return Response.json(
        { error: 'unavailable', message: 'Container tidak tersedia.' },
        { status: 503 },
      );
    }

    this.#starting ??= this.#startAndWait().finally(() => {
      this.#starting = undefined;
    });
    await this.#starting;

    const url = new URL(request.url);
    url.protocol = 'http:';
    url.host = 'container';
    const forwarded = new Request(url, request);
    forwarded.headers.delete('host');
    return this.ctx.container.getTcpPort(PORT).fetch(forwarded);
  }

  async #startAndWait() {
    const container = this.ctx.container;

    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: 'lite',
        // SMTP submission is an outbound TLS connection; without this the
        // container can never reach the relay.
        enableInternet: true,
        env: this.#containerEnv(),
      });
    }

    this.#observeExit();
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);

    const port = container.getTcpPort(PORT);
    for (let attempt = 0; attempt < READINESS_ATTEMPTS; attempt += 1) {
      try {
        const response = await port.fetch('http://container/healthz', {
          signal: AbortSignal.timeout(1000),
        });
        await response.body?.cancel();
        if (response.ok) return;
      } catch {
        // Not listening yet; keep probing rather than failing the request.
      }
      await scheduler.wait(200);
    }
    throw new Error(`mailer container did not become ready on port ${PORT}`);
  }

  /** Only the keys that are actually set, so a blank variable keeps its default. */
  #containerEnv() {
    const env = { PORT: String(PORT) };
    for (const key of CONTAINER_ENV_KEYS) {
      const value = this.env[key];
      if (typeof value === 'string' && value !== '') env[key] = value;
    }
    return env;
  }

  #observeExit() {
    if (this.#monitoring) return;
    this.#monitoring = this.ctx.container
      .monitor()
      .then(() => console.log('mailer container exited'))
      .catch((error) => console.error('mailer container failed', error))
      .finally(() => {
        this.#monitoring = undefined;
      });
    this.ctx.waitUntil(this.#monitoring);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/healthz') {
      return env.MAILER.getByName('mailer').fetch(request);
    }

    if (url.pathname !== '/send') {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    }

    // Reject a wrong token here, before a container is booted for it. The
    // container checks it again for its own protection.
    const header = request.headers.get('authorization') ?? '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!sameToken(token, env.MAIL_SERVICE_TOKEN ?? '')) {
      return Response.json({ error: 'unauthenticated' }, { status: 401 });
    }

    return env.MAILER.getByName('mailer').fetch(request);
  },
};
