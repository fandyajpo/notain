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
  const target = href.split(/[?#]/)[0] ?? href;
  if (!target.startsWith('/')) return false;
  if (target === '/') return pathname === '/';
  return pathname === target || pathname.startsWith(`${target}/`);
}
