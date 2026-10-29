import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Button } from './button';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-3xl',
};

const HEADER = 'flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-6';
const BODY = 'px-5 py-4 sm:px-6';
/**
 * The panel is height-capped (`max-h-[…]` below), so without a scroll of its
 * own the body would simply be cut off and the footer — with the primary
 * action — would sit outside the dialog. `flex-auto` keeps the body's natural
 * height for short content and lets it shrink (and scroll) only when the cap
 * bites; a `flex-1` basis of zero would collapse a short modal to its chrome.
 */
const BODY_SCROLL = `${BODY} min-h-0 flex-auto overflow-y-auto`;
const FOOTER =
  'flex shrink-0 flex-col gap-2 border-t border-border bg-background px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6';

/** What counts as a stop on Tab: everything the browser can put focus on. */
const FOCUSABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Everything that can layer above a dialog while it is open: another dialog
 * (a nested confirm, the business-type picker) and the portalled menus that
 * `Select` and `Menu` draw at the end of `body`.
 */
const OVERLAY_SURFACE = '[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]';

/** The surface drawn above `panel`, or `null` when `panel` is the topmost one. */
function coveringSurface(panel: HTMLElement | null): HTMLElement | null {
  if (!panel) return null;
  const surfaces = document.querySelectorAll<HTMLElement>(OVERLAY_SURFACE);
  const top = surfaces[surfaces.length - 1];
  return top && top !== panel ? top : null;
}

/** Focus stops inside `panel`, minus the ones a user could never reach. */
function focusablesIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0,
  );
}

/** One button in the standard footer row. */
export type ModalAction = {
  label: ReactNode;
  onClick: () => void;
  /** `secondary` reads as cancel, `danger` as delete, `primary` as save/confirm. */
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  /** Icon rendered before the label. */
  icon?: ReactNode;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Custom header content; replaces the default title row. */
  header?: ReactNode;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  size?: Size;
  /** `alertdialog` for destructive confirms, `dialog` otherwise. */
  role?: 'dialog' | 'alertdialog';
  /** Points the dialog at a heading that lives in the body (e.g. onboarding). */
  ariaLabelledBy?: string;
  /**
   * When false the modal cannot be dismissed by Escape or backdrop click and
   * shows no close button — used by onboarding, whose only exit is completion.
   */
  dismissible?: boolean;
  children: ReactNode;
  /**
   * The standard footer: save/delete/cancel buttons laid out for you. Pass
   * them cancel-first and confirm-last — they stack full-width on mobile and
   * sit right-aligned on desktop. Use this instead of hand-rolling `footer`
   * for the common cases.
   */
  actions?: ModalAction[];
  /** Fully custom footer; overrides `actions`. */
  footer?: ReactNode;
};

/**
 * Shared modal surface: one backdrop, panel, header/body/footer rhythm and a
 * CSS enter animation (global.css). Exit is an instant unmount.
 *
 * Spacing is deliberately compact — a confirm dialog should not feel like a
 * page. For the four everyday actions there is no need to build a footer:
 * `actions` renders save/delete/cancel, and a dismissible modal always shows
 * an X (Escape and backdrop click also close it).
 */
