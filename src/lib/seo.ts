/**
 * The one place metadata is decided.
 *
 * Every page in the app goes through `Layout.astro`, so putting the rules here
 * means a route cannot ship a title, a canonical, or an index directive that
 * the rest of the site disagrees with. Nothing in this module touches the DOM
 * or the framework — it is pure string work over a pathname, which is why the
 * sitemap script and the layout can both reason about the same policy.
 */

/** Canonical origin. The site is a single host; every absolute URL is built from it. */
export const SITE_URL = 'https://notain.pages.dev';

export const SITE_NAME = 'Notain';

export const DEFAULT_TITLE = 'Notain | Bikin nota. Kirim. Selesai.';

export const DEFAULT_DESCRIPTION =
  'Notain membantu UMKM membuat nota dan invoice dalam hitungan detik.';

/** Square logo used as the social card thumbnail (500×500 PNG). */
export const SOCIAL_IMAGE = '/notain-remove-bg.png';

/**
 * The routes a crawler may index — an **allowlist**, not a denylist.
 *
 * Every page behind a session, a payment, or a customer capability link falls
 * off this list automatically, so a new app route is `noindex` until someone
 * deliberately publishes it. That is the direction of safety this product
 * needs: invoice, customer and account screens must never reach an index.
 *
 * Paths are compared as built, i.e. with the trailing slash the static build
 * emits (`/pricing/`), and the root is `/`.
 */
const INDEXABLE_ROUTES = new Set([
  '/',
  '/blog/',
  '/contact/',
  '/developers/',
  '/login/',
  '/register/',
  '/pricing/',
  '/privacy/',
  '/terms/',
]);

/**
 * Normalises a request path to what the static build actually serves: query
 * and hash dropped, a trailing slash added to every path but the root.
 */
export function normalizePath(pathname: string): string {
  const clean = pathname.split(/[?#]/)[0] ?? '/';
  if (clean === '' || clean === '/') return '/';
  return clean.endsWith('/') ? clean : `${clean}/`;
}

/** Whether this URL belongs in the index and the sitemap. */
export function isIndexable(pathname: string): boolean {
  return INDEXABLE_ROUTES.has(normalizePath(pathname));
}

export type PageMeta = {
  title: string;
  description: string;
  /** Absolute, normalized. Only emitted for indexable pages. */
  canonical?: string;
  robots: string;
  indexable: boolean;
  ogType: 'website';
};

/**
 * Metadata for one page. `title`/`description` fall back to the site defaults
 * so no route can render an empty `<title>` or description.
 */
export function pageMeta(input: {
  pathname: string;
  title?: string;
  description?: string;
}): PageMeta {
  const path = normalizePath(input.pathname);
  const indexable = INDEXABLE_ROUTES.has(path);
  const title = input.title?.trim() || DEFAULT_TITLE;
  const description = input.description?.trim() || DEFAULT_DESCRIPTION;
  return {
    title,
    description,
    canonical: indexable ? `${SITE_URL}${path}` : undefined,
    robots: indexable ? 'index, follow' : 'noindex, nofollow',
    indexable,
    ogType: 'website',
  };
}
