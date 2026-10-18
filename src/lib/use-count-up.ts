import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './ui/confetti';

/** How long a count-up takes, start to finish. */
export const COUNT_UP_DURATION_MS = 700;

/**
 * The eased value at progress `t` (0–1): ease-out cubic, so the number
 * decelerates into its target the way the rest of the app's motion lands.
 * Exported pure so tests can pin the curve without a clock.
 */
export function countUpValue(from: number, to: number, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const eased = 1 - (1 - clamped) ** 3;
  return Math.round(from + (to - from) * eased);
}

/**
 * Animates a counter up to `target` whenever it changes.
 *
 * Starts at 0 so the first data arrival (skeleton → numbers) rolls up instead
 * of blinking into place, and re-rolls on later changes (a revalidation that
 * moves a figure by one). Reduced-motion users get the target immediately;
 * identical values never restart the animation.
 */
export function useCountUp(target: number, durationMs = COUNT_UP_DURATION_MS): number {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;

    const start = performance.now();
    const tick = (now: number) => {
      const progress = (now - start) / durationMs;
      if (progress >= 1) {
        fromRef.current = target;
        setDisplay(target);
        return;
      }
      setDisplay(countUpValue(from, target, progress));
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, durationMs]);

  return display;
}
