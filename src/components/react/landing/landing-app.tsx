import { motion, MotionConfig, useScroll, useSpring } from 'motion/react';
import { Hero } from './hero';
import { AudienceMarquee } from './audience-marquee';
import { WorkflowSteps } from './workflow-steps';
import { WhatsAppSection } from './whatsapp-section';
import { BenefitsBand } from './benefits-band';
import { ExcelSection } from './excel-section';
import { FaqSection } from './faq-section';
import { FinaleCta } from './finale-cta';
import { SiteHeader } from './site-header';
import { SiteFooter } from './site-footer';

export function LandingApp() {
  const { scrollYProgress } = useScroll();

  const progress = useSpring(scrollYProgress, { stiffness: 150, damping: 30, mass: 0.3 });

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-clip">
        {/* Page-wide dot texture; fixed so content slides over it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 texture-dots [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
        />

        <motion.div
          aria-hidden="true"
          style={{ scaleX: progress }}
          className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent will-change-transform"
        />

        <SiteHeader />

        <main>
          <section className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <Hero
              ctaHref="/register"
              ctaLabel="Buat Invoice Gratis"
              secondaryHref="#cara-kerja"
              secondaryLabel="Lihat cara kerjanya"
            />
          </section>

          <AudienceMarquee />

          <WorkflowSteps />

          <WhatsAppSection />

          <BenefitsBand />

          <ExcelSection />

          <FaqSection />

          <FinaleCta />
        </main>

        <SiteFooter />
      </div>
    </MotionConfig>
  );
}
