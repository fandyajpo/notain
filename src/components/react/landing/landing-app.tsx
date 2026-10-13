import { motion, MotionConfig, useScroll, useSpring, useTransform } from 'motion/react';
import { Hero } from './hero';
import { AudienceMarquee } from './audience-marquee';
import { WorkflowSteps } from './workflow-steps';
import { WhatsAppSection } from './whatsapp-section';
import { BenefitsBand } from './benefits-band';
import { ExcelSection } from './excel-section';
import { FaqSection } from './faq-section';
import { FinaleCta } from './finale-cta';
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

export function LandingApp() {
  const { scrollY, scrollYProgress } = useScroll();

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
              <motion.span
                className="flex size-7 items-center justify-center rounded-lg bg-accent text-sm text-accent-foreground"
                whileHover={{ rotate: -10, scale: 1.1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 16 }}
              >
                N
              </motion.span>
              Notain
            </motion.a>

            <nav className="flex items-center gap-1 sm:gap-2">
              <NavLink href="#cara-kerja" className="hidden sm:block">
                Cara kerja
              </NavLink>
              <NavLink href="#whatsapp" className="hidden sm:block">
                WhatsApp
              </NavLink>
              <NavLink href="#kenapa">Kenapa Notain</NavLink>
              <NavLink href="#faq" className="hidden md:block">
                FAQ
              </NavLink>
              <NavLink href="/login">Masuk</NavLink>

              <motion.a
                href="/register"
                whileHover={{ y: -1, scale: 1.03 }}
                whileTap={{ y: 0, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                className="ml-1 inline-flex h-9 items-center rounded-control bg-accent px-3 text-sm font-medium text-accent-foreground shadow-[0_8px_20px_-12px_rgb(22_163_74_/_0.9)] focus-ring"
              >
                Buat Invoice Gratis
              </motion.a>
            </nav>
          </div>
        </motion.header>

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

        <footer className="border-t border-border bg-card">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8">
            <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
              <div className="max-w-xs">
                <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-sm text-accent-foreground">
                    N
                  </span>
                  Notain
                </a>
                <p className="mt-3 text-sm text-muted">
                  Bikin invoice profesional, download PDF-nya, kirim lewat WhatsApp. Selesai.
                </p>
              </div>

              <nav className="grid grid-cols-2 gap-x-12 gap-y-6 text-sm sm:gap-x-16">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Produk</p>
                  <ul className="mt-3 space-y-2.5">
                    <li>
                      <a href="#cara-kerja" className="text-muted hover:text-foreground">
                        Cara kerja
                      </a>
                    </li>
                    <li>
                      <a href="#whatsapp" className="text-muted hover:text-foreground">
                        Kirim ke WhatsApp
                      </a>
                    </li>
                    <li>
                      <a href="#kenapa" className="text-muted hover:text-foreground">
                        Kenapa Notain
                      </a>
                    </li>
                    <li>
                      <a href="#faq" className="text-muted hover:text-foreground">
                        FAQ
                      </a>
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Akun</p>
                  <ul className="mt-3 space-y-2.5">
                    <li>
                      <a href="/login" className="text-muted hover:text-foreground">
                        Masuk
                      </a>
                    </li>
                    <li>
                      <a href="/register" className="text-muted hover:text-foreground">
                        Daftar gratis
                      </a>
                    </li>
                  </ul>
                </div>
              </nav>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
              <p>© 2026 Notain. Dibuat untuk UMKM Indonesia.</p>
              <p>Invoice kamu tersimpan aman di akun Notain.</p>
            </div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
