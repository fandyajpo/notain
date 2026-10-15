import 'driver.js/dist/driver.css';
import { driver, type Driver } from 'driver.js';
import { getTour, type TourStep } from './tours';
import { isTourDone, markTourDone, takePendingTour } from './tour-store';

/** Only one tour runs at a time; navigation tears the active one down. */
let active: Driver | null = null;
let activeId: string | null = null;
/** Set right before a programmatic destroy so it isn't recorded as a skip. */
let suppressDone = false;

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function isTourActive(): boolean {
  return active !== null;
}

function toDriverSteps(steps: TourStep[]) {
  return steps.map((step) => ({
    element: `[data-tour="${step.target}"]`,
    // Tolerate a target that never appears (conditional UI, narrow viewport):
    // driver skips it instead of crashing on a null element.
    skipMissingElement: true,
    waitForElement: 1500,
    disableActiveInteraction: step.blockInteraction ?? false,
    popover: {
      title: step.title,
      description: step.description,
      side: step.side ?? 'bottom',
      align: 'center' as const,
    },
  }));
}

/** True when at least one of the tour's targets is present in the DOM. */
function hasAnyTarget(id: string): boolean {
  const tour = getTour(id);
  if (!tour) return false;
  return tour.steps.some((step) => document.querySelector(`[data-tour="${step.target}"]`));
}

/** Polls until the tour's first target exists, or the timeout elapses. */
async function waitForFirstTarget(id: string, timeoutMs = 2500): Promise<void> {
  const tour = getTour(id);
  const first = tour?.steps[0]?.target;
  if (!first) return;
  const selector = `[data-tour="${first}"]`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (document.querySelector(selector)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}

type RunOptions = { userId?: string };

/**
 * Starts a tour by id if it isn't already running and its targets exist.
 * Returns true when a tour actually started. Completion (finish *or* skip)
 * marks the tour done so it never auto-repeats.
 */
export async function runTour(id: string, options: RunOptions = {}): Promise<boolean> {
  const tour = getTour(id);
  if (!tour || active) return false;
  // Guard against running in a non-browser pass (defensive; islands are client-only).
  if (typeof document === 'undefined') return false;

  await waitForFirstTarget(id);
  if (!hasAnyTarget(id)) return false;

  const { userId } = options;
  activeId = id;
  active = driver({
    // Respect reduced-motion by dropping the slide animation (the tour itself
    // still shows — it is informational, not decorative).
    animate: !prefersReducedMotion(),
    allowClose: true,
    showProgress: true,
    progressText: 'Langkah {{current}} dari {{total}}',
    nextBtnText: 'Lanjut',
    prevBtnText: 'Kembali',
    popoverClass: 'notain-driver',
    steps: toDriverSteps(tour.steps),
    onDestroyed: () => {
      if (!suppressDone && activeId) markTourDone(activeId, userId);
      active = null;
      activeId = null;
    },
  });

  active.drive(0);
  return true;
}

/** Tears down the active tour without recording it as done (used on navigation). */
export function stopTour(): void {
  if (!active) return;
  suppressDone = true;
  active.destroy();
  suppressDone = false;
  active = null;
  activeId = null;
}

/** Re-runs a tour regardless of whether it was completed before (help/restart). */
export async function restartTour(id: string, options: RunOptions = {}): Promise<void> {
  stopTour();
  await runTour(id, options);
}

/**
 * Entry point a page island calls on mount. Runs the pending tour (e.g. the
 * welcome tour queued by onboarding) if one is scheduled, otherwise the page's
 * own tour the first time it is seen. Never stacks two tours.
 */
export async function maybeRunPageTour(pageId: string, options: RunOptions = {}): Promise<void> {
  if (active) return;

  const pending = takePendingTour();
  const id = pending ?? pageId;

  // A scheduled tour runs even if its id would otherwise be marked done; a
  // normal page tour only runs the first time it is encountered.
  if (!pending && isTourDone(id, options.userId)) return;

  await runTour(id, options);
}
