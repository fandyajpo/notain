import { ArrowUpRight } from 'lucide-react';
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
 * Desain & Kreatif — editorial: paper-white canvas, oversized black type,
 * one orange accent, monospaced labels. The list is a numbered index, not a
 * price table, so it reads like a studio's contents page.
 */
const PALETTE: SitePalette = {
  bg: '#fafafa',
  surface: '#ffffff',
  ink: '#0f0f0f',
  muted: '#6f6f6f',
  line: '#e5e5e5',
  accent: '#ff4d00',
  accentInk: '#ffffff',
};

const CTA =
  'inline-flex items-center gap-2 bg-[var(--site-accent)] px-6 py-3.5 text-sm font-bold tracking-wide text-[color:var(--site-accent-ink)] uppercase transition hover:opacity-90';

export default function DesignerTemplate({ site, items }: SiteTemplateProps) {
  const wa = whatsappHref(site);
  const hasList = items.length > 0;
  const rows = contactRows(site);

  return (
    <SiteFrame palette={PALETTE}>
      <header className="border-b border-[color:var(--site-line)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <SiteLogo site={site} className="h-9 w-9" />
            <span className="truncate text-sm font-bold tracking-tight uppercase">
              {site.businessName}
            </span>
          </div>
          <a
            href="#daftar"
            className="text-sm font-bold tracking-wide text-[color:var(--site-accent)] uppercase hover:underline"
          >
            Daftar →
          </a>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <span
          aria-hidden="true"
          className="absolute top-10 right-0 h-24 w-24 bg-[var(--site-accent)] sm:h-32 sm:w-32"
        />
        <div className="relative mx-auto max-w-5xl px-5 py-16 sm:py-24">
          <p className="font-mono text-xs tracking-widest text-[color:var(--site-accent)] uppercase">
            [ {INDUSTRY_LABELS.designer} ]
          </p>
          <h1 className="mt-5 max-w-3xl text-5xl leading-[0.95] font-black tracking-tighter break-words uppercase sm:text-7xl">
            {site.businessName}
          </h1>
          {wa && (
            <div className="mt-9 flex flex-wrap gap-3">
              <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
                Mulai proyek <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              {hasList && (
                <a
                  href="#daftar"
                  className="inline-flex items-center gap-2 border border-[color:var(--site-line)] px-6 py-3.5 text-sm font-bold uppercase transition hover:bg-[var(--site-surface)]"
                >
                  Lihat daftar
                </a>
              )}
            </div>
          )}
        </div>
      </section>
      {hasList ? (
        <section id="daftar" className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <h2 className="font-mono text-xs tracking-widest text-[color:var(--site-muted)] uppercase">
            // daftar
          </h2>
          <ol className="mt-5 border-t border-[color:var(--site-line)]">
            {items.map((item, index) => {
              const price = formatItemPrice(item);
              return (
                <li
                  key={item.name}
                  className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-3 border-b border-[color:var(--site-line)] py-5 sm:grid-cols-[3.5rem_1fr_auto] sm:gap-5"
                >
                  <span className="font-mono text-sm text-[color:var(--site-accent)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0">
                    <span className="text-xl font-bold tracking-tight sm:text-2xl">{item.name}</span>
                    <span className="ml-3 font-mono text-[11px] tracking-wider text-[color:var(--site-muted)] uppercase">
                      {item.kind === 'barang' ? 'produk' : 'jasa'}
                    </span>
                    {price?.per && (
                      <span className="block text-sm text-[color:var(--site-muted)]">
                        per {price.per}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-sm font-bold whitespace-nowrap sm:text-base">
                    {price?.price ?? CONTACT_FOR_PRICE}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <section id="daftar" className="mx-auto max-w-5xl px-5 py-14">
          <EmptyListNote />
        </section>
      )}

      <section className="bg-[var(--site-ink)] text-[color:var(--site-bg)]">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-16">
          <h2 className="text-3xl font-black tracking-tighter uppercase sm:text-4xl">Kontak</h2>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <ul className="space-y-4">
              {rows.map((row) => {
                const Icon = row.icon;
                const body = (
                  <span className="flex gap-3">
                    <Icon size={16} className="mt-1 shrink-0" aria-hidden="true" />
                    <span className="break-words">{row.text}</span>
                  </span>
                );
                return (
                  <li key={row.text} className="text-sm">
                    {row.href ? (
                      <a
                        href={row.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[color:var(--site-accent)] hover:underline"
                      >
                        {body}
                      </a>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
              {rows.length === 0 && (
                <li className="text-sm opacity-70">Belum ada kontak yang dipublikasikan.</li>
              )}
            </ul>
            <div className="sm:justify-self-end">
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA}>
                  Kirim pesan <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <SiteFooter site={site} />
    </SiteFrame>
  );
}
