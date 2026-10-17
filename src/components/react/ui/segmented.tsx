import type { ReactNode } from 'react';
import { cx } from '../../../lib/ui/classes';

/**
 * The shared segmented toggle: icon/label chips in one recessed track.
 *
 * Replaces four hand-rolled copies (line-item unit toggle, template align /
 * width groups, theme wallpaper kind, builder tabs). Two tones:
 * `accent` for navigation-like state (tabs), neutral for value toggles.
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
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>;
  variant?: 'neutral' | 'accent';
  ariaLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx('inline-flex rounded-control border border-border bg-sunken p-0.5', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex items-center justify-center gap-1.5 rounded-item font-medium transition-colors focus-ring',
              size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
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
