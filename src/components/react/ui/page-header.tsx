import type { ReactNode } from 'react';

type Props = {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions (export buttons, "new" button, reload). */
  actions?: ReactNode;
  className?: string;
};

/**
 * The standard page header: a `text-title` h1 with an optional muted
 * description and an actions slot on the right. Every app page that opens
 * with a heading uses this so spacing and type stay identical.
 */
export function PageHeader({ title, description, actions, className }: Props) {
  return (
    <header
      className={['flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div>
        <h1 className="text-title">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
