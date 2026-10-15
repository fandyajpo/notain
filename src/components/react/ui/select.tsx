import { Check, ChevronDown, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
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
  // Popover flips above the trigger when it would overflow the viewport bottom.
  const [above, setAbove] = useState(false);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const display = selected?.label ?? placeholder ?? '';

  const openMenu = useCallback(() => {
    if (disabled) return;
    setAbove(false);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled));
    setOpen(true);
  }, [disabled, options, selectedIndex]);

  const closeMenu = useCallback(
    (refocus = true) => {
      setOpen(false);
      setActiveIndex(-1);
      if (refocus) triggerRef.current?.focus();
    },
    [],
  );

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

  // Measure the trigger and flip the menu upward when it would clip the bottom.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;

    const rect = trigger.getBoundingClientRect();
    const listHeight = Math.min(list.scrollHeight, 288); // matches max-h-72
    const spaceBelow = window.innerHeight - rect.bottom;
    setAbove(spaceBelow < listHeight + 12 && rect.top > spaceBelow);

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

  const height = size === 'sm' ? 'h-10' : 'h-11';
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
        aria-activedescendant={open && activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined}
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
                className: [
                  'relative',
                  height,
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

      {open && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={aria['aria-label'] ?? aria['aria-labelledby']}
          className={`absolute z-50 ${above ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} left-0 w-full min-w-40 overflow-y-auto ${MAX_LIST_HEIGHT} rounded-control border border-border bg-card p-1 shadow-popover animate-popover-in`}
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
                className={[
                  'flex cursor-pointer items-center justify-between gap-2 rounded-[0.375rem] px-2.5 py-2 text-sm',
                  'transition-colors',
                  option.disabled
                    ? 'cursor-not-allowed text-muted/60'
                    : isActive
                      ? 'bg-accent-soft text-accent'
                      : 'text-foreground',
                  isSelected ? 'font-medium' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check size={15} className="shrink-0 text-accent" aria-hidden="true" />}
              </div>
            );
          })}
          {options.length === 0 && (
            <div className="px-2.5 py-2 text-sm text-muted">Tidak ada pilihan</div>
          )}
        </div>
      )}
    </div>
  );
}
