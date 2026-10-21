import { Check, ChevronDown, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cx, menuItemClass, popoverClass } from '../../../lib/ui/classes';
import { controlClass } from './field';

export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Rendered when `value` is an empty string — a non-selectable first item. */
  placeholder?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /**
   * Show a clear (×) button when a value is selected, so an optional selection
   * can be reset in one tap. It calls `onClear` (or `onChange('')`). Never set
   * this on required fields — clearing one would strand the form invalid.
   */
  clearable?: boolean;
  onClear?: () => void;
  /** Control height. `md` matches form fields (h-11); `sm` matches toolbar rows. */
  size?: 'md' | 'sm';
  /**
   * Drop the standard control surface so `triggerClassName` fully owns the
   * trigger's look (used by the status badge, which is a pill, not a field).
   */
  bare?: boolean;
  /** Appended last so callers can restyle the trigger (e.g. the status badge). */
  triggerClassName?: string;
  className?: string;
};

const MAX_LIST_HEIGHT = 'max-h-72';

/**
 * A hand-rolled listbox in the WAI-ARIA "button + aria-activedescendant" pattern.
 *
 * Native `<select>` dropdowns are painted by the OS and cannot be themed, which
 * is why the open menu never matched the design system. This renders the menu
 * ourselves so options get the same rounded/popover treatment as the rest of the
 * app, while keeping full keyboard support (typeahead, arrows, Home/End) and
 * screen-reader semantics. The trigger stays focusable and announces the
 * selected value via `aria-expanded`/`aria-activedescendant`.
 *
 * The listbox is portalled to `document.body` with `position: fixed`, measured
 * off the trigger and flipped above it near the viewport bottom — the same
 * treatment `Menu` gets. An in-flow (absolute) menu inside the invoice table's
 * `overflow-x-auto` shell would add to the shell's scrollable area, so opening
 * a status dropdown made the whole table scroll and reflow.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  id,
  name,
  required,
  disabled,
  invalid,
  clearable,
  onClear,
  size = 'md',
  bare,
  triggerClassName,
  className,
  ...aria
}: Props) {
  const reactId = useId();
  const baseId = id ?? `select-${reactId}`;
  const listboxId = `${baseId}-listbox`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ buffer: '', timer: 0 });

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Fixed-portal coordinates, measured off the trigger. `null` = not placed yet.
  const [pos, setPos] = useState<CSSProperties | null>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const display = selected?.label ?? placeholder ?? '';

  const openMenu = useCallback(() => {
    if (disabled) return;
    setPos(null);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled));
    setOpen(true);
  }, [disabled, options, selectedIndex]);

  const closeMenu = useCallback((refocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onChange(option.value);
      closeMenu();
    },
    [closeMenu, onChange, options],
  );

  // Close on outside press / Escape while open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
      setActiveIndex(-1);
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
  }, [closeMenu, open]);

  // The menu is fixed to the viewport, so a scroll or resize would strand it.
  // Closing is simpler (and calmer) than re-anchoring — except for scrolls
  // inside the listbox itself (typeahead scroll-into-view, wheel over options).
  useEffect(() => {
    if (!open) return;
    function close(event: Event) {
      const target = event.target;
      if (target instanceof Node && listRef.current?.contains(target)) return;
      setOpen(false);
      setActiveIndex(-1);
    }
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // Measure the trigger, then place (and possibly flip) the portalled menu.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;

    const rect = trigger.getBoundingClientRect();
    const listHeight = Math.min(list.scrollHeight, 288); // matches max-h-72
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < listHeight + 12 && rect.top > spaceBelow;
    // Effective width is `width` widened by the list's `min-w-40` floor.
    const width = Math.max(rect.width, 160);

    const style: CSSProperties = { width, left: rect.left };
    if (above) style.bottom = window.innerHeight - rect.top + 6;
    else style.top = rect.bottom + 6;
    // Flip against the right viewport edge so a field near the edge never
    // spills (and never widens an overflow-x parent).
    if (rect.left + width > window.innerWidth - 8) style.left = Math.max(8, rect.right - width);
    setPos(style);

    const option = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    option?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  function moveTo(next: number) {
    if (options.length === 0) return;
    let index = next;
    // Skip disabled options in the direction of travel.
    for (let steps = 0; steps < options.length; steps += 1) {
      const option = options[index];
      if (option && !option.disabled) break;
      index = (index + (next > 0 || index === -1 ? 1 : -1) + options.length) % options.length;
    }
    setActiveIndex(index);
  }

  function runTypeahead(char: string) {
    const state = typeahead.current;
    window.clearTimeout(state.timer);
    state.buffer += char.toLowerCase();
    state.timer = window.setTimeout(() => {
      state.buffer = '';
    }, 500);

    const start = activeIndex >= 0 ? activeIndex + 1 : 0;
    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (start + offset) % options.length;
      const option = options[index];
      if (option && !option.disabled && option.label.toLowerCase().startsWith(state.buffer)) {
        setActiveIndex(index);
        return;
      }
    }
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (open) moveTo(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
        else openMenu();
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) commit(activeIndex);
        else openMenu();
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          moveTo(0);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          moveTo(options.length - 1);
        }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
      default:
        if (!open && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          openMenu();
          runTypeahead(event.key);
        } else if (open && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          runTypeahead(event.key);
        }
    }
  }

  // Only meaningful on optional fields with a live selection.
  const showClear = Boolean(clearable) && !disabled && value !== '';
  const clear = (event: ReactMouseEvent) => {
    event.stopPropagation();
    (onClear ?? (() => onChange('')))();
  };

  return (
    <div className={`relative ${bare ? 'w-fit' : ''} ${className ?? ''}`}>
      <button
        ref={triggerRef}
        id={baseId}
        type="button"
        role="combobox"
        name={name}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined
        }
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-labelledby']}
        disabled={disabled}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={
          bare
            ? ['relative inline-flex items-center gap-1.5 focus-ring', triggerClassName ?? '']
                .filter(Boolean)
                .join(' ')
            : controlClass({
                invalid,
                size,
                className: [
                  'relative',
                  'flex items-center justify-between gap-2 text-left',
                  showClear ? 'pr-16' : 'pr-9',
                  'cursor-pointer disabled:cursor-not-allowed',
                  triggerClassName ?? '',
                ]
                  .filter(Boolean)
                  .join(' '),
              })
        }
      >
        <span className={`truncate ${display ? '' : 'text-muted'}`}>{display}</span>
        <ChevronDown
          size={bare ? 12 : 16}
          aria-hidden="true"
          className={`pointer-events-none ${
            bare ? 'right-2 opacity-60' : 'right-3.5 text-muted'
          } absolute top-1/2 -translate-y-1/2 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {showClear && (
        <button
          type="button"
          aria-label="Hapus pilihan"
          disabled={disabled}
          onClick={clear}
          className="absolute top-1/2 right-9 z-10 -translate-y-1/2 rounded-md p-0.5 text-muted transition-colors hover:text-foreground focus-ring disabled:opacity-40"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}

      {open &&
        createPortal(
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={aria['aria-label'] ?? aria['aria-labelledby']}
            // First pass is invisible at the origin so we can measure the
            // height, then re-place it anchored to the trigger.
            style={pos ?? { top: 0, left: 0, visibility: 'hidden' }}
            className={cx(
              'fixed z-portal min-w-40 overflow-y-auto',
              MAX_LIST_HEIGHT,
              popoverClass(),
            )}
          >
            {placeholder && selectedIndex < 0 && (
              <div className="px-2.5 py-2 text-sm text-muted">{placeholder}</div>
            )}
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <div
                  key={option.value}
                  id={`${baseId}-opt-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => commit(index)}
                  className={cx(
                    menuItemClass({
                      disabled: option.disabled,
                      active: isActive && !option.disabled,
                    }),
                    !option.disabled && 'cursor-pointer',
                    'justify-between',
                    isSelected && 'font-medium',
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && (
                    <Check size={15} className="shrink-0 text-accent" aria-hidden="true" />
                  )}
                </div>
              );
            })}
            {options.length === 0 && (
              <div className="px-2.5 py-2 text-sm text-muted">Tidak ada pilihan</div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
