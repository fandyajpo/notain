import { ArrowRight, UtensilsCrossed } from 'lucide-react';
import { INDUSTRY_LABELS } from '../../../../core/site/industries';
import type { PublicSiteItem } from '../../../../app/public-site';
import {
  CONTACT_FOR_PRICE,
  SiteFooter,
  SiteFrame,
  SiteLogo,
  contactRows,
  formatItemPrice,
  splitItems,
  whatsappHref,
  type SitePalette,
  type SiteTemplateProps,
} from '../site-shared';

/**
 * Katering — warm cream canvas, forest-green accent, serif headings, menu
 * rows with dotted leaders. The list reads like a printed menu card; contact
 * is a quiet band underneath.
 */
const PALETTE: SitePalette = {
  bg: '#fbf7ef',
  surface: '#ffffff',
  ink: '#1f2a1e',
  muted: '#6b7a66',
  line: '#e3dcc9',
  accent: '#2f6b3f',
  accentInk: '#ffffff',
};

const CTA =
  'inline-flex items-center gap-2 rounded-full bg-[var(--site-accent)] px-6 py-3 text-sm font-semibold text-[color:var(--site-accent-ink)] transition hover:opacity-90';

/** One menu course inside the printed-menu card: names left, prices right. */
function MenuBlock({ title, names }: { title: string; names: PublicSiteItem[] }) {
  return (
    <div className="mt-8 first:mt-6">
      <p className="text-center text-xs font-semibold tracking-[0.22em] text-[color:var(--site-accent)] uppercase">
        {title}
      </p>
      <ul className="mt-3">
        {names.map((item) => {
          const price = formatItemPrice(item);
          return (
            <li
              key={item.name}
              className="flex items-baseline gap-2 border-b border-dotted border-[color:var(--site-line)] py-3 last:border-0"
            >
              <span className="font-medium">{item.name}</span>
              {price?.per && (
                <span className="text-sm text-[color:var(--site-muted)]">/ {price.per}</span>
              )}
              <span
                aria-hidden="true"
                className="mx-1 min-w-6 flex-1 self-center border-b border-dotted border-[color:var(--site-line)]"
              />
              <span className="shrink-0 font-serif font-semibold">
                {price?.price ?? CONTACT_FOR_PRICE}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function CateringTemplate({ site, items }: SiteTemplateProps) {
  const wa = whatsappHref(site);
  const hasList = items.length > 0;
  const { products, services } = splitItems(items);
  const rows = contactRows(site);

  return (
    <SiteFrame palette={PALETTE}>
      <header className="border-b border-[color:var(--site-line)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <SiteLogo site={site} className="h-10 w-10" />
            <span className="truncate font-serif text-lg font-semibold">{site.businessName}</span>
          </div>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={`${CTA} shrink-0`}>
              Pesan
            </a>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 py-14 sm:py-20 md:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-[color:var(--site-accent)] uppercase">
            {INDUSTRY_LABELS.catering}
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">
            {site.businessName}
          </h1>
          <p className="mt-4 max-w-md text-[color:var(--site-muted)]">
            Pesan langsung lewat WhatsApp{hasList ? ', dan lihat daftarnya di bawah.' : '.'}
          </p>
          {wa && (
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
                Hubungi &amp; pesan <ArrowRight size={16} aria-hidden="true" />
              </a>
              {hasList && (
                <a
                  href="#daftar"
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--site-line)] px-6 py-3 text-sm font-semibold transition hover:bg-[var(--site-surface)]"
                >
                  Lihat daftar
                </a>
              )}
            </div>
          )}
        </div>
        <div className="relative justify-self-center">
          <span
            aria-hidden="true"
            className="absolute -inset-4 rounded-full border border-[color:var(--site-line)]"
          />
          <span
            aria-hidden="true"
            className="absolute -inset-8 rounded-full border border-dotted border-[color:var(--site-line)]"
          />
          <div className="flex h-44 w-44 items-center justify-center rounded-full bg-[var(--site-surface)] shadow-lg sm:h-52 sm:w-52">
            <SiteLogo site={site} className="h-32 w-32 sm:h-36 sm:w-36" />
          </div>
          <UtensilsCrossed
            size={20}
            className="absolute -right-2 -bottom-2 text-[color:var(--site-accent)]"
            aria-hidden="true"
          />
        </div>
      </section>
      {hasList && (
        <section id="daftar" className="mx-auto max-w-5xl px-5 pb-16">
          <div className="rounded-3xl border border-[color:var(--site-line)] bg-[var(--site-surface)] p-6 shadow-md sm:p-10">
            <div className="flex items-center justify-center gap-3">
              <span aria-hidden="true" className="h-px w-8 bg-[color:var(--site-line)]" />
              <h2 className="text-center font-serif text-2xl sm:text-3xl">Daftar Menu</h2>
              <span aria-hidden="true" className="h-px w-8 bg-[color:var(--site-line)]" />
            </div>

            {services.length > 0 && <MenuBlock title="Layanan" names={services} />}
            {products.length > 0 && <MenuBlock title="Produk" names={products} />}
          </div>
        </section>
      )}

      <section className="border-t border-[color:var(--site-line)] bg-[var(--site-surface)]">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 py-12 sm:grid-cols-2 sm:py-14">
          <div>
            <h2 className="font-serif text-2xl">Hubungi kami</h2>
            {rows.length > 0 ? (
              <ul className="mt-4 space-y-3 text-sm">
                {rows.map((row) => {
                  const Icon = row.icon;
                  const body = (
                    <>
                      <Icon
                        size={16}
                        className="mt-0.5 shrink-0 text-[color:var(--site-accent)]"
                        aria-hidden="true"
                      />
                      <span className="break-words">{row.text}</span>
                    </>
                  );
                  return (
                    <li key={row.text} className="flex gap-3">
                      {row.href ? (
                        <a
                          href={row.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {body}
                        </a>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[color:var(--site-muted)]">
                Belum ada kontak yang dipublikasikan.
              </p>
            )}
          </div>
          <div className="flex items-center sm:justify-end">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
                Pesan via WhatsApp <ArrowRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </section>

      <SiteFooter site={site} />
    </SiteFrame>
  );
}
