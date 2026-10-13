/**
 * Minimal Workers/Pages typings, declared here instead of pulling in
 * `@cloudflare/workers-types`.
 *
 * That package injects `Request`, `Response`, `fetch` and friends as globals,
 * which collide with the DOM lib the rest of this repo type-checks against —
 * a global-only dependency for two route files is not worth that. These
 * declarations cover exactly the surface the logo API touches.
 */

export interface Env {
  /** R2 bucket binding declared in `wrangler.toml`. */
  LOGOS: R2Bucket;
  PUBLIC_APPWRITE_ENDPOINT?: string;
  PUBLIC_APPWRITE_PROJECT_ID?: string;
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
