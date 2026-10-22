import { MotionConfig } from 'motion/react';
import { AudienceMarquee } from './audience-marquee';
import { ProductSection } from './product-section';
import { WorkflowSteps } from './workflow-steps';
import { WhatsAppSection } from './whatsapp-section';
import { BenefitsBand } from './benefits-band';
import { UseCases } from './use-cases';
import { ExcelSection } from './excel-section';
import { PricingPreview } from './pricing-preview';
import { FaqSection } from './faq-section';
import { SupportSection } from './support-section';
import { FinaleCta } from './finale-cta';
import { IslandBoundary } from '../ui/island-boundary';

/**
 * The sections below the hero. This island mounts with `client:visible`
 * (see `index.astro`), so its chunk (these components and their icons)
 * is only fetched as the reader scrolls toward it. Nothing here runs on
 * load: the entrance animations play through `Reveal` when they appear.
 */
export function LandingRest() {
  return (
    <IslandBoundary>
      <MotionConfig reducedMotion="user">
        <AudienceMarquee />

        <ProductSection />

        <WorkflowSteps />

        <WhatsAppSection />

        <BenefitsBand />

        <UseCases />

        <ExcelSection />

        <PricingPreview />

        <FaqSection />

        <SupportSection />

        <FinaleCta />
      </MotionConfig>
    </IslandBoundary>
  );
}
