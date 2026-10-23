import { ArrowRight, Terminal } from 'lucide-react';
import { INDUSTRY_LABELS } from '../../../../core/site/industries';
import {
  CONTACT_FOR_PRICE,
  EmptyListNote,
  SiteFooter,
  SiteFrame,
  SiteLogo,
  contactRows,
  formatItemPrice,
  whatsappHref,
  type SitePalette,
  type SiteTemplateProps,
} from '../site-shared';

/**
 * Developer & Teknologi — dark terminal canvas, monospaced labels, green
 * accent, a bento grid of service cards. The header carries a `~/path` chip
 * derived from the business name; prices render in mono like output.
 */
const PALETTE: SitePalette = {
  bg: '#0b0f17',
  surface: '#131a26',
  ink: '#e6edf3',
  muted: '#8b98a9',
  line: '#232d3d',
  accent: '#39d98a',
  accentInk: '#05240f',
};

const CTA =
  'inline-flex items-center gap-2 rounded-md bg-[var(--site-accent)] px-6 py-3 font-mono text-sm font-semibold text-[color:var(--site-accent-ink)] transition hover:opacity-90';

export default function DeveloperTemplate({ site, items }: SiteTemplateProps) {
  const wa = whatsappHref(site);
  const hasList = items.length > 0;
  const rows = contactRows(site);
  const path = site.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return (
    <SiteFrame palette={PALETTE}>
      <header className="border-b border-[color:var(--site-line)] bg-[var(--site-surface)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <SiteLogo site={site} className="h-9 w-9" />
            <span className="truncate font-mono text-xs text-[color:var(--site-muted)]">
              ~/{path || 'usaha'}
            </span>
          </div>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border border-[color:var(--site-line)] px-4 py-2 font-mono text-xs transition hover:border-[color:var(--site-accent)] hover:text-[color:var(--site-accent)]"
            >
              ./kontak
            </a>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 py-14 sm:py-20 md:grid-cols-[1.3fr_0.7fr]">
        <div>
          <p className="flex items-center gap-2 font-mono text-xs text-[color:var(--site-accent)]">
            <Terminal size={14} aria-hidden="true" />
            // {INDUSTRY_LABELS.developer.toLowerCase()}
          </p>
          <h1 className="mt-4 text-4xl leading-tight font-semibold tracking-tight break-words sm:text-6xl">
            {site.businessName}
          </h1>
          <p className="mt-4 max-w-md text-sm text-[color:var(--site-muted)]">
            {hasList
              ? 'Daftar layanan dan harganya di bawah. Hubungi untuk mulai berdiskusi.'
              : 'Hubungi untuk mulai berdiskusi.'}
          </p>
          {wa && (
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
                diskusi() <ArrowRight size={15} aria-hidden="true" />
              </a>
              {hasList && (
                <a
                  href="#daftar"
                  className="inline-flex items-center gap-2 rounded-md border border-[color:var(--site-line)] px-6 py-3 font-mono text-sm transition hover:border-[color:var(--site-accent)]"
                >
                  lihat_daftar
                </a>
              )}
            </div>
          )}
        </div>
        <div className="justify-self-center rounded-lg border border-[color:var(--site-line)] bg-[var(--site-surface)] p-6 md:justify-self-end">
          <SiteLogo site={site} className="h-28 w-28 sm:h-32 sm:w-32" />
        </div>
      </section>
      <section id="daftar" className="mx-auto max-w-5xl px-5 py-14 sm:py-16">
        <p className="font-mono text-xs text-[color:var(--site-muted)]">// daftar</p>
        {hasList ? (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const price = formatItemPrice(item);
              return (
                <li
                  key={item.name}
                  className="flex flex-col gap-3 rounded-lg border border-[color:var(--site-line)] bg-[var(--site-surface)] p-5 transition hover:border-[color:var(--site-accent)]"
                >
                  <span className="font-mono text-[10px] tracking-widest text-[color:var(--site-muted)] uppercase">
                    {item.kind === 'barang' ? 'produk' : 'layanan'}
                  </span>
                  <span className="text-base font-semibold">{item.name}</span>
                  <span className="mt-auto flex items-baseline gap-2 font-mono text-sm">
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
          <div className="mt-5 rounded-lg border border-dashed border-[color:var(--site-line)] p-6">
            <EmptyListNote />
          </div>
        )}
      </section>

      <section className="border-t border-[color:var(--site-line)] bg-[var(--site-surface)]">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 py-12 sm:grid-cols-2 sm:py-14">
          <div>
            <p className="font-mono text-xs text-[color:var(--site-accent)]">// kontak</p>
            <ul className="mt-4 space-y-3 text-sm">
              {rows.map((row) => {
                const Icon = row.icon;
                const body = (
                  <span className="flex gap-3">
                    <Icon size={15} className="mt-0.5 shrink-0 text-[color:var(--site-accent)]" aria-hidden="true" />
                    <span className="break-words">{row.text}</span>
                  </span>
                );
                return (
                  <li key={row.text}>
                    {row.href ? (
                      <a href={row.href} target="_blank" rel="noopener noreferrer" className="hover:text-[color:var(--site-accent)]">
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
                chat() <ArrowRight size={15} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </section>

      <SiteFooter site={site} />
    </SiteFrame>
  );
}
