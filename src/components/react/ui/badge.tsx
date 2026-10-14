import type { HTMLAttributes, ReactNode } from 'react';

type Variant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  neutral: 'bg-background text-muted border-border',
  accent: 'bg-accent-soft text-accent border-accent/20',
  success: 'bg-accent-soft text-accent border-accent/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
};

const SIZES: Record<Size, string> = {
  sm: 'h-5 px-2 text-[11px]',
  md: 'h-6 px-2.5 text-xs',
};

/** Shared badge surface: pill, bordered, tinted per variant. */
export function badgeClass(variant: Variant = 'neutral', size: Size = 'md'): string {
  return [
    'inline-flex items-center gap-1 rounded-pill border font-medium whitespace-nowrap',
    VARIANTS[variant],
    SIZES[size],
  ].join(' ');
}

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
};

/** React twin of the Astro `Badge.astro`. */
export function Badge({ variant = 'neutral', size = 'md', className, children, ...rest }: Props) {
  return (
    <span className={[badgeClass(variant, size), className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  );
}
