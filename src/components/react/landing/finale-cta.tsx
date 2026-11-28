import { MotionConfig } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { MagneticButton } from './interactive';
import { MARKETING_H2, MARKETING_SECTION } from '../../../lib/ui/classes';

/**
 * The page's last word: one line, one button, on the same rule as everything
 * above it. It used to be a card with a centered stack, which cost a full
 * screen to say two sentences.
 */
export function FinaleCta() {
  return (
    <MotionConfig reducedMotion="user">
      <section className={MARKETING_SECTION}>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-14">
          <div>
            <h2 className={MARKETING_H2}>Buat nota pertamamu</h2>
            <p className="mt-1.5 text-sm text-muted">
              Gratis, tanpa kartu kredit, dan langsung jadi.
            </p>
          </div>

          <MagneticButton
            href="/register"
            className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-control bg-accent px-5 text-sm font-medium text-accent-foreground shadow-accent transition-colors hover:bg-accent/90 focus-ring"
          >
            Buat nota gratis
            <ArrowRight
              size={16}
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </MagneticButton>
        </div>
      </section>
    </MotionConfig>
  );
}
