import { SiteFooter } from './site-footer';

/**
 * Page footer as its own `client:visible` island: it has no motion and no
 * state, so it hydrates last and never delays the hero.
 */
export function LandingFooter() {
  return <SiteFooter />;
}
