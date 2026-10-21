import { Check } from 'lucide-react';
import { usePortalSession } from '../../../lib/query/hooks/use-payment';
import {
  PLAN_BENEFITS,
  PLAN_PRICES,
  PLAN_TAGLINES,
  PLAN_TIER_IDS,
  type PlanTier,
} from '../../../core/billing/plan-benefits';
import { planChoice, planDisplayName } from '../../../core/billing/plan-availability';
import { GENERIC_ERROR_MESSAGE, isAppError } from '../../../core/shared/errors';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ErrorState, LoadingState } from '../ui/state';

/**
 * The plan catalog with the entitlements of each tier, plus the one control
 * this account is allowed to use for that tier right now.
 *
 * Which button appears (or why none does) comes from `planChoice`, which
 * restates the checkout API's own downgrade rule; the plan and benefits
 * themselves are the shared display copy in `core/billing/plan-benefits`, so
 * this card and the pricing page cannot describe a tier differently.
 */
export function PlanCatalogCard() {
  const portal = usePortalSession();

  const current = portal.data ? { plan: portal.data.plan, active: portal.data.active } : null;

  return (
    <Card data-tour="billing-plans">
      <div>
        <p className="font-medium">Plan & keuntungan</p>
        <p className="text-sm text-muted">
          Apa yang kamu dapat sekarang, dan pilihan plan yang bisa dipilih dari akun ini.
        </p>
      </div>

      {portal.isLoading ? (
        <div className="mt-4">
          <LoadingState label="Memuat daftar plan…" />
        </div>
      ) : portal.isError || !portal.data || !current ? (
        <div className="mt-4">
          <ErrorState
            title="Daftar plan tidak bisa dimuat"
            message={isAppError(portal.error) ? portal.error.message : GENERIC_ERROR_MESSAGE}
            action={
              <Button variant="secondary" size="sm" onClick={() => void portal.refetch()}>
                Coba lagi
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLAN_TIER_IDS.map((tier) => (
            <PlanTile key={tier} tier={tier} current={current} />
          ))}
        </div>
      )}
    </Card>
  );
}

function PlanTile({
  tier,
  current,
}: {
  tier: PlanTier;
  current: { plan: string; active: boolean };
}) {
  const choice = planChoice(tier, current);
  const { amount, period } = PLAN_PRICES[tier];
  const isCurrent = choice.kind === 'current';

  return (
    <div
      className={`flex flex-col rounded-card border p-5 ${
        isCurrent ? 'border-accent bg-accent-soft/40' : 'border-border bg-background'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">
          {planDisplayName(tier)}
        </p>
        {isCurrent && (
          <Badge variant="accent" size="sm">
            Plan saat ini
          </Badge>
        )}
      </div>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tracking-tight">{amount}</span>
        <span className="text-xs text-muted">{period}</span>
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{PLAN_TAGLINES[tier]}</p>

      <ul className="mt-4 flex-1 space-y-2">
        {PLAN_BENEFITS[tier].map((benefit) => (
          <li key={benefit} className="flex items-start gap-2 text-sm leading-relaxed">
            <Check
              size={14}
              strokeWidth={2.5}
              aria-hidden="true"
              className="mt-1 shrink-0 text-accent"
            />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        {choice.kind === 'checkout' ? (
          <Button href={choice.href} variant="secondary" size="sm" full>
            {choice.label}
          </Button>
        ) : choice.kind === 'current' ? (
          <p className="text-sm text-muted">Kamu sedang memakai plan ini.</p>
        ) : (
          <p className="text-sm text-muted">{choice.label}</p>
        )}
      </div>
    </div>
  );
}
