import type { ReactNode } from 'react';

type Props = {
  title: ReactNode;
  /** Muted line above the title (a greeting, a parent location). */
  kicker?: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions (export buttons, "new" button, reload). */
  actions?: ReactNode;
  className?: string;
};

/**
 * The standard page header: a `text-title` h1 with an optional muted kicker
 * above, description below, and an actions slot on the right. Every app page
 * that opens with a heading uses this so spacing and type stay identical —
 * pages should never hand-roll this row again.
 */
export function PageHeader({ title, kicker, description, actions, className }: Props) {
  return (
    <header
      className={['flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="min-w-0">
        {kicker && <p className="text-sm text-muted">{kicker}</p>}
        <h1 className={kicker ? 'mt-0.5 text-title' : 'text-title'}>{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
