import { useSelector } from '@tanstack/react-store';
import {
  builderUiStore,
  setBuilderSection,
  type BuilderSection,
} from '../../../lib/store/builder-ui';

const SECTIONS: Array<{ id: BuilderSection; label: string }> = [
  { id: 'detail', label: 'Detail' },
  { id: 'barang', label: 'Barang' },
  { id: 'header', label: 'Bagian atas' },
  { id: 'isi', label: 'Bagian isi' },
  { id: 'footer', label: 'Bagian bawah' },
  { id: 'catatan', label: 'Catatan' },
];

/** Section switcher backed by the shared builder store. */
export function BuilderTabs() {
  const active = useSelector(builderUiStore, (state) => state.activeSection);

  return (
    <div
      role="tablist"
      aria-label="Bagian invoice"
      className="inline-flex max-w-full overflow-x-auto rounded-control border border-border bg-sunken p-0.5"
    >
      {SECTIONS.map((section) => {
        const selected = section.id === active;
        return (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setBuilderSection(section.id)}
            className={[
              'shrink-0 rounded-item px-3 py-1.5 text-sm font-medium transition-colors focus-ring',
              selected
                ? 'bg-accent text-accent-foreground shadow-card'
                : 'text-muted hover:text-foreground',
            ].join(' ')}
          >
            {section.label}
          </button>
        );
      })}
    </div>
  );
}
