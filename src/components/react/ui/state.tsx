import { CircleAlert, Loader2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../../lib/ui/classes';
import { cardClass } from './card';

/**
 * Every data view in the app shows one of these three states — loading, empty,
 * error — from the same surface so a page never swaps one card style for
 * another halfway down. Callers only supply copy and an optional action.
 */

const shell = 'flex flex-col items-center justify-center px-6 text-center';

/** Spinner + label on the standard card surface. */
export function LoadingState({
  label = 'Memuat…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" className={cx(cardClass('none', cx(shell, 'py-14')), className)}>
      <Loader2 size={20} className="animate-spin text-muted" aria-hidden="true" />
      <p className="mt-3 text-sm text-muted">{label}</p>
    </div>
  );
}

/** Dashed surface inviting the first action (or reporting "no matches"). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        cardClass('none', 'border-dashed'),
        shell,
        'py-12',
        className,
      )}
    >
      {Icon ? <Icon size={22} className="text-muted" aria-hidden="true" /> : null}
      <p className={cx('text-section text-foreground', Icon && 'mt-3')}>{title}</p>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/**
 * Failure surfaced honestly: danger tint, plain-language message, optional
 * retry. `inline` sits inside a table cell or narrow column and drops the card.
 */
export function ErrorState({
  title = 'Gagal memuat',
  message,
  action,
  inline = false,
  className,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
  inline?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-center gap-2">
        <CircleAlert size={16} className="shrink-0 text-danger" aria-hidden="true" />
        <p className="text-section text-foreground">{title}</p>
      </div>
      <p className="mt-1.5 max-w-md text-sm text-muted">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </>
  );

  if (inline) {
    return (
      <div role="alert" className={cx(shell, 'py-10', className)}>
        {body}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cx(cardClass('none', 'border-danger/25 bg-danger-soft'), shell, 'py-10', className)}
    >
      {body}
    </div>
  );
}
