import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { getSelectionStore, resetSelection, resolveSelection, setManyInScope } from './selection';

/**
 * The contract the three table pages rely on, exercised without a table:
 *
 * 1. **Persistence** — the store lives in a registry keyed by entity, so a
 *    selection survives pagination, refetches and island remounts (none of
 *    which the store even knows about).
 * 2. **Scopes** — "select all matching / select everything" snapshots ids,
 *    keeps out-of-scope picks, and counts `scope − excluded + included`.
 * 3. **Resolution** — the pre-export walk reports deleted records instead of
 *    shipping them, and never trusts what is loaded on screen.
 */

type Row = { id: string; name: string };

const DATASET: Row[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
  { id: 'd', name: 'Delta' },
];

const CRITERIA = { query: 'x' };

function freshStore(key = 'test') {
  resetSelection(key);
  return getSelectionStore<{ query: string }>(key);
}

beforeEach(() => {
  resetSelection('test');
  resetSelection('customers');
});

describe('plain selection', () => {
  it('starts empty and counts the ticked ids', () => {
    const store = freshStore();
    expect(store.count(null)).toBe(0);

    store.toggle('a');
    store.toggle('b');
    expect(store.count(null)).toBe(2);
    expect(store.isSelected('a', false)).toBe(true);
    expect(store.isSelected('c', false)).toBe(false);

    store.toggle('a');
    expect(store.count(null)).toBe(1);
  });

  it('holds its snapshot reference steady between mutations (useSyncExternalStore contract)', () => {
    const store = freshStore();
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);

    store.toggle('a');
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    expect(before.included.has('a')).toBe(false);
  });

  it('lives in the registry, so a remounted table finds the same selection', () => {
    const first = getSelectionStore<{ query: string }>('customers');
    first.toggle('row-1');

    // A second lookup stands in for the island unmounting and mounting again.
    const again = getSelectionStore<{ query: string }>('customers');
    expect(again).toBe(first);
    expect(again.getSnapshot().included.has('row-1')).toBe(true);

    resetSelection('customers');
    expect(getSelectionStore<{ query: string }>('customers').count(null)).toBe(0);
  });

  it('clear() returns to an empty plain selection', () => {
    const store = freshStore();
    store.setMany(['a', 'b'], true);
    store.clear();
    expect(store.count(null)).toBe(0);
    expect(store.isSelected('a', false)).toBe(false);
    expect(store.getSnapshot().all).toBeNull();
  });
});

describe('setManyInScope', () => {
  it('ignores the scope flag in plain mode (every id is simply ticked)', () => {
    const store = freshStore();
    setManyInScope(store, ['a', 'b', 'c'], true, () => false);
    expect(store.count(null)).toBe(3);
  });

  it('routes mixed ids to the right side of an active scope in one commit', () => {
    const store = freshStore();
    store.selectScope({ kind: 'filtered', criteria: CRITERIA });
    store.toggle('d', false); // an out-of-scope pick layered on top
    expect(store.count(10)).toBe(11);

    // `a` is inside the scope (untick = exclude), `d` is outside (untick = drop).
    setManyInScope(store, ['a', 'd'], false, (id) => id === 'a');

    expect(store.count(10)).toBe(9);
    expect(store.isSelected('a', true)).toBe(false);
    expect(store.isSelected('d', false)).toBe(false);
    // Untouched rows keep their scope membership.
    expect(store.isSelected('b', true)).toBe(true);
  });
});

describe('all-scope mode', () => {
  it('counts a dataset scope as size minus exclusions plus picks', () => {
    const store = freshStore();
    store.selectScope({ kind: 'dataset' });
    expect(store.count(100)).toBe(100);
    expect(store.isSelected('anything', true)).toBe(true);

    store.toggle('a', true); // exclude
    expect(store.count(100)).toBe(99);
    expect(store.isSelected('a', true)).toBe(false);

    store.toggle('a', true); // re-include
    expect(store.count(100)).toBe(100);
    expect(store.isSelected('a', true)).toBe(true);
  });

  it('answers null while an all-scope is still resolving', () => {
    const store = freshStore();
    store.toggle('a');
    store.selectScope({ kind: 'filtered', criteria: CRITERIA });
    expect(store.count(null)).toBeNull();
  });

  it('absorbs explicit picks into a dataset scope (they would double-count)', () => {
    const store = freshStore();
    store.toggle('x');
    expect(store.count(null)).toBe(1);

    store.selectScope({ kind: 'dataset' });
    expect(store.count(100)).toBe(100);
    expect(store.getSnapshot().included.size).toBe(0);
  });

  it('keeps out-of-scope picks when a filtered scope is chosen', () => {
    const store = freshStore();
    store.toggle('x'); // ticked before any scope existed
    store.selectScope({ kind: 'filtered', criteria: CRITERIA });
    expect(store.count(10)).toBe(11);
  });

  it('resets exclusions when a new scope is taken', () => {
    const store = freshStore();
    store.selectScope({ kind: 'filtered', criteria: CRITERIA });
    store.toggle('a', true);
    expect(store.count(10)).toBe(9);

    store.selectScope({ kind: 'filtered', criteria: { query: 'y' } });
    expect(store.count(10)).toBe(10);
    expect(store.isSelected('a', true)).toBe(true);
  });
});

