import { Loader2 } from 'lucide-react';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50 [aria-disabled=true]:opacity-50';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-foreground hover:bg-accent/90 active:bg-accent/80',
  secondary: 'border border-border bg-card text-foreground shadow-card hover:bg-background',
  ghost: 'text-foreground hover:bg-border/70',
  danger: 'bg-danger text-danger-foreground hover:bg-danger/90 active:bg-danger/80',
  // Destructive, but not the page's primary action: quiet until hovered.
  'danger-soft':
    'border border-danger/25 bg-danger-soft text-danger hover:border-danger/40 hover:bg-danger/10',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

type SharedProps = {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  className?: string;
  children?: ReactNode;
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  SharedProps & {
    loading?: boolean;
  };

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & SharedProps;

function classes({
  variant,
  size,
  full,
  className,
}: Required<Pick<SharedProps, 'variant' | 'size'>> & Pick<SharedProps, 'full' | 'className'>) {
  return [BASE, VARIANTS[variant], SIZES[size], full ? 'w-full' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
}

/**
 * The one button. When `href` is present it renders an `<a>` so navigation
 * links share the exact same surface as clickable buttons. `target`/`rel` are
 * listed explicitly: the base props describe a `<button>`, which has neither,
 * but callers do open these links in a new tab.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  full = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps & { href?: string; target?: string; rel?: string }) {
  const cls = classes({ variant, size, full, className });

  if ('href' in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest as LinkProps & { href?: string };
    return (
      <a
        href={href}
        className={cls}
        aria-disabled={disabled ? 'true' : undefined}
        {...(anchorRest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
