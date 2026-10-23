import type { CSSProperties } from 'react';
import { ArrowRight, Store } from 'lucide-react';
import type { PublicSiteItem } from '../../../../app/public-site';
import { INDUSTRY_LABELS } from '../../../../core/site/industries';
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
 * Warung & Toko Lokal — warm cream, burnt-orange accent, heavy rounded type.
 * The page opens with an awning stripe band (pure CSS) and a centered
 * storefront hero; the list is a menu board of price chips.
 */
const PALETTE: SitePalette = {
  bg: '#fff8ec',
  surface: '#ffffff',
  ink: '#3b2a1a',
  muted: '#8a6f52',
  line: '#f0e2c8',
  accent: '#d9480f',
  accentInk: '#ffffff',
};

/** The awning: diagonal accent/surface stripes, no image required. */
const AWNING: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, var(--site-accent) 0 14px, var(--site-surface) 14px 28px)',
};

const CTA =
  'inline-flex items-center gap-2 rounded-2xl bg-[var(--site-accent)] px-6 py-3 text-sm font-bold text-[color:var(--site-accent-ink)] transition hover:opacity-90';

/** One menu-board group: chunky cards, price as a filled chip. */
function BoardBlock({ title, names }: { title: string; names: PublicSiteItem[] }) {
  return (
    <div className="mt-6 first:mt-0">
      <p className="text-xs font-bold tracking-[0.2em] text-[color:var(--site-accent)] uppercase">
        {title}
      </p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {names.map((item) => {
          const price = formatItemPrice(item);
          return (
            <li
              key={item.name}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--site-line)] bg-[var(--site-bg)] px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{item.name}</span>
                {price?.per && (
                  <span className="text-xs text-[color:var(--site-muted)]">/{price.per}</span>
                )}
              </span>
              <span className="shrink-0 rounded-full bg-[var(--site-accent)] px-3 py-1 text-xs font-bold text-[color:var(--site-accent-ink)]">
                {price?.price ?? CONTACT_FOR_PRICE}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function WarungTemplate({ site, items }: SiteTemplateProps) {
  const wa = whatsappHref(site);
  const hasList = items.length > 0;
  const { products, services } = splitItems(items);
  const rows = contactRows(site);

  return (
    <SiteFrame palette={PALETTE}>
      <div aria-hidden="true" className="h-3" style={AWNING} />
      <header>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <SiteLogo site={site} className="h-10 w-10" />
            <span className="truncate text-lg font-extrabold">{site.businessName}</span>
          </div>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={`${CTA} shrink-0`}>
              Pesan
            </a>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-5 pt-10 pb-14 text-center sm:pt-14">
        <div className="mx-auto w-fit">
          <SiteLogo site={site} className="h-28 w-28 sm:h-32 sm:w-32" />
        </div>
        <p className="mt-5 inline-block rounded-full border border-[color:var(--site-line)] bg-[var(--site-surface)] px-4 py-1.5 text-xs font-bold tracking-wide text-[color:var(--site-accent)] uppercase">
          {INDUSTRY_LABELS.warung}
        </p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight break-words sm:text-5xl">
          {site.businessName}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[color:var(--site-muted)]">
          {hasList
            ? 'Lihat menu dan harganya di bawah, pesan langsung lewat WhatsApp.'
            : 'Pesan langsung lewat WhatsApp.'}
        </p>
        {wa && (
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
              <Store size={16} aria-hidden="true" /> Pesan via WhatsApp
            </a>
            {hasList && (
              <a
                href="#menu"
                className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--site-line)] bg-[var(--site-surface)] px-6 py-3 text-sm font-bold transition hover:border-[color:var(--site-accent)]"
              >
                Lihat menu <ArrowRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </section>
      {hasList && (
        <section id="menu" className="mx-auto max-w-4xl px-5 pb-14">
          <div className="overflow-hidden rounded-3xl border border-[color:var(--site-line)] bg-[var(--site-surface)] shadow-md">
            <div className="flex items-center justify-center gap-2 bg-[var(--site-accent)] px-5 py-3 text-sm font-bold tracking-wide text-[color:var(--site-accent-ink)] uppercase">
              <Store size={16} aria-hidden="true" /> Daftar Tersedia
            </div>
            <div className="p-5 sm:p-7">
              {services.length > 0 && <BoardBlock title="Jasa" names={services} />}
              {products.length > 0 && <BoardBlock title="Produk" names={products} />}
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-[color:var(--site-line)]">
        <div className="mx-auto grid max-w-4xl gap-8 px-5 py-12 sm:grid-cols-2">
          <div>
            <h2 className="text-2xl font-extrabold">Kontak &amp; Lokasi</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {rows.map((row) => {
                const Icon = row.icon;
                const body = (
                  <span className="flex gap-3">
                    <Icon size={16} className="mt-0.5 shrink-0 text-[color:var(--site-accent)]" aria-hidden="true" />
                    <span className="break-words">{row.text}</span>
                  </span>
                );
                return (
                  <li key={row.text}>
                    {row.href ? (
                      <a href={row.href} target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--site-accent)] hover:underline">
                        {body}
                      </a>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
              {rows.length === 0 && (
                <li className="text-[color:var(--site-muted)]">Belum ada kontak yang dipublikasikan.</li>
              )}
            </ul>
          </div>
          <div className="flex items-center sm:justify-end">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
                <Store size={16} aria-hidden="true" /> Chat &amp; pesan
              </a>
            )}
          </div>
        </div>
      </section>

      <SiteFooter site={site} />
    </SiteFrame>
  );
}
