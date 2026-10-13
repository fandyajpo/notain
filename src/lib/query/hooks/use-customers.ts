import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCustomer,
  deleteCustomer,
  importCustomers,
  listCustomers,
  rememberCustomer,
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

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: CustomerDraft) => createCustomer(draft),
    onSuccess: (customer) => {
      queryClient.setQueryData(queryKeys.customer(customer.id), customer);
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers });
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
    },
  });
}
