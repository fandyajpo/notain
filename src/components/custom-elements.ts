/**
 * Single entry point that registers every non-React island in the app.
 *
 * React components must import this (statically) *before* rendering the
 * custom element tags: React only writes a data prop as a property when the
 * tag already exposes it, otherwise it falls back to a stringified attribute.
 * Importing here guarantees `customElements.define` has run by first render.
 *
 * All invoice/dashboard islands are `client:only`, so none of this executes
 * during SSR — the guards inside each registration module are belt and braces.
 */

import './svelte/register';
import './vue/register';
import './solid/register';
