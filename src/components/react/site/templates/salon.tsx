import { ArrowRight, CalendarHeart } from 'lucide-react';
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
 * Salon & Barbershop — blush canvas, rose accent, serif display type and a
 * centered, airy hero. Services render as a classic salon price list (thin
 * dotted leaders, two columns); products tuck underneath as small chips.
 */
const PALETTE: SitePalette = {
  bg: '#fbf6f4',
  surface: '#ffffff',
  ink: '#3f2a32',
  muted: '#9b7f88',
  line: '#efe0dc',
  accent: '#b3567c',
  accentInk: '#ffffff',
};

const CTA =
  'inline-flex items-center gap-2 rounded-full bg-[var(--site-accent)] px-6 py-3 text-sm font-medium text-[color:var(--site-accent-ink)] transition hover:opacity-90';

export default function SalonTemplate({ site, items }: SiteTemplateProps) {
  const wa = whatsappHref(site);
  const hasList = items.length > 0;
  const rows = contactRows(site);
  const { services, products } = splitItems(items);
  const treatments = services.length > 0 ? services : products;

  return (
    <SiteFrame palette={PALETTE}>
      <header className="border-b border-[color:var(--site-line)] bg-[var(--site-surface)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <SiteLogo site={site} className="h-10 w-10" />
            <span className="truncate font-serif text-lg">{site.businessName}</span>
          </div>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--site-accent)] px-4 py-2 text-xs font-semibold text-[color:var(--site-accent)] transition hover:bg-[var(--site-accent)] hover:text-[color:var(--site-accent-ink)]"
            >
              Booking
            </a>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-5 py-16 text-center sm:py-20">
        <span aria-hidden="true" className="mx-auto block h-10 w-px bg-[color:var(--site-accent)]" />
        <p className="mt-4 text-xs font-semibold tracking-[0.3em] text-[color:var(--site-accent)] uppercase">
          {INDUSTRY_LABELS.salon}
        </p>
        <h1 className="mt-4 font-serif text-4xl break-words sm:text-6xl">{site.businessName}</h1>
        <p className="mx-auto mt-5 max-w-md text-[color:var(--site-muted)]">
          {hasList
            ? 'Pilihan layanan dan harganya di bawah — booking jadwal lewat WhatsApp.'
            : 'Booking jadwal lewat WhatsApp.'}
        </p>
        {wa && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
              <CalendarHeart size={16} aria-hidden="true" /> Booking via WhatsApp
            </a>
            {hasList && (
              <a
                href="#daftar"
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--site-line)] bg-[var(--site-surface)] px-6 py-3 text-sm font-medium transition hover:border-[color:var(--site-accent)]"
              >
                Daftar layanan <ArrowRight size={16} aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </section>
      <section id="daftar" className="mx-auto max-w-4xl px-5 pb-16">
        <div className="rounded-[2rem] border border-[color:var(--site-line)] bg-[var(--site-surface)] p-6 sm:p-10">
          <p className="text-center text-xs font-semibold tracking-[0.3em] text-[color:var(--site-accent)] uppercase">
            Daftar Layanan
          </p>
          {hasList ? (
            <ul className="mt-6 grid gap-x-12 sm:grid-cols-2">
              {treatments.map((item) => {
                const price = formatItemPrice(item);
                return (
                  <li
                    key={item.name}
                    className="flex items-baseline gap-2 border-b border-dotted border-[color:var(--site-line)] py-3.5"
                  >
                    <span className="font-serif">{item.name}</span>
                    <span aria-hidden="true" className="min-w-4 flex-1 self-center border-b border-dotted border-[color:var(--site-line)]" />
                    <span className="shrink-0 text-sm font-semibold whitespace-nowrap">
                      {price?.price ?? CONTACT_FOR_PRICE}
                    </span>
                    {price?.per && (
                      <span className="shrink-0 text-xs text-[color:var(--site-muted)]">
                        /{price.per}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-6">
              <EmptyListNote />
            </div>
          )}

          {services.length > 0 && products.length > 0 && (
            <div className="mt-8 border-t border-[color:var(--site-line)] pt-6">
              <p className="text-xs font-semibold tracking-[0.2em] text-[color:var(--site-accent)] uppercase">
                Produk
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {products.map((item) => {
                  const price = formatItemPrice(item);
                  return (
                    <li
                      key={item.name}
                      className="rounded-full border border-[color:var(--site-line)] px-3.5 py-1.5 text-sm"
                    >
                      {item.name}
                      {price && (
                        <span className="ml-2 text-xs text-[color:var(--site-muted)]">
                          {price.price}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-[color:var(--site-line)]">
        <div className="mx-auto grid max-w-4xl gap-8 px-5 py-12 sm:grid-cols-2">
          <div>
            <h2 className="font-serif text-2xl">Kunjungi kami</h2>
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
                <CalendarHeart size={16} aria-hidden="true" /> Minta jadwal
              </a>
            )}
          </div>
        </div>
      </section>

      <SiteFooter site={site} />
    </SiteFrame>
  );
}
