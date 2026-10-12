import { useEffect, useRef } from 'react';
import type { z } from 'zod';
import { parseEvent } from './contracts';

/**
 * Subscribes a React component to a validated CustomEvent emitted by one of
 * the non-React islands (Svelte grid, Vue picker, Solid inspector).
 *
 * Why not React's `onEvent` prop: React only wires a fixed set of DOM events
 * from JSX, so arbitrary CustomEvents must go through `addEventListener`.
 * The schema keeps that raw boundary safe — a malformed payload is dropped
 * (and warned about in dev) instead of reaching the TanStack Form.
 *
 * The element must already be mounted when the effect runs; it subscribes
 * once per (element, event name, schema) and reads the latest handler from a
 * ref, so handlers may be recreated every render without resubscribing.
 */
export function useCeEvent<S extends z.ZodType>(
  element: HTMLElement | null,
  eventName: string,
  schema: S,
  onPayload: (payload: z.output<S>) => void,
  label?: string,
): void {
  const handlerRef = useRef(onPayload);
  const labelRef = useRef(label);

  useEffect(() => {
    handlerRef.current = onPayload;
    labelRef.current = label;
  }, [onPayload, label]);

  useEffect(() => {
    if (!element) return;

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      const payload = parseEvent(schema, detail, labelRef.current ?? eventName);
      if (payload !== null) handlerRef.current(payload);
    };

    element.addEventListener(eventName, listener);
    return () => element.removeEventListener(eventName, listener);
  }, [element, eventName, schema]);
}
