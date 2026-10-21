import { useSelector } from '@tanstack/react-store';
import {
  builderUiStore,
  setBuilderSection,
  type BuilderSection,
} from '../../../lib/store/builder-ui';
import { SegmentedControl } from '../ui/segmented';

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
    <SegmentedControl<BuilderSection>
      value={active}
      onChange={setBuilderSection}
      options={SECTIONS.map((section) => ({ value: section.id, label: section.label }))}
      variant="accent"
      ariaLabel="Bagian invoice"
      className="max-w-full overflow-x-auto"
    />
  );
}
