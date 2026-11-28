import { MotionConfig } from 'motion/react';
import { AudienceMarquee } from './audience-marquee';
import { FeatureList, HowItWorks, LiveCalculator, SendDemo, TrackDemo } from './sections';
import { PricingPreview } from './pricing-preview';
import { FaqSection } from './faq-section';
import { SupportSection } from './support-section';
import { FinaleCta } from './finale-cta';
import { IslandBoundary } from '../ui/island-boundary';

/**
 * The sections below the hero, each one the product doing its own job: the
 * three steps, a calculator that answers a tap, the WhatsApp message that types
 * itself, the status stamp you set, and the feature list on a rule.
 *
 * This island mounts with `client:visible` (see `index.astro`), so its chunk is
 * only fetched as the reader scrolls toward it.
 */
export function LandingRest() {
  return (
    <IslandBoundary>
      <MotionConfig reducedMotion="user">
        <AudienceMarquee />

        <HowItWorks />

        <LiveCalculator />

        <SendDemo />

        <TrackDemo />

        <FeatureList />

        <PricingPreview />

        <FaqSection />

        <SupportSection />

        <FinaleCta />
      </MotionConfig>
    </IslandBoundary>
  );
}
