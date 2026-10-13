// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import svelte from '@astrojs/svelte';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

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
    plugins: [tailwindcss()],
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
