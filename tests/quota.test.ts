import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  breakerAllows,
  breakerFailure,
  breakerStatus,
  breakerSuccess,
  cacheGet,
  cacheSet,
  count,
  enforceLimit,
  PROVIDER_LIMITS,
  quotaPolicy,
  quotaSnapshot,
  rateLimit,
  resetQuotaState,
  singleFlight,
} from '../functions/_lib/quota';

beforeEach(() => {
  resetQuotaState();
});

describe('quotaPolicy', () => {
  it('falls back to safe defaults with no env overrides', () => {
    const policy = quotaPolicy(undefined);
    expect(policy.sessionCacheTtlMs).toBe(60_000);
    expect(policy.dokuFailureThreshold).toBe(5);
    expect(policy.limits.support.limit).toBe(5);
    expect(policy.limits.checkout.windowMs).toBe(60 * 60_000);
  });

  it('applies QUOTA_* overrides and ignores garbage values', () => {
    const policy = quotaPolicy({
      QUOTA_SESSION_CACHE_TTL_MS: '0',
      QUOTA_DOKU_FAILURE_THRESHOLD: '2',
      QUOTA_LIMIT_SUPPORT_PER_HOUR: '9',
      QUOTA_LIMIT_TURNSTILE_PER_MINUTE: 'not-a-number',
    });
    expect(policy.sessionCacheTtlMs).toBe(0);
    expect(policy.dokuFailureThreshold).toBe(2);
    expect(policy.limits.support.limit).toBe(9);
    // Garbage falls back to the default rather than disabling the guard.
    expect(policy.limits.turnstile.limit).toBe(30);
  });
});

describe('rateLimit', () => {
  it('allows up to the limit, then refuses with a positive retry window', () => {
    const policy = quotaPolicy({ QUOTA_LIMIT_SUPPORT_PER_HOUR: '3' });
    const now = 1_000_000;
    expect(rateLimit('support', '1.2.3.4', policy, now).allowed).toBe(true);
    expect(rateLimit('support', '1.2.3.4', policy, now + 1).allowed).toBe(true);
    expect(rateLimit('support', '1.2.3.4', policy, now + 2).allowed).toBe(true);

    const fourth = rateLimit('support', '1.2.3.4', policy, now + 3);
    expect(fourth.allowed).toBe(false);
    if (!fourth.allowed) expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps keys independent — another caller is unaffected', () => {
    const policy = quotaPolicy({ QUOTA_LIMIT_SUPPORT_PER_HOUR: '1' });
    expect(rateLimit('support', 'a', policy, 1_000).allowed).toBe(true);
    expect(rateLimit('support', 'a', policy, 1_000).allowed).toBe(false);
    expect(rateLimit('support', 'b', policy, 1_000).allowed).toBe(true);
  });

  it('forgets hits once the window has rolled over', () => {
    const policy = quotaPolicy({ QUOTA_LIMIT_SUPPORT_PER_HOUR: '1' });
    const hour = 60 * 60_000;
    expect(rateLimit('support', 'a', policy, 1_000).allowed).toBe(true);
    expect(rateLimit('support', 'a', policy, 1_000 + 1_000).allowed).toBe(false);
    // Past the original hit's window: space frees up again.
    expect(rateLimit('support', 'a', policy, 1_000 + hour + 1).allowed).toBe(true);
  });
});

describe('enforceLimit', () => {
  it('returns null while under the limit and a 429 with retry-after when over', async () => {
    const env = { QUOTA_LIMIT_TURNSTILE_PER_MINUTE: '1' };
    expect(enforceLimit('turnstile', 'ip-1', env)).toBeNull();

    const response = enforceLimit('turnstile', 'ip-1', env);
    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get('retry-after'))).toBeGreaterThan(0);
    await expect(response?.json()).resolves.toMatchObject({ error: 'rate_limited' });
  });
});

describe('cache', () => {
  it('returns a value only inside its TTL', () => {
    const now = 5_000;
    cacheSet('k', 'v', 1_000, now);
    expect(cacheGet<string>('k', now + 999)).toBe('v');
    expect(cacheGet<string>('k', now + 1_000)).toBeUndefined();
  });

  it('never stores when the TTL is zero (cache disabled)', () => {
    cacheSet('k', 'v', 0, 1_000);
    expect(cacheGet('k', 1_001)).toBeUndefined();
  });
});

