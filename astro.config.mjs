// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import svelte from '@astrojs/svelte';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

/**
 * `/invoice/<id>` and `/templates/<id>` are served by Pages Functions in
 * production; `astro dev` never reads `functions/`, so locally they would 404.
 * This is their dev twin: the request is rewritten to the same shell the
 * function would have served, the address bar is left alone, and every other
 * path — including `/invoice/new`, `/invoice/print` and `/templates/new` — goes
 * to the dev server untouched.
 *
 * The two rules below are duplicated on purpose: `astro.config.mjs` is Node ESM
 * and cannot import the TypeScript shared by the functions and the app. Keep
 * the segment sets and the id pattern in step with
 * `functions/invoice/[[id]].ts`, `functions/templates/[[id]].ts` and
 * `src/lib/edit-route.ts`; `e2e/edit-routes.spec.ts` covers both halves.
 */
const ID_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/** @type {Record<string, { reserved: Set<string>, shell: string }>} */
const EDIT_ROUTE_SHELLS = {
  invoice: { reserved: new Set(['new', 'print', 'edit']), shell: '/invoice/edit' },
  templates: { reserved: new Set(['new']), shell: '/templates/new' },
};

function editRouteFallback() {
  return {
    name: 'edit-route-fallback',
    /** @param {import('vite').ViteDevServer} server */
    configureServer(server) {
      server.middlewares.use(
        /**
         * Connect's `req`, but seen through the narrow shape a rewrite needs:
         * this repo ships without `@types/node` on purpose (see the header of
         * `functions/_lib/types.ts`), so `req.url` would otherwise not type-check.
         *
         * @param {{ url?: string }} req
         * @param {unknown} _res
         * @param {() => void} next
         */
        (req, _res, next) => {
          const url = req.url;
          if (typeof url !== 'string') return next();
          // Query strings are dropped, exactly as the function drops them when
          // it fetches the shell; the browser keeps its own, and the app reads
          // that.
          const match = /^\/(invoice|templates)\/([^/]+)\/?$/.exec(url.split('?', 1)[0]);
          if (!match) return next();
          const route = EDIT_ROUTE_SHELLS[match[1]];
          const segment = match[2];
          if (route.reserved.has(segment) || !ID_SEGMENT.test(segment)) return next();
          req.url = route.shell;
          next();
        },
      );
    },
  };
}

// https://astro.build/config
export default defineConfig({
  // Navigasi antarhalaman: HTML-nya di-warm di idle/hover supaya pindah route
  // tidak menunggu rtt pertama. Hanya berlaku untuk link yang memasang
  // `data-astro-prefetch`.
  prefetch: true,
  integrations: [
    // Every JSX file in the app lives under src/components/react/**, so React
    // claims that subtree and nothing else. Solid claims its own directory
    // instead of taking over the root `jsxImportSource`, which would break
    // React. Each Solid file pins its runtime with a `@jsxImportSource`
    // pragma.
    react({ include: ['**/components/react/**'] }),
    // `preprocess` comes from svelte.config.js, shared with vitest.
    svelte(),
    vue(),
    solid({ include: ['**/components/solid/**'] }),
  ],
  vite: {
    plugins: [tailwindcss(), editRouteFallback()],
    server: {
      proxy: {
        // Pages Functions only exist on the deployed site; without this
        // `astro dev` would 404 every logo call. Forwarding to the deployment
        // keeps the default `PUBLIC_LOGO_API` path-based (so the built site
        // never hardcodes a domain) and needs no CORS, because to the browser
        // the request stays same-origin.
        //
        // This proxies at *production* `functions/`. To exercise local changes
        // to that directory instead, run `npx wrangler pages dev dist`.
        '/api': { target: 'https://notain.pages.dev', changeOrigin: true },
      },
    },
  },
});
