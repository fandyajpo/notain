import { CheckCheck, Filter, Layers, ListChecks } from 'lucide-react';
import { Menu, type MenuItem } from './menu';

type Props = {
  /** Rows currently displayed — the page option's own count. */
  pageCount: number;
  /** Tick everything currently shown (the header checkbox does this too). */
  onSelectPage: () => void;
  /**
   * Snapshot the rows matching the active search/filter. Offered only while a
   * filter is active — with no filter it *is* the dataset option, and
   * offering both would be two labels for one set.
   */
  onSelectFiltered?: () => void;
  /** Snapshot the entire dataset, including rows never loaded. */
  onSelectDataset: () => void;
  /** Used in the trigger's accessible name: "Pilih banyak invoice". */
  noun?: string;
};

/**
 * The header's "select beyond this page" menu, next to the plain checkbox.
 *
 * The three scopes are stated explicitly and differently — this page, this
 * page's filter, the whole dataset — so an action never claims to select more
 * than it does. Each choice *snapshots* ids into the shared selection store
 * (see `lib/selection`); nothing here re-reads the table.
 *
 * Rendered inside a `Th` — the panel is portalled, so the cell's overflow
 * cannot clip it — and hidden from the flow when there is only one row on the
 * page, where the checkbox already covers everything.
 */
export function SelectAllMenu({
  pageCount,
  onSelectPage,
  onSelectFiltered,
  onSelectDataset,
  noun = 'baris',
}: Props) {
  const items: MenuItem[] = [
    {
      label: `Pilih semua di halaman ini (${pageCount})`,
      icon: <CheckCheck size={15} aria-hidden="true" />,
      onClick: onSelectPage,
      disabled: pageCount === 0,
    },
  ];
  if (onSelectFiltered) {
    items.push({
      label: 'Pilih semua yang cocok filter',
      icon: <Filter size={15} aria-hidden="true" />,
      onClick: onSelectFiltered,
    });
  }
  items.push({
    label: 'Pilih seluruh data',
    icon: <Layers size={15} aria-hidden="true" />,
    onClick: onSelectDataset,
  });

  return (
    <Menu label={`Pilih banyak ${noun}`} align="start" items={items}>
      <ListChecks size={14} aria-hidden="true" />
    </Menu>
  );
}
