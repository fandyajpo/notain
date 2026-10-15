import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

/**
 * Canonical table styling. The invoice table (TanStack) and the admin table
 * both build on these so a row, a header cell, and the card wrapper look the
 * same everywhere.
 */

/** The card wrapper every data table sits inside. */
export const TABLE_SHELL = 'overflow-x-auto rounded-card border border-border bg-card shadow-card';

export const TABLE = 'w-full border-collapse text-sm';

export const THEAD_ROW = 'border-b border-border-strong';

/** `relative` gives the invoice row's stretched link a positioned ancestor. */
export const TBODY_ROW =
  'relative border-b border-border/60 last:border-0 hover:bg-background/60';

/**
 * Header cell: a faint wash instead of a heavy rule, on the eyebrow scale so
 * headers read as labels, not shouting caps in body size.
 */
export function thClass(extra = ''): string {
  return [
    'bg-background/70 px-4 py-2.5 text-left text-eyebrow uppercase text-muted',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export function tdClass(extra = ''): string {
  return ['px-4 py-3', extra].filter(Boolean).join(' ');
}

type ShellProps = HTMLAttributes<HTMLDivElement> & {
  /** Minimum width before the shell scrolls horizontally. */
  minWidth?: string;
  children?: ReactNode;
};

/** Wrapper + `<table>` skeleton for simple, non-virtualised tables. */
export function TableShell({ minWidth = '640px', className, children, ...rest }: ShellProps) {
  return (
    <div className={[TABLE_SHELL, className ?? ''].filter(Boolean).join(' ')} {...rest}>
      <table className={TABLE} style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

type HeadCellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right';
  children?: ReactNode;
};

export function Th({ align = 'left', className, children, ...rest }: HeadCellProps) {
  return (
    <th
      scope="col"
      className={thClass([align === 'right' ? 'text-right' : '', className ?? ''].join(' ').trim())}
      {...rest}
    >
      {children}
    </th>
  );
}

type BodyCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  children?: ReactNode;
};

export function Td({ className, children, ...rest }: BodyCellProps) {
  return (
    <td className={tdClass(className ?? '')} {...rest}>
      {children}
    </td>
  );
}
