import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  confirmPasswordReset,
  requestPasswordReset,
  sendInvoiceEmail,
} from '../../../app/mail';
import { queryKeys } from '../keys';

/**
 * Mutations for the email flows. There is no query here on purpose: nothing the
 * app renders is a list of sent mail, so an email is a one-shot side effect and
 * its own answer is the only state worth caching — which is what
 * `mutateAsync`'s result already is.
 */

/** "Lupa password": asks the server to mail a reset link. */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => requestPasswordReset(email.trim()),
  });
}

/** The reset link itself: stores the new password and spends the token. */
export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: (input: { token: string; password: string }) => confirmPasswordReset(input),
  });
}

/**
 * "Kirim nota": mails one saved invoice to its customer.
 *
 * The server may move the invoice to `sent` (only from unset), so every cache
 * that shows the status is invalidated afterwards — the same three the status
 * mutation touches. The invoice detail is keyed by id, so opening this dialog on
 * one invoice never refreshes another.
 */
export function useSendInvoiceEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { invoiceId: string; to: string; note?: string }) =>
      sendInvoiceEmail(input),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoice(variables.invoiceId) });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardFinanceAll });
    },
  });
}
