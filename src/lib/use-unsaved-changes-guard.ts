import { useCallback, useEffect, useRef, useState } from 'react';

export type UnsavedChangesGuard = {
  /** True while an in-app navigation is being held for confirmation. */
  isPrompting: boolean;
  /** Proceed with the held navigation (bypasses the guard for that one hop). */
  confirmLeave: () => void;
  /** Cancel the held navigation and stay on the page. */
  cancelLeave: () => void;
  /** Permanently disarm — call right before an intentional post-save redirect. */
  disarm: () => void;
};

/**
 * Warns before leaving a form that still has unsaved edits.
 *
 * Two escape routes are covered. Hard exits (close, refresh, external link,
 * `window.location.assign`) get the browser's native `beforeunload` prompt. In-app
 * link navigation rides the Astro `ClientRouter`, which fires a cancelable
 * `astro:before-preparation`; we hold that hop and surface our own confirmation
 * instead, so the destination can be shown and the user can stay.
 *
 * `when` is the arming condition (typically `isDirty && isEditing`). Once armed,
 * `when` is re-read on every render, but `disarm()` flips a sticky flag that wins
 * over it — so a post-save redirect is never re-prompted.
 */
export function useUnsavedChangesGuard(when: boolean): UnsavedChangesGuard {
  const disabledRef = useRef(false);
  const whenRef = useRef(when);
  whenRef.current = when && !disabledRef.current;
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  // Hard exits: the browser owns the dialog, so this is the only lever.
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!whenRef.current) return;
      event.preventDefault();
      // Legacy Chrome/Safari need `returnValue` set to actually show the prompt.
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // In-app navigation via the Astro ClientRouter. Hold it and ask.
  useEffect(() => {
    function onBeforePreparation(event: Event) {
      if (!whenRef.current || disabledRef.current) return;
      const to = (event as Event & { to?: URL }).to;
      event.preventDefault();
      setPendingNav(to ? to.pathname + to.search : '/');
    }
    document.addEventListener('astro:before-preparation', onBeforePreparation);
    return () => document.removeEventListener('astro:before-preparation', onBeforePreparation);
  }, []);

  const disarm = useCallback(() => {
    disabledRef.current = true;
    whenRef.current = false;
  }, []);

  const confirmLeave = useCallback(() => {
    const href = pendingNav;
    setPendingNav(null);
    disarm();
    if (href) window.location.assign(href);
  }, [disarm, pendingNav]);

  const cancelLeave = useCallback(() => setPendingNav(null), []);

  return {
    isPrompting: pendingNav !== null,
    confirmLeave,
    cancelLeave,
    disarm,
  };
}
