/**
 * Minimal Workers/Pages typings, declared here instead of pulling in
 * `@cloudflare/workers-types`.
 *
 * That package injects `Request`, `Response`, `fetch` and friends as globals,
 * which collide with the DOM lib the rest of this repo type-checks against —
 * a global-only dependency for two route files is not worth that. These
 * declarations cover exactly the surface the logo API touches.
 */

/**
 * The asset store every Pages Function is handed: the built `dist/` files.
 * It is how a function either answers with one of them or hands the request
 * back untouched (see `functions/invoice/[[id]].ts`).
 */
export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  /** R2 bucket binding declared in `wrangler.toml`. */
  LOGOS: R2Bucket;
  /** Injected by Pages itself, never declared in `wrangler.toml`. */
  ASSETS: AssetsBinding;
  PUBLIC_APPWRITE_ENDPOINT?: string;
  PUBLIC_APPWRITE_PROJECT_ID?: string;
  /**
   * Cloudflare Turnstile secret for `functions/api/turnstile.ts`. Set it as an
   * *encrypted* Pages variable (dashboard or `wrangler pages secret put`) —
   * never in `wrangler.toml`, which is committed.
   */
  TURNSTILE_SECRET_KEY?: string;
  /**
   * Appwrite API key for admin operations (list users, check team membership,
   * read/update profile rows, suspend accounts, write audit rows). Scope:
   * `users.read`, `users.write`, `teams.read`, `documents.read`,
   * `documents.write`. (Appwrite ≥2.4 splits table access: `collections.*`
   * covers schema, `documents.*` covers rows.) Set as an encrypted Pages
   * variable.
   */
  APPWRITE_API_KEY?: string;
  /**
   * DOKU sandbox checkout credentials (never the production ones — this
   * integration is sandbox-only). `DOKU_CLIENT_ID` goes in the `Client-Id`
   * header of every Checkout API call and must match the one DOKU signs
   * notifications with; `DOKU_SECRET_KEY` is the Back Office Secret Key used
   * to compute and verify the `HMACSHA256=` signatures. `DOKU_API_KEY` is
   * kept for DOKU APIs that use it (e.g. Snap Authorization); the hosted
   * Checkout flow documented at developers.doku.com only needs the two above.
   * Set all three as *encrypted* Pages variables — never in `wrangler.toml`.
   */
  DOKU_CLIENT_ID?: string;
  DOKU_SECRET_KEY?: string;
  DOKU_API_KEY?: string;
  /**
   * Optional quota-policy overrides, read by `functions/_lib/quota.ts`. Every
   * one is optional — the defaults live in that module and are safe for the
   * Cloudflare Free and Appwrite Free plans. Set only when tuning, as
   * ordinary (unencrypted) Pages variables; none of them are secrets.
   * Names: QUOTA_SESSION_CACHE_TTL_MS, QUOTA_ADMIN_CACHE_TTL_MS,
   * QUOTA_NEXT_NUMBER_CACHE_TTL_MS, QUOTA_APPWRITE_READ_RETRIES,
   * QUOTA_APPWRITE_RETRY_BASE_MS, QUOTA_DOKU_FAILURE_THRESHOLD,
   * QUOTA_DOKU_BREAKER_COOLDOWN_MS, and the QUOTA_LIMIT_* family
   * (see quota.ts for the full list).
   */
  [key: `QUOTA_${string}`]: string | undefined;
}

export type PagesFunction<E> = (context: {
  request: Request;
  /** Path params: `[key].ts` yields `params.key`. */
  params: Record<string, string | undefined>;
  env: E;
  waitUntil: (promise: Promise<unknown>) => void;
}) => Response | Promise<Response>;

export type R2HttpMetadata = { contentType?: string };

export interface R2Object {
  key: string;
  size: number;
  httpMetadata?: R2HttpMetadata;
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
    options?: { httpMetadata?: R2HttpMetadata; customMetadata?: Record<string, string> },
  ): Promise<R2Object>;
  delete(key: string | string[]): Promise<void>;
}
