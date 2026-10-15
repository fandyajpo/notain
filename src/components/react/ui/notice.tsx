import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx, noticeClass } from '../../../lib/ui/classes';

const ICONS: Record<'danger' | 'accent' | 'success' | 'warning', LucideIcon> = {
  danger: CircleAlert,
  accent: Info,
  success: CircleCheck,
  warning: TriangleAlert,
};

/**
 * Inline alert: server errors under a form, stale-data banners, confirmation
 * notices. One tint/radius/icon rhythm for all of them, replacing the
 * scattered `border-danger/25` vs `/40` one-offs.
 */
export function Notice({
  variant = 'danger',
  children,
  className,
  ...rest
}: {
  variant?: 'danger' | 'accent' | 'success' | 'warning';
  children: ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  const Icon = ICONS[variant];

  return (
    <div role={variant === 'danger' ? 'alert' : 'status'} className={cx(noticeClass(variant), className)} {...rest}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
