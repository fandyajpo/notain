import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import {
  searchBusinessSubtypes,
  type BusinessSubtypeSlug,
} from '../../../core/business/taxonomy';
import { cx, menuItemClass } from '../../../lib/ui/classes';
import { EmptyState } from '../ui/state';
import { SearchField } from '../ui/search-field';

type Props = {
  /** The current choice; `null` means nothing picked yet. */
  value: BusinessSubtypeSlug | null;
  /** Fires on every tap — the caller owns committing or previewing it. */
  onChange: (slug: BusinessSubtypeSlug) => void;
  className?: string;
};

/**
 * The one way the app asks "what kind of business is this?": a search box over
 * the whole taxonomy plus a grouped list of the 175 subtypes.
 *
 * Search runs through `searchBusinessSubtypes`, which matches subtype labels
 * and whole-category labels — typing "otomotif" surfaces the trade even though
 * no subtype is called that. Selected rows read as `aria-pressed`, so a
 * screen reader hears the current choice without visiting the others.
 */
export function BusinessTypePicker({ value, onChange, className }: Props) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => searchBusinessSubtypes(query), [query]);

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Cari jenis usaha, misalnya bengkel"
        aria-label="Cari jenis usaha"
      />

      {groups.length === 0 ? (
        <EmptyState
          title="Tidak ada yang cocok"
          description="Coba kata lain, misalnya kafe, konveksi, atau travel."
          className="py-8"
        />
      ) : (
        <div className="max-h-80 overflow-y-auto rounded-control border border-border bg-background p-1.5">
          {groups.map((category) => (
            <div key={category.slug} className="mb-1 last:mb-0">
              <p className="sticky top-0 z-10 bg-background px-2.5 pt-2 pb-1 text-eyebrow uppercase text-muted">
                {category.label}
              </p>
              {category.subtypes.map((subtype) => {
                const selected = subtype.slug === value;
                return (
                  <button
                    key={subtype.slug}
                    type="button"
                    data-subtype={subtype.slug}
                    aria-pressed={selected}
                    onClick={() => onChange(subtype.slug as BusinessSubtypeSlug)}
                    className={menuItemClass({ active: selected })}
                  >
                    <span className="truncate">{subtype.label}</span>
                    {selected && (
                      <Check size={15} className="ml-auto shrink-0" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
