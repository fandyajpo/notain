/**
 * Local persistence for Driver.js tours.
 *
 * Backed by `localStorage`, keyed per authenticated user (falling back to an
 * anonymous bucket) and namespaced by a `VERSION` so shipping new tour copy can
 * re-show a tour by bumping it. This is local-only: completion does not follow
 * the user across devices or browsers, which is the documented trade-off when
 * there is no per-user backend preference store wired up.
 */

const NAMESPACE = 'notain.tour';
const VERSION = '1';
const PENDING_KEY = `${NAMESPACE}.pending`;

type Completed = Record<string, true>;

function storeKey(userId?: string): string {
  return `${NAMESPACE}.${VERSION}.${userId ?? 'anon'}`;
}

function read(userId?: string): Completed {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storeKey(userId));
    return raw ? (JSON.parse(raw) as Completed) : {};
  } catch {
    return {};
  }
}

function write(userId: string | undefined, completed: Completed): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(completed));
  } catch {
    /* private mode / quota — tours simply re-offer, never crash */
  }
}

export function isTourDone(tourId: string, userId?: string): boolean {
  return Boolean(read(userId)[tourId]);
}

export function markTourDone(tourId: string, userId?: string): void {
  const completed = read(userId);
  completed[tourId] = true;
  write(userId, completed);
}

export function clearTour(tourId: string, userId?: string): void {
  const completed = read(userId);
  delete completed[tourId];
  write(userId, completed);
}

/** Marks every known tour done — used by "never ask again" style resets. */
export function clearAllTours(userId?: string): void {
  write(userId, {});
}

/**
 * A tour queued to run as soon as its host surface is ready (the welcome tour,
 * right after onboarding, before the dashboard has mounted). Stored so the
 * hand-off survives the re-render that mounts the dashboard.
 */
export function scheduleTour(tourId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PENDING_KEY, tourId);
  } catch {
    /* ignore */
  }
}

/** Reads (and clears) any queued tour. Returns null when nothing is pending. */
export function takePendingTour(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const tourId = localStorage.getItem(PENDING_KEY);
    if (tourId) localStorage.removeItem(PENDING_KEY);
    return tourId;
  } catch {
    return null;
  }
}

export function peekPendingTour(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}
