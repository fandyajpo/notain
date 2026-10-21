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

const HEADER = 'flex items-center justify-between gap-3 px-5 py-4 sm:px-6';
const BODY = 'px-5 py-4 sm:px-6';
const FOOTER =
  'flex flex-col gap-2 border-t border-border bg-background px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6';

/** What counts as a stop on Tab: everything the browser can put focus on. */
const FOCUSABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

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

  useEffect(() => {
    if (!open || !dismissible) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
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
          size="sm"
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

  return (
    <div
      className="animate-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 p-4"
      onClick={dismissible ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role={role}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={ariaLabelledBy ?? (headerContent && !header ? titleId : undefined)}
        onKeyDown={cycleFocus}
        className={`animate-modal-in max-h-[calc(100dvh-2rem)] w-full ${SIZE[size]} overflow-hidden rounded-card border border-border bg-card shadow-modal`}
        onClick={(event) => event.stopPropagation()}
      >
        {headerContent && (
          <div className={`border-b border-border ${headerClassName ?? HEADER}`}>
            {headerContent}
          </div>
        )}
        <div className={bodyClassName ?? BODY}>{children}</div>
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
      className="-m-1 shrink-0 rounded-control p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground focus-ring"
    >
      <X size={16} aria-hidden="true" />
    </button>
  );
}
