import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  /** Rendered as a link (client-side nav via the Astro router). */
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
};

type Props = {
  /** Accessible name for the trigger, e.g. "Aksi INV-0001". */
  label: string;
  items: MenuItem[];
  /** Menu edge alignment relative to the trigger. */
  align?: 'start' | 'end';
  className?: string;
  /** Trigger content — usually an icon. */
  children: ReactNode;
};

const ITEM_BASE =
  'flex w-full items-center gap-2.5 rounded-[0.375rem] px-2.5 py-2 text-left text-sm transition-colors';

/**
 * An icon-triggered action menu (WAI-ARIA `menu` + `menuitem`).
 *
 * The panel is portalled to `document.body` with `position: fixed`, measured
 * off the trigger and flipped above it near the viewport bottom. A portal is
 * required here: the invoice table scrolls horizontally (`overflow-x-auto`),
 * which would otherwise clip an absolutely-positioned popover. Keyboard users
 * get arrow/Home/End roving focus plus Escape to close.
 */
export function Menu({ label, items, align = 'end', className, children }: Props) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);

  function openMenu() {
    setPos(null);
    setOpen(true);
    // Focus the first enabled item once the panel is in the DOM.
    requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
        ?.focus();
    });
  }

  function closeMenu(refocus = true) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  // Close on outside press / Escape while open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') closeMenu();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // A fixed portal tracks the trigger, so a scroll or resize would strand it.
  // Closing is simpler (and calmer) than re-anchoring on every frame.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // Measure the trigger + panel, then place (and possibly flip) the menu.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    const panelHeight = panel.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < panelHeight + 8 && rect.top > spaceBelow;

    const style: CSSProperties = above
      ? { bottom: window.innerHeight - rect.top + 6 }
      : { top: rect.bottom + 6 };
    if (align === 'end') style.right = window.innerWidth - rect.right;
    else style.left = rect.left;
    setPos(style);
  }, [align, open]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nodes = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        nodes[(index + 1) % nodes.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        nodes[(index - 1 + nodes.length) % nodes.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        nodes[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        nodes[nodes.length - 1]?.focus();
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        className="rounded-control p-2 text-muted transition-colors hover:bg-background hover:text-foreground focus-ring"
      >
        {children}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            // First pass is invisible at the origin so we can measure the
            // height, then re-place it anchored to the trigger.
            style={pos ?? { top: 0, left: 0, visibility: 'hidden' }}
            className="fixed z-[100] min-w-44 rounded-control border border-border bg-card p-1 shadow-popover animate-popover-in"
          >
            {items.map((item) => {
              const danger = item.variant === 'danger';
              const tone = item.disabled
                ? 'cursor-not-allowed text-muted/60'
                : danger
                  ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft'
                  : 'text-foreground hover:bg-accent-soft hover:text-accent focus:bg-accent-soft focus:text-accent';
              const iconTone = item.disabled
                ? 'text-muted/60'
                : danger
                  ? 'text-danger'
                  : 'text-muted';
              const content = (
                <>
                  {item.icon && (
                    <span className={`shrink-0 ${iconTone}`} aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  <span className="truncate">{item.label}</span>
                </>
              );
              const handle = () => {
                closeMenu(false);
                item.onClick?.();
              };
              const classes = `${ITEM_BASE} focus:outline-none ${tone}`;

              if (item.href && !item.disabled) {
                return (
                  <a
                    key={item.label}
                    role="menuitem"
                    href={item.href}
                    tabIndex={-1}
                    onClick={handle}
                    className={classes}
                  >
                    {content}
                  </a>
                );
              }
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  tabIndex={-1}
                  onClick={handle}
                  className={classes}
                >
                  {content}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
