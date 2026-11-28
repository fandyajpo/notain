import { motion, MotionConfig } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { EASE, Reveal } from './reveal';
import { MagneticButton } from './interactive';

/** Closing CTA: one card, one button, and the page's last word. */
export function FinaleCta() {
  return (
    <MotionConfig reducedMotion="user">
      <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="rounded-card border border-border bg-card shadow-card"
        >
          <div className="px-6 py-14 text-center sm:px-12 sm:py-16">
            <Reveal scale y={18}>
              <h2 className="text-title">Buat nota pertamamu</h2>
            </Reveal>
            <Reveal y={14} delay={0.1}>
              <p className="mx-auto mt-3 max-w-md text-muted">
                Gratis, tanpa kartu kredit, dan langsung jadi dalam hitungan detik.
              </p>
            </Reveal>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
              className="mt-8 flex justify-center"
            >
              <MagneticButton
                href="/register"
                className="group inline-flex h-12 items-center gap-2 rounded-control bg-accent px-5 text-base font-medium text-accent-foreground shadow-accent transition-colors hover:bg-accent/90 focus-ring"
              >
                Buat nota gratis
                <ArrowRight
                  size={17}
                  aria-hidden="true"
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </MagneticButton>
            </motion.div>
          </div>
        </motion.div>
      </section>
    </MotionConfig>
  );
}
