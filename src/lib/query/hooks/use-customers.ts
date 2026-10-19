import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  countCustomers,
  createCustomer,
  deleteCustomer,
  deleteCustomers,
  importCustomers,
  listCustomers,
  listCustomersPage,
  mergeCustomers,
  rememberCustomer,
  updateCustomer,
} from '../../../app/customers';
import { queryPolicy } from '../policies';
import { queryKeys } from '../keys';
import type { Customer, CustomerDraft } from '../../../core/customer/model';

/**
 * The saved-customer directory.
 *
 * Unlike templates there is no code-defined fallback: an empty list simply
 * means the picker has nothing to pre-fill yet.
 */
export function useCustomers() {
  return useQuery({
    queryKey: queryKeys.customers,
    queryFn: () => listCustomers(),
    ...queryPolicy('customers'),
  });
}

/**
 * The `/customers` page's own cursor-paginated list ("Muat lebih banyak").
 *
 * Kept apart from `useCustomers` on purpose: the picker and duplicate checks
 * still need the whole directory in one shot, while this page only renders
 * what the user has asked to load.
 */
export function useCustomersPage() {
  return useInfiniteQuery({
    queryKey: queryKeys.customersPage,
    queryFn: ({ pageParam }) => listCustomersPage({ cursorAfter: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...queryPolicy('customersPage'),
  });
}

/**
 * Just "how many customers", for the dashboard stat.
 *
 * A separate hook from `useCustomers` on purpose: the dashboard needs only the
 * count, and pulling the whole directory to render one number is the most
 * wasteful read the app used to make.
 */
export function useCustomerCount() {
  return useQuery({
    queryKey: queryKeys.customerCount,
    queryFn: () => countCustomers(),
    ...queryPolicy('customerCount'),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: CustomerDraft) => createCustomer(draft),
    onSuccess: (customer) => {
      queryClient.setQueryData(queryKeys.customer(customer.id), customer);
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customersPage });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerCount });
      // Customer events feed the dashboard's activity list.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardFinanceAll });
    },
  });
}

/** Edits a stored customer in place; refreshes the directory after. */
export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: CustomerDraft }) => updateCustomer(id, draft),
    onSuccess: (customer) => {
      queryClient.setQueryData(queryKeys.customer(customer.id), customer);
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customersPage });
    },
  });
}

/**
 * Collapses several rows into one. The surviving row is refreshed and the
 * whole directory is invalidated, which drops the deleted rows from the cache.
 */
export function useMergeCustomers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { targetId: string; sourceIds: string[]; draft: CustomerDraft }) =>
      mergeCustomers(input),
    onSuccess: (customer) => {
      queryClient.setQueryData(queryKeys.customer(customer.id), customer);
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customersPage });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerCount });
      // Customer events feed the dashboard's activity list.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardFinanceAll });
    },
  });
}

/**
 * Silent sibling of the mutations above: saving an invoice also files its
 * customer away, but that must never surface as an error or block the save.
 */
export function useRememberCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ draft, lastUsedAt }: { draft: CustomerDraft; lastUsedAt?: string }) =>
      rememberCustomer(draft, lastUsedAt),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customersPage });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerCount });
      // Customer events feed the dashboard's activity list.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardFinanceAll });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCustomer(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.customers });
      const previous = queryClient.getQueryData<Customer[]>(queryKeys.customers);

      queryClient.setQueryData<Customer[]>(queryKeys.customers, (current) =>
        current ? current.filter((customer) => customer.id !== id) : current,
      );

      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.customers, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customersPage });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerCount });
      // Customer events feed the dashboard's activity list.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardFinanceAll });
    },
  });
}

/** The list's bulk action: same optimistic drop, for a whole selection at once. */
export function useDeleteCustomers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deleteCustomers(ids),
    onMutate: async (ids) => {
      const dropping = new Set(ids);
      await queryClient.cancelQueries({ queryKey: queryKeys.customers });
      const previous = queryClient.getQueryData<Customer[]>(queryKeys.customers);

      queryClient.setQueryData<Customer[]>(queryKeys.customers, (current) =>
        current ? current.filter((customer) => !dropping.has(customer.id)) : current,
      );

      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.customers, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customersPage });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerCount });
      // Customer events feed the dashboard's activity list.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardFinanceAll });
    },
  });
}

/** Bulk file-in of a validated import batch; refreshes the directory after. */
export function useImportCustomers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (drafts: CustomerDraft[]) => importCustomers(drafts),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customersPage });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customerCount });
      // Customer events feed the dashboard's activity list.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardFinanceAll });
    },
  });
}
