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

/**
 * The track itself must be a BLOCK so `max-w-full` can bite: as the original
 * `inline-flex` it shrink-to-fit'd its 6 shrink-0 chips (an inline box cannot
 * be narrower than its min-content), so on a 320px phone the strip pushed the
 * whole page 102px wide instead of scrolling. Block + max-width + overflow
 * lets the track cap at the column and the chips scroll inside it.
 * A block track with `overflow-x: auto` also forms a scroll container, so
 * tabs stay clickable at every width and the first chip no longer sits flush
 * against the viewport edge.
 */
export function BuilderTabs() {
  const active = useSelector(builderUiStore, (state) => state.activeSection);

  return (
    <SegmentedControl<BuilderSection>
      value={active}
      onChange={setBuilderSection}
      options={SECTIONS.map((section) => ({ value: section.id, label: section.label }))}
      variant="accent"
      ariaLabel="Bagian invoice"
      className="!block max-w-full overflow-x-auto"
    />
  );
}
