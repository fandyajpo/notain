// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import svelte from '@astrojs/svelte';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
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
  },
});
