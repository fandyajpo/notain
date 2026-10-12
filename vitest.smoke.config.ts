import { defineConfig } from 'vitest/config';

/**
 * Live end-to-end tests against Appwrite Cloud. They are kept out of the
 * default `vitest` run (`smoke/` is outside `src/`) so `npm test` stays
 * offline and deterministic.
 */
export default defineConfig({
  // Vite only puts `VITE_`-prefixed variables on `import.meta.env`; the app
  // config reads `PUBLIC_`, so opt into the same prefix the site uses.
  envPrefix: 'PUBLIC_',
  test: {
    include: ['smoke/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['smoke/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: false,
  },
});
