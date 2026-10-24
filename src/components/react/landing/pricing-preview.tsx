import { motion, MotionConfig } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { PLAN_PRICES, PLAN_TAGLINES, PLAN_TIER_IDS } from '../../../core/billing/plan-benefits';
import { EASE, Reveal, SectionHeading } from './reveal';

const HIGHLIGHTS: Record<(typeof PLAN_TIER_IDS)[number], readonly string[]> = {
  free: ['Invoice tanpa batas', 'PDF A4 & kirim ke WhatsApp', 'Data pelanggan & katalog'],
  pro: ['Template premium & branding', 'Laporan bisnis & invoice link', 'Penyimpanan lebih besar'],
  business: ['API key untuk tim & integrasi', 'Webhook event invoice', 'Rate limit lebih tinggi'],
};

const TIER_NAMES = { free: 'Free', pro: 'Pro', business: 'Business' } as const;

/**
 * `#harga-preview`: a compact price preview that always mirrors the pricing
 * page: prices, taglines and highlights are imported from
 * `core/billing/plan-benefits`, the same source `/pricing` renders from, so
 * the two surfaces can never disagree. The only CTA here leads to
 * `/pricing`: plan purchase still happens exclusively on that page's
 * checkout flow, unchanged.
 */
export function PricingPreview() {
  return (
    <MotionConfig reducedMotion="user">
      <section id="harga-preview" className="scroll-mt-4">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <SectionHeading
            align="center"
            title="Mulai gratis. Bayar hanya kalau butuh lebih."
            description="Fitur inti gratis selamanya, tanpa kartu kredit dan tanpa masa trial."
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-3 sm:gap-6">
            {PLAN_TIER_IDS.map((tier, index) => {
              const price = PLAN_PRICES[tier];
              const primary = tier === 'pro';
              return (
                <motion.div
                  key={tier}
                  initial={{ opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.55, delay: index * 0.08, ease: EASE }}
                  className={`flex flex-col rounded-card border p-6 ${
                    primary
                      ? 'border-accent bg-gradient-to-b from-accent/8 via-card to-card shadow-accent'
                      : 'border-border bg-card shadow-card'
                  }`}
                >
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted">
                    {TIER_NAMES[tier]}
                  </p>
                  <p className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tracking-[-0.03em]">
                      {price.amount}
                    </span>
                    <span className="text-sm text-muted">{price.period}</span>
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{PLAN_TAGLINES[tier]}</p>
                  <ul className="mt-5 space-y-2.5 border-t border-border pt-5">
                    {HIGHLIGHTS[tier].map((highlight) => (
                      <li key={highlight} className="flex items-start gap-2.5 text-sm">
                        <Check
                          size={14}
                          strokeWidth={2.5}
                          aria-hidden="true"
                          className="mt-0.5 shrink-0 text-accent"
                        />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              );
            })}
          </div>

          <Reveal y={16} delay={0.15}>
            <div className="mt-10 flex flex-col items-center gap-4">
              <motion.a
                href="/pricing"
                whileHover={{ y: -2 }}
                whileTap={{ y: 0, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 24 }}
                className="group inline-flex h-12 items-center gap-2 rounded-control border border-border bg-card px-6 text-base font-medium text-foreground shadow-card focus-ring"
              >
                Lihat semua plan
                <ArrowRight
                  size={17}
                  aria-hidden="true"
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </motion.a>
              <p className="max-w-xl text-center text-xs leading-relaxed text-muted">
                Pembayaran Pro dan Business diproses lewat DOKU dan plan aktif otomatis setelah
                pembayaran terkonfirmasi. Tidak ada biaya di luar harga yang tertera, dan kamu bisa
                berhenti kapan saja.
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </MotionConfig>
  );
}
