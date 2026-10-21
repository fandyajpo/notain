import { motion, MotionConfig, useScroll, useSpring } from 'motion/react';
import type { ReactNode } from 'react';
import { SiteHeader } from './site-header';

/**
 * The eager half of `/pricing`: scroll progress, header, and the landmark that
 * holds the page.
 *
 * Mirrors `landing-top.tsx`. The progress bar and the backdrop have to respond
 * to scroll from the first frame, so this island mounts on load — while the
 * plans and the closing CTA arrive as `client:visible` children and the footer
 * stays a sibling island, keeping the content out of the initial hydration.
 * The dot texture and the page wrapper are plain HTML in `pricing.astro`.
 */
export function PricingTop({ children }: { children: ReactNode }) {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 150, damping: 30, mass: 0.3 });

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        aria-hidden="true"
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent will-change-transform"
      />

      <SiteHeader anchorPrefix="/" />

      <main id="konten" tabIndex={-1}>{children}</main>
    </MotionConfig>
  );
}
