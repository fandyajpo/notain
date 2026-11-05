import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../keys';
import { queryPolicy } from '../policies';
import { resolveSelection, type Scope, type SelectionSnapshot } from '../../selection';
import { toast } from '../../ui/toast';
import { AppError, ERROR_CODES } from '../../../core/shared/errors';

/**
 * React Query glue for the selection stores (`lib/selection`).
 *
 * Two jobs, deliberately split:
 *
 * - {@link useSelectionScope} answers *display* questions — the exact size of
 *   an all-scope and whether one id belongs to it — from a cached walk.
 * - {@link resolveSelected} / {@link exportRows} answer *action* questions by
 *   walking the source fresh at the moment a merge, delete or export runs.
 *   Freshness there is not negotiable: a cached scope could contain a record
 *   that was deleted seconds ago, and the brief's rule is to revalidate
 *   rather than ship stale rows.
 */

export type SelectionLoaders<T, C> = {
  /** Every record in the dataset (unfiltered). */
  all: () => Promise<T[]>;
  /** Every record matching a scope's criteria. */
  matching: (criteria: C) => Promise<T[]>;
};

export type ScopeView = {
  /** Exact number of records the scope covers; `null` while unknown. */
  size: number | null;
  /** Membership test for one id under the active scope (always `false` without one). */
  has: (id: string) => boolean;
};

/**
 * Size + membership for the store's active all-scope.
 *
 * A dataset scope with a known server total answers both without fetching —
 * every row is in scope by definition. A filtered scope walks `matching()`
 * once per criteria snapshot and caches it under `selectionScope`.
 */
export function useSelectionScope<C, T extends { id: string }>(
  entity: string,
  scope: Scope<C> | null,
  loaders: SelectionLoaders<T, C>,
  datasetTotal?: number | null,
): ScopeView {
  const filtered = scope?.kind === 'filtered';
  const needsDatasetWalk = scope?.kind === 'dataset' && datasetTotal == null;
  const query = useQuery({
    queryKey: queryKeys.selectionScope(entity, scope),
    queryFn: () => (scope?.kind === 'filtered' ? loaders.matching(scope.criteria) : loaders.all()),
    enabled: filtered || needsDatasetWalk,
    ...queryPolicy('selectionScope'),
  });

  if (!scope) return { size: null, has: () => false };
  if (scope.kind === 'dataset') {
    if (datasetTotal != null) return { size: datasetTotal, has: () => true };
    // Walk pending: every row is in the dataset by definition, so membership
    // is already known even though the exact size is not.
    return { size: query.data?.length ?? null, has: () => true };
  }
  // Filtered scope: while the walk runs, report membership optimistically —
  // the rows on screen are exactly the ones the snapshot criteria matched a
  // moment ago, so an unchecked flicker would lie the other way. The walk
  // corrects it within the same second and caches under `selectionScope`.
  if (!query.data) return { size: null, has: () => true };
  const ids = new Set(query.data.map((row) => row.id));
  return { size: ids.size, has: (id) => ids.has(id) };
}

type ResolverOptions<C, T extends { id: string }> = {
  snapshot: SelectionSnapshot<C>;
  loaders: SelectionLoaders<T, C>;
  /** Entity noun for the "deleted and skipped" toast: `pelanggan`, `nota`, `entri`. */
  noun: string;
};

async function resolveNow<C, T extends { id: string }>(
  options: ResolverOptions<C, T>,
): Promise<{ rows: T[]; missing: number }> {
  const result = await resolveSelection(options.snapshot, options.loaders, (row) => row.id);
  if (result.missing > 0) {
    toast(`${result.missing} ${options.noun} sudah dihapus dan dilewati.`, { variant: 'info' });
  }
  return result;
}

/**
 * Rows behind the current selection, revalidated against the source.
 * For merge and bulk delete, which need the records themselves and treat an
 * empty result as "nothing to act on" rather than an error.
 */
export async function resolveSelected<C, T extends { id: string }>(
  options: ResolverOptions<C, T>,
): Promise<T[]> {
  const { rows } = await resolveNow(options);
  return rows;
}

/**
 * The export getter: same revalidation, but an empty result is an error —
 * `ExportButtons` surfaces the message instead of downloading nothing. An
 * `AppError` (not a bare `Error`) so `toAppError` passes this copy through
 * instead of replacing it with the generic fallback.
 */
export async function exportRows<C, T extends { id: string }>(
  options: ResolverOptions<C, T>,
): Promise<T[]> {
  const { rows } = await resolveNow(options);
  if (rows.length === 0) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Data terpilih sudah tidak tersedia.');
  }
  return rows;
}
