/**
 * Whether a marketing-header link points at the page currently on show.
 *
 * Anchor links — in-page sections, with or without the homepage prefix — are
 * never active: on the homepage they are scroll targets and every one of them
 * would light up at once. Page links match exactly, or as a prefix on a
 * trailing slash so a link stays lit under a future sub-route.
 */
export function isActiveSiteLink(pathname: string, href: string): boolean {
  if (href.startsWith('#') || href.startsWith('/#')) return false;
  const target = href.split(/[?#]/)[0] ?? '';
  if (!target.startsWith('/')) return false;
  if (target === '/') return pathname === '/';
  return pathname === target || pathname.startsWith(`${target}/`);
}

/** Lowest desktop breakpoint where a marketing-header link is visible. */
export type SiteNavVisibility = 'sm' | 'md' | 'always';

export type SiteNavLink = {
  href: string;
  label: string;
  show: SiteNavVisibility;
};

/**
 * The marketing header's nav items, in one place.
 *
 * Two headers render them — the React one (`landing/site-header.tsx`) on the
 * motion-heavy landing and pricing pages, the Astro one
 * (`components/ui/SiteHeader.astro`) on static content pages, where shipping a
 * React runtime for a nav bar is the whole point of this repo being Astro.
 * Keeping the list here is what stops the two from drifting apart.
 *
 * Mobile shows every entry; desktop hides the ones below the viewport through
 * {@link SITE_NAV_VISIBILITY}.
 */
export function siteNavLinks(anchorPrefix: string): SiteNavLink[] {
  return [
    { href: `${anchorPrefix}#fitur`, label: 'Fitur', show: 'always' },
    { href: `${anchorPrefix}#cara-kerja`, label: 'Cara kerja', show: 'always' },
    { href: '/pricing', label: 'Harga', show: 'sm' },
    { href: `${anchorPrefix}#faq`, label: 'FAQ', show: 'md' },
    { href: '/login', label: 'Masuk', show: 'always' },
  ];
}

/** Class pair for each {@link SiteNavVisibility} value. */
export const SITE_NAV_VISIBILITY: Record<SiteNavVisibility, string> = {
  sm: 'hidden sm:block',
  md: 'hidden md:block',
  always: '',
};
