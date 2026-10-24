import { describe, expect, it } from 'vite-plus/test';
import { apiError, json } from '../functions/_lib/http';

/**
 * Private data must never sit in a browser or shared cache. The default lives
 * in the helper so a new endpoint is safe by omission; these tests pin that
 * default (and the override path a deliberately public route would use).
 */
describe('json()', () => {
  it('marks API responses no-store by default', () => {
    const response = json(200, { ok: true });

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  it('lets a route override the default', () => {
    const response = json(200, { ok: true }, { 'cache-control': 'public, max-age=60' });

    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
  });
});

describe('apiError()', () => {
  it('marks error responses no-store too', () => {
    const response = apiError(401, 'unauthenticated', 'Silakan masuk terlebih dahulu.');

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('keeps extra headers (e.g. retry-after) alongside the default', () => {
    const response = apiError(429, 'rate_limited', 'Tenang dulu.', { 'retry-after': '30' });

    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
