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

type Props = HTMLAttributes<HTMLDivElement> & {
  padding?: Padding;
  children?: ReactNode;
};

/** React twin of the Astro `Card.astro`. */
export function Card({ padding = 'md', className, children, ...rest }: Props) {
  return (
    <div className={cardClass(padding, className ?? '')} {...rest}>
      {children}
    </div>
  );
}
