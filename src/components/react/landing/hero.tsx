import { motion, MotionConfig } from 'motion/react';
import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { InvoicePreview } from '../invoice/invoice-preview';
import { createSampleInvoice } from '../../../core/invoice/sample';
import { BUILTIN_TEMPLATES } from '../../../core/template/builtins';
import { resolveTemplate } from '../../../core/template/resolve';
import { EASE, SplitWords } from './reveal';
import { MagneticButton, TiltCard } from './interactive';

/** One tab per built-in template, so the landing page can never disagree with the picker. */
const TEMPLATES = BUILTIN_TEMPLATES.map((template) => ({
  id: template.id,
  label: template.name,
}));

/**
 * The invoice sample lives here so the sheet and the sections below it agree on
 * the numbers. Each tab resolves a different built-in template, so what the
 * landing page shows is exactly what the picker offers.
 */
function PreviewStage() {
  const [templateId, setTemplateId] = useState(BUILTIN_TEMPLATES[0]?.id ?? '');
  const sample = useMemo(() => createSampleInvoice(new Date(Date.UTC(2026, 9, 8))), []);

  return (
    <div className="relative mx-auto w-full max-w-[25rem]">
      {/* Template switch as a rule with three words on it: the sheet below is
          the subject, so the control does not get a pill of its own. */}
      <motion.div
        role="tablist"
        aria-label="Pilih tampilan nota"
        initial={false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6, ease: EASE }}
        className="flex items-center gap-1 border-b border-rule"
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
              className={`relative px-2.5 py-2.5 text-sm font-medium transition-colors focus-ring ${
                active ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {item.label}
              {active && (
                <motion.span
                  layoutId="hero-template-tab"
                  className="absolute inset-x-2 -bottom-px h-0.5 bg-accent"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
            </button>
          );
        })}
      </motion.div>

      {/* The page's one authored moment: the sheet is printed onto the page, top
          down, so the first thing the eye follows is the document itself. The
          stamp sits outside the clip wrapper — a sheet printing over it would
          slice the ink in half mid-word. */}
      <div className="relative mt-4">
        <motion.div
          initial={{ clipPath: 'inset(0 0 100% 0)' }}
          whileInView={{ clipPath: 'inset(0 0 0% 0)' }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          <TiltCard max={5}>
            <div className="receipt-sheet rounded-[1rem] p-1.5 shadow-popover">
              <InvoicePreview
                business={sample.business}
                invoice={sample.draft}
                template={resolveTemplate(templateId)}
                className="shadow-none"
              />
            </div>
          </TiltCard>
        </motion.div>

        <motion.span
          aria-hidden="true"
          initial={{ opacity: 0, scale: 1.4, rotate: -7 }}
          whileInView={{ opacity: 0.85, scale: 1, rotate: -7 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.5 }}
          className="receipt-stamp absolute -top-3 right-6 bg-card text-accent"
        >
          {sample.business.name}
        </motion.span>
      </div>
    </div>
  );
}

type Props = {
  ctaHref: string;
  ctaLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

/**
 * The first screen: the promise on the left, the document on the right.
 *
 * Two columns rather than a centered stack — a shop's letterhead sits beside
 * the nota it belongs to, and the page reaches the product without a scroll.
 */
export function Hero({ ctaHref, ctaLabel, secondaryHref, secondaryLabel }: Props) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="grid gap-10 pb-12 pt-8 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start lg:gap-14 lg:pb-14 lg:pt-12">
        <div>
          <h1 className="text-balance text-[clamp(1.9rem,4.4vw,3rem)] font-semibold leading-[1.06] tracking-[-0.03em]">
            <SplitWords text="Buat nota lebih rapi." className="block" delay={0.08} immediate />
            <SplitWords
              text="Biar urusan usaha lebih mudah."
              className="block"
              delay={0.24}
              immediate
            />
          </h1>

          <motion.p
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.45, ease: EASE }}
            className="mt-4 max-w-md text-base leading-relaxed text-muted"
          >
            Catat barang, hitung total, simpan PDF-nya. Pesan WhatsApp sudah terisi nomor dan
            nominalnya, jadi kamu tinggal melampirkan berkasnya.
          </motion.p>

          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.55, ease: EASE }}
            className="mt-6 flex flex-wrap items-center gap-2.5"
          >
            <MagneticButton
              href={ctaHref}
              className="group inline-flex h-11 items-center gap-2 rounded-control bg-accent px-5 text-sm font-medium text-accent-foreground shadow-accent transition-colors hover:bg-accent/90 focus-ring"
            >
              {ctaLabel}
              <ArrowRight
                size={16}
                aria-hidden="true"
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </MagneticButton>

            {secondaryHref && secondaryLabel && (
              <a
                href={secondaryHref}
                className="inline-flex h-11 items-center rounded-control border border-rule px-4 text-sm font-medium transition-colors hover:border-ink/30 focus-ring"
              >
                {secondaryLabel}
              </a>
            )}
          </motion.div>

          <p className="mt-4 text-xs text-muted">
            Gratis selamanya, tanpa kartu kredit. PDF A4 siap dicetak.
          </p>
        </div>

        <motion.div
          id="contoh"
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="scroll-mt-24"
        >
          <PreviewStage />
        </motion.div>
      </div>
    </MotionConfig>
  );
}
