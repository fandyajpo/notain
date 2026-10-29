import { motion, MotionConfig } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { EASE, Reveal } from './reveal';
import { MagneticButton } from './interactive';

/** Closing CTA: rotating conic border with a calm, centered pitch inside. */
export function FinaleCta() {
  return (
    <MotionConfig reducedMotion="user">
      <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="relative overflow-hidden rounded-card p-px"
        >
          {/* The rotating ring: accent-tinted alpha stops (color-mix keeps the
              gradient on-token) so the border sweeps from faint to full accent. */}
          <motion.span
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 block size-[170%] bg-[conic-gradient(from_0deg,color-mix(in_srgb,var(--color-accent)_6%,transparent),color-mix(in_srgb,var(--color-accent)_65%,transparent),color-mix(in_srgb,var(--color-accent)_15%,transparent),color-mix(in_srgb,var(--color-accent)_6%,transparent))] will-change-transform"
            initial={{ x: '-50%', y: '-50%', rotate: 0 }}
            animate={{ x: '-50%', y: '-50%', rotate: 360 }}
            transition={{ duration: 11, repeat: Infinity, ease: 'linear' }}
          />

          <div className="relative rounded-card bg-card px-6 py-14 text-center sm:px-12 sm:py-16">
            <Reveal scale y={18}>
              <h2 className="text-title">Buat invoice pertama kamu sekarang</h2>
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
                Buat invoice gratis
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
