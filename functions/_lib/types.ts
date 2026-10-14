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
   * read/update profile rows). Scope: `users.read`, `teams.read`,
   * `documents.read`, `documents.write`. (Appwrite ≥2.4 splits table access:
   * `collections.*` covers schema, `documents.*` covers rows.) Set as an
   * encrypted Pages variable.
   */
  APPWRITE_API_KEY?: string;
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
