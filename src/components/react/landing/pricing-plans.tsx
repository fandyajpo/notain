import { motion, MotionConfig } from 'motion/react';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { EASE } from './reveal';
import { MagneticButton } from './interactive';
import { Aurora } from './aurora';

type Plan = {
  name: string;
  price: string;
  period: string;
  tagline: string;
  cta: { href: string; label: string };
  /** Highlighted card with the accent border and primary button. */
  primary?: boolean;
  badge?: string;
  benefits: string[];
};

const PLANS: readonly Plan[] = [
  {
    name: 'Free',
    price: 'Rp 0',
    period: 'selamanya',
    tagline: 'Semua fitur inti untuk bikin dan kirim nota.',
    cta: { href: '/register', label: 'Buat Invoice Gratis' },
    benefits: [
      'Invoice tanpa batas',
      'Kalkulator otomatis: diskon, pajak, pembulatan',
      'PDF A4 rapi, siap cetak',
      'Kirim ke WhatsApp dalam satu ketukan',
      'Kelola data pelanggan',
      'Template bawaan & upload logo bisnis',
      'Export riwayat invoice ke Excel',
      'Data tersimpan di akun, aman ganti perangkat',
    ],
  },
  {
    name: 'Pro',
    price: 'Rp 29.000',
    period: '/bulan',
    tagline: 'Untuk bisnis yang makin sering kirim nota.',
    cta: { href: '/register', label: 'Dapatkan Akses Awal' },
    primary: true,
    badge: 'Segera hadir',
    benefits: [
      'Semua fitur di Free',
      'Template premium dengan desain nota lebih variatif',
      'Warna & branding sendiri di setiap nota',
      'Invoice link: customer buka nota tanpa download',
      'Laporan bisnis: ringkasan penjualan & pendapatan',
      'Penyimpanan cloud lebih besar',
      'Dukungan prioritas',
    ],
  },
  {
    name: 'Business',
    price: 'Rp 99.000',
    period: '/bulan',
    tagline: 'Untuk tim dan developer yang butuh akses API.',
    cta: { href: '/register', label: 'Dapatkan Akses Awal' },
    badge: 'Segera hadir',
    benefits: [
      'Semua fitur di Pro',
      'API key untuk akses programatik',
      'Multi API key untuk tim & integrasi',
      'Webhook event invoice (created, paid, dll)',
      'Rate limit lebih tinggi',
      'Dukungan prioritas',
    ],
  },
];

function PlanCard({ plan, delay }: { plan: Plan; delay: number }) {
  const primary = plan.primary ?? false;

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
        <span className="text-[2rem] font-semibold leading-none tracking-[-0.03em]">
          {plan.price}
        </span>
        <span className="text-sm text-muted">{plan.period}</span>
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">{plan.tagline}</p>

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
        {plan.benefits.map((benefit) => (
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

/** Pricing section: three plan cards — Free forever, Pro for growing businesses, Business for API access. */
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
          Pembayaran untuk plan Pro dan Business sedang disiapkan. Daftar sekarang; fitur Free
          tetap bisa dipakai penuh, dan kamu jadi yang pertama mencoba.
        </motion.p>
      </section>
    </MotionConfig>
  );
}
