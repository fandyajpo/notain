import { MotionConfig } from 'motion/react';
import { Audience } from './audience';
import { Bench, FeatureList, HowItWorks } from './sections';
import { PricingPreview } from './pricing-preview';
import { FaqSection } from './faq-section';
import { SupportSection } from './support-section';
import { FinaleCta } from './finale-cta';
import { IslandBoundary } from '../ui/island-boundary';

/**
 * The page below the hero, in reading order: who it is for, the three steps,
 * the bench where the same nota is counted, sent and stamped, what already
 * works, the price list, the questions, the form, and one last way in.
 *
 * Seven sections instead of ten, each on the same hairline rhythm, so the whole
 * sheet can be read in about half the scroll it used to take.
 *
 * This island mounts with `client:visible` (see `index.astro`), so its chunk is
 * only fetched as the reader scrolls toward it.
 */
export function LandingRest() {
  return (
    <IslandBoundary>
      <MotionConfig reducedMotion="user">
        <Audience />

        <HowItWorks />

        <Bench />

        <FeatureList />

        <PricingPreview />

        <FaqSection />

        <SupportSection />

        <FinaleCta />
      </MotionConfig>
    </IslandBoundary>
  );
}
