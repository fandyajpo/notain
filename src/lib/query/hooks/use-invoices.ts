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
  listPickerHistory,
  updateInvoice,
  updateInvoiceStatus,
} from '../../../app/invoices';
import { queryPolicy } from '../policies';
import { queryKeys } from '../keys';
import type { Invoice, InvoiceDraft, InvoiceStatus } from '../../../core/invoice/model';
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
 *
 * `options.limit` shrinks the page for a caller that only previews a handful of
 * rows (the dashboard shows six). It is keyed separately so a small preview
 * never shares — or evicts — the full page the `/invoices` table relies on.
 */
export function useInvoices(
  search = '',
  options?: { limit?: number; status?: InvoiceStatus; templateId?: string },
) {
  const limit = options?.limit;
  const status = options?.status;
  const templateId = options?.templateId;
  return useInfiniteQuery({
    queryKey: queryKeys.invoices(search, limit, status, templateId),
    queryFn: ({ pageParam }) =>
      listInvoicesPage({ search, status, templateId, cursorAfter: pageParam, limit }),
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

function useStatusCount(status: InvoiceStatus) {
  return useQuery({
    queryKey: queryKeys.invoiceStatusCount(status),
    // `limit: 1` — Appwrite reports the full `total` regardless of page size,
    // so counting a state never ships a single invoice row.
    queryFn: () => listInvoicesPage({ status, limit: 1 }).then((page) => page.total),
    ...queryPolicy('invoices'),
  });
}

/** Per-status invoice totals for the dashboard's summary table. */
export function useInvoiceStatusCounts() {
  const sent = useStatusCount('sent');
  const paid = useStatusCount('paid');
  const statusVoid = useStatusCount('void');
  return {
    sent: sent.data,
    paid: paid.data,
    void: statusVoid.data,
    isLoading: sent.isLoading || paid.isLoading || statusVoid.isLoading,
  };
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

/**
 * Recent invoice history for the picker, projected to just the columns its
 * suggestions are derived from.
 *
 * Deliberately separate from `useInvoices`: the table needs full rows, the
 * picker needs a sliver. Sharing one query would either bloat the picker with
 * rich-text HTML or strip the columns the table renders. It rides the `invoices`
 * policy because it is invoice data and is invalidated alongside it.
 */
export function usePickerHistory() {
  return useQuery({
    queryKey: queryKeys.pickerHistory,
    queryFn: () => listPickerHistory(),
    ...queryPolicy('invoices'),
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

/**
 * Flips only the status field. Kept separate from `useUpdateInvoice` so the
 * table's status cell does not have to round-trip the whole draft (rich-text
 * sections included) to change one enum value.
 */
export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      updateInvoiceStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['invoices'] });
      const previousLists = queryClient.getQueriesData<InvoiceListData>({
        queryKey: ['invoices'],
      });

      // Flip the status in every cached page so the controlled select reflects
      // the pick immediately instead of snapping back while `isPending`.
      queryClient.setQueriesData<InvoiceListData>({ queryKey: ['invoices'] }, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                items: page.items.map((invoice) =>
                  invoice.id === id ? { ...invoice, status } : invoice,
                ),
              })),
            }
          : current,
      );

      return { previousLists };
    },
    onError: (_error, _variables, context) => {
      context?.previousLists.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
      });
    },
    onSuccess: (invoice) => {
      queryClient.setQueryData(queryKeys.invoice(invoice.id), invoice);
    },
    // Refetch rather than trust the optimistic write: the server is the source
    // of truth for the stored enum.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
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
  void queryClient.invalidateQueries({ queryKey: queryKeys.pickerHistory });
}

export type { Invoice, InvoicePage };
