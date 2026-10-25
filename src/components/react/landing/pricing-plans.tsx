import { motion, MotionConfig } from 'motion/react';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { EASE } from './reveal';
import { MagneticButton } from './interactive';
import { Aurora } from './aurora';
import {
  PLAN_BADGES,
  PLAN_BENEFITS,
  PLAN_PRICES,
  PLAN_TAGLINES,
  yearlySavingNote,
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
    cta: { href: '/register', label: 'Buat Invoice Gratis' },
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
  // A paid tier also shows the annual alternative. Derived, so the saving can
  // never disagree with the monthly price printed a few pixels above it.
  const yearly = plan.id === 'free' ? null : yearlySavingNote(plan.id);

  return (
    <motion.article
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={`relative flex flex-col rounded-card border p-6 sm:p-8 ${
        primary
          ? 'border-accent bg-gradient-to-b from-accent/8 via-card to-card shadow-accent'
          : 'border-border bg-card shadow-card'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          {primary && <Sparkles size={15} aria-hidden="true" className="text-accent" />}
          {plan.name}
        </span>
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
      {yearly && <p className="mt-2 text-sm leading-relaxed text-muted">{yearly}</p>}
      <p className="mt-3 text-sm leading-relaxed text-muted">{tagline}</p>

      <div className="mt-6">
        {primary ? (
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

      <p className="mt-8 border-t border-border pt-6 text-eyebrow uppercase text-muted">
        Yang kamu dapat
      </p>
      <ul className="mt-4 space-y-3">
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

/** Pricing section: three plan cards (Free forever, Pro for growing businesses, Business for API access). */
export function PricingPlans() {
  return (
    <MotionConfig reducedMotion="user">
      <section
        id="harga"
        className="relative mx-auto w-full max-w-5xl scroll-mt-4 px-5 pb-20 pt-14 sm:px-8 sm:pb-24 sm:pt-20"
      >
        {/* Same drifting gradient identity as the homepage hero, so the two
            pages read as one brand. */}
        <Aurora />

        {/* First-viewport content uses `initial={false}` so the server HTML
            already paints it at full size, like the hero. */}
        <div className="text-center">
          <motion.span
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-pill border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-medium text-accent"
          >
            Harga
          </motion.span>

          <h1 className="mx-auto mt-6 max-w-2xl text-[clamp(2.25rem,5.5vw,3.25rem)] font-semibold leading-[1.06] tracking-[-0.03em]">
            Mulai gratis. <span className="text-accent">Naik ke Pro</span> atau Business kalau
            butuh.
          </h1>

          <motion.p
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
            className="mx-auto mt-5 max-w-xl text-lead text-muted"
          >
            Fitur inti gratis selamanya, tanpa kartu kredit dan tanpa masa trial. Pro membuka
            template premium dan laporan bisnis; Business menambah akses API untuk tim dan
            developer.
          </motion.p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((plan, index) => (
            <PlanCard key={plan.name} plan={plan} delay={0.25 + index * 0.12} />
          ))}
        </div>

        <motion.p
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55, ease: EASE }}
          className="mx-auto mt-8 max-w-xl text-center text-sm leading-relaxed text-muted"
        >
          Pembayaran plan Pro dan Business diproses lewat DOKU, dan plan aktif otomatis setelah
          pembayaran terkonfirmasi. Tidak ada biaya di luar harga yang tertera, dan kamu bisa
          berhenti kapan saja.
        </motion.p>

        <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-relaxed text-muted">
          Butuh akses API untuk integrasi? Intip rencana fiturnya di{' '}
          <a
            href="/developers"
            className="font-medium text-foreground underline underline-offset-2 hover:text-muted"
          >
            halaman developers
          </a>
          .
        </p>
      </section>
    </MotionConfig>
  );
}
