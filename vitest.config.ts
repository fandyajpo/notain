import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import vue from '@vitejs/plugin-vue';
import solid from 'vite-plugin-solid';

export default defineConfig({
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
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    passWithNoTests: true,
  },
});
