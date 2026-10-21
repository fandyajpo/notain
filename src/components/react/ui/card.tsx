import type { HTMLAttributes, ReactNode } from 'react';

type Padding = 'none' | 'sm' | 'md' | 'lg';

const PADDING: Record<Padding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

/** Shared card surface: rounded, bordered, themed fill, hairline shadow. */
export function cardClass(padding: Padding = 'md', className = ''): string {
  return ['rounded-card border border-border bg-card shadow-card', PADDING[padding], className]
    .filter(Boolean)
    .join(' ');
}

/**
 * The action row three list pages open with: one card laid out
 * `justify-between`. Named so the pager, the toolbar and the bulk bar stay in
 * step instead of each retyping the surface (the same idea as `TABLE_SHELL`).
 */
export const CARD_ROW =
  'flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card px-4 py-3 shadow-card';

type Props = HTMLAttributes<HTMLDivElement> & {
  padding?: Padding;
  children?: ReactNode;
};

/** Panel shell: `border` + `bg-card` + `rounded-card`, padding from the scale. */
export function Card({ padding = 'md', className, children, ...rest }: Props) {
  return (
    <div className={cardClass(padding, className ?? '')} {...rest}>
      {children}
    </div>
  );
}
