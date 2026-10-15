import { Fragment, useEffect, type ReactNode } from 'react';
import { useSelector } from '@tanstack/react-store';
import { Keyboard } from 'lucide-react';
import { Modal } from './modal';
import { setShortcutsOpen, shortcutsStore, toggleShortcuts } from '../../../lib/store/shortcuts';

/** One keyboard shortcut: `keys` are display tokens, `label` what it does. */
type ShortcutItem = {
  keys: string[];
  label: string;
  note?: string;
};

type ShortcutGroup = {
  title: string;
  items: ShortcutItem[];
  /** Only listed when the builder is mounted (invoice routes). */
  builderOnly?: boolean;
};

/**
 * Every entry mirrors a hotkey that actually exists in code: the builder's
 * `useHotkeys` block (Mod+S / Mod+Enter / Mod+Shift+P), Select's listbox
 * keyboard handling, and the `?` listener in `ShortcutsIsland` itself.
 * Never document a shortcut the app does not implement.
 */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Di builder invoice',
    builderOnly: true,
    items: [
      { keys: ['Mod', 'S'], label: 'Simpan invoice' },
      { keys: ['Mod', 'Enter'], label: 'Tambah item barang' },
      { keys: ['Mod', 'Shift', 'P'], label: 'Buka pratinjau cetak' },
    ],
  },
  {
    title: 'Umum',
    items: [
      { keys: ['?'], label: 'Buka / tutup menu pintasan' },
      { keys: ['Esc'], label: 'Tutup dialog atau dropdown' },
      { keys: ['Tab'], label: 'Pindah ke kolom berikutnya' },
      { keys: ['Shift', 'Tab'], label: 'Pindah ke kolom sebelumnya' },
    ],
  },
  {
    title: 'Form & dropdown',
    items: [
      { keys: ['↑'], label: 'Sorot opsi di atas' },
      { keys: ['↓'], label: 'Sorot opsi di bawah' },
      { keys: ['Enter'], label: 'Pilih opsi yang disorot' },
      { keys: ['A-Z'], label: 'Loncat ke opsi (typeahead)', note: 'Saat dropdown terbuka' },
    ],
  },
];

/** `Mod` is ⌘ on Apple platforms, Ctrl everywhere else. */
function displayKeys(keys: string[], isMac: boolean): string[] {
  return keys.map((key) => {
    if (key === 'Mod') return isMac ? '⌘' : 'Ctrl';
    if (key === 'Shift') return isMac ? '⇧' : 'Shift';
    return key;
  });
}

const isApplePlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/** Small key chip used by the dialog, the triggers, and the builder header. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded-control border border-border bg-sunken px-1.5 py-0.5 font-mono text-eyebrow text-muted">
      {children}
    </kbd>
  );
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isMac = isApplePlatform();
  const onBuilderPage =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/invoices');
  const groups = SHORTCUT_GROUPS.filter((group) => !group.builderOnly || onBuilderPage);

  return (
    <Modal open={open} onClose={onClose} title="Pintasan keyboard" size="lg">
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-eyebrow">{group.title}</h3>
            <ul className="flex flex-col">
              {group.items.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between gap-4 border-b border-border/60 py-2 last:border-0"
                >
                  <span className="text-sm">
                    {item.label}
                    {item.note && <span className="block text-xs text-muted">{item.note}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {displayKeys(item.keys, isMac).map((key, index) => (
                      <Fragment key={`${item.label}-${key}`}>
                        {index > 0 && <span className="text-xs text-muted">+</span>}
                        <Kbd>{key}</Kbd>
                      </Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-xs text-muted">
          Pintasan tidak aktif saat kamu sedang mengetik di kolom.
        </p>
      </div>
    </Modal>
  );
}

/**
 * Mount-once island (one per app shell): renders the shared dialog and owns
 * the global `?` hotkey that opens/closes it.
 */
export function ShortcutsIsland() {
  const open = useSelector(shortcutsStore, (state) => state.open);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        toggleShortcuts();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return <ShortcutsDialog open={open} onClose={() => setShortcutsOpen(false)} />;
}

type TriggerProps = {
  /** `sidebar` collapses to an icon-only rail; `drawer` is the mobile list style. */
  variant?: 'sidebar' | 'drawer';
};

/** Button that opens the shared shortcuts dialog (sidebar, drawer, …). */
export function ShortcutsTrigger({ variant = 'sidebar' }: TriggerProps) {
  const className =
    variant === 'sidebar'
      ? 'sidebar-link flex w-full items-center gap-2 rounded-control px-3 py-2 text-sm text-muted transition-colors hover:bg-background hover:text-foreground focus-ring'
      : 'flex w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-sm text-muted transition-colors hover:bg-background hover:text-foreground focus-ring';

  return (
    <button
      type="button"
      onClick={() => setShortcutsOpen(true)}
      aria-haspopup="dialog"
      aria-label="Pintasan keyboard"
      className={className}
    >
      <Keyboard size={16} aria-hidden="true" />
      <span
        className={
          variant === 'sidebar'
            ? 'sidebar-label flex items-center gap-1.5'
            : 'flex items-center gap-1.5'
        }
      >
        Pintasan
        <Kbd>?</Kbd>
      </span>
    </button>
  );
}
