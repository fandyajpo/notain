/**
 * Shared class strings used across React, Svelte and Astro surfaces.
 *
 * Anything repeated by two or more component files belongs here so a radius,
 * hover tone or spacing tweak lands everywhere at once. Keep helpers small and
 * pure — this file is plain data, no runtime dependencies.
 */

type ClassValue = string | false | null | undefined;

/** Joins truthy class fragments (a 20-line dependency-free `cx`). */
export function cx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}

type ControlOptions = {
  invalid?: boolean;
  /** Compact controls (toolbars, dense tables) drop to h-10; default h-11. */
  size?: 'sm' | 'md';
  /** Multi-line controls (textarea) drop the fixed height and grow instead. */
  multiline?: boolean;
  className?: string;
};

/**
 * The single source of truth for every text-like control's surface. React
 * (`react/ui/field.tsx`) and the Astro/Svelte/Vue twin (`lib/ui/field.ts`)
 * both re-export this, so a tweak lands in every framework at once.
 */
export function controlClass({
  invalid = false,
  size = 'md',
  multiline = false,
  className = '',
}: ControlOptions = {}): string {
  return [
    'w-full rounded-control border bg-card px-3.5 text-sm text-foreground shadow-card',
    'transition-colors placeholder:text-muted focus-ring',
    invalid ? 'border-danger' : 'border-border hover:border-border-strong',
    'disabled:cursor-not-allowed disabled:bg-background disabled:text-muted disabled:shadow-none disabled:hover:border-border',
    'read-only:cursor-default read-only:bg-background',
    multiline ? 'min-h-24 resize-y py-2.5 leading-relaxed' : size === 'sm' ? 'h-10' : 'h-11',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The one icon-button surface: an unfilled square hit target for toolbars,
 * card headers and table rows. Sizes keep the 36/40px touch rhythm.
 */
export function iconButtonClass(size: 'sm' | 'md' = 'md'): string {
  return cx(
    'inline-flex shrink-0 select-none items-center justify-center rounded-control text-muted',
    'transition-colors hover:bg-background hover:text-foreground focus-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    size === 'sm' ? 'p-1.5' : 'p-2',
  );
}

/** The shared floating-surface shell: menus, listboxes, popovers. */
export function popoverClass(className?: string): string {
  return cx(
    'rounded-control border border-border bg-card p-1 shadow-popover animate-popover-in',
    className,
  );
}

const BASE_ROW =
  'flex w-full items-center gap-2.5 rounded-item px-2.5 py-2 text-left text-sm transition-colors focus-ring';

/**
 * A row inside a menu or listbox.
 *
 * `active` paints the highlight unconditionally — listbox options move with the
 * arrow keys, where `:hover` never fires — while plain menus rely on
 * `:hover`/`:focus-visible`.
 */
export function menuItemClass(
  options: { tone?: 'default' | 'danger'; disabled?: boolean; active?: boolean } = {},
): string {
  const { tone = 'default', disabled = false, active = false } = options;
  if (disabled) {
    return cx(BASE_ROW, 'cursor-not-allowed text-muted/60');
  }
  if (tone === 'danger') {
    return cx(BASE_ROW, 'text-danger', active ? 'bg-danger-soft' : 'hover:bg-danger-soft focus:bg-danger-soft');
  }
  return cx(
    BASE_ROW,
    active
      ? 'bg-accent-soft text-accent'
      : 'text-foreground hover:bg-accent-soft hover:text-accent focus:bg-accent-soft focus:text-accent',
  );
}
/**
 * Inline alert surface (validation banners, stale-data notices). One radius,
 * one tint, one icon rhythm — replaces the scattered `border-danger/25` vs
 * `border-danger/40` one-offs.
 */
export function noticeClass(variant: 'danger' | 'accent' | 'success' | 'warning'): string {
  const tint = {
    danger: 'border-danger/25 bg-danger-soft text-danger',
    accent: 'border-accent/25 bg-accent-soft text-accent',
    success: 'border-success/25 bg-success-soft text-success',
    warning: 'border-warning/30 bg-warning-soft text-warning',
  }[variant];
  return cx('flex items-start gap-2.5 rounded-control border px-4 py-3 text-sm', tint);
}

/** The standard page section rhythm: every page root stacks with this gap. */
export const PAGE_GAP = 'flex flex-col gap-6';

/**
 * Color treatments for sidebar/mobile nav links. SSR class lists and the
 * client-side `syncNav` script both toggle these exact tokens, so the shell
 * has one source of truth for "active" vs "idle".
 */
export const NAV_ACTIVE_CLASS = 'bg-accent-soft font-medium text-accent';
export const NAV_IDLE_CLASS = 'text-muted hover:bg-background hover:text-foreground';

export function navLinkClass(active: boolean): string {
  return active ? NAV_ACTIVE_CLASS : NAV_IDLE_CLASS;
}
