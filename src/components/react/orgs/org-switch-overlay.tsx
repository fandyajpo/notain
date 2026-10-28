import { Building2 } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

/**
 * Blocking full-screen overlay shown while an organization switch is in
 * flight (state lives in `src/app/org-switch.ts`, rendered by `OrgGate`).
 *
 * It covers the whole viewport — sidebar, header and content — so the previous
 * organization's UI cannot be interacted with while the new one loads. A
 * deterministic-looking top bar plus the centered card make the wait legible;
 * `role="status"` announces the transition to screen readers.
 *
 * Keyboard: focus moves into the overlay and Tab is held there for the
 * sub-second lifetime of the switch, so focus cannot wander into the page
 * underneath. Nothing else needs cancelling — the overlay unmounts itself as
 * soon as the gate reports ready (or restores on failure).
 */
export function OrgSwitchOverlay({ name }: { name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const holdFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') event.preventDefault();
  };

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      onKeyDown={holdFocus}
      className="fixed inset-0 z-portal flex flex-col items-center justify-center gap-4 bg-background/85 p-6 backdrop-blur-sm outline-none"
    >
      {/* Indeterminate progress bar pinned to the top edge: reads as "something
          is moving" without pretending to know how long the load will take. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-1 overflow-hidden bg-accent-soft"
        aria-hidden="true"
      >
        <div className="h-full w-1/3 animate-org-switch-progress bg-accent" />
      </div>

      <div className="flex w-full max-w-64 flex-col items-center gap-3 rounded-card border border-border bg-card p-6 text-center shadow-modal">
        <span
          className="flex size-10 items-center justify-center rounded-full bg-accent-soft"
          aria-hidden="true"
        >
          <Building2 className="text-accent" size={20} />
        </span>
        <p className="text-sm font-semibold">Berpindah ke {name}…</p>
        <p className="text-xs text-muted">Menyiapkan data organisasi baru. Tunggu sebentar.</p>
      </div>
    </div>,
    document.body,
  );
}
