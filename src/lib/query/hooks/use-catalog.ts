import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  countCatalog,
  createCatalogItem,
  deleteCatalogItem,
  deleteCatalogItems,
  listCatalog,
  listCatalogPage,
  rememberCatalogItems,
  updateCatalogItem,
} from '../../../app/catalog';
import { queryPolicy } from '../policies';
import { queryKeys } from '../keys';
import type { CatalogDraft, CatalogItem } from '../../../core/catalog/model';

/**
 * The owner's saved barang/jasa. Unlike templates there is no code-defined
 * fallback: an empty list simply means the invoice picker has nothing to
 * pre-fill yet.
 */
export function useCatalog() {
  return useQuery({
    queryKey: queryKeys.catalog,
    queryFn: () => listCatalog(),
    ...queryPolicy('catalog'),
  });
}

/**
 * The `/catalog` page's own cursor-paginated list ("Muat lebih banyak").
 *
 * Kept apart from `useCatalog` on purpose: the invoice picker and auto-save
 * still need the whole catalog in one shot, while this page only renders what
 * the user has asked to load.
 */
export function useCatalogPage() {
  return useInfiniteQuery({
    queryKey: queryKeys.catalogPage,
    queryFn: ({ pageParam }) => listCatalogPage({ cursorAfter: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...queryPolicy('catalogPage'),
  });
}

/** Just "how many catalog entries", for any stat surface that needs it. */
export function useCatalogCount() {
  return useQuery({
    queryKey: queryKeys.catalogCount,
    queryFn: () => countCatalog(),
    ...queryPolicy('catalogCount'),
  });
}

export function useCreateCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: CatalogDraft) => createCatalogItem(draft),
    onSuccess: (item) => {
      queryClient.setQueryData(queryKeys.catalogItem(item.id), item);
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalogPage });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalogCount });
    },
  });
}

/** Edits a stored entry in place; refreshes the catalog after. */
export function useUpdateCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: CatalogDraft }) =>
      updateCatalogItem(id, draft),
    onSuccess: (item) => {
      queryClient.setQueryData(queryKeys.catalogItem(item.id), item);
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalogPage });
    },
  });
}

/**
 * Silent sibling of the mutations above: saving an invoice also files its
 * ticked items away, but that must never surface as an error or block the save.
 */
export function useRememberCatalogItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (drafts: CatalogDraft[]) => rememberCatalogItems(drafts),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalogPage });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalogCount });
    },
  });
}

export function useDeleteCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCatalogItem(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.catalog });
      const previous = queryClient.getQueryData<CatalogItem[]>(queryKeys.catalog);

      queryClient.setQueryData<CatalogItem[]>(queryKeys.catalog, (current) =>
        current ? current.filter((item) => item.id !== id) : current,
      );

      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.catalog, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalogPage });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalogCount });
    },
  });
}

/** The list's bulk action: same optimistic drop, for a whole selection at once. */
export function useDeleteCatalogItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deleteCatalogItems(ids),
    onMutate: async (ids) => {
      const dropping = new Set(ids);
      await queryClient.cancelQueries({ queryKey: queryKeys.catalog });
      const previous = queryClient.getQueryData<CatalogItem[]>(queryKeys.catalog);

      queryClient.setQueryData<CatalogItem[]>(queryKeys.catalog, (current) =>
        current ? current.filter((item) => !dropping.has(item.id)) : current,
      );

      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.catalog, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalogPage });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalogCount });
    },
  });
}
