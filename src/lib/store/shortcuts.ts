import { Store } from '@tanstack/store';

export type ShortcutsState = {
  open: boolean;
};

/**
 * Transient UI state for the keyboard-shortcuts dialog. Shared through a
 * store (not context) so the sidebar trigger, the mobile drawer trigger and
 * the invoice-builder header button can all open the same single dialog.
 */
export const shortcutsStore = new Store<ShortcutsState>({
  open: false,
});

export function setShortcutsOpen(open: boolean): void {
  shortcutsStore.setState((state) => ({ ...state, open }));
}

export function toggleShortcuts(): void {
  shortcutsStore.setState((state) => ({ ...state, open: !state.open }));
}
