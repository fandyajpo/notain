import { motion, MotionConfig, useScroll, useSpring } from 'motion/react';
import { SiteHeader } from './site-header';
import { SiteFooter } from './site-footer';
import { PricingPlans } from './pricing-plans';
import { FinaleCta } from './finale-cta';

/** Shell for /pricing: same chrome as the landing page (texture, progress, nav, footer). */
export function PricingApp() {
  const { scrollYProgress } = useScroll();

  const progress = useSpring(scrollYProgress, { stiffness: 150, damping: 30, mass: 0.3 });

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-clip">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 texture-dots [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
        />

        <motion.div
          aria-hidden="true"
          style={{ scaleX: progress }}
          className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent will-change-transform"
        />

        <SiteHeader anchorPrefix="/" />

        <main>
          <PricingPlans />

          <FinaleCta />
        </main>

        <SiteFooter anchorPrefix="/" />
      </div>
    </MotionConfig>
  );
}
