import { MotionConfig, motion, useScroll, useSpring } from 'motion/react';
import type { ReactNode } from 'react';
import { SiteHeader } from './site-header';
import { Hero } from './hero';
import { IslandBoundary } from '../ui/island-boundary';

type Props = {
  /**
   * The below-the-fold sections, passed in from `index.astro` as a nested
   * `client:visible` island. Keeping them as children (instead of imports)
   * is what lets their chunk stay off the initial load.
   */
  children?: ReactNode;
};

/**
 * Everything the first viewport needs: the scroll-progress bar, the sticky
 * header, and the hero. Hydrates immediately (`client:load`) because the
 * header's scrolled state and the progress bar react from the first frame.
 *
 * The page-wide dot texture stays in `index.astro`, since it is pure HTML and
 * belongs to the wrapper both islands share.
 */
export function LandingTop({ children }: Props) {
  const { scrollYProgress } = useScroll();

  const progress = useSpring(scrollYProgress, { stiffness: 150, damping: 30, mass: 0.3 });

  return (
    <IslandBoundary>
      <MotionConfig reducedMotion="user">
        <motion.div
          aria-hidden="true"
          style={{ scaleX: progress }}
          className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent will-change-transform"
        />

        <SiteHeader />

        <main id="konten" tabIndex={-1}>
          <section className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <Hero
              ctaHref="/register"
              ctaLabel="Buat invoice gratis"
              secondaryHref="#fitur"
              secondaryLabel="Lihat fiturnya"
            />
          </section>

          {children}
        </main>
      </MotionConfig>
    </IslandBoundary>
  );
}
