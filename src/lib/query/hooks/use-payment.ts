import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchPaymentStatus,
  readPortalSession,
  startCheckout,
} from '../../../app/payments';
import type { PaidPlan } from '../../../core/billing/plans';
import { queryKeys } from '../keys';
import { queryPolicy } from '../policies';

/** How often `/payment/result` re-reads the order while it is still undecided. */
const POLL_MS = 3_000;

/**
 * Starts (or resumes) a DOKU sandbox checkout for a paid plan. The plan id is
 * the only input — the amount is resolved server-side, so this hook cannot be
 * talked into a cheaper price.
 *
 * The profile is invalidated on success because activation happens in the
 * webhook while the user is away on DOKU's page: when they come back, the
 * cached `free` plan must not outlive the payment that changed it.
 */
export function useStartCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plan: PaidPlan) => startCheckout(plan),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      // The new pending order belongs in the portal's history immediately.
      void queryClient.invalidateQueries({ queryKey: queryKeys.portalSession });
    },
  });
}

/**
 * Reads back the persisted status of one of the caller's payments. Strictly a
 * read: no result of this query can activate a plan — only the verified DOKU
 * notification endpoint writes that.
 *
 * While the order is `pending` the query refetches on an interval; the moment
 * the row turns `paid`/`expired`/`failed` the interval stops, so a forgotten
 * tab does not poll forever.
 */
export function usePaymentStatus(invoice: string) {
  return useQuery({
    queryKey: queryKeys.paymentStatus(invoice),
    queryFn: () => fetchPaymentStatus(invoice),
    enabled: invoice !== '',
    ...queryPolicy('paymentStatus'),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? POLL_MS : false),
  });
}

/**
 * The billing portal read: the caller's plan, its expiry, and their recent
 * payment history (including a resume link for a checkout still worth
 * paying). Used by the settings plan card; also invalidated when a checkout
 * starts so a fresh pending order shows up without a manual refresh.
 */
export function usePortalSession(enabled = true) {
  return useQuery({
    queryKey: queryKeys.portalSession,
    queryFn: () => readPortalSession(),
    enabled,
    ...queryPolicy('portalSession'),
  });
}
