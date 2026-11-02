import { useEffect, useRef } from 'react';
import type {
  HTMLAttributes,
  ReactNode,
  RefObject,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from 'react';

/**
 * Canonical table styling. The invoice table (TanStack) and the admin table
 * both build on these so a row, a header cell, and the card wrapper look the
 * same everywhere.
 */

/**
 * The card frame around a horizontally scrolling table. It never scrolls
 * itself — the scroller inside it does — so it can host the edge fades
 * (`data-hint` decides which are visible).
 */
export const TABLE_FRAME =
  'relative isolate overflow-hidden rounded-card border border-border bg-card shadow-card';

/** The horizontal scroller inside {@link TABLE_FRAME}. */
export const TABLE_SCROLLER = 'overflow-x-auto';

export const TABLE = 'w-full border-collapse text-sm';

export const THEAD_ROW = 'border-b border-border-strong';

/** `relative` gives the invoice row's stretched link a positioned ancestor. */
export const TBODY_ROW = 'relative border-b border-border/60 last:border-0 hover:bg-background/60';

/**
 * Header cell: a faint wash instead of a heavy rule, on the eyebrow scale so
 * headers read as labels, not shouting caps in body size.
 */
export function thClass(extra = ''): string {
  return ['bg-background/70 px-4 py-2.5 text-left text-eyebrow uppercase text-muted', extra]
    .filter(Boolean)
    .join(' ');
}

export function tdClass(extra = ''): string {
  return ['px-4 py-3', extra].filter(Boolean).join(' ');
}

/**
 * Scrollbars are hidden everywhere (see `global.css`), so a table wider than
 * its card needs another way to say "there is more to the right". The frame
 * gets `data-hint="start"`, `data-hint="end"` or both, and CSS fades the
 * matching edge in; no hint attribute means the table fits and no fade shows.
 *
 * Measured on scroll, on resize, and on content mutation (rows render in
 * after the island hydrates), coalesced to one read per frame.
 */
function useScrollHints(frameRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const frame = frameRef.current;
    // `<TableFrame>` always renders the scroller as its first child; the
    // hint spans follow it.
    const scroller = frame?.firstElementChild as HTMLElement | null;
    if (!frame || !scroller) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const max = scroller.scrollWidth - scroller.clientWidth;
      const x = scroller.scrollLeft;
      const hints: string[] = [];
      // 1px slack: subpixel layout reports a fractional remainder on tables
      // that exactly fit.
      if (max > 1) {
        if (x > 1) hints.push('start');
        if (x < max - 1) hints.push('end');
      }
      if (hints.length) frame.dataset.scrollHint = hints.join(' ');
      else delete frame.dataset.scrollHint;
      // Keyboard access (WCAG 2.1.1): a scroller with no focusable cells of
      // its own must be reachable by Tab — but only while there is actually
      // something to scroll to, so a table that fits adds no tab stop.
      if (max > 1) scroller.setAttribute('tabindex', '0');
      else scroller.removeAttribute('tabindex');
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(scroller);
    if (scroller.firstElementChild) resize.observe(scroller.firstElementChild);
    const mutations = new MutationObserver(schedule);
    mutations.observe(scroller, { childList: true, subtree: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [frameRef]);
}

type FrameProps = HTMLAttributes<HTMLDivElement>;

/**
 * Card + horizontal scroller for tables that render their own `<table>`
 * (the TanStack invoice table, the dashboard and list pages). Extra props
 * (`data-tour`, `aria-busy`) land on the frame, which keeps the same box the
 * bare shell used to occupy.
 */
export function TableFrame({ className, children, ...rest }: FrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  useScrollHints(frameRef);
  return (
    <div
      ref={frameRef}
      className={[TABLE_FRAME, className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    >
      <div className={TABLE_SCROLLER}>{children}</div>
      {/* Decorative fades: no pointer events, hidden from assistive tech —
          the table is still scrollable and readable without them. */}
      <span aria-hidden="true" className="table-hint table-hint-start" />
      <span aria-hidden="true" className="table-hint table-hint-end" />
    </div>
  );
}

type ShellProps = FrameProps & {
  /** Minimum width before the shell scrolls horizontally. */
  minWidth?: string;
  children?: ReactNode;
};

/** Wrapper + `<table>` skeleton for simple, non-virtualised tables. */
export function TableShell({ minWidth = '640px', className, children, ...rest }: ShellProps) {
  return (
    <TableFrame className={className} {...rest}>
      <table className={TABLE} style={{ minWidth }}>
        {children}
      </table>
    </TableFrame>
  );
}

type HeadCellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right';
  children?: ReactNode;
};

/** Header cell with the shared label styling. */
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

/** Body cell with the shared padding. */
export function Td({ className, children, ...rest }: BodyCellProps) {
  return (
    <td className={tdClass(className ?? '')} {...rest}>
      {children}
    </td>
  );
}
