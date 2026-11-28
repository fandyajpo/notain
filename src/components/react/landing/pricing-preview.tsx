import { ArrowRight } from 'lucide-react';
import { FREE_PLAN_LIMITS } from '../../../core/billing/plans';
import {
  PLAN_COMING_SOON_LABEL,
  PLAN_PRICES,
  PLAN_TAGLINES,
  PLAN_TIER_IDS,
  isPlanComingSoon,
} from '../../../core/billing/plan-benefits';
import { MARKETING_BOX, MARKETING_H2, MARKETING_SECTION } from '../../../lib/ui/classes';

const TIER_NAMES = { free: 'Free', pro: 'Pro', business: 'Business' } as const;

/**
 * `#harga-preview`: the three plans as a price list, the way a shop posts them.
 *
 * Prices, taglines and the coming-soon flag are imported from
 * `core/billing/plan-benefits`, the same source `/pricing` renders from, so the
 * two surfaces can never disagree. Three cards were three screens of the same
 * information; three ruled lines say it in one and leave the comparing to the
 * page that actually sells the plan.
 */
export function PricingPreview() {
  return (
    <section id="harga-preview" className={MARKETING_SECTION}>
      <div className={MARKETING_BOX}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="max-w-md">
            <h2 className={MARKETING_H2}>Mulai gratis. Bayar kalau butuh lebih.</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Fitur dasar gratis selamanya, termasuk {FREE_PLAN_LIMITS.invoicesPerMonth} nota baru
              per bulan. Tanpa kartu kredit.
            </p>
          </div>

          <a
            href="/pricing"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-accent focus-ring"
          >
            Lihat semua paket
            <ArrowRight
              size={15}
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </a>
        </div>

        <ul className="mt-5 border-t border-rule">
          {PLAN_TIER_IDS.map((tier) => {
            const price = PLAN_PRICES[tier];
            return (
              <li key={tier} className="border-b border-rule py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{TIER_NAMES[tier]}</span>
                  <span className="till-figure shrink-0 text-sm">
                    {price.amount}
                    <span className="ml-1 text-xs font-normal text-muted">{price.period}</span>
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {isPlanComingSoon(tier) ? PLAN_COMING_SOON_LABEL : PLAN_TAGLINES[tier]}
                </p>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          Pembayaran Pro diproses lewat DOKU dan paket aktif otomatis setelah pembayaran
          terkonfirmasi.
        </p>
      </div>
    </section>
  );
}
