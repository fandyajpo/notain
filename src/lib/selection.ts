import { useSyncExternalStore } from 'react';

/**
 * Pagination-independent selection for the data tables.
 *
 * Three list pages (customers, invoices, catalog) share one contract:
 *
 * - **Ids, never indexes.** A selection is a set of stable record ids, so it
 *   survives "Muat lebih banyak", refetches, sorting and re-renders of the
 *   table that displays it. Nothing here reads row positions.
 * - **Two modes.** Plain mode (`all === null`) is "the rows I ticked". An
 *   all-scope mode is "everything matching this snapshot, minus the rows I
 *   unticked, plus the out-of-scope rows I ticked" — the model behind
 *   *select all matching* / *select the whole dataset* with individual
 *   exclusions.
 * - **The scope is a snapshot, not the live filter.** Changing the search or
 *   a filter never rewrites the selection: an all-scope keeps the criteria it
 *   was created with, and exports resolve against those criteria rather than
 *   whatever the table happens to show now.
 *
 * Invariants the count formula and the resolver rely on:
 *
 * - `excluded` only ever holds ids *inside* the current scope — a row outside
 *   the scope was never selected by the scope, so there is nothing to exclude
 *   (ticking such a row records it in `included` instead).
 * - `included` in all-mode only ever holds ids *outside* the scope — ids the
 *   scope already covers would double-count. Entering a dataset scope
 *   therefore clears `included` outright (the scope covers everything).
 *
 * The store is module-scoped per entity key so it outlives the table
 * component's re-renders and remounts; it deliberately does not persist to
 * storage — a fresh visit starts with a clean selection.
 */

/** What a "select all" captured: the whole dataset, or a filtered view. */
export type Scope<C> = { kind: 'dataset' } | { kind: 'filtered'; criteria: C };

export type SelectionSnapshot<C> = {
  /** The active all-scope, or `null` while selection is explicit-only. */
  readonly all: Scope<C> | null;
  /** Explicitly ticked ids (plain mode: the whole selection). */
  readonly included: ReadonlySet<string>;
  /** Explicitly unticked ids inside an all-scope. */
  readonly excluded: ReadonlySet<string>;
};

export type SelectionStore<C> = {
  /** Stable reference between mutations — safe as a `useSyncExternalStore` snapshot. */
  getSnapshot: () => SelectionSnapshot<C>;
  subscribe: (listener: () => void) => () => void;
  /**
   * Flips one row. `inScope` says whether the id is covered by the active
   * all-scope (ignored in plain mode); pages pass it from the resolved scope.
   */
  toggle(id: string, inScope?: boolean): void;
  /** Applies one truth to many ids in a single commit — the header's "select page" action. */
  setMany(ids: readonly string[], selected: boolean, inScope?: boolean): void;
  /** Enters all-scope mode. Kept `included` picks are unioned, never dropped. */
  selectScope(scope: Scope<C>): void;
  /** Deselect everything — the toolbar's clear action. */
  clear(): void;
  /** Current selection size. `null` while an all-scope is still resolving. */
  count(scopeSize: number | null): number | null;
  isSelected(id: string, inScope: boolean): boolean;
};

function createSelectionStore<C>(): SelectionStore<C> {
  let included = new Set<string>();
  let excluded = new Set<string>();
  let all: Scope<C> | null = null;
  const listeners = new Set<() => void>();

  /**
   * Copies the sets rather than freezing them in place: `Object.freeze` only
   * guards the snapshot's own properties, so handing out the live `Set` would
   * let the next `apply` mutate a snapshot React is still holding — a stale
   * snapshot that changes under `useSyncExternalStore` breaks its contract.
   */
  function capture(): SelectionSnapshot<C> {
    return Object.freeze({ all, included: new Set(included), excluded: new Set(excluded) });
  }

  let snapshot: SelectionSnapshot<C> = capture();

  function commit() {
    snapshot = capture();
    for (const listener of listeners) listener();
  }

  /** One row to one truth; returns whether anything actually changed. */
  function apply(id: string, selected: boolean, inScope: boolean): boolean {
    if (!all) {
      if (selected) {
        if (included.has(id)) return false;
        included.add(id);
        return true;
      }
      return included.delete(id);
    }

    if (inScope) {
      // Covered by the scope: untick = exclude, tick = lift the exclusion.
      // `included` never carries scope members (see invariants).
      included.delete(id);
      if (selected) return excluded.delete(id);
      if (excluded.has(id)) return false;
      excluded.add(id);
      return true;
    }

    // Outside the scope: a plain id pick layered on top of the scope.
    if (selected) {
      if (included.has(id)) return false;
      included.add(id);
      return true;
    }
    return included.delete(id);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    toggle(id, inScope = false) {
      const selected = all
        ? inScope
          ? !excluded.has(id) && !included.has(id)
          : included.has(id)
        : included.has(id);
      if (apply(id, !selected, inScope)) commit();
    },
    setMany(ids, selected, inScope = false) {
      let changed = false;
      for (const id of ids) if (apply(id, selected, inScope)) changed = true;
      if (changed) commit();
    },
    selectScope(scope) {
      all = scope;
      // A fresh scope gets fresh exclusions; explicit picks outside it
      // survive (never silently dropped). Picks the new scope already covers
      // would double-count, so a dataset scope absorbs them entirely.
      excluded = new Set();
      if (scope.kind === 'dataset') included = new Set();
      commit();
    },
    clear() {
      included = new Set();
      excluded = new Set();
      all = null;
      commit();
    },
    count(scopeSize) {
      if (!all) return included.size;
      if (scopeSize === null) return null;
      return scopeSize - excluded.size + included.size;
    },
    isSelected(id, inScope) {
      if (!all) return included.has(id);
      if (included.has(id)) return true;
      if (!inScope) return false;
      return !excluded.has(id);
    },
  };
}

