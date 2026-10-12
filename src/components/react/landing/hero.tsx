import { motion, MotionConfig } from 'motion/react';
import { useMemo, useState } from 'react';
import { ArrowRight, Check, CheckCheck, ChevronDown, FileDown } from 'lucide-react';
import { InvoicePreview } from '../invoice/invoice-preview';
import { createSampleInvoice } from '../../../core/invoice/sample';
import { BUILTIN_TEMPLATES } from '../../../core/template/builtins';
import { resolveTemplate } from '../../../core/template/resolve';
import { EASE, SplitWords } from './reveal';
import { MagneticButton, TiltCard } from './interactive';

const BLOBS = [
  { className: '-left-24 -top-32 size-[26rem] bg-accent/20', duration: 26, delay: 0 },
  { className: '-right-28 top-8 size-[20rem] bg-warning/15', duration: 21, delay: -6 },
  { className: 'left-1/3 -bottom-36 size-[22rem] bg-accent/10', duration: 31, delay: -13 },
];

const TRUST_POINTS = [
  'Gratis selamanya',
  'Tanpa kartu kredit',
  'PDF A4 siap kirim',
  'Pakai bahasa Indonesia',
];

/** One tab per built-in template, so the landing page can never disagree with the picker. */
const TEMPLATES = BUILTIN_TEMPLATES.map((template) => ({
  id: template.id,
  label: template.name,
}));

/** Aurora blobs drifting behind the hero; the graph-paper texture lives on the page. */
function Aurora() {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden"
      aria-hidden="true"
    >
      {BLOBS.map((blob) => (
        <motion.div
          key={blob.className}
          className={`absolute rounded-full blur-3xl will-change-transform ${blob.className}`}
          animate={{ x: [0, 45, -35, 0], y: [0, -35, 25, 0], scale: [1, 1.18, 0.92, 1] }}
          transition={{
            duration: blob.duration,
            delay: blob.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

function Eyebrow({ delay }: { delay: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 12, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      className="inline-flex items-center gap-2 rounded-pill border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-medium text-accent"
    >
      <span className="relative flex size-1.5">
        <motion.span
          className="absolute inset-0 rounded-full bg-accent"
          animate={{ scale: [1, 2.4], opacity: [0.7, 0] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut' }}
        />
        <span className="relative size-1.5 rounded-full bg-accent" />
      </span>
      Untuk UMKM Indonesia
    </motion.span>
  );
}

/**
 * The invoice sample lives here so the card and its floating chips agree on
 * the numbers. Each tab resolves a different built-in template, so what the
 * landing page shows is exactly what the picker offers.
 */
function PreviewStage() {
  const [templateId, setTemplateId] = useState(BUILTIN_TEMPLATES[0].id);
  const sample = useMemo(() => createSampleInvoice(new Date(Date.UTC(2026, 9, 8))), []);

  return (
    <div className="relative mx-auto w-full max-w-lg">
      <motion.div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-accent/12 blur-3xl will-change-transform"
        animate={{ opacity: [0.55, 0.95, 0.55], scale: [1, 1.06, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        role="tablist"
        aria-label="Pilih tampilan invoice"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.85, ease: EASE }}
        className="mb-4 flex w-fit items-center gap-1 rounded-pill border border-border bg-card p-1 shadow-card"
      >
        {TEMPLATES.map((item) => {
          const active = item.id === templateId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTemplateId(item.id)}
              className={`relative rounded-pill px-4 py-1.5 text-sm font-medium transition-colors focus-ring ${
                active ? 'text-accent-foreground' : 'text-muted hover:text-foreground'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="template-tab"
                  className="absolute inset-0 rounded-pill bg-accent"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{item.label}</span>
            </button>
          );
        })}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 40, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.9, delay: 0.35, ease: EASE }}
      >
        <motion.div
          className="will-change-transform"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        >
          <TiltCard max={6}>
            <InvoicePreview
              business={sample.business}
              invoice={sample.draft}
              template={resolveTemplate(templateId)}
              className="shadow-popover"
            />
          </TiltCard>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, delay: 1.15, ease: EASE }}
        className="absolute -left-4 top-16 hidden items-center gap-2 rounded-control border border-border bg-card px-3 py-2 text-xs font-medium shadow-popover lg:flex"
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-accent">
          <FileDown size={13} aria-hidden="true" />
        </span>
        PDF A4 siap diunduh
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-control border border-accent/40"
          animate={{ opacity: [0, 1, 0], scale: [1, 1.12, 1.18] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut', delay: 2 }}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, delay: 1.35, ease: EASE }}
        className="absolute -right-4 bottom-24 hidden items-center gap-2 rounded-control rounded-br-sm border border-accent/20 bg-accent-soft px-3 py-2 text-xs font-medium text-foreground shadow-popover lg:flex"
      >
        <CheckCheck size={14} aria-hidden="true" className="text-accent" />
        Terkirim ke Budi
      </motion.div>
    </div>
  );
}

type Props = {
  ctaHref: string;
  ctaLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

/** Centered hero: mask-revealed headline over a live, template-switchable invoice. */
export function Hero({ ctaHref, ctaLabel, secondaryHref, secondaryLabel }: Props) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative pb-16 pt-12 sm:pb-24 sm:pt-16">
        <Aurora />

        <div className="text-center">
          <Eyebrow delay={0.05} />

          <h1 className="mx-auto mt-6 max-w-3xl text-[clamp(2.75rem,7vw,4.25rem)] font-semibold leading-[1.03] tracking-[-0.035em]">
            <SplitWords text="Bikin invoice." className="block" delay={0.16} />
            <SplitWords text="Kirim. Selesai." className="block text-accent" delay={0.34} />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: EASE }}
            className="mx-auto mt-6 max-w-xl text-lead text-muted"
          >
            Buat invoice profesional untuk bisnis kamu, atur diskon dan pajaknya, download PDF-nya,
            lalu kirim ke customer langsung lewat WhatsApp.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.72, ease: EASE }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <MagneticButton
              href={ctaHref}
              className="group inline-flex h-12 items-center gap-2 rounded-control bg-accent px-5 text-base font-medium text-accent-foreground shadow-[0_10px_28px_-12px_rgb(22_163_74_/_0.7)] transition-colors hover:bg-accent/90 focus-ring"
            >
              {ctaLabel}
              <ArrowRight
                size={17}
                aria-hidden="true"
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </MagneticButton>

            {secondaryHref && secondaryLabel && (
              <motion.a
                href={secondaryHref}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 24 }}
                className="inline-flex h-12 items-center rounded-control border border-border bg-card px-5 text-base font-medium text-foreground shadow-card focus-ring"
              >
                {secondaryLabel}
              </motion.a>
            )}
          </motion.div>

          <motion.ul
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.86, ease: EASE }}
            className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
          >
            {TRUST_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-1.5 text-sm text-muted">
                <Check size={10} strokeWidth={3} aria-hidden="true" className="text-accent" />
                {point}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          id="contoh"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-14 scroll-mt-24 sm:mt-16"
        >
          <PreviewStage />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.5 }}
          className="mt-12 flex justify-center"
        >
          <motion.div
            aria-hidden="true"
            className="flex flex-col items-center gap-1 text-xs text-muted"
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
          >
            <span>Gulir ke bawah</span>
            <ChevronDown size={16} />
          </motion.div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