describe('singleFlight', () => {
  it('coalesces concurrent callers onto one execution', async () => {
    let executions = 0;
    const work = async (): Promise<string> => {
      executions += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 'done';
    };

    const [a, b, c] = await Promise.all([
      singleFlight('key', work),
      singleFlight('key', work),
      singleFlight('key', work),
    ]);
    expect(executions).toBe(1);
    expect([a, b, c]).toEqual(['done', 'done', 'done']);
  });

  it('releases the key so a later, non-concurrent run executes again', async () => {
    let executions = 0;
    const work = async (): Promise<number> => ++executions;
    await singleFlight('key', work);
    await singleFlight('key', work);
    expect(executions).toBe(2);
  });

  it('does not pin a failed flight — the next caller retries', async () => {
    await expect(
      singleFlight('key', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(singleFlight('key', async () => 'recovered')).resolves.toBe('recovered');
  });
});

describe('breaker', () => {
  const policy = quotaPolicy({
    QUOTA_DOKU_FAILURE_THRESHOLD: '2',
    QUOTA_DOKU_BREAKER_COOLDOWN_MS: '30000',
  });

  it('stays closed below the failure threshold', () => {
    breakerFailure('doku', policy, 1_000);
    expect(breakerStatus('doku', policy, 1_000)).toBe('closed');
    expect(breakerAllows('doku', policy, 1_000)).toBe(true);
  });

  it('opens at the threshold, rejects during cooldown, half-opens after it', () => {
    breakerFailure('doku', policy, 1_000);
    breakerFailure('doku', policy, 2_000);
    // Opens on the threshold hit at t=2_000, so the cooldown elapses there.
    expect(breakerStatus('doku', policy, 2_000)).toBe('open');
    expect(breakerAllows('doku', policy, 10_000)).toBe(false);
    expect(breakerAllows('doku', policy, 2_000 + 30_000)).toBe(true);
    expect(breakerStatus('doku', policy, 2_000 + 30_000)).toBe('half-open');
  });

  it('closes again on success and counts from zero', () => {
    breakerFailure('doku', policy, 1_000);
    breakerFailure('doku', policy, 2_000);
    breakerSuccess('doku');
    expect(breakerStatus('doku', policy, 3_000)).toBe('closed');
    breakerFailure('doku', policy, 4_000);
    expect(breakerStatus('doku', policy, 4_000)).toBe('closed');
  });
});

describe('counters and snapshot', () => {
  it('accumulates named counters and exposes them in the snapshot', () => {
    count('doku.probe');
    count('doku.probe');
    count('checkout.rate-limited');
    // Breaker opened "just now": the snapshot must report it as open, since
    // the snapshot's own clock is the real one.
    const openedNow = quotaPolicy({ QUOTA_DOKU_FAILURE_THRESHOLD: '1' });
    breakerFailure('doku', openedNow, Date.now());

    const snapshot = quotaSnapshot(quotaPolicy(undefined));
    expect(snapshot.isolate.counters['doku.probe']).toBe(2);
    expect(snapshot.isolate.counters['checkout.rate-limited']).toBe(1);
    expect(snapshot.isolate.breakers.doku).toBe('open');
    expect(snapshot.isolate.scope).toBe('single-isolate');
    expect(snapshot.isolate.note).toMatch(/dashboard/i);
  });
});

describe('PROVIDER_LIMITS', () => {
  it('publishes the verified free-plan ceilings with a measurement date', () => {
    expect(PROVIDER_LIMITS.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PROVIDER_LIMITS.cloudflare.workersRequestsPerDay).toBe(100_000);
    expect(PROVIDER_LIMITS.appwrite.databaseReadsPerMonth).toBe(500_000);
    // R2 overage is billed — the one place this stack can spend money.
    expect(PROVIDER_LIMITS.cloudflare.r2.billingRisk).toMatch(/BILLED/i);
    // No usage API claims: dashboards only.
    expect(PROVIDER_LIMITS.appwrite.usageSource).toMatch(/Console/);
  });
});
