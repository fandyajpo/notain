/**
 * The organization the signed-in user is currently working inside.
 *
 * Every tenant-scoped read and write carries this id — it is the `orgId`
 * *hint* the server re-verifies against the caller's membership row on every
 * request (`requireOrg`), never an authority by itself: a stale or forged
 * value here can only produce a 404, never access to someone's data.
 *
 * Kept in a module store (not React context) because the repositories are
 * plain classes constructed once in the DI container and must resolve the org
 * at call time. React subscribes through `subscribeActiveOrg` for re-renders.
 *
 * The id is persisted per browser so a reload lands in the org the user last
 * picked; the first fresh session still validates it server-side — if the org
 * was deleted or the membership removed, the gate answers 404 and the app
 * falls back to the org list (`ensureActiveOrg` in the org provider).
 */

const STORAGE_KEY = 'notain.activeOrgId';

let activeOrgId: string | null = readPersisted();
const listeners = new Set<(orgId: string | null) => void>();

function readPersisted(): string | null {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return typeof value === 'string' && /^org_[0-9a-f]{16}$/.test(value) ? value : null;
  } catch {
    return null; // storage disabled (private mode, SSR) — session-scoped only
  }
}

function persist(id: string | null): void {
  try {
    if (id === null) globalThis.localStorage?.removeItem(STORAGE_KEY);
    else globalThis.localStorage?.setItem(STORAGE_KEY, id);
  } catch {
    // A browser that refuses storage simply forgets the choice on reload.
  }
}

/** Current org id, or `null` before the first org has been chosen. */
export function getActiveOrgId(): string | null {
  return activeOrgId;
}

/**
 * The active org for repositories — throws (as a domain error the UI already
 * renders) when none is selected, rather than silently issuing an unscoped
 * request the server would reject anyway.
 */
export function requireActiveOrgId(): string {
  if (activeOrgId === null) {
    throw new Error('Belum ada organisasi aktif. Pilih atau buat organisasi dulu.');
  }
  return activeOrgId;
}

/** Switches (or clears) the active org and notifies subscribers. */
export function setActiveOrgId(orgId: string | null): void {
  if (orgId === activeOrgId) return;
  activeOrgId = orgId;
  persist(orgId);
  for (const listener of listeners) listener(orgId);
}

/** React-facing change subscription. Returns the unsubscribe function. */
export function subscribeActiveOrg(listener: (orgId: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
