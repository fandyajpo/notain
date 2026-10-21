import { PAID_PLANS, planRank } from './plans';
import type { PlanTier } from './plan-benefits';

/**
 * Which plan tiers the account can move to *right now*, derived from the same
 * two facts the checkout API re-checks (`functions/api/payments/checkout.ts`):
 * the stored plan and whether its term is still running.
 *
 * The rules are the server's, restated client-side purely to render the right
 * control — checkout still answers 409 if they ever disagree:
 *
 * - the tier you already have entitlement to is `current`;
 * - a higher tier is always purchasable (`checkout`);
 * - a lower tier is only purchasable once the current term has lapsed, so
 *   while a paid plan is active the choice is `unavailable`;
 * - Free is never a checkout target — it is what the account falls back to
 *   when a paid term ends, so it is `current` for a free *or* expired account.
 *
 * "Effective" plan rather than stored plan: an expired `pro` row already
 * behaves as Free.
 */
export type PlanChoice =
  | { kind: 'current'; label: string }
  | { kind: 'checkout'; label: string; href: string }
  | { kind: 'unavailable'; label: string };

/** The one sentence shown wherever a switch is not possible yet. */
export const PLAN_SWITCH_HINT = 'Berlaku setelah masa aktif berakhir';

export function planDisplayName(tier: PlanTier): string {
  return tier === 'free' ? 'Free' : PAID_PLANS[tier].name;
}

export function planChoice(tier: PlanTier, current: { plan: string; active: boolean }): PlanChoice {
  const effective: PlanTier =
    current.active && (current.plan === 'pro' || current.plan === 'business')
      ? current.plan
      : 'free';

  if (tier === effective) return { kind: 'current', label: 'Plan saat ini' };
  if (tier === 'free' || planRank(tier) < planRank(effective)) {
    return { kind: 'unavailable', label: PLAN_SWITCH_HINT };
  }
  return {
    kind: 'checkout',
    label: `Pilih ${planDisplayName(tier)}`,
    href: `/checkout?plan=${tier}`,
  };
}
