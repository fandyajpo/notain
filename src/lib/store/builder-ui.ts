import { Store } from '@tanstack/store';

export type BuilderSection = 'detail' | 'barang' | 'header' | 'isi' | 'footer' | 'catatan';

export type BuilderUiState = {
  activeSection: BuilderSection;
};

/**
 * Transient UI state for the invoice builder. It deliberately lives outside
 * React so the tab strip and the form can share it without prop drilling.
 */
export const builderUiStore = new Store<BuilderUiState>({
  activeSection: 'detail',
});

export function setBuilderSection(section: BuilderSection): void {
  builderUiStore.setState((state) => ({ ...state, activeSection: section }));
}
