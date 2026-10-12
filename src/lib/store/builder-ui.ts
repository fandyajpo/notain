import { Store } from '@tanstack/store';

export type BuilderSection = 'detail' | 'barang' | 'header' | 'isi' | 'footer' | 'catatan';

export type BuilderUiState = {
  activeSection: BuilderSection;
  showShortcuts: boolean;
};

/**
 * Transient UI state for the invoice builder. It deliberately lives outside
 * React so the preview and the form can share it without prop drilling.
 */
export const builderUiStore = new Store<BuilderUiState>({
  activeSection: 'detail',
  showShortcuts: false,
});

export function setBuilderSection(section: BuilderSection): void {
  builderUiStore.setState((state) => ({ ...state, activeSection: section }));
}

export function toggleShortcuts(open?: boolean): void {
  builderUiStore.setState((state) => ({
    ...state,
    showShortcuts: open ?? !state.showShortcuts,
  }));
}
