import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  listAllInvoiceNumbers,
  listInvoicesPage,
  updateInvoice,
} from '../../../app/invoices';
import { queryPolicy } from '../policies';
import { queryKeys } from '../keys';
import type { Invoice, InvoiceDraft } from '../../../core/invoice/model';
import type { InvoicePage } from '../../../ports/invoice-repository';

/** Cache shape behind every `queryKeys.invoices(...)` entry. */
type InvoiceListData = InfiniteData<InvoicePage>;

/**
 * The dashboard list, loaded a page at a time.
 *
 * The whole set is never fetched up front: an account with years of invoices
 * would otherwise ship every row (rich-text sections included) to the browser
 * just to render the first screen. Rows are still narrowed server-side by
 * `search`, so pagination and search do not fight each other.
 */
export function useInvoices(search = '') {
  return useInfiniteQuery({
    queryKey: queryKeys.invoices(search),
    queryFn: ({ pageParam }) => listInvoicesPage({ search, cursorAfter: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    ...queryPolicy('invoices'),
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.invoice(id ?? ''),
    queryFn: () => getInvoice(id as string),
    enabled: Boolean(id),
    ...queryPolicy('invoice'),
  });
}

/**
 * Numbers only — cheap to refresh and used to suggest the next invoice number.
 *
 * Paginates through every page (selecting just the number column) so the
 * suggestion never reuses a number that lives past the first page.
 */
export function useInvoiceNumbers() {
  return useQuery({
    queryKey: queryKeys.invoiceNumbers,
    queryFn: () => listAllInvoiceNumbers(),
    ...queryPolicy('invoiceNumbers'),
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: InvoiceDraft) => createInvoice(draft),
    onSuccess: (invoice) => {
      queryClient.setQueryData(queryKeys.invoice(invoice.id), invoice);
      invalidateCollections(queryClient);
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: InvoiceDraft }) => updateInvoice(id, draft),
    onSuccess: (invoice) => {
      queryClient.setQueryData(queryKeys.invoice(invoice.id), invoice);
      invalidateCollections(queryClient);
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['invoices'] });
      const previousLists = queryClient.getQueriesData<InvoiceListData>({
        queryKey: ['invoices'],
      });

      // Drop the invoice from every cached page so the table updates instantly.
      queryClient.setQueriesData<InvoiceListData>({ queryKey: ['invoices'] }, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                items: page.items.filter((invoice) => invoice.id !== id),
              })),
            }
          : current,
      );
      queryClient.removeQueries({ queryKey: queryKeys.invoice(id) });

      return { previousLists };
    },
    onError: (_error, _id, context) => {
      context?.previousLists.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
      });
    },
    onSettled: () => {
      invalidateCollections(queryClient);
    },
  });
}

function invalidateCollections(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['invoices'] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.invoiceNumbers });
}

export type { Invoice, InvoicePage };
