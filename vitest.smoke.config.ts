import { defineConfig } from 'vite-plus';

/**
 * Live end-to-end tests against Appwrite Cloud. They are kept out of the
 * default `vitest` run (`smoke/` is outside `src/`) so `npm test` stays
 * offline and deterministic.
 */
export default defineConfig({
  // Same reason as `vitest.config.ts`: never share the dev server's dep cache.
  cacheDir: 'node_modules/.vite/vitest-smoke',
  // Vite only puts `VITE_`-prefixed variables on `import.meta.env`; the app
  // config reads `PUBLIC_`, so opt into the same prefix the site uses.
  envPrefix: 'PUBLIC_',
  test: {
    include: ['smoke/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['smoke/setup.ts'],
    // The logo API defaults to a path (`/api/logo`), which only means anything
    // to a browser on a real origin. Node has no origin, so the smoke test
    // points at the deployed Pages Function — the same one production uses.
    env: { PUBLIC_LOGO_API: 'https://notain.pages.dev/api/logo' },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: false,
  },
});
