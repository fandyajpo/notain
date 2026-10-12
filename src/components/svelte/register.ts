/**
 * Side-effect import: registering the Svelte islands. Importing this module
 * runs `customElements.define` for every Svelte probe/widget, so React must
 * evaluate it before rendering the tags (all invoice islands are
 * `client:only`, so this never executes during SSR).
 */
import './ItemsGrid.svelte';
import './probe.svelte';