/**
 * `setMany` across a scope boundary: one call for a mixed id list, splitting
 * scope members from outsiders so each id gets the right `inScope` flag.
 *
 * The header's "select this page" action hands over every visible id at once,
 * and under an active scope that list legitimately mixes rows the scope covers
 * with rows it does not (a filter changed since the scope was taken). Routing
 * through one helper keeps callers from hand-rolling the split — and it is a
 * no-op split in plain mode, where the flag is ignored.
 */
export function setManyInScope<C>(
  store: SelectionStore<C>,
  ids: readonly string[],
  selected: boolean,
  inScope: (id: string) => boolean,
): void {
  const inside: string[] = [];
  const outside: string[] = [];
  for (const id of ids) (inScope(id) ? inside : outside).push(id);
  if (inside.length) store.setMany(inside, selected, true);
  if (outside.length) store.setMany(outside, selected, false);
}

/**
 * Store registry keyed by entity (`customers` / `invoices` / `catalog`).
 * The same key always returns the same store, which is what lets a selection
 * outlive a table remount.
 */
const registry = new Map<string, SelectionStore<unknown>>();

export function getSelectionStore<C>(key: string): SelectionStore<C> {
  let store = registry.get(key);
  if (!store) {
    store = createSelectionStore<C>() as SelectionStore<unknown>;
    registry.set(key, store);
  }
  return store as SelectionStore<C>;
}

/** Drops a store's state — used by tests. */
export function resetSelection(key: string): void {
  registry.delete(key);
}

/** React binding: re-renders only when the snapshot reference changes. */
export function useSelection<C>(key: string): SelectionStore<C> {
  const store = getSelectionStore<C>(key);
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store;
}

/**
 * Resolves a selection to concrete rows right before an export, merge or
 * bulk action runs.
 *
 * Every operation must act on the *complete* selection, which may span pages
 * that are no longer loaded — so this walks the source fresh via the loaders
 * the page passes instead of trusting what is on screen. The walk doubles as
 * the revalidation step: ids the selection still claims but the source no
 * longer has come back as `missing`, so the caller can say "N records were
 * deleted and skipped" instead of silently exporting stale rows.
 */
export async function resolveSelection<T, C>(
  state: SelectionSnapshot<C>,
  loaders: {
    /** Every record in the dataset (unfiltered). */
    all: () => Promise<T[]>;
    /** Every record matching the scope's criteria. */
    matching: (criteria: C) => Promise<T[]>;
  },
  idOf: (row: T) => string,
): Promise<{ rows: T[]; missing: number }> {
  if (!state.all) {
    if (state.included.size === 0) return { rows: [], missing: 0 };
    const dataset = await loaders.all();
    const present = dataset.filter((row) => state.included.has(idOf(row)));
    return { rows: present, missing: state.included.size - present.length };
  }

  const scopeRows =
    state.all.kind === 'dataset' ? await loaders.all() : await loaders.matching(state.all.criteria);
  const selected = scopeRows.filter((row) => !state.excluded.has(idOf(row)));
  if (state.included.size === 0) return { rows: selected, missing: 0 };

  // Defensive: the store's invariants leave `included` empty under a dataset
  // scope (the scope covers everything), so only the filtered case can carry
  // out-of-scope picks.
  const scopeIds = new Set(scopeRows.map(idOf));
  if (state.all.kind === 'dataset') {
    return {
      rows: selected,
      missing: [...state.included].filter((id) => !scopeIds.has(id)).length,
    };
  }

  // Revalidate the picks against the unfiltered dataset — only that walk can
  // tell "does not match the filter any more" from "was deleted".
  const dataset = await loaders.all();
  const datasetIds = new Set(dataset.map(idOf));
  const extras = dataset.filter((row) => state.included.has(idOf(row)) && !scopeIds.has(idOf(row)));
  const missing = [...state.included].filter((id) => !datasetIds.has(id)).length;
  return { rows: [...selected, ...extras], missing };
}
