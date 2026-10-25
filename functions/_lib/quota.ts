import { apiError } from './http';

/**
 * Centralized quota policy for every Pages Function.
 *
 * Everything here is **per isolate** — Cloudflare recycles isolates at will
 * and Pages Functions on the Free plan have no KV/D1 binding to persist state
 * (and adding one would spend quota to save quota). So the honest contract is:
 *
 * - Rate limits, caches, dedup and the circuit breaker are best-effort burst
 *   protection inside one isolate. They reset on isolate recycle; they are
 *   NOT a guarantee across the fleet.
 * - Monthly provider quotas (Workers requests, Appwrite reads/writes, R2
 *   operations) cannot be measured from inside a Function. They live in the
 *   provider dashboards; this module only enforces the *per-request* guards
 *   that keep us away from those ceilings and reports local counters as
 *   clearly-labelled partial measurements.
 *
 * All thresholds are overridable via `QUOTA_*` Pages variables (dashboard or
 * `wrangler pages secret put`); the defaults below are chosen to be safe for
 * the Appwrite Free plan (500k reads / 250k writes per month, counted per
 * row) and the Workers Free plan (100k requests/day shared by every Pages
 * Function on this account).
 */

/**
 * The only part of `Env` this module reads: the optional `QUOTA_*` override
 * family. Typing against it (rather than `Env`) lets callers — and tests —
 * pass just the overrides they are tuning without satisfying the binding
 * fields (`LOGOS`, `ASSETS`) that a quota decision never touches.
 */
export type QuotaEnv = { readonly [key: `QUOTA_${string}`]: string | undefined };

/** Named tunables; every one reads `env.QUOTA_*` and falls back to a default. */
export type QuotaPolicy = {
  /** How long a verified Appwrite session (JWT → GET /account) is trusted. */
  sessionCacheTtlMs: number;
  /** How long an `admins`-team membership answer is trusted. */
  adminCacheTtlMs: number;
  /** How long a computed next-invoice-number suggestion is reused. */
  nextNumberCacheTtlMs: number;
  /** Extra attempts for a *failed* Appwrite GET read (network error / 5xx). */
  appwriteReadRetries: number;
  /** Base delay for that retry's exponential backoff. */
  appwriteRetryBaseDelayMs: number;
  /** Consecutive DOKU failures that open the circuit breaker. */
  dokuFailureThreshold: number;
  /** How long the DOKU breaker stays open before one probe is allowed. */
  dokuBreakerCooldownMs: number;
  /** Sliding-window limits, `{ name: { limit, windowMs } }`. */
  limits: Record<LimitName, { limit: number; windowMs: number }>;
};

export type LimitName =
  | 'csp-report'
  | 'turnstile'
  | 'support'
  | 'proof-upload'
  | 'proof-upload-owner'
  | 'logo-upload'
  | 'checkout'
  | 'invoice-quota'
  | 'site';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Defaults for the public/abuse-prone write endpoints. These guard *our*
 * quota (a Workers invocation plus, for turnstile/proof/checkout, a
 * subrequest or an R2 write) — they are not security boundaries, only cost
 * fences. Turnstile itself is unlimited on the Free plan, so the bot gate
 * stays the real protection; these stop a flood from burning invocation
 * quota before or despite it.
 */
const DEFAULT_LIMITS: Record<LimitName, { limit: number; windowMs: number }> = {
  'csp-report': { limit: 30, windowMs: MINUTE },
  turnstile: { limit: 30, windowMs: MINUTE },
  support: { limit: 5, windowMs: HOUR },
  'proof-upload': { limit: 6, windowMs: HOUR },
  'proof-upload-owner': { limit: 30, windowMs: HOUR },
  'logo-upload': { limit: 10, windowMs: HOUR },
  checkout: { limit: 10, windowMs: HOUR },
  // The quota claim runs on every save attempt, so this one is a *burst*
  // fence rather than an hourly budget: a legitimate user taps save a handful
  // of times a minute at most, while a loop asking "am I over?" sixty times a
  // second is either a bug or a probe. The limit sits above the page's own
  // debounce so a slow double-click never trips it.
  'invoice-quota': { limit: 60, windowMs: MINUTE },
  // The public business page is a *read*, but an expensive one: every hit is
  // a profile row plus a catalog list (up to a hundred rows counted per row
  // against the Appwrite read quota). The fence stops a flood from burning
  // read quota; 60/min is far above what one real visitor's page load costs.
  site: { limit: 60, windowMs: MINUTE },
};

