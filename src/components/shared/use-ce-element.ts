import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * Cross-framework custom element plumbing for React.
 *
 * React's JSX cannot be trusted to deliver data props to a custom element:
 * it only writes a property when `key in domElement`, and it falls back to a
 * stringified attribute otherwise. Vue defines its property accessors lazily
 * (on `connectedCallback`), so a JSX array prop would arrive as
 * `"[object Object],…"`. Every data prop therefore goes through
 * `setCeProperty` in a layout effect, which runs after the element is
 * connected and upgraded — by then all three islands expose real accessors.
 *
 * Layout-only props (`className`, `id`, `aria-*`, …) can stay in JSX.
 */

/** Always writes a real property — never an attribute — on the island. */
export function setCeProperty(element: HTMLElement | null, name: string, value: unknown): void {
  if (!element) return;
  (element as unknown as Record<string, unknown>)[name] = value;
}

/**
 * Element ref that also re-renders when the island mounts, so props are
 * (re)applied as soon as the node exists rather than on the next unrelated
 * render.
 */
export function useCeRef<T extends HTMLElement = HTMLElement>(): [
  (element: T | null) => void,
  T | null,
] {
  const [element, setElement] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => setElement(node), []);
  return [ref, element];
}

/** Pushes one prop onto an island after it has mounted. */
export function useCeProp(element: HTMLElement | null, name: string, value: unknown): void {
  useLayoutEffect(() => {
    setCeProperty(element, name, value);
  }, [element, name, value]);
}

/**
 * Reports whether the custom element `tag` is registered, importing its
 * registration module on first use.
 *
 * Registration is *not* a static import on purpose: `svelte/register`,
 * `vue/register` and `solid/register` each drag in a complete framework
 * runtime (~177 kB raw together), and a static import puts them on the
 * critical path of every page that renders one of their tags. Loading them
 * from an effect keeps them off the invoice routes' first paint.
 *
 * React still must not render the tag before `customElements.define` has run —
 * `useCeProp` writes properties that only exist once the element upgrades —
 * so callers render a placeholder until this returns `true`. `register` has to
 * be a module-scope function so the effect does not re-run every render.
 */
export function useCeDefined(tag: string, register: () => Promise<unknown>): boolean {
  const [defined, setDefined] = useState(
    () => typeof window !== 'undefined' && customElements.get(tag) !== undefined,
  );

  useEffect(() => {
    if (customElements.get(tag) !== undefined) return;

    let active = true;
    void register().then(
      () => {
        if (active) setDefined(true);
      },
      (error: unknown) => {
        console.error(`[notain] gagal memuat registrasi <${tag}>`, error);
      },
    );

    return () => {
      active = false;
    };
  }, [tag, register]);

  return defined;
}
