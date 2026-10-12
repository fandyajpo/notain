import { useCallback, useLayoutEffect, useState } from 'react';

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