const LIMIT_ENV_OVERRIDES: Record<LimitName, string> = {
  'csp-report': 'QUOTA_LIMIT_CSP_PER_MINUTE',
  turnstile: 'QUOTA_LIMIT_TURNSTILE_PER_MINUTE',
  support: 'QUOTA_LIMIT_SUPPORT_PER_HOUR',
  'proof-upload': 'QUOTA_LIMIT_PROOF_PER_HOUR',
  'proof-upload-owner': 'QUOTA_LIMIT_PROOF_OWNER_PER_HOUR',
  'logo-upload': 'QUOTA_LIMIT_LOGO_PER_HOUR',
  checkout: 'QUOTA_LIMIT_CHECKOUT_PER_HOUR',
  'invoice-quota': 'QUOTA_LIMIT_INVOICE_QUOTA_PER_MINUTE',
  site: 'QUOTA_LIMIT_SITE_PER_MINUTE',
};

/** Reads `env[name]` as a positive integer, else `fallback`. */
function envInt(env: QuotaEnv | undefined, name: string, fallback: number): number {
  const raw = env?.[name as `QUOTA_${string}`];
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

/** Resolves the effective policy for this request's env (cheap, allocation-light). */
export function quotaPolicy(env?: QuotaEnv): QuotaPolicy {
  const limits = {} as QuotaPolicy['limits'];
  for (const name of Object.keys(DEFAULT_LIMITS) as LimitName[]) {
    limits[name] = {
      limit: envInt(env, LIMIT_ENV_OVERRIDES[name], DEFAULT_LIMITS[name].limit),
      windowMs: DEFAULT_LIMITS[name].windowMs,
    };
  }
  return {
    sessionCacheTtlMs: envInt(env, 'QUOTA_SESSION_CACHE_TTL_MS', 60_000),
    adminCacheTtlMs: envInt(env, 'QUOTA_ADMIN_CACHE_TTL_MS', 60_000),
    nextNumberCacheTtlMs: envInt(env, 'QUOTA_NEXT_NUMBER_CACHE_TTL_MS', 30_000),
    appwriteReadRetries: envInt(env, 'QUOTA_APPWRITE_READ_RETRIES', 1),
    appwriteRetryBaseDelayMs: envInt(env, 'QUOTA_APPWRITE_RETRY_BASE_MS', 250),
    dokuFailureThreshold: envInt(env, 'QUOTA_DOKU_FAILURE_THRESHOLD', 5),
    dokuBreakerCooldownMs: envInt(env, 'QUOTA_DOKU_BREAKER_COOLDOWN_MS', 30_000),
    limits,
  };
}

// --- Counters & structured logs -------------------------------------------

/** Per-isolate counters, exposed (with their caveat) by `/api/admin/quota`. */
const counters = new Map<string, number>();

/** Bump a named counter. Names are flat strings like `doku.probe`. */
export function count(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

/**
 * One structured log line. No personal data: callers pass route names,
 * statuses and counters — never emails or full ids (use {@link shortId}).
 */
export function logQuota(
  component: string,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({ t: 'quota', component, event, ...fields }));
}

/** Truncates an identifier for logs/metrics: enough to correlate, not to identify. */
export function shortId(value: string | null | undefined): string {
  if (!value) return '-';
  return value.length <= 8 ? value : `${value.slice(0, 8)}…`;
}

// --- Sliding-window rate limiter -------------------------------------------

/**
 * Hits per key inside a rolling window. Returns how many seconds the caller
 * should tell the client to wait (`0` = allowed). Keys are IP addresses or
 * user ids; entries expire with the window and a size sweep keeps a flood of
 * distinct keys from growing the map without bound.
 */
const windows = new Map<string, number[]>();
const WINDOW_SWEEP_AT = 2_000;

export function rateLimit(
  name: LimitName,
  key: string,
  policy: QuotaPolicy,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const { limit, windowMs } = policy.limits[name];
  const mapKey = `${name}|${key}`;
  const cutoff = now - windowMs;

  const hits = windows.get(mapKey)?.filter((at) => at > cutoff) ?? [];
  if (hits.length >= limit) {
    // The request that would free a slot is the one at the back of the queue:
    // index `hits.length - limit` (== 0 when the window is exactly full).
    const freeingHit = hits[hits.length - limit] ?? hits[0] ?? now;
    windows.set(mapKey, hits);
    const retryAfterMs = Math.max(1, freeingHit + windowMs - now);
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  hits.push(now);
  windows.set(mapKey, hits);
  if (windows.size > WINDOW_SWEEP_AT) sweepWindows(cutoff);
  return { allowed: true };
}

function sweepWindows(cutoff: number): void {
  for (const [key, hits] of windows) {
    const live = hits.filter((at) => at > cutoff);
    if (live.length === 0) windows.delete(key);
    else windows.set(key, live);
  }
}

/**
 * The one-liner most endpoints use: `const limited = enforceLimit('support', ip(env, request), env); if (limited) return limited;`
 * Returns a ready 429 response (with `retry-after` and a counted metric) when
 * the caller is over the limit, `null` otherwise. Never throws.
 */
export function enforceLimit(name: LimitName, key: string, env?: QuotaEnv): Response | null {
  const result = rateLimit(name, key, quotaPolicy(env));
  if (result.allowed) return null;
  count(`${name}.rate-limited`);
  return apiError(429, 'rate_limited', 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.', {
    'retry-after': String(result.retryAfterSeconds),
  });
}

/** Caller identity for rate limiting: the connecting IP, falling back to a single bucket. */
export function requestKey(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

// --- TTL cache ---------------------------------------------------------------

/** Bounded key/value cache with per-entry expiry (session, admin, numbering). */
const entries = new Map<string, { value: unknown; expiresAt: number }>();
const CACHE_SWEEP_AT = 1_000;

export function cacheGet<T>(key: string, now = Date.now()): T | undefined {
  const hit = entries.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= now) {
    entries.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number, now = Date.now()): void {
  if (ttlMs <= 0) return;
  entries.set(key, { value, expiresAt: now + ttlMs });
  if (entries.size > CACHE_SWEEP_AT) {
    for (const [k, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(k);
    }
  }
}

export function cacheDelete(key: string): void {
  entries.delete(key);
}

// --- Single-flight dedup ------------------------------------------------------

/**
 * Coalesces concurrent identical work: the first caller runs `fn`, everyone
 * else awaiting the same `key` shares its outcome. Used for the session
 * probe, the DOKU status probe and payment settlement — the three places
 * where duplicate in-flight requests would spend provider quota to compute
 * the same answer twice.
 */
const inflight = new Map<string, Promise<unknown>>();

export async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

// --- Circuit breaker -----------------------------------------------------------

/**
 * Consecutive-failure breaker for one downstream provider (`doku`).
 *
 * closed → (N consecutive failures) → open → (cooldown) → half-open (one
 * probe) → closed on success / open again on failure. While open, callers
 * fail fast with a controlled error instead of spending quota on calls that
 * are known to fail — "stop nonessential work before exhausting quota".
 */
type BreakerState = { failures: number; openedAt: number | null };
const breakers = new Map<string, BreakerState>();

function breaker(name: string): BreakerState {
  let state = breakers.get(name);
  if (!state) {
    state = { failures: 0, openedAt: null };
    breakers.set(name, state);
  }
  return state;
}

/** Whether a call to `name` may proceed right now (half-open lets one through). */
export function breakerAllows(name: string, policy: QuotaPolicy, now = Date.now()): boolean {
  const state = breaker(name);
  if (state.openedAt === null) return true;
  return now - state.openedAt >= policy.dokuBreakerCooldownMs;
}

export function breakerSuccess(name: string): void {
  const state = breaker(name);
  state.failures = 0;
  state.openedAt = null;
}

export function breakerFailure(name: string, policy: QuotaPolicy, now = Date.now()): void {
  const state = breaker(name);
  state.failures += 1;
  if (state.failures >= policy.dokuFailureThreshold) {
    const openedNow = state.openedAt === null;
    state.openedAt = now;
    if (openedNow) {
      logQuota('breaker', 'open', { name, failures: state.failures });
      count('breaker.open');
    }
  }
}

/** Test/snapshot view: `closed`, `open`, or `half-open` (cooldown elapsed). */
export function breakerStatus(name: string, policy: QuotaPolicy, now = Date.now()): string {
  const state = breaker(name);
  if (state.openedAt === null) return 'closed';
  return now - state.openedAt >= policy.dokuBreakerCooldownMs ? 'half-open' : 'open';
}

// --- Snapshot ------------------------------------------------------------------

/** Everything `/api/admin/quota` reports about this isolate's local state. */
export function quotaSnapshot(policy: QuotaPolicy): {
  isolate: {
    scope: 'single-isolate';
    note: string;
    counters: Record<string, number>;
    breakers: Record<string, string>;
    cacheEntries: number;
    rateLimitKeys: number;
    inflightKeys: number;
  };
  policy: QuotaPolicy;
} {
  const breakersView: Record<string, string> = {};
  for (const name of breakers.keys()) breakersView[name] = breakerStatus(name, policy);
  return {
    isolate: {
      scope: 'single-isolate',
      note: 'Local to whichever isolate answered this request; resets on isolate recycle and is NOT fleet-wide. Provider totals live in the Cloudflare and Appwrite dashboards.',
      counters: Object.fromEntries([...counters.entries()].sort(([a], [b]) => a.localeCompare(b))),
      breakers: breakersView,
      cacheEntries: entries.size,
      rateLimitKeys: windows.size,
      inflightKeys: inflight.size,
    },
    policy,
  };
}

/** Clears every piece of isolate state. Used by tests and nowhere in prod paths. */
export function resetQuotaState(): void {
  counters.clear();
  windows.clear();
  entries.clear();
  inflight.clear();
  breakers.clear();
}

// --- Documented provider limits (verified 2026-10-22, official docs) ----------

/**
 * Free-plan ceilings as published by the providers. These are **limits**, not
 * measurements — `usage` is deliberately absent because neither Cloudflare's
 * Workers quotas nor Appwrite's quotas are readable in real time from inside
 * a Function (Appwrite Free exposes no usage API at all; Cloudflare's
 * GraphQL analytics are aggregated and explicitly not billing-grade).
 */
export const PROVIDER_LIMITS = {
  verifiedAt: '2026-10-22',
  cloudflare: {
    workersRequestsPerDay: 100_000,
    workersCpuMsPerRequest: 10,
    workersNote:
      'Pages Functions share the Workers Free quota — they are NOT an independent allowance. Exceeding it fails requests (Error 1027); it is never converted to paid usage on Free.',
    pagesBuildsPerMonth: 500,
    r2: {
      storageGbMonth: 10,
      classAOperationsPerMonth: 1_000_000,
      classBOperationsPerMonth: 10_000_000,
      egress: 'free',
      billingRisk:
        'R2 free tiers are INCLUDED AMOUNTS, not hard caps: usage beyond them is metered and BILLED automatically. This is the only automatic-billing risk in this stack — keep objects small, delete superseded ones, watch Workers & Pages → R2.',
    },
    turnstileChallengesPerMonth: null,
    turnstileNote: 'Unlimited on Free (max 20 widgets, 10 hostnames each).',
    usageSource:
      'Workers & Pages dashboard; GraphQL Analytics API (workersInvocationsAdaptive) with an API token that has Analytics read.',
    sources: {
      workers: 'https://developers.cloudflare.com/workers/platform/pricing/',
      limits: 'https://developers.cloudflare.com/workers/platform/limits/',
      pages: 'https://developers.cloudflare.com/pages/platform/limits/',
      r2: 'https://developers.cloudflare.com/r2/pricing/',
      turnstile: 'https://developers.cloudflare.com/turnstile/plans/',
    },
  },
  appwrite: {
    databaseReadsPerMonth: 500_000,
    databaseWritesPerMonth: 250_000,
    countingNote:
      'Counted per ROW returned/written, not per API call: a list of 50 rows costs 50 reads.',
    storageGb: 2,
    bandwidthGbPerMonth: 5,
    realtimeMessagesPerMonth: 2_000_000,
    realtimeConcurrentConnections: 250,
    atLimitNote:
      'Free never auto-upgrades or charges: database ops are throttled, bandwidth denial blocks API access, function executions and realtime subscriptions are disabled, uploads are refused.',
    usageSource:
      'No public usage API on Free — organization Usage tab in the Appwrite Console is the source of truth.',
    sources: {
      free: 'https://appwrite.io/docs/advanced/billing/free',
      database: 'https://appwrite.io/docs/advanced/billing/database-reads-and-writes',
      pricing: 'https://appwrite.io/pricing',
    },
  },
} as const;
