import { describe, expect, it } from 'vite-plus/test';
import { AppError, ERROR_CODES } from '../../core/shared/errors';
import {
  DEFAULT_QUERY_POLICY,
  MAX_QUERY_RETRIES,
  QUERY_POLICIES,
  queryPolicy,
  retryDelay,
  shouldRetry,
} from './policies';

function appError(code: string): AppError {
  return new AppError(code as (typeof ERROR_CODES)[keyof typeof ERROR_CODES], 'x');
}

describe('shouldRetry', () => {
  it('retries transient failures up to the configured limit', () => {
    const network = appError(ERROR_CODES.NETWORK);

    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(MAX_QUERY_RETRIES - 1, network)).toBe(true);
    expect(shouldRetry(MAX_QUERY_RETRIES, network)).toBe(false);
  });

  it('never retries a rate-limited request', () => {
    // Retrying a 429 cannot make it succeed sooner; it only extends the window
    // in which the client is throttled.
    const limited = appError(ERROR_CODES.RATE_LIMITED);

    expect(shouldRetry(0, limited)).toBe(false);
    expect(shouldRetry(MAX_QUERY_RETRIES, limited)).toBe(false);
  });

  it('never retries deterministic client errors', () => {
    for (const code of [
      ERROR_CODES.UNAUTHENTICATED,
      ERROR_CODES.FORBIDDEN,
      ERROR_CODES.NOT_FOUND,
      ERROR_CODES.VALIDATION,
      ERROR_CODES.CONFLICT,
      ERROR_CODES.RATE_LIMITED,
      ERROR_CODES.SUSPENDED,
    ]) {
      expect(shouldRetry(0, appError(code)), code).toBe(false);
    }
  });

  it('retries unrecognised failures, which are usually a transient 5xx', () => {
    expect(shouldRetry(0, appError(ERROR_CODES.UNKNOWN))).toBe(true);
  });

  it('retries a thrown non-AppError rather than failing the query immediately', () => {
    expect(shouldRetry(0, new Error('socket hang up'))).toBe(true);
  });
});

describe('retryDelay', () => {
  it('grows exponentially and stays under the ceiling', () => {
    const noJitter = () => 0;

    expect(retryDelay(0, noJitter)).toBe(500);
    expect(retryDelay(1, noJitter)).toBe(1_000);
    expect(retryDelay(2, noJitter)).toBe(2_000);
    expect(retryDelay(10, noJitter)).toBe(4_000);
  });

  it('never returns more than the ceiling, whatever the jitter', () => {
    const maxJitter = () => 1;

    expect(retryDelay(0, maxJitter)).toBeLessThanOrEqual(8_000);
    expect(retryDelay(10, maxJitter)).toBe(8_000);
  });

  it('stays at or above half the exponential base, so it never retries instantly', () => {
    const minJitter = () => 0;

    for (const attempt of [0, 1, 2, 3, 8]) {
      expect(retryDelay(attempt, minJitter)).toBeGreaterThan(0);
    }
  });
});

describe('QUERY_POLICIES', () => {
  it('declares a policy for every query in the app', () => {
    expect(Object.keys(QUERY_POLICIES).sort()).toEqual(
      [
        'adminAudit',
        'adminMembership',
        'adminSupport',
        'adminUsers',
        'catalog',
        'catalogCount',
        'catalogPage',
        'customerCount',
        'customers',
        'customersPage',
        'dashboardFinance',
        'invoice',
        'invoiceNumbers',
        'invoiceQuota',
        'invoices',
        'paymentStatus',
        'portalSession',
        'profile',
        'publicSite',
        'session',
        'stats',
        'templates',
        'templatesPage',
      ].sort(),
    );
  });

  it('never leaves a query with zero stale time, which would defeat caching', () => {
    for (const [name, policy] of Object.entries(QUERY_POLICIES)) {
      expect(policy.staleTime, name).toBeGreaterThan(0);
      expect(policy.gcTime, name).toBeGreaterThan(0);
    }
  });

  it('keeps the session cached until an explicit auth event', () => {
    expect(queryPolicy('session').staleTime).toBe(Number.POSITIVE_INFINITY);
  });

  it('trusts the business profile longer than invoice data', () => {
    expect(queryPolicy('profile').staleTime).toBeGreaterThan(queryPolicy('invoices').staleTime);
  });

  it('returns a usable floor for an untagged query', () => {
    expect(DEFAULT_QUERY_POLICY.staleTime).toBeGreaterThan(0);
    expect(DEFAULT_QUERY_POLICY.gcTime).toBeGreaterThanOrEqual(DEFAULT_QUERY_POLICY.staleTime);
  });

  it('exposes each policy by name', () => {
    expect(queryPolicy('invoices')).toBe(QUERY_POLICIES.invoices);
  });
});
