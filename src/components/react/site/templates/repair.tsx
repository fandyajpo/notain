import { ArrowRight, Wrench } from 'lucide-react';
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
 * Jasa Servis & Reparasi — workshop-dark: charcoal canvas, amber safety
 * accent, uppercase headings, service rows styled as job tickets with a
 * left accent rail and mono prices.
 */
const PALETTE: SitePalette = {
  bg: '#17181c',
  surface: '#1f2127',
  ink: '#f2f2f2',
  muted: '#9aa0a8',
  line: '#2c2f36',
  accent: '#f5b301',
  accentInk: '#1a1400',
};

const CTA =
  'inline-flex items-center gap-2 bg-[var(--site-accent)] px-6 py-3.5 text-sm font-bold tracking-wide text-[color:var(--site-accent-ink)] uppercase transition hover:opacity-90';

export default function RepairTemplate({ site, items }: SiteTemplateProps) {
  const wa = whatsappHref(site);
  const hasList = items.length > 0;
  const rows = contactRows(site);
  const { services, products } = splitItems(items);
  const jobs = [...services, ...products];

  return (
    <SiteFrame palette={PALETTE}>
      <header className="border-b border-[color:var(--site-line)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <SiteLogo site={site} className="h-10 w-10" />
            <span className="truncate text-sm font-bold tracking-wide uppercase">
              {site.businessName}
            </span>
          </div>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={`${CTA} shrink-0`}>
              Tanya
            </a>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-4xl items-center gap-10 px-5 py-14 sm:py-20 md:grid-cols-[1.3fr_auto]">
        <div>
          <p className="inline-block bg-[var(--site-accent)] px-3 py-1 text-xs font-bold tracking-widest text-[color:var(--site-accent-ink)] uppercase">
            {INDUSTRY_LABELS.repair}
          </p>
          <h1 className="mt-5 text-4xl leading-[1.05] font-black tracking-tight break-words uppercase sm:text-6xl">
            {site.businessName}
          </h1>
          <p className="mt-4 max-w-md text-sm text-[color:var(--site-muted)]">
            {hasList
              ? 'Daftar jasa dan tarifnya di bawah. Konsultasi dulu lewat WhatsApp.'
              : 'Konsultasi dulu lewat WhatsApp.'}
          </p>
          {wa && (
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
                <Wrench size={16} aria-hidden="true" /> Servis sekarang
              </a>
              {hasList && (
                <a
                  href="#daftar"
                  className="inline-flex items-center gap-2 border border-[color:var(--site-line)] px-6 py-3.5 text-sm font-bold uppercase transition hover:border-[color:var(--site-accent)]"
                >
                  Lihat daftar <ArrowRight size={16} aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>
        <div
          aria-hidden="true"
          className="hidden h-40 w-40 items-center justify-center bg-[var(--site-accent)] text-[color:var(--site-accent-ink)] md:flex"
        >
          <Wrench size={72} strokeWidth={1.5} />
        </div>
      </section>
      <section id="daftar" className="mx-auto max-w-4xl px-5 py-14">
        <h2 className="text-xl font-bold tracking-wide uppercase">Daftar jasa &amp; tarif</h2>
        {hasList ? (
          <ul className="mt-5 space-y-3">
            {jobs.map((item) => {
              const price = formatItemPrice(item);
              return (
                <li
                  key={item.name}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-l-4 border-[color:var(--site-accent)] bg-[var(--site-surface)] px-4 py-3.5 sm:px-5"
                >
                  <span className="flex min-w-0 items-baseline gap-3">
                    <span className="font-semibold">{item.name}</span>
                    <span className="font-mono text-[10px] tracking-widest text-[color:var(--site-muted)] uppercase">
                      {item.kind === 'barang' ? 'produk' : 'jasa'}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-2 font-mono text-sm">
                    <span className="font-bold text-[color:var(--site-accent)]">
                      {price?.price ?? CONTACT_FOR_PRICE}
                    </span>
                    {price?.per && (
                      <span className="text-[color:var(--site-muted)]">/ {price.per}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-5 border-l-4 border-dashed border-[color:var(--site-line)] bg-[var(--site-surface)] p-5">
            <EmptyListNote />
          </div>
        )}
      </section>

      <section className="border-t border-[color:var(--site-line)]">
        <div className="mx-auto max-w-4xl px-5 py-12">
          <h2 className="text-xl font-bold tracking-wide uppercase">Kontak</h2>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {rows.map((row) => {
              const Icon = row.icon;
              const body = (
                <span className="flex items-center gap-2">
                  <Icon
                    size={15}
                    className="shrink-0 text-[color:var(--site-accent)]"
                    aria-hidden="true"
                  />
                  <span className="break-words">{row.text}</span>
                </span>
              );
              return (
                <span
                  key={row.text}
                  className="rounded-sm border border-[color:var(--site-line)] bg-[var(--site-surface)] px-3.5 py-2 text-sm"
                >
                  {row.href ? (
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[color:var(--site-accent)]"
                    >
                      {body}
                    </a>
                  ) : (
                    body
                  )}
                </span>
              );
            })}
            {rows.length === 0 && (
              <span className="text-sm text-[color:var(--site-muted)]">
                Belum ada kontak yang dipublikasikan.
              </span>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
                <Wrench size={16} aria-hidden="true" /> Servis sekarang
              </a>
            )}
          </div>
        </div>
      </section>

      <SiteFooter site={site} />
    </SiteFrame>
  );
}
