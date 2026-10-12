import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the cross-framework custom element boundary.
 *
 * Kept out of `npm test` (vitest, node/jsdom) so the default suite stays fast
 * and offline. Run with `npm run test:e2e`.
 *
 * Targets the running background dev server (`astro dev --background`, port
 * 4321) so there is no second server to manage. If it is not up, Playwright
 * starts `astro dev` itself.
 *
 * No `process.env` here on purpose: the repo has no `@types/node`, and adding it
 * would leak Node globals into the app's strict tsconfig.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
