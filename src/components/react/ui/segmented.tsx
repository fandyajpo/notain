import type { ReactNode } from 'react';
import { cx } from '../../../lib/ui/classes';

/** Chip footprint per size; `icon` is the square pad used by glyph-only chips. */
const PADDING = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  icon: 'p-1.5',
} as const;

type Option<T extends string> = {
  value: T;
  label: ReactNode;
  title?: string;
  /** Overrides the button's accessible name — needed when the chip shows an
   *  icon, or when several tracks of the same chips sit on one page. */
  ariaLabel?: string;
};

/**
 * The shared segmented toggle: icon/label chips in one recessed track.
 *
 * One component owns the track (`border` + `bg-sunken` + `p-0.5`), the chip
 * rhythm and the pressed styling, so every toggle in the app is built from the
 * same pieces instead of retyping them. Two tones: `accent` for
 * navigation-like state (builder section tabs), neutral for value toggles
 * (align, width, template, unit).
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  variant = 'neutral',
  ariaLabel,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<Option<T>>;
  variant?: 'neutral' | 'accent';
  ariaLabel?: string;
  size?: keyof typeof PADDING;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        // The default track hugs its chips (`inline-flex`), which is right for
        // the small inline toggles (align, Rp/%, width) that sit inside a form
        // row. Long tracks (the builder's 6-section tab strip) override this
        // with `!block` so `max-w-full` can bite and `overflow-x-auto` scrolls
        // instead of the page — an inline box cannot shrink below its
        // min-content, so `max-w-full` alone is a no-op on it.
        'inline-flex rounded-control border border-border bg-sunken p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.ariaLabel}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cx(
              // `shrink-0` matters in the builder's scrollable tab strip, where
              // a flex child would otherwise compress below its label.
              'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-item font-medium transition-colors focus-ring',
              PADDING[size],
              active
                ? variant === 'accent'
                  ? 'bg-accent text-accent-foreground shadow-card'
                  : 'bg-card text-foreground shadow-card'
                : 'text-muted hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
