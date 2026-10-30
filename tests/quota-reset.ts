import { beforeEach } from 'vite-plus/test';
import { resetQuotaState } from '../functions/_lib/quota';
import { clearMintedJwt } from '../src/appwrite/client';

/**
 * Registered as `setupFiles` in `vitest.config.ts`.
 *
 * The quota module keeps isolate-local state in module-level maps (session
 * cache, admin-membership cache, rate-limit windows, breakers) because that
 * is exactly how it runs in production — one module instance per Worker
 * isolate. In tests the module instance is shared across every test in a
 * file, so without this reset a cached session or a tripped rate limit from
 * one test would silently decide the next test's outcome (a test setting
 * `fake.account = null` would still be answered from the session cache).
 *
 * Resetting before each test gives every test a fresh isolate — while still
 * letting one test exercise caching/dedup across its own sequential calls.
 */
beforeEach(() => {
  resetQuotaState();
  // The browser-side JWT cache is isolate-local for the same reason: a token
  // minted by one test would otherwise authenticate the next one's requests.
  clearMintedJwt();
});