export function Modal({
  open,
  onClose,
  title,
  header,
  headerClassName,
  bodyClassName,
  footerClassName,
  size = 'md',
  role = 'dialog',
  ariaLabelledBy,
  dismissible = true,
  children,
  actions,
  footer,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Set on the backdrop's pointerdown, read on the click that follows: see
  // `onBackdropPointerDown` below for why the two cannot be one handler.
  const pressCovered = useRef(false);

  useEffect(() => {
    if (!open || !dismissible) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Escape dismisses the *topmost* surface. A nested dialog or an open
      // menu handles this keystroke itself; passing it through would close
      // this dialog in the same stroke, taking a half-edited form with it.
      if (coveringSurface(panelRef.current)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Keyboard containment: focus walks into the dialog when it opens, Tab and
  // Shift+Tab cycle only inside it (`aria-modal` says the rest is inert — but
  // inert has to actually hold), and focus returns to the control that opened
  // it on close. Without this the first Tab leaves the page behind a backdrop
  // the user cannot see or reach.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const opener = document.activeElement as HTMLElement | null;
    panel.focus({ preventScroll: true });

    return () => {
      if (opener && opener !== document.body && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;

  const showClose = dismissible && !header;
  const headerContent =
    header ??
    (title ? (
      <>
        <h2 id={titleId} className="text-section">
          {title}
        </h2>
        {showClose && <CloseButton onClick={onClose} />}
      </>
    ) : null);

  const actionFooter = actions?.length
    ? actions.map((action, index) => (
        <Button
          key={index}
          variant={action.variant ?? 'primary'}
          // `md` = 44px: a dialog's footer buttons are THE confirmation targets
          // of the whole app, so they carry the full WCAG 2.5.5 touch size
          // instead of the 40px `sm` used for inline page actions. They also
          // sit next to `md` inputs in the forms above them.
          size="md"
          loading={action.loading}
          disabled={action.disabled}
          onClick={action.onClick}
          className="w-full sm:w-auto"
        >
          {action.icon}
          {action.label}
        </Button>
      ))
    : null;
  const footerContent = footer ?? actionFooter;

  /** Handled on the panel, so it fires for focus arriving from anywhere inside. */
  const cycleFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;

    // A keystroke inside a nested dialog belongs to that dialog's own trap —
    // letting this one act on it too makes Tab jump two stops.
    const covering = coveringSurface(panel);
    if (covering && event.target instanceof Node && covering.contains(event.target)) return;

    const items = focusablesIn(panel);
    if (items.length === 0) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = active instanceof Node && panel.contains(active);

    if (event.shiftKey) {
      // Wrapping backwards from the panel itself or from the first stop lands
      // on the last one; the backdrop is not a candidate.
      if (!inside || active === first) {
        event.preventDefault();
        last?.focus();
      }
    } else if (!inside || active === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  /**
   * An outside press while a portalled menu is open is aimed at the menu, not
   * at this dialog: the menu closes itself on pointerdown, and the click that
   * arrives a beat later would otherwise close the dialog too. React's
   * synthetic pointerdown reaches the backdrop *before* the document-level
   * listener that closes the menu, so this is the last moment where "a menu is
   * still open" is knowable — the click that follows then skips one press.
   */
  const onBackdropPointerDown = () => {
    pressCovered.current = Boolean(coveringSurface(panelRef.current));
  };

  const onBackdropClick = () => {
    const covered = pressCovered.current;
    pressCovered.current = false;
    if (covered) return;
    onClose();
  };

  return (
    <div
      className="animate-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-4"
      onPointerDown={dismissible ? onBackdropPointerDown : undefined}
      onClick={dismissible ? onBackdropClick : undefined}
    >
      <div
        ref={panelRef}
        role={role}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={ariaLabelledBy ?? (headerContent && !header ? titleId : undefined)}
        onKeyDown={cycleFocus}
        className={`animate-modal-in flex max-h-[calc(100dvh-2rem)] w-full ${SIZE[size]} flex-col overflow-hidden rounded-card border border-border bg-card shadow-modal`}
        onClick={(event) => event.stopPropagation()}
      >
        {headerContent && (
          <div className={`border-b border-border ${headerClassName ?? HEADER}`}>
            {headerContent}
          </div>
        )}
        <div className={bodyClassName ?? BODY_SCROLL}>{children}</div>
        {footerContent && <div className={footerClassName ?? FOOTER}>{footerContent}</div>}
      </div>
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Tutup"
      // size-11 (44px) hit target with a 20px glyph: the old p-1.5 + 16px box
      // was 28px, under the 44px touch target. `-mr-3` pulls the box out so the
      // glyph's centre lands exactly where the smaller button's did — the
      // header's optical alignment is unchanged, only the invisible padding
      // grew.
      className="-mr-3 flex size-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-background hover:text-foreground focus-ring"
    >
      <X size={20} aria-hidden="true" />
    </button>
  );
}
