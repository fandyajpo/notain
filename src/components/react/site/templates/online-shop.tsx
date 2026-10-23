import { MessageCircle, ShoppingBag } from 'lucide-react';
import { INDUSTRY_LABELS } from '../../../../core/site/industries';
import {
  CONTACT_FOR_PRICE,
  EmptyListNote,
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
 * Online Shop — white retail canvas, blue accent, product-card grid with a
 * per-item WhatsApp ask. An announcement strip up top states the channel
 * (WhatsApp) the store actually sells through; nothing about shipping or
 * stock is claimed, because the profile does not store it.
 */
const PALETTE: SitePalette = {
  bg: '#ffffff',
  surface: '#f7f9fc',
  ink: '#0e1726',
  muted: '#5b6b80',
  line: '#e3e9f2',
  accent: '#1f6feb',
  accentInk: '#ffffff',
};

const CTA =
  'inline-flex items-center gap-2 rounded-full bg-[var(--site-accent)] px-6 py-3 text-sm font-semibold text-[color:var(--site-accent-ink)] transition hover:opacity-90';

export default function OnlineShopTemplate({ site, items }: SiteTemplateProps) {
  const wa = whatsappHref(site);
  const hasList = items.length > 0;
  const { products, services } = splitItems(items);
  const rows = contactRows(site);

  return (
    <SiteFrame palette={PALETTE}>
      {wa && (
        <div className="bg-[var(--site-accent)] px-5 py-2 text-center text-xs font-medium text-[color:var(--site-accent-ink)]">
          Pemesanan lewat WhatsApp
        </div>
      )}
      <header className="border-b border-[color:var(--site-line)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <SiteLogo site={site} className="h-10 w-10" />
            <span className="truncate font-semibold">{site.businessName}</span>
          </div>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={`${CTA} shrink-0`}>
              <MessageCircle size={16} aria-hidden="true" /> Chat
            </a>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 py-14 sm:py-16 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[color:var(--site-accent)] uppercase">
            {INDUSTRY_LABELS['online-shop']}
          </p>
          <h1 className="mt-3 text-4xl leading-tight font-bold tracking-tight break-words sm:text-5xl">
            {site.businessName}
          </h1>
          <p className="mt-4 max-w-md text-[color:var(--site-muted)]">
            {hasList
              ? 'Produk dan layanan yang tersedia — tanyakan stok dan pemesanan lewat WhatsApp.'
              : 'Tanyakan ketersediaan lewat WhatsApp.'}
          </p>
          {wa && (
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
                <ShoppingBag size={16} aria-hidden="true" /> Belanja via WhatsApp
              </a>
              {hasList && (
                <a
                  href="#produk"
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--site-line)] px-6 py-3 text-sm font-semibold transition hover:bg-[var(--site-surface)]"
                >
                  Lihat produk
                </a>
              )}
            </div>
          )}
        </div>
        <div className="rounded-3xl border border-[color:var(--site-line)] bg-[var(--site-surface)] p-8 justify-self-center md:justify-self-end">
          <SiteLogo site={site} className="h-32 w-32 sm:h-40 sm:w-40" />
        </div>
      </section>
      {hasList ? (
        <section id="produk" className="mx-auto max-w-5xl px-5 py-14 sm:py-16">
          {products.length > 0 && (
            <>
              <h2 className="text-2xl font-bold">Produk</h2>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((item) => (
                  <li
                    key={item.name}
                    className="flex flex-col rounded-2xl border border-[color:var(--site-line)] bg-[var(--site-surface)] p-5"
                  >
                    <span className="text-base font-semibold">{item.name}</span>
                    <span className="mt-3 flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-[color:var(--site-accent)]">
                        {formatItemPrice(item)?.price ?? CONTACT_FOR_PRICE}
                      </span>
                      {formatItemPrice(item)?.per && (
                        <span className="text-xs text-[color:var(--site-muted)]">
                          / {formatItemPrice(item)?.per}
                        </span>
                      )}
                    </span>
                    {wa && (
                      <a
                        href={
                          whatsappHref(
                            site,
                            `Halo ${site.businessName} 👋, saya mau tanya tentang ${item.name}.`,
                          ) ?? undefined
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--site-line)] bg-[var(--site-bg)] px-4 py-2 text-xs font-semibold transition hover:border-[color:var(--site-accent)] hover:text-[color:var(--site-accent)]"
                      >
                        <MessageCircle size={14} aria-hidden="true" /> Tanya produk ini
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {services.length > 0 && (
            <div className={products.length > 0 ? 'mt-12' : ''}>
              <h2 className="text-2xl font-bold">Layanan</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {services.map((item) => {
                  const price = formatItemPrice(item);
                  return (
                    <li
                      key={item.name}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--site-line)] px-4 py-3"
                    >
                      <span className="truncate font-medium">{item.name}</span>
                      <span className="shrink-0 text-sm font-bold text-[color:var(--site-accent)]">
                        {price?.price ?? CONTACT_FOR_PRICE}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <section id="produk" className="mx-auto max-w-5xl px-5 py-14">
          <div className="rounded-2xl border border-dashed border-[color:var(--site-line)] p-6">
            <EmptyListNote />
          </div>
        </section>
      )}

      <section className="border-t border-[color:var(--site-line)] bg-[var(--site-surface)]">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 py-12 sm:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold">Kontak</h2>
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
                <MessageCircle size={16} aria-hidden="true" /> Chat sekarang
              </a>
            )}
          </div>
        </div>
      </section>

      <SiteFooter site={site} />
    </SiteFrame>
  );
}
