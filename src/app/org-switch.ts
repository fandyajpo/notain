/**
 * In-flight organization switch state.
 *
 * Switching organizations is a cross-island transition: the dropdown (shell)
 * starts it, and the page's `OrgGate` is what actually knows when the target
 * org's context and data are ready — different React roots, so the shared
 * state lives here in the module store, exactly like `active-org.ts`.
 *
 * While a switch is pending the gate renders a blocking full-screen overlay
 * (`OrgSwitchOverlay`), the gate ends it when the target org is validated and
 * every fetch on the shared client has settled, and restores the previous org
 * if the switch fails.
 */
import { getActiveOrgId, setActiveOrgId } from './active-org';

export type OrgSwitch = {
  /** Organization the user was on when they initiated the switch. */
  from: string;
  /** Organization being switched to. */
  to: string;
  /**
   * Display name of the target, captured by the dropdown at click time.
   * The switch resets the orgs cache (that reset IS the gate's validation
   * pass), so for most of the transition the list is undefined — the overlay
   * must still name the destination from here rather than from the cache.
   */
  toName: string;
  /** Epoch ms when the switch began; drives the minimum display time. */
  startedAt: number;
};

let pending: OrgSwitch | null = null;
const listeners = new Set<() => void>();

/** Begin a switch. No-op when the target equals the current organization. */
export function beginOrgSwitch(from: string, to: string, toName: string): void {
  if (from === to) return;
  pending = { from, to, toName, startedAt: Date.now() };
  notify();
}

/**
 * The ONE way the active organization changes from user intent.
 *
 * The sidebar dropdown, the create flow's confirmation panel and the mutation
 * that mints a new organization each used to inline their own copy of these
 * three lines — which is exactly how entry points drift apart (one raising the
 * blocking overlay, another flipping the selection bare and leaving the gate
 * to blank the page with nothing covering it).
 *
 * The order is the contract and lives here: announce the switch BEFORE the
 * selection changes, so `OrgGate` sees the flag on the very commit where it
 * resets and can raise the overlay over that transition. Starting from a null
 * selection (first organization, onboarding) announces nothing — there is no
 * previous workspace to block — and a request for the current organization
 * does nothing at all.
 */
export function switchActiveOrg(orgId: string, toName: string): void {
  const previous = getActiveOrgId();
  if (previous === orgId) return;
  if (previous !== null) beginOrgSwitch(previous, orgId, toName);
  setActiveOrgId(orgId);
}

/** End the current switch (success, failure or timeout). Idempotent. */
export function endOrgSwitch(): void {
  if (pending === null) return;
  pending = null;
  notify();
}

export function getOrgSwitch(): OrgSwitch | null {
  return pending;
}

export function subscribeOrgSwitch(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}
