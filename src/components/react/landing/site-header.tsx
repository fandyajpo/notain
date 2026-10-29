import { AnimatePresence, motion, useScroll, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Menu, X } from 'lucide-react';
import { EASE } from './reveal';
import { isActiveSiteLink, SITE_NAV_VISIBILITY, siteNavLinks } from '../../../lib/site-nav';

const NAV_LINK_BASE = 'relative px-3 py-2 text-sm transition-colors focus-ring';

const MOBILE_LINK_BASE = 'block rounded-control px-3 py-2.5 text-base transition-colors focus-ring';

/** Header link whose underline wipes in from the left on hover. */
function NavLink({
  href,
  active = false,
  children,
  className = '',
}: {
  href: string;
  /** Current page: stays underlined and bolder instead of waiting for hover. */
  active?: boolean;
  children: string;
  className?: string;
}) {
  return (
    <motion.a
      href={href}
      className={[
        NAV_LINK_BASE,
        active ? 'font-medium text-foreground' : 'text-muted hover:text-foreground',
        className,
      ].join(' ')}
      aria-current={active ? 'page' : undefined}
      initial="rest"
      animate="rest"
      whileHover="hover"
      variants={{ rest: {}, hover: {} }}
    >
      {children}
      <motion.span
        aria-hidden="true"
        className="absolute inset-x-3 -bottom-0.5 h-px bg-foreground"
        style={{ originX: 0 }}
        variants={{ rest: { scaleX: active ? 1 : 0 }, hover: { scaleX: 1 } }}
        transition={{ duration: 0.3, ease: EASE }}
      />
    </motion.a>
  );
}

/** Re-render on soft navigations (ClientRouter) as well as back/forward. */
function subscribeToPathname(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  document.addEventListener('astro:page-load', onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    document.removeEventListener('astro:page-load', onChange);
  };
}

type Props = {
  /** Prefix for on-page anchors: `''` on the landing page, `'/'` anywhere else. */
  anchorPrefix?: string;
};

/**
 * Sticky marketing header: transparent over the hero, then flips to the page
 * background once scrolled past 16px.
 */
export function SiteHeader({ anchorPrefix = '' }: Props) {
  const { scrollY } = useScroll();
  // Server snapshot is '' (no link active) so hydration matches the prerender;
  // the client snapshot lights the current page right after, and `astro:page-load`
  // keeps it right across soft navigations.
  const pathname = useSyncExternalStore(
    subscribeToPathname,
    () => window.location.pathname,
    () => '',
  );

  // Drives the header's scrolled state as pure motion values: no React
  // re-render per scroll frame, and no backdrop-blur (which forces the
  // compositor to re-blur everything under the sticky header while scrolling).
  // A spring smooths the flip past 16px the way the old CSS transition did.
  // Color literals mirror the --color-background / --color-border /
  // --shadow-card tokens in global.css (motion can't interpolate var()).
  const scrolledRaw = useTransform(scrollY, (latest): number => (latest > 16 ? 1 : 0));
  const scrolled = useSpring(scrolledRaw, { stiffness: 220, damping: 30 });
  const headerBg = useTransform(scrolled, [0, 1], ['rgb(0 0 0 / 0)', '#f8f8f6']);
  const headerBorder = useTransform(scrolled, [0, 1], ['rgb(0 0 0 / 0)', '#e5e5e5']);
  const headerShadow = useTransform(
    scrolled,
    [0, 1],
    ['0 0 0 0 rgb(0 0 0 / 0)', '0 1px 2px 0 rgb(23 23 23 / 0.04)'],
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  // Lock background scroll while the mobile drawer is open, and close on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // The open drawer is the focused surface: land on its first link, and hand
  // focus back to the hamburger when it closes. (`wasOpen` never steals
  // focus on the initial page mount.)
  const wasOpen = useRef(false);
  useEffect(() => {
    if (menuOpen) {
      wasOpen.current = true;
      firstLinkRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      menuButtonRef.current?.focus();
    }
  }, [menuOpen]);

  // One list for both breakpoints, shared with the static Astro twin on the
  // content pages (see components/ui/SiteHeader.astro): mobile shows every
  // entry, desktop hides the ones below its viewport.
  const links = siteNavLinks(anchorPrefix);

  return (
    <>
      {/* `initial={false}`: the sticky header is part of the first paint, so
          it must not wait for hydration to slide in. */}
      <motion.header
        initial={false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
        style={{
          backgroundColor: headerBg,
          borderColor: headerBorder,
          boxShadow: headerShadow,
        }}
        className="sticky top-0 z-40 border-b"
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <motion.a
            href="/"
            whileHover={{ y: -1 }}
            whileTap={{ y: 0, scale: 0.96 }}
            className="flex items-center gap-2 font-semibold tracking-tight focus-ring rounded-control"
          >
            <motion.img
              src="/notain-remove-bg.png"
              alt=""
              width={28}
              height={28}
              className="size-7 rounded-control"
              whileHover={{ rotate: -10, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 16 }}
            />
            Notain
          </motion.a>

          <nav className="hidden items-center gap-1 sm:flex sm:gap-2">
            {links.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                active={isActiveSiteLink(pathname, link.href)}
                className={SITE_NAV_VISIBILITY[link.show]}
              >
                {link.label}
              </NavLink>
            ))}

            <motion.a
              href="/register"
              whileHover={{ y: -1, scale: 1.03 }}
              whileTap={{ y: 0, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="ml-1 inline-flex h-9 items-center rounded-control bg-accent px-3 text-sm font-medium text-accent-foreground shadow-accent focus-ring"
            >
              Buat invoice gratis
            </motion.a>
          </nav>

          {/* Mobile: hamburger toggles an animated drawer with every nav item. */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
            className="inline-flex items-center justify-center rounded-control p-2 text-foreground transition-colors hover:bg-accent-soft focus-ring sm:hidden"
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {menuOpen && (
            <motion.div
              id="mobile-nav"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="overflow-hidden border-t border-border bg-card sm:hidden"
            >
              <div className="flex flex-col gap-0.5 px-4 py-3">
                {links.map((link, index) => {
                  const active = isActiveSiteLink(pathname, link.href);
                  return (
                    <a
                      key={link.href}
                      ref={index === 0 ? firstLinkRef : undefined}
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        MOBILE_LINK_BASE,
                        active
                          ? 'bg-accent-soft font-medium text-accent'
                          : 'text-foreground hover:bg-accent-soft',
                      ].join(' ')}
                    >
                      {link.label}
                    </a>
                  );
                })}
                <a
                  href="/register"
                  onClick={() => setMenuOpen(false)}
                  className="mt-2 inline-flex h-11 items-center justify-center rounded-control bg-accent px-4 text-base font-medium text-accent-foreground focus-ring"
                >
                  Buat invoice gratis
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* Blur veil behind the drawer: keeps the navbar as the clear focal
          surface and doubles as the "click outside" target. Sits below the
          header (z-40) so only the page gets blurred, never the menu. */}
      <AnimatePresence initial={false}>
        {menuOpen && (
          <motion.div
            key="nav-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-background/50 backdrop-blur-sm sm:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
