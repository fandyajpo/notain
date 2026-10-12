import { vitePreprocess } from '@astrojs/svelte';

/** @type {import('@sveltejs/vite-plugin-svelte').ResolvedVitePluginSvelteOptions} */
const config = {
  // TypeScript in `<script lang="ts">` blocks.
  preprocess: vitePreprocess(),
};

export default config;