describe('resolveSelection', () => {
  function loaders(overrides?: { all?: Row[]; matching?: Row[] }) {
    return {
      all: vi.fn(async () => overrides?.all ?? DATASET),
      matching: vi.fn(async () => overrides?.matching ?? DATASET.slice(0, 2)),
    };
  }

  it('does not touch the source when nothing is selected', async () => {
    const store = freshStore();
    const source = loaders();
    const result = await resolveSelection(store.getSnapshot(), source, (row) => row.id);
    expect(result).toEqual({ rows: [], missing: 0 });
    expect(source.all).not.toHaveBeenCalled();
    expect(source.matching).not.toHaveBeenCalled();
  });

  it('returns plain picks from the full dataset and counts the deleted ones', async () => {
    const store = freshStore();
    store.toggle('a');
    store.toggle('c');

    const fresh = await resolveSelection(store.getSnapshot(), loaders(), (row) => row.id);
    expect(fresh.rows.map((row) => row.id)).toEqual(['a', 'c']);
    expect(fresh.missing).toBe(0);

    // `c` was deleted between the tick and the export.
    const stale = await resolveSelection(
      store.getSnapshot(),
      loaders({ all: DATASET.slice(0, 2) }),
      (row) => row.id,
    );
    expect(stale.rows.map((row) => row.id)).toEqual(['a']);
    expect(stale.missing).toBe(1);
  });

  it('walks the dataset scope and drops excluded rows', async () => {
    const store = freshStore();
    store.selectScope({ kind: 'dataset' });
    store.toggle('b', true); // exclude Beta

    const source = loaders();
    const result = await resolveSelection(store.getSnapshot(), source, (row) => row.id);

    expect(source.all).toHaveBeenCalledTimes(1);
    expect(source.matching).not.toHaveBeenCalled();
    expect(result.rows.map((row) => row.id)).toEqual(['a', 'c', 'd']);
    expect(result.missing).toBe(0);
  });

  it('walks a filtered scope by its snapshot criteria, not the live filter', async () => {
    const store = freshStore();
    store.selectScope({ kind: 'filtered', criteria: CRITERIA });

    const source = loaders();
    const result = await resolveSelection(store.getSnapshot(), source, (row) => row.id);

    expect(source.matching).toHaveBeenCalledWith(CRITERIA);
    expect(source.all).not.toHaveBeenCalled();
    expect(result.rows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('adds out-of-scope picks that still exist to the filtered walk', async () => {
    const store = freshStore();
    store.selectScope({ kind: 'filtered', criteria: CRITERIA });
    store.toggle('d', false); // a pick outside the snapshot filter
    store.toggle('b', true); // an exclusion inside it

    // `matching` answers a, b; the dataset walk proves `d` still exists.
    const source = loaders();
    const result = await resolveSelection(store.getSnapshot(), source, (row) => row.id);

    expect(source.matching).toHaveBeenCalledWith(CRITERIA);
    expect(result.rows.map((row) => row.id)).toEqual(['a', 'd']);
    expect(result.missing).toBe(0);
  });

  it('reports an out-of-scope pick the dataset no longer has', async () => {
    const store = freshStore();
    store.selectScope({ kind: 'filtered', criteria: CRITERIA });
    store.toggle('d', false); // deleted between the tick and the export

    const source = loaders({ all: DATASET.slice(0, 3) }); // no `d`
    const result = await resolveSelection(store.getSnapshot(), source, (row) => row.id);

    // The scope still resolves to a, b — only the out-of-scope pick `d` is
    // dropped, and it is reported as missing instead of shipped.
    expect(result.rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(result.missing).toBe(1);
  });
});
