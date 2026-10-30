// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import svelte from '@astrojs/svelte';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

/**
 * `/invoice/<id>`, `/templates/<id>` and `/site/<ownerId>` are served by Pages
 * Functions in production; `astro dev` never reads `functions/`, so locally
 * they would 404. This is their dev twin: the request is rewritten to the same
 * shell the function would have served, the address bar is left alone, and
 * every other path — including `/invoice/new`, `/invoice/print` and
 * `/templates/new` — goes to the dev server untouched. The older `…/edit`
 * links get the same real redirect the functions send in production.
 *
 * The rules below are duplicated on purpose: `astro.config.mjs` is Node ESM
 * and cannot import the TypeScript shared by the functions and the app. Keep
 * the segment sets, the id pattern and the redirect targets in step with
 * `functions/invoice/[[id]].ts`, `functions/templates/[[id]].ts`,
 * `functions/site/[[id]].ts` and `src/lib/edit-route.ts`;
 * `e2e/edit-routes.spec.ts` covers both halves.
 */
const ID_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/**  {{ invoice: { reserved: Set<string>, shell: string }, templates: { reserved: Set<string>, shell: string } }} */
const EDIT_ROUTE_SHELLS = {
  invoice: { reserved: new Set(['new', 'print', 'edit']), shell: '/invoice/edit' },
  templates: { reserved: new Set(['new']), shell: '/templates/new' },
};

/**
 * A `?id=` that could name a real resource — same rules as `src/lib/edit-route.ts`.
 *
 * @param {string} query
 * @param {Set<string>} reserved
 * @returns {string | undefined}
 */
function idParam(query, reserved) {
  const id = new URLSearchParams(query).get('id');
  return id && ID_SEGMENT.test(id) && !reserved.has(id) ? id : undefined;
}

/**
 * `/invoice/edit?id=…` → `/invoice/<id>`; no id → nothing to fold in.
 *
 * @param {string} query
 * @returns {string | undefined}
 */
function invoiceEditRedirect(query) {
  const id = idParam(query, EDIT_ROUTE_SHELLS.invoice.reserved);
  return id ? `/invoice/${id}` : undefined;
}

/**
 * `/templates/edit` → the id, the built-in to copy, or the blank editor.
 *
 * @param {string} query
 * @returns {string}
 */
function templateEditRedirect(query) {
  const params = new URLSearchParams(query);
  const id = idParam(query, EDIT_ROUTE_SHELLS.templates.reserved);
  if (id) return `/templates/${id}`;
  const from = params.get('from');
  return from ? `/templates/new?from=${encodeURIComponent(from)}` : '/templates/new';
}

function editRouteFallback() {
  return {
    name: 'edit-route-fallback',
    /** @param {import('vite').ViteDevServer} server */
    configureServer(server) {
      server.middlewares.use(
        /**
         * Connect's `req`/`res`, seen through the narrow shape a rewrite needs:
         * this repo ships without `@types/node` on purpose (see the header of
         * `functions/_lib/types.ts`), so the raw types would otherwise not
         * type-check. `res` is cast again at the one place that writes to it.
         *
         * @param {{ url?: string }} req
         * @param {unknown} _res
         * @param {() => void} next
         */
        (req, _res, next) => {
          const url = req.url;
          if (typeof url !== 'string') return next();
          const [path = '', query = ''] = url.split('?', 2);

          // `/invoice/print/<id>` — the customer-facing print link. Same
          // trick as the edit route below, but the shell is the print page
          // and the id is read by the app from the address bar.
          const printMatch = /^\/invoice\/print\/([^/]+)\/?$/.exec(path);
          if (printMatch) {
            if (ID_SEGMENT.test(printMatch[1] ?? '')) req.url = '/invoice/print';
            return next();
          }

          // `/site/<ownerId>` — the public business page. Same shell trick:
          // only a valid id segment rewrites (to the site shell), and the bare
          // `/site/` or any deeper path goes to the dev server untouched.
          const siteMatch = /^\/site\/([^/]+)\/?$/.exec(path);
          if (siteMatch) {
            if (ID_SEGMENT.test(siteMatch[1] ?? '')) req.url = '/site';
            return next();
          }

          const match = /^\/(invoice|templates)\/([^/]+)\/?$/.exec(path);
          if (!match) return next();

          if (match[2] === 'edit') {
            const target =
              match[1] === 'invoice' ? invoiceEditRedirect(query) : templateEditRedirect(query);
            if (target) {
              // The narrow shape of a redirecting `res`, without depending on
              // `@types/node`.
              const res =
                /** @type {{ statusCode: number, setHeader(name: string, value: string): void, end(): void }} */ (
                  _res
                );
              res.statusCode = 302;
              res.setHeader('location', target);
              res.end();
              return;
            }
            // `/invoice/edit` without an id keeps the old behaviour: the shell
            // answers and the app explains that the link is incomplete.
          }

          const route =
            match[1] === 'templates' ? EDIT_ROUTE_SHELLS.templates : EDIT_ROUTE_SHELLS.invoice;
          const segment = match[2] ?? '';
          if (route.reserved.has(segment) || !ID_SEGMENT.test(segment)) return next();
          // The query is dropped from the rewrite, exactly as the function
          // drops it when it fetches the shell; the browser keeps its own, and
          // the app reads that.
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
  // `/admin` is the tabs page the admin section used to be; it folds into the
  // first tab's page. Static build turns this into a meta-refresh stub.
  redirects: {
    '/admin': '/admin/users',
  },
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
    resolve: {
      // Vue's default esm-bundler build ships the runtime template compiler,
      // which reaches for `new Function` — a CSP `unsafe-eval` violation.
      // Every component here is an SFC, so the render functions are already
      // compiled at build time and the compiler is dead weight anyway. The
      // anchored regex rewrites only bare `vue` imports — a plain string
      // alias would also mangle `vue/server-renderer`.
      alias: [{ find: /^vue$/, replacement: 'vue/dist/vue.runtime.esm-bundler.js' }],
    },
    optimizeDeps: {
      // Built eagerly, not left to scan-time discovery: this module backs the
      // builder's keyboard shortcuts, and a missing file in `.vite/deps` made
      // the invoice islands' dynamic import 404 — the page shell rendered
      // with an empty `<main>` and every hydration failed with "Failed to
      // fetch dynamically imported module". Pinning it makes the optimizer
      // produce it on every fresh server start regardless of scan timing.
      include: ['@tanstack/react-hotkeys'],
      // Without this the dev toolbar's entrypoint (`/@id/astro/runtime/client/
      // dev-toolbar/entrypoint.js`) answers 504 "Outdated Optimize Dep" after
      // every re-optimization: the optimizer replaces its metadata when it
      // discovers new deps mid-session, and the toolbar URL carries no `?v=`
      // hash to re-resolve against. The iframe keeps failing, every page logs
      // a console error, and the no-console-error e2e specs go red. Serving
      // the current bundle instead of demanding a reload fixes the toolbar
      // and costs nothing the app relies on.
      ignoreOutdatedRequests: true,
    },
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
        //
        // Anchored to `/api/` so the match is a path segment, not a prefix:
        // a bare `/api` would also swallow sibling routes like `/api-keys`
        // (they never reach the dev server, and answer with whatever the
        // deployed site has for that path).
        '^/api/': { target: 'https://notain.pages.dev', changeOrigin: true },
      },
    },
  },
});
