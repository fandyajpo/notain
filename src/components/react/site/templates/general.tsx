import { ArrowRight, MessageCircle } from 'lucide-react';
import { INDUSTRY_LABELS } from '../../../../core/site/industries';
import {
  CONTACT_FOR_PRICE,
  EmptyListNote,
  SiteFooter,
  SiteFrame,
  SiteLogo,
  contactRows,
  formatItemPrice,
  subtypeLabel,
  whatsappHref,
  type SitePalette,
  type SiteTemplateProps,
} from '../site-shared';

/**
 * Umum — the fallback skin for business types outside the eight industries
 * (and for profiles with no type at all). Deliberately the most neutral:
 * the brand surface Notain already uses, one amber accent, a standard card
 * grid. Its label comes from the stored subtype when one exists, so even the
 * fallback still says what the business *is*.
 */
const PALETTE: SitePalette = {
  bg: '#f8f8f6',
  surface: '#ffffff',
  ink: '#171717',
  muted: '#6b6b6b',
  line: '#e5e5e5',
  accent: '#b45309',
  accentInk: '#ffffff',
};

const CTA =
  'inline-flex items-center gap-2 rounded-xl bg-[var(--site-accent)] px-6 py-3 text-sm font-semibold text-[color:var(--site-accent-ink)] transition hover:opacity-90';

export default function GeneralTemplate({ site, items }: SiteTemplateProps) {
  const wa = whatsappHref(site);
  const hasList = items.length > 0;
  const rows = contactRows(site);
  // The subtype's own label when one is stored, else the neutral category.
  const label = subtypeLabel(site) ?? INDUSTRY_LABELS.general;

  return (
    <SiteFrame palette={PALETTE}>
      <header className="border-b border-[color:var(--site-line)] bg-[var(--site-surface)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <SiteLogo site={site} className="h-10 w-10" />
            <span className="truncate font-semibold">{site.businessName}</span>
          </div>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={`${CTA} shrink-0`}>
              <MessageCircle size={16} aria-hidden="true" /> Hubungi
            </a>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-4xl items-center gap-8 px-5 py-14 sm:py-16 md:grid-cols-[auto_1fr]">
        <div className="rounded-3xl border border-[color:var(--site-line)] bg-[var(--site-surface)] p-6 justify-self-center md:justify-self-start">
          <SiteLogo site={site} className="h-28 w-28 sm:h-32 sm:w-32" />
        </div>
        <div className="text-center md:text-left">
          <p className="text-xs font-semibold tracking-[0.18em] text-[color:var(--site-accent)] uppercase">
            {label}
          </p>
          <h1 className="mt-3 text-4xl leading-tight font-bold tracking-tight break-words sm:text-5xl">
            {site.businessName}
          </h1>
          <p className="mt-4 text-[color:var(--site-muted)]">
            {hasList
              ? 'Daftar produk dan layanannya di bawah, hubungi untuk informasi lebih lanjut.'
              : 'Hubungi untuk informasi lebih lanjut.'}
          </p>
          {wa && (
            <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
              <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
                <MessageCircle size={16} aria-hidden="true" /> Chat WhatsApp
              </a>
              {hasList && (
                <a
                  href="#daftar"
                  className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--site-line)] bg-[var(--site-surface)] px-6 py-3 text-sm font-semibold transition hover:border-[color:var(--site-accent)]"
                >
                  Lihat daftar <ArrowRight size={16} aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>
      </section>
      <section id="daftar" className="mx-auto max-w-4xl px-5 py-14">
        <h2 className="text-xl font-bold">Daftar produk &amp; layanan</h2>
        {hasList ? (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const price = formatItemPrice(item);
              return (
                <li
                  key={item.name}
                  className="rounded-2xl border border-[color:var(--site-line)] bg-[var(--site-surface)] p-5 shadow-sm"
                >
                  <span className="text-[11px] font-semibold tracking-wider text-[color:var(--site-muted)] uppercase">
                    {item.kind === 'barang' ? 'Produk' : 'Jasa'}
                  </span>
                  <p className="mt-1.5 font-semibold">{item.name}</p>
                  <p className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-bold text-[color:var(--site-accent)]">
                      {price?.price ?? CONTACT_FOR_PRICE}
                    </span>
                    {price?.per && (
                      <span className="text-xs text-[color:var(--site-muted)]">/{price.per}</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-[color:var(--site-line)] p-6">
            <EmptyListNote />
          </div>
        )}
      </section>

      <section className="border-t border-[color:var(--site-line)] bg-[var(--site-surface)]">
        <div className="mx-auto grid max-w-4xl gap-8 px-5 py-12 sm:grid-cols-2">
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
                <MessageCircle size={16} aria-hidden="true" /> Chat WhatsApp
              </a>
            )}
          </div>
        </div>
      </section>

      <SiteFooter site={site} />
    </SiteFrame>
  );
}
