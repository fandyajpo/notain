import { motion, MotionConfig } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { EASE } from './reveal';
import { MagneticButton } from './interactive';
import {
  PLAN_BADGES,
  PLAN_BENEFITS,
  PLAN_COMING_SOON_LABEL,
  PLAN_PRICES,
  PLAN_TAGLINES,
  isPlanComingSoon,
  type PlanTier,
} from '../../../core/billing/plan-benefits';

type Plan = {
  id: PlanTier;
  name: string;
  cta: { href: string; label: string };
  /** Highlighted card with the accent border and primary button. */
  primary?: boolean;
  badge?: string;
};

/**
 * `?plan=` drives the checkout confirmation page: the plan id survives a
 * login detour there, and the server prices it from its own catalog: the
 * price, tagline and benefit strings are display copy, shared with the
 * billing page from `core/billing/plan-benefits`. Free is deliberately NOT a
 * checkout target: free never touches payment.
 */
const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Free',
    badge: PLAN_BADGES.free ?? undefined,
    cta: { href: '/register', label: 'Buat nota gratis' },
  },
  {
    id: 'pro',
    name: 'Pro',
    badge: PLAN_BADGES.pro ?? undefined,
    cta: { href: '/checkout?plan=pro', label: 'Berlangganan Pro' },
    primary: true,
  },
  {
    id: 'business',
    name: 'Business',
    badge: PLAN_BADGES.business ?? undefined,
    cta: { href: '/checkout?plan=business', label: 'Berlangganan Business' },
  },
];

function PlanCard({ plan, delay }: { plan: Plan; delay: number }) {
  const primary = plan.primary ?? false;
  const { amount, period } = PLAN_PRICES[plan.id];
  const tagline = PLAN_TAGLINES[plan.id];
  const benefits = PLAN_BENEFITS[plan.id];
  // Announced, not sold (Business): no annual alternative either — there is
  // nothing to buy in any period yet.
  const comingSoon = isPlanComingSoon(plan.id);

  return (
    <motion.article
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={`relative flex flex-col rounded-card border bg-card p-5 sm:p-6 ${
        primary ? 'border-accent' : 'border-rule'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{plan.name}</span>
        {plan.badge && (
          <span className="rounded-pill border border-accent/25 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
            {plan.badge}
          </span>
        )}
      </div>

      <p className="mt-5 flex items-baseline gap-2">
        <span className="text-[2rem] font-semibold leading-none tracking-[-0.03em]">{amount}</span>
        <span className="text-sm text-muted">{period}</span>
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">{tagline}</p>

      <div className="mt-6">
        {comingSoon ? (
          // Not a link, and not a control-shaped box either: a dashed button
          // that looks disabled still invites a tap that does nothing. One line
          // of copy, matching the height of the CTAs beside it.
          <p className="flex h-12 items-center justify-center text-sm text-muted">
            {PLAN_COMING_SOON_LABEL}
          </p>
        ) : primary ? (
          <MagneticButton
            href={plan.cta.href}
            className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-control bg-accent px-5 text-base font-medium text-accent-foreground shadow-accent transition-colors hover:bg-accent/90 focus-ring"
          >
            {plan.cta.label}
            <ArrowRight
              size={17}
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </MagneticButton>
        ) : (
          <motion.a
            href={plan.cta.href}
            whileHover={{ y: -2 }}
            whileTap={{ y: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
            className="inline-flex h-12 w-full items-center justify-center rounded-control border border-border bg-card px-5 text-base font-medium text-foreground shadow-card focus-ring"
          >
            {plan.cta.label}
          </motion.a>
        )}
      </div>

      <p className="mt-6 border-t border-rule pt-4 text-sm font-medium">Yang kamu dapat</p>
      <ul className="mt-3 space-y-2.5">
        {benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-3 text-sm leading-relaxed">
            <Check
              size={15}
              strokeWidth={2.5}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-accent"
            />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>
    </motion.article>
  );
}

/** Pricing section: three plan cards — Free forever, Pro today, Business announced as coming soon. */
export function PricingPlans() {
  return (
    <MotionConfig reducedMotion="user">
      <section
        id="harga"
        className="relative mx-auto w-full max-w-4xl scroll-mt-20 px-5 pb-12 pt-10 sm:px-8 sm:pb-16 sm:pt-12"
      >
        {/* First-viewport content uses `initial={false}` so the server HTML
            already paints it at full size, like the hero. */}
        <div>
          <h1 className="max-w-2xl text-balance text-[clamp(1.9rem,4.4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.03em]">
            Mulai gratis. Pilih Pro kalau butuh fitur lebih.
          </h1>

          <motion.p
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
            className="mt-3 max-w-xl text-sm leading-relaxed text-muted"
          >
            Fitur dasar gratis selamanya, termasuk template bawaan dan template buatan sendiri. Pro
            menambah nota tanpa batas dan laporan. Business sedang disiapkan dan belum bisa dibeli.
          </motion.p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((plan, index) => (
            <PlanCard key={plan.name} plan={plan} delay={0.25 + index * 0.12} />
          ))}
        </div>

        <motion.p
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.55, ease: EASE }}
          className="mt-6 max-w-xl text-xs leading-relaxed text-muted"
        >
          Pembayaran paket Pro diproses lewat DOKU, dan paket aktif otomatis setelah pembayaran
          terkonfirmasi. Tidak ada biaya di luar harga yang tertera, dan kamu bisa berhenti kapan
          saja.
        </motion.p>

        <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted">
          Butuh akses API untuk integrasi? Intip rencana fiturnya di{' '}
          <a
            href="/developers"
            className="font-medium text-foreground underline underline-offset-2 hover:text-muted"
          >
            halaman developer
          </a>
          .
        </p>
      </section>
    </MotionConfig>
  );
}
