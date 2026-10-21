import { AuthGate } from '../auth/auth-gate';
import { AppProviders } from '../providers';
import { IslandBoundary } from '../ui/island-boundary';
import { PageHeader } from '../ui/page-header';
import { PaymentHistoryCard, PlanStatusCard } from './plan-status';
import { PlanCatalogCard } from './plan-catalog';

/**
 * `/billing` — the standalone Billing page.
 *
 * It replaces the "Langganan" card that used to live inside Settings: the
 * subscription deserves its own destination now that it has a menu entry, and
 * Settings keeps only the business profile and the tour.
 *
 * All three cards read `GET /api/payments/portal`; none of them can write.
 */
export function BillingApp() {
  return (
    <IslandBoundary>
      <AppProviders>
        <AuthGate>
          <BillingContent />
        </AuthGate>
      </AppProviders>
    </IslandBoundary>
  );
}

function BillingContent() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Billing"
        description="Plan aktif, masa berlaku, dan riwayat pembayaran kamu."
      />
      <PlanStatusCard />
      <PaymentHistoryCard />
      <PlanCatalogCard />
    </div>
  );
}
