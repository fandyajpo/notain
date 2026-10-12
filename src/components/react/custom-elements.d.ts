import type { HTMLAttributes, RefAttributes } from 'react';

/**
 * Props React accepts on the non-React islands. Layout/ARIA props only —
 * data props are pushed imperatively through `useCeProp`, because React
 * falls back to a stringified attribute when the custom element does not yet
 * expose a matching property.
 */
type IslandProps = HTMLAttributes<HTMLElement> & RefAttributes<HTMLElement>;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'notain-calc-inspector': IslandProps;
      'notain-items-grid': IslandProps;
      'notain-picker': IslandProps;
      'notain-probe-svelte': IslandProps;
      'notain-probe-vue': IslandProps;
      'notain-probe-solid': IslandProps;
    }
  }
}
