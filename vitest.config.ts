import { defineConfig } from 'vite-plus';
import react from '@vitejs/plugin-react';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import vue from '@vitejs/plugin-vue';
import solid from 'vite-plugin-solid';

export default defineConfig({
  // Keep vitest's dep-optimizer cache out of the dev server's `node_modules/.vite`.
  // Vite 8 defaults `cacheDir` to that shared path, so a `npm test` run while
  // `astro dev` is up replaces the server's `_metadata.json` and dep bundles
  // with its own hash — the server keeps serving `?v=<old-hash>` import URLs,
  // those files are gone, and every island dies with 404 "Outdated Optimize
  // Dep" fetches (blank pages across the app).
  cacheDir: 'node_modules/.vite/vitest',
  // Each plugin is scoped to its own island directory: the root tsconfig uses
  // `jsx: "preserve"`, so without an explicit owner no JSX would be compiled
  // at all, and an unscoped Solid transform could rewrite React files.
  plugins: [
    react({ include: [/components[\\/]react[\\/]/] }),
    // `preprocess` comes from svelte.config.js, shared with Astro.
    svelte({
      onwarn(warning, defaultHandler) {
        // `<svelte:options customElement={{ … }}>` turns on custom-element
        // mode by itself; the global `compilerOptions.customElement` flag is
        // only advisory, and every .svelte file in this app is an island.
        if (warning.code === 'options_missing_custom_element') return;
        defaultHandler(warning);
      },
    }),
    vue(),
    solid({ include: [/components[\\/]solid[\\/]/] }),
  ],
  test: {
    // The Pages Functions handlers are tested from `tests/`, NOT from
    // `functions/` itself: Cloudflare compiles every `.ts` file under
    // `functions/` into the deployed Worker, so a test file there would try
    // to bundle `vitest` into production. They are plain `Request →
    // Response` functions over Web APIs, so they run fine in the node
    // environment with a stubbed `fetch`.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    // Isolate-local quota state (session cache, rate windows, breakers) must
    // start empty for every test — see the file's doc comment.
    setupFiles: ['tests/quota-reset.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
