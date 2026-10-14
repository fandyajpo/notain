import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import { EASE } from './reveal';

const NAV_LINK =
  'relative px-3 py-2 text-sm text-muted transition-colors hover:text-foreground focus-ring';

/** Header link whose underline wipes in from the left on hover. */
function NavLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: string;
  className?: string;
}) {
  return (
    <motion.a
      href={href}
      className={`${NAV_LINK} ${className}`}
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
        variants={{ rest: { scaleX: 0 }, hover: { scaleX: 1 } }}
        transition={{ duration: 0.3, ease: EASE }}
      />
    </motion.a>
  );
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

  return (
    /* `initial={false}`: the sticky header is part of the first paint, so
       it must not wait for hydration to slide in. */
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
            className="size-7 rounded-lg"
            whileHover={{ rotate: -10, scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 16 }}
          />
          Notain
        </motion.a>

        <nav className="flex items-center gap-1 sm:gap-2">
          <NavLink href={`${anchorPrefix}#cara-kerja`} className="hidden sm:block">
            Cara kerja
          </NavLink>
          <NavLink href={`${anchorPrefix}#whatsapp`} className="hidden sm:block">
            WhatsApp
          </NavLink>
          <NavLink href={`${anchorPrefix}#kenapa`}>Kenapa Notain</NavLink>
          <NavLink href={`${anchorPrefix}#faq`} className="hidden md:block">
            FAQ
          </NavLink>
          <NavLink href="/pricing" className="hidden sm:block">
            Harga
          </NavLink>
          <NavLink href="/login">Masuk</NavLink>

          <motion.a
            href="/register"
            whileHover={{ y: -1, scale: 1.03 }}
            whileTap={{ y: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="ml-1 inline-flex h-9 items-center rounded-control bg-accent px-3 text-sm font-medium text-accent-foreground shadow-[0_8px_20px_-12px_rgb(37_99_235_/_0.9)] focus-ring"
          >
            Buat Invoice Gratis
          </motion.a>
        </nav>
      </div>
    </motion.header>
  );
}
