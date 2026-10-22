import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deletePaymentProof,
  getPublicInvoice,
  uploadOwnerPaymentProof,
  uploadPaymentProof,
} from '../../../app/public-invoice';
import { queryKeys } from '../keys';

/**
 * The customer's view of one invoice, fetched through the public capability
 * URL. No session stands behind it, so it rides its own query key — never
 * the owner's `invoice(id)` key, which lives behind auth and would be
 * poisoned by an anonymous read.
 */
export function usePublicInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['public-invoice', id ?? ''],
    queryFn: () => getPublicInvoice(id as string),
    enabled: Boolean(id),
    retry: false,
  });
}

/**
 * The customer's one-shot upload. The response replaces the cached payload so
 * the card flips to "sudah dikirim" without a refetch.
 */
export function useUploadPaymentProof(invoiceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, turnstileToken }: { file: File; turnstileToken: string | null }) =>
      uploadPaymentProof(invoiceId, file, turnstileToken),
    onSuccess: (proof) => {
      queryClient.setQueryData(['public-invoice', invoiceId], (current: unknown) =>
        current && typeof current === 'object'
          ? {
              ...(current as Record<string, unknown>),
              invoice: {
                ...(current as { invoice: Record<string, unknown> }).invoice,
                paymentProof: { key: proof.key, uploadedAt: proof.uploadedAt },
              },
            }
          : current,
      );
    },
  });
}

/**
 * The owner's delete. Invalidates every invoice surface — the dashboard list
 * (badge + proof actions), the builder's detail cache (so its notice drops
 * the moment the delete lands), and the customer's public page — so all three
 * agree the proof is gone and the upload form may re-open. The dashboard's
 * activity feed reads proof events too, so its prefix goes with them.
 */
export function useDeletePaymentProof() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => deletePaymentProof(key),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['invoice'] });
      void queryClient.invalidateQueries({ queryKey: ['public-invoice'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardFinanceAll });
    },
  });
}

/**
 * The owner's upload/replace from the dashboard. Same invalidation set as
 * the delete above: list badge, builder notice and the customer's page must
 * all re-read the row after the write — and the dashboard activity feed,
 * which lists proof arrivals, must not keep yesterday's event set.
 */
export function useUploadOwnerPaymentProof() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, file }: { invoiceId: string; file: File }) =>
      uploadOwnerPaymentProof(invoiceId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['invoice'] });
      void queryClient.invalidateQueries({ queryKey: ['public-invoice'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardFinanceAll });
    },
  });
}
